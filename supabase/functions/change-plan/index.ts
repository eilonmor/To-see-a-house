// POST { plan, lang } with the user's session: upgrades the user's (or their
// agency's) subscription to `plan` now, charging the prorated difference on
// the saved card. The new plan keeps the old period's dates. Downgrades are
// scheduled by the billing page itself (schedule_plan_change), not here.
// See docs/cardcom-integration.md, Task 6.
//
// The amount and the payer come from plan_change_check, never from the
// browser. complete_upgrade does the bookkeeping in one transaction.

import { cardcomCharge } from '../_shared/cardcom.ts'
import { CARD_COLUMNS, payerOf, responseFields, tokenChargeBody, type ChargeBody } from '../_shared/charge.ts'
import { admin, must, rpc, sessionUser } from '../_shared/db.ts'
import { ApiError, handler, str } from '../_shared/http.ts'

type Change = { subscription_id: string; change: 'upgrade' | 'downgrade'; amount: number; new_org_id: string | null }

type UpgradeResult = { result: 'upgraded' | 'duplicate' | 'already_done'; subscription_id: string | null }

const UNIQUE_VIOLATION = '23505'

/** The period's end (the next charge date), for the receipt: "(until 12.11.2026)". */
const untilDate = (iso: string, lang: 'he' | 'en') =>
  new Intl.DateTimeFormat(lang === 'he' ? 'he-IL' : 'en-GB', {
    timeZone: 'Asia/Jerusalem',
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
  }).format(new Date(iso))

Deno.serve(
  handler(async (body, req) => {
    const user = await sessionUser(req)

    const plan = str(body.plan)
    const lang = str(body.lang)
    if (!plan || (lang !== 'he' && lang !== 'en')) throw new ApiError('bad_request')

    const [change] = await rpc<Change[]>('plan_change_check', { p_user_id: user.id, p_plan: plan })
    if (!change) throw new Error('plan_change_check returned no row')
    // Downgrades wait for the renewal: the billing page calls schedule_plan_change.
    if (change.change !== 'upgrade') throw new ApiError('plan_change_not_allowed')
    const subscriptionId = change.subscription_id

    // An earlier upgrade whose charge couldn't be confirmed may have been
    // charged: it's checked by hand first. Until then the plan doesn't change,
    // even for free, so that payment can still complete the upgrade it paid for.
    const unconfirmed = must(
      await admin
        .from('payments')
        .select('id')
        .eq('subscription_id', subscriptionId)
        .eq('kind', 'upgrade')
        .eq('status', 'pending'),
      'payments',
    )
    if (unconfirmed.length) {
      console.error('[cardcom] upgrade still unconfirmed', unconfirmed.map((p) => p.id))
      throw new ApiError('payment_unconfirmed', 409)
    }

    const upgrade = (paymentId: string | null, tranzactionId: number | null) =>
      rpc<UpgradeResult>('complete_upgrade', {
        p_user_id: user.id,
        p_plan: plan,
        p_payment_id: paymentId,
        p_tranzaction_id: tranzactionId,
      })

    const amount = Math.round(Number(change.amount) * 100) / 100
    if (amount === 0) {
      await upgrade(null, null)
      return { upgraded: true }
    }

    const inserted = await admin
      .from('payments')
      .insert({
        // complete_upgrade checks it, then moves it to the new subscription.
        subscription_id: subscriptionId,
        org_id: change.new_org_id,
        bought_by: user.id,
        plan_code: plan,
        amount,
        kind: 'upgrade',
        status: 'pending',
      })
      .select('id')
      .single()
    // payments_one_pending_upgrade_idx: another request (two tabs) is charging it right now.
    if (inserted.error?.code === UNIQUE_VIOLATION) throw new ApiError('payment_unconfirmed', 409)
    const paymentId: string = must(inserted, 'payments').id

    const markFailed = async (fields: Record<string, unknown> = {}) => {
      const failed = await admin
        .from('payments')
        .update({ ...fields, status: 'failed' })
        .eq('id', paymentId)
        .eq('status', 'pending')
      if (failed.error) console.error('[cardcom] could not mark payment failed', paymentId, failed.error.message)
    }

    // Nothing is sent to CardCom until the body is complete: a failure here
    // can't have charged the card, so the payment fails instead of staying pending.
    let charge: ChargeBody | null
    try {
      const [subRes, planRes, payer] = await Promise.all([
        admin.from('subscriptions').select(`current_period_end, ${CARD_COLUMNS}`).eq('id', subscriptionId).single(),
        admin.from('plans').select('name_he, name_en').eq('code', plan).single(),
        // The agency pays from now on: the same name and email its renewals use.
        payerOf({ user_id: null, org_id: change.new_org_id }),
      ])
      const sub = must(subRes, 'subscriptions')
      const planRow = must(planRes, 'plans')
      const name = lang === 'he' ? planRow.name_he : planRow.name_en
      const until = untilDate(sub.current_period_end, lang)
      charge = tokenChargeBody({
        paymentId,
        amount,
        card: sub,
        payer,
        product: lang === 'he' ? `${name} (עד ${until})` : `${name} (until ${until})`,
        lang,
      })
    } catch (err) {
      await markFailed()
      throw err
    }
    if (!charge) {
      console.error('[cardcom] upgrade failed', subscriptionId, 'no saved card token or expiration date')
      await markFailed()
      throw new ApiError('upgrade_payment_failed', 402)
    }

    const { outcome, response } = await cardcomCharge(charge)
    const fields = response && responseFields(response)

    if (outcome === 'declined') {
      console.error('[cardcom] upgrade failed', subscriptionId, response?.Description)
      await markFailed(fields ?? {})
      throw new ApiError('upgrade_payment_failed', 402)
    }

    if (fields) {
      const saved = await admin.from('payments').update(fields).eq('id', paymentId).eq('status', 'pending')
      if (saved.error) console.error('[cardcom] could not save the response', paymentId, saved.error.message)
    }

    if (outcome === 'unknown') {
      // Never a decline: the card may have been charged. Stays pending until
      // it's checked in CardCom's dashboard (or sent again with the same id).
      console.error('[cardcom] upgrade unconfirmed', paymentId)
      throw new ApiError('payment_unconfirmed', 502)
    }

    // Paid.
    let done: UpgradeResult
    try {
      done = await upgrade(paymentId, response?.TranzactionId ?? null)
    } catch (err) {
      // Charged, but not recorded: the payment stays pending, to finish by
      // hand with complete_upgrade.
      console.error('[cardcom] upgrade charged but not completed', paymentId, err instanceof Error ? err.message : String(err))
      throw new ApiError('payment_unconfirmed', 502)
    }
    if (done.result === 'duplicate') {
      // Charged, but the subscription changed meanwhile (two tabs, or its
      // renewal was stopped), so this payment didn't change the plan: refund
      // it in CardCom. The user is told it's being checked, not that it worked.
      console.error('[cardcom] duplicate upgrade payment', paymentId)
      throw new ApiError('payment_unconfirmed', 409)
    }
    return { upgraded: true }
  }),
)
