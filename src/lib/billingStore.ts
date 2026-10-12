// Billing (phase 5): plans, the user's subscriptions and payments, and the
// CardCom checkout. The browser only reads billing tables; every change goes
// through an edge function or a database function. See
// docs/cardcom-integration.md.
//
// subscriptions and payments have column-level grants: name the columns in
// every select (select('*') fails). The card token and CardCom's texts are
// never readable here.

import type { Lang } from '../i18n/translations'
import type { Profile } from './auth'
import type { Database } from './database.types'
import { BookingError, callFunction, run } from './supabase'

export type Period = 'month' | 'year'

export type Plan = {
  code: string
  audience: 'agent' | 'agency'
  period: Period
  /** Charged, in shekels (final, no VAT). */
  price: number
  /** Shown struck out next to the price. */
  listPrice: number
  discountPercent: number
  /** Agents an agency plan includes (null for agent plans). */
  agentSeats: number | null
  name: Record<Lang, string>
}

export type SubscriptionStatus = Database['public']['Enums']['subscription_status']

export type Subscription = {
  id: string
  /** The payer: the user (agent plans) or the agency (agency plans). */
  userId: string | null
  orgId: string | null
  planCode: string
  price: number
  period: Period
  status: SubscriptionStatus
  currentPeriodStart: string
  currentPeriodEnd: string
  cancelAtPeriodEnd: boolean
  /** A downgrade applied at the next renewal (Task 6). */
  nextPlanCode: string | null
}

export type PaymentStatus = 'pending' | 'paid' | 'failed'

export type Payment = {
  id: string
  boughtBy: string | null
  planCode: string
  amount: number
  kind: 'checkout' | 'renewal' | 'upgrade'
  status: PaymentStatus
  createdAt: string
  paidAt: string | null
  documentNumber: number | null
  /** A paid charge that bought nothing: refunded by hand ("due" until then). */
  refund: 'due' | 'done' | null
}

const SUBSCRIPTION_COLUMNS =
  'id, user_id, org_id, plan_code, price, period, status, current_period_start, current_period_end, cancel_at_period_end, next_plan_code'

const PAYMENT_COLUMNS =
  'id, bought_by, plan_code, amount, kind, status, created_at, paid_at, cardcom_document_number, refund_reason, refunded_at'

/** Plans on sale, cheapest first. */
export async function fetchPlans(): Promise<Plan[]> {
  const rows = await run((db) =>
    db
      .from('plans')
      .select('code, audience, period, price, list_price, discount_percent, agent_seats, name_he, name_en')
      .eq('active', true)
      .order('price'),
  )
  return rows.map((r) => ({
    code: r.code,
    audience: r.audience as Plan['audience'],
    period: r.period as Period,
    price: Number(r.price),
    listPrice: Number(r.list_price),
    discountPercent: r.discount_percent,
    agentSeats: r.agent_seats,
    name: { he: r.name_he, en: r.name_en },
  }))
}

/**
 * The running (active or past due) subscriptions the user pays for or
 * manages: their own, and for an agency admin the agency's. An admin can
 * have both, e.g. an agent subscription from before creating the agency.
 */
export type MySubscriptions = { own: Subscription | null; agency: Subscription | null }

export async function fetchMySubscription(profile: Profile): Promise<MySubscriptions> {
  const agencyId = profile.role === 'agency_admin' ? profile.orgId : null
  const rows = await run((db) =>
    db
      .from('subscriptions')
      .select(SUBSCRIPTION_COLUMNS)
      .or(agencyId ? `user_id.eq.${profile.id},org_id.eq.${agencyId}` : `user_id.eq.${profile.id}`)
      .in('status', ['active', 'past_due']),
  )
  const subs: Subscription[] = rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    orgId: r.org_id,
    planCode: r.plan_code,
    price: Number(r.price),
    period: r.period as Period,
    status: r.status,
    currentPeriodStart: r.current_period_start,
    currentPeriodEnd: r.current_period_end,
    cancelAtPeriodEnd: r.cancel_at_period_end,
    nextPlanCode: r.next_plan_code,
  }))
  return {
    own: subs.find((s) => s.userId === profile.id) ?? null,
    agency: (agencyId && subs.find((s) => s.orgId === agencyId)) || null,
  }
}

/** Payments the user can see (their own, and their agency's for an admin), newest first. */
export async function fetchMyPayments(): Promise<Payment[]> {
  const rows = await run((db) =>
    db.from('payments').select(PAYMENT_COLUMNS).order('created_at', { ascending: false }).limit(50),
  )
  return rows.map((r) => ({
    id: r.id,
    boughtBy: r.bought_by,
    planCode: r.plan_code,
    amount: Number(r.amount),
    kind: r.kind as Payment['kind'],
    status: r.status as PaymentStatus,
    createdAt: r.created_at,
    paidAt: r.paid_at,
    documentNumber: r.cardcom_document_number,
    refund: r.refund_reason ? (r.refunded_at ? 'done' : 'due') : null,
  }))
}

/**
 * Starts paying for `plan`: returns the address of CardCom's payment page,
 * in `lang`. CardCom then sends the browser back to /dashboard/billing.
 */
export async function startCheckout(plan: string, lang: Lang): Promise<string> {
  const { url } = await callFunction<{ url: string }>('create-checkout', { plan, lang })
  return url
}

export type PlanChangeQuote = {
  change: 'upgrade' | 'downgrade'
  /** Charged now for the rest of the period, in shekels (0: no charge). */
  amount: number
}

/** What moving to `plan` would do, for the confirm dialog. Raises plan_change_not_allowed. */
export async function quotePlanChange(plan: string): Promise<PlanChangeQuote> {
  const rows = await run((db) => db.rpc('plan_change_quote', { p_plan: plan }))
  const row = rows[0]
  if (!row) throw new BookingError('planChangeNotAllowed')
  return { change: row.change as PlanChangeQuote['change'], amount: Number(row.amount) }
}

/**
 * Upgrades now: the change-plan edge function charges the prorated amount
 * on the saved card (CardCom is called only there) and switches the plan.
 * The receipt is in `lang`.
 */
export async function upgradePlan(plan: string, lang: Lang): Promise<void> {
  await callFunction<{ upgraded: true }>('change-plan', { plan, lang })
}

/**
 * Schedules a downgrade for the next renewal (no charge). Called with the
 * subscription's current plan, it cancels the scheduled downgrade.
 */
export async function scheduleDowngrade(plan: string): Promise<void> {
  await run((db) => db.rpc('schedule_plan_change', { p_plan: plan }))
}
