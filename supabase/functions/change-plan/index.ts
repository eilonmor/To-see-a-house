// POST { plan, lang } with the user's session: upgrades the user's (or their
// agency's) subscription to `plan` now, charging the prorated difference on
// the saved card. The new plan keeps the old period's dates. Downgrades are
// scheduled by the billing page itself (schedule_plan_change), not here.
// See docs/cardcom-integration.md, Task 6.
//
// The amount and the payer come from start_upgrade, never from the
// browser. complete_upgrade does the bookkeeping in one transaction.

import { cardcomCharge } from '../_shared/cardcom.ts'
import { CARD_COLUMNS, payerOf, responseFields, tokenChargeBody, type ChargeBody } from '../_shared/charge.ts'
import { admin, must, rpc, sessionUser } from '../_shared/db.ts'
import { ApiError, handler, str } from '../_shared/http.ts'

type StartResult = { subscription_id: string; amount: number; new_org_id: string; payment_id: string | null }

type UpgradeResult = { result: 'upgraded' | 'duplicate' | 'already_done'; subscription_id: string | null }

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

    // Checks the change under a lock and inserts the pending payment. Raises
    // plan_change_not_allowed (also for downgrades: the billing page calls
    // schedule_plan_change for those) or upgrade_in_progress (another upgrade
    // of it is being charged, or was never confirmed).
    const start = await rpc<StartResult>('start_upgrade', { p_user_id: user.id, p_plan: plan })
    const subscriptionId = start.subscription_id

    const upgrade = (paymentId: string | null, tranzactionId: number | null) =>
      rpc<UpgradeResult>('complete_upgrade', {
        p_user_id: user.id,
        p_plan: plan,
        p_payment_id: paymentId,
        p_tranzaction_id: tranzactionId,
      })

    if (!start.payment_id) {
      // Under ₪1 for the rest of the period: no charge.
      await upgrade(null, null)
      return { upgraded: true }
    }
    const paymentId = start.payment_id
    const amount = Math.round(Number(start.amount) * 100) / 100

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
        payerOf({ user_id: null, org_id: start.new_org_id }),
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
      // Charged, but the change wasn't allowed any more, so the plan didn't
      // change. complete_upgrade set refund_reason: refund it in CardCom.
      console.error('[cardcom] duplicate upgrade payment', paymentId)
      throw new ApiError('upgrade_refund_due', 409)
    }
    return { upgraded: true }
  }),
)
