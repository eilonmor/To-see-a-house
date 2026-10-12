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
import { admin, rpc } from '../_shared/db.ts'

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

function must<T>(res: { data: T | null; error: { code?: string; message: string } | null }, what: string): T {
  if (res.error || res.data === null) throw new Error(`${what}: ${res.error?.code ?? ''} ${res.error?.message ?? 'not found'}`)
  return res.data
}

async function emailOf(userId: string): Promise<string> {
  const { data, error } = await admin.auth.admin.getUserById(userId)
  if (error) throw new Error(`auth user ${userId}: ${error.message}`)
  return data.user?.email ?? ''
}

/**
 * Who the charge and the document are for. A user pays for themselves; an
 * agency's card owner and email are its (oldest) agency admin's, and the
 * document is in the agency's name, as at checkout.
 */
async function payerOf(sub: { user_id: string | null; org_id: string | null }) {
  if (sub.user_id) {
    const profile = must(await admin.from('profiles').select('full_name').eq('id', sub.user_id).single(), 'profiles')
    const fullName = profile.full_name.trim()
    return { fullName, email: await emailOf(sub.user_id), documentName: fullName }
  }
  const [orgRes, adminRes] = await Promise.all([
    admin.from('organizations').select('name').eq('id', sub.org_id!).single(),
    admin
      .from('profiles')
      .select('id, full_name')
      .eq('org_id', sub.org_id!)
      .eq('role', 'agency_admin')
      .order('created_at')
      .limit(1)
      .maybeSingle(),
  ])
  const org = must(orgRes, 'organizations')
  const orgAdmin = must(adminRes, 'agency admin')
  const fullName = orgAdmin.full_name.trim()
  return { fullName, email: await emailOf(orgAdmin.id), documentName: org.name.trim() || fullName }
}

/** Month zero-padded + the last 2 digits of the year (CardYear may be 28 or 2028), or null. */
function expirationMMYY(month: number | null, year: number | null): string | null {
  if (!Number.isInteger(month) || !Number.isInteger(year) || month! < 1 || month! > 12) return null
  return String(month).padStart(2, '0') + String(year! % 100).padStart(2, '0')
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
  return summary
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

  // Couldn't be sent to CardCom. A new payment was never sent, so it fails
  // (past_due, ended after 3 runs) instead of staying pending until it's
  // stuck. A re-sent one may have been charged the first time: it stays
  // pending, and is reported as stuck after 3 days for a check by hand.
  const notSent = async (reason: string) => {
    if (start.resend) {
      summary.errors++
      console.error('[cardcom] renewal not re-sent, left pending', subscriptionId, paymentId, reason)
      return
    }
    console.error('[cardcom] renewal failed', subscriptionId, reason)
    await finish(false, null)
  }

  let body: Parameters<typeof cardcomCharge>[0]
  try {
    const sub = must(
      await admin
        .from('subscriptions')
        .select(
          'user_id, org_id, cardcom_token, cardcom_token_card_month, cardcom_token_card_year, cardcom_token_card_owner_identity_number',
        )
        .eq('id', subscriptionId)
        .single(),
      'subscriptions',
    )

    const token = sub.cardcom_token?.trim()
    const mmyy = expirationMMYY(sub.cardcom_token_card_month, sub.cardcom_token_card_year)
    if (!token || !mmyy) return await notSent('no saved card token or expiration date')

    const [payer, planRes] = await Promise.all([
      payerOf(sub),
      admin.from('plans').select('name_he').eq('code', start.plan_code).single(),
    ])
    const plan = must(planRes, 'plans')
    const amount = Math.round(Number(start.amount) * 100) / 100
    const documentName = payer.documentName || payer.email

    body = {
      Amount: amount,
      Token: token,
      CardExpirationMMYY: mmyy,
      ExternalUniqTranId: paymentId,
      NumOfPayments: 1,
      ISOCoinId: 1,
      CardOwnerInformation: {
        FullName: payer.fullName || documentName,
        IdentityNumber: sub.cardcom_token_card_owner_identity_number?.trim() || undefined,
        CardOwnerEmail: payer.email,
      },
      Document: {
        DocumentTypeToCreate: 'Auto',
        Name: documentName,
        Email: payer.email,
        IsSendByEmail: true,
        Language: 'he',
        Products: [{ Description: plan.name_he, UnitCost: amount, Quantity: 1 }],
      },
    }
  } catch (err) {
    return await notSent(err instanceof Error ? err.message : String(err))
  }

  const { outcome, response } = await cardcomCharge(body)

  if (response) {
    const saved = await admin
      .from('payments')
      .update({
        cardcom_response_code: typeof response.ResponseCode === 'number' ? response.ResponseCode : null,
        cardcom_description: response.Description ?? null,
        cardcom_document_type: response.DocumentType ?? null,
        cardcom_document_number: response.DocumentNumber ?? null,
      })
      .eq('id', paymentId)
      .eq('status', 'pending')
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
