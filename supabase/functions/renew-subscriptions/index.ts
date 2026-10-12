// POST from Supabase Cron, once a day, with the header x-cron-secret:
// ends the subscriptions whose renewal was stopped, then charges the saved
// card of each subscription whose period has ended. Answers 202 at once and
// keeps running in the background; the summary goes to the function log.
//
// Unauthenticated (verify_jwt = false): the CRON_SECRET header is the check.
// The bookkeeping is in start_renewal / finish_renewal / expire_subscriptions;
// this only talks to CardCom between them. Each subscription is handled on
// its own, so one failure doesn't stop the others.
// See docs/cardcom-integration.md, Task 5.

import { cardcomCharge } from '../_shared/cardcom.ts'
import { CARD_COLUMNS, payerOf, responseFields, tokenChargeBody } from '../_shared/charge.ts'
import { admin, must, rpc } from '../_shared/db.ts'

// Supabase's edge runtime: keeps the function running after the response.
declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void }

type StartResult =
  | { skipped: 'not_due' | 'retried_today' | 'pending' | 'stuck'; payment_id?: string }
  | { skipped?: undefined; payment_id: string; amount: number; plan_code: string; resend?: boolean }

type FinishResult = { status?: string; already_done?: boolean; refund?: boolean }

type Summary = {
  expired: number
  charged: number
  failed: number
  ended: number
  unknown: number
  skipped: number
  refunds: number
  errors: number
  left: number
}

// Charges are made one after another and can take up to 30 seconds each; the
// function is stopped at 150 s (free plan). Later ones wait for the next run.
const BUDGET_MS = 100_000

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

/** Compares two strings in constant time (their SHA-256 hashes, so the length doesn't leak either). */
async function sameSecret(a: string, b: string): Promise<boolean> {
  const encoder = new TextEncoder()
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(a)),
    crypto.subtle.digest('SHA-256', encoder.encode(b)),
  ])
  const x = new Uint8Array(ha)
  const y = new Uint8Array(hb)
  let diff = 0
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i]
  return diff === 0
}

/** Expires the stopped subscriptions, then renews the due ones. Never throws. */
async function renewAll(started: number): Promise<Summary> {
  const summary: Summary = { expired: 0, charged: 0, failed: 0, ended: 0, unknown: 0, skipped: 0, refunds: 0, errors: 0, left: 0 }

  try {
    const expired = await rpc<{ expired: number; pending: string[] }>('expire_subscriptions', {})
    summary.expired = expired.expired
    if (expired.pending.length) {
      console.error('[cardcom] not expired, a renewal payment is still pending', expired.pending)
    }

    const [dueRes, pendingRes] = await Promise.all([
      admin
        .from('subscriptions')
        .select('id')
        .in('status', ['active', 'past_due'])
        .eq('cancel_at_period_end', false)
        .lte('current_period_end', new Date().toISOString())
        .order('current_period_end'),
      // Whatever the subscription's state: one stopped while being charged
      // must still get its payment finished.
      admin.from('payments').select('subscription_id').eq('kind', 'renewal').eq('status', 'pending'),
    ])
    const due = must(dueRes, 'subscriptions')
    const pending = must(pendingRes, 'payments')
    const ids = [...new Set([...pending.map((p) => p.subscription_id), ...due.map((s) => s.id)])].filter(
      (id): id is string => !!id,
    )

    for (let i = 0; i < ids.length; i++) {
      // Checked before start_renewal: a payment it inserts but doesn't send
      // would wait an hour before being picked up again.
      if (Date.now() - started > BUDGET_MS) {
        summary.left = ids.length - i
        break
      }
      const subscriptionId = ids[i]
      try {
        await renewOne(subscriptionId, summary)
      } catch (err) {
        summary.errors++
        console.error('[renew] subscription', subscriptionId, err instanceof Error ? err.message : String(err))
      }
    }
  } catch (err) {
    summary.errors++
    console.error('[renew]', err instanceof Error ? err.message : String(err))
  }
  try {
    await reportOpenIssues()
  } catch (err) {
    summary.errors++
    console.error('[renew] report', err instanceof Error ? err.message : String(err))
  }
  return summary
}

// An upgrade charge takes seconds; one still pending after this was never confirmed.
const UPGRADE_UNCONFIRMED_MS = 60 * 60_000

/**
 * Logged every day until someone handles them in CardCom's dashboard: paid
 * charges to refund (then set refunded_at), and upgrade charges never
 * confirmed (finish with complete_upgrade if charged, else set failed). Each
 * of them also blocks further upgrades of its subscription.
 */
async function reportOpenIssues(): Promise<void> {
  const [refundsRes, upgradesRes] = await Promise.all([
    admin
      .from('payments')
      .select('id, refund_reason, amount')
      .not('refund_reason', 'is', null)
      .is('refunded_at', null)
      .order('created_at'),
    admin
      .from('payments')
      .select('id, subscription_id')
      .eq('kind', 'upgrade')
      .eq('status', 'pending')
      .lt('created_at', new Date(Date.now() - UPGRADE_UNCONFIRMED_MS).toISOString()),
  ])
  const refunds = must(refundsRes, 'payments')
  const upgrades = must(upgradesRes, 'payments')
  if (refunds.length) console.error('[cardcom] refunds due, refund in CardCom and set refunded_at', refunds)
  if (upgrades.length) console.error('[cardcom] upgrades unconfirmed, check them in CardCom', upgrades)
}

async function renewOne(subscriptionId: string, summary: Summary): Promise<void> {
  const start = await rpc<StartResult>('start_renewal', { p_subscription_id: subscriptionId })
  if (start.skipped) {
    summary.skipped++
    if (start.skipped === 'stuck') {
      console.error('[cardcom] renewal stuck, check it in CardCom', subscriptionId, start.payment_id)
    }
    return
  }
  const paymentId = start.payment_id
  if (start.resend) console.error('[cardcom] renewal re-sent', paymentId)

  const finish = async (paid: boolean, tranzactionId: number | null) => {
    const done = await rpc<FinishResult>('finish_renewal', {
      p_payment_id: paymentId,
      p_paid: paid,
      p_tranzaction_id: tranzactionId,
    })
    if (done.already_done) {
      summary.skipped++
      return
    }
    if (done.refund) {
      summary.refunds++
      console.error('[cardcom] renewal charged after the subscription ended, refund it', paymentId, subscriptionId)
      return
    }
    if (paid) {
      summary.charged++
    } else {
      summary.failed++
      // With `refund` (false) in the result, the subscription had ended before.
      if (done.status === 'canceled' && done.refund === undefined) summary.ended++
    }
  }

  // The card can't be charged (no saved token). A new payment was never sent,
  // so it fails (past_due, ended after 3 runs) instead of staying pending
  // until it's stuck. A re-sent one may have been charged the first time: it
  // stays pending, and is reported as stuck after 3 days for a check by hand.
  const notSent = async (reason: string) => {
    if (start.resend) {
      summary.errors++
      console.error('[cardcom] renewal not re-sent, left pending', subscriptionId, paymentId, reason)
      return
    }
    console.error('[cardcom] renewal failed', subscriptionId, reason)
    await finish(false, null)
  }

  // A lookup failure throws: our error isn't the card's, so the payment stays
  // pending and the next run re-sends it (or reports it stuck after 3 days).
  const sub = must(
    await admin.from('subscriptions').select(`user_id, org_id, ${CARD_COLUMNS}`).eq('id', subscriptionId).single(),
    'subscriptions',
  )
  const [payer, planRes] = await Promise.all([
    payerOf(sub),
    admin.from('plans').select('name_he').eq('code', start.plan_code).single(),
  ])
  const plan = must(planRes, 'plans')
  const body = tokenChargeBody({ paymentId, amount: Number(start.amount), card: sub, payer, product: plan.name_he, lang: 'he' })
  if (!body) return await notSent('no saved card token or expiration date')

  const { outcome, response } = await cardcomCharge(body)

  if (response) {
    const saved = await admin.from('payments').update(responseFields(response)).eq('id', paymentId).eq('status', 'pending')
    if (saved.error) console.error('[cardcom] could not save the response', paymentId, saved.error.message)
  }

  if (outcome === 'unknown') {
    // Stays pending; start_renewal returns it for resending on the next run.
    summary.unknown++
    return
  }
  if (outcome === 'declined') {
    console.error('[cardcom] renewal failed', subscriptionId, response?.Description)
  }
  await finish(outcome === 'paid', response?.TranzactionId ?? null)
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
  const secret = Deno.env.get('CRON_SECRET')
  if (!secret) {
    console.error('CRON_SECRET is not set')
    return json({ error: 'server' }, 500)
  }
  if (!(await sameSecret(req.headers.get('x-cron-secret') ?? '', secret))) {
    return json({ error: 'not_authenticated' }, 401)
  }

  // A run can take minutes, and Cron's HTTP request gives up after a few
  // seconds: answer now and keep running until the summary is logged.
  const started = Date.now()
  EdgeRuntime.waitUntil(renewAll(started).then((summary) => console.log('[renew] done', summary)))
  return json({ started: true }, 202)
})
