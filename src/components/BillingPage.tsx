import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { CONTACT_EMAIL } from '../config'
import {
  fetchMyPayments,
  fetchMySubscription,
  fetchPlans,
  quotePlanChange,
  scheduleDowngrade,
  setRenewal,
  startCheckout,
  upgradePlan,
  type MySubscriptions,
  type Payment,
  type Period,
  type Plan,
  type Subscription,
} from '../lib/billingStore'
import { formatDate, israelDate } from '../lib/bookingStore'
import { BookingError } from '../lib/supabase'
import { usePolledData } from '../hooks/usePolledData'
import { errorText, useI18n } from '../i18n/I18nProvider'
import type { Lang } from '../i18n/translations'
import { useAccount } from './AccountGate'
import { useConfirm } from './ConfirmDialog'
import { Alert, Button, Card, Link, Loading, Spinner } from './ui'

type Billing = { plans: Plan[]; subs: MySubscriptions }
type History = { plans: Plan[]; payments: Payment[] }

const PERIODS: Period[] = ['month', 'year']

// After CardCom sends the browser back, the webhook may arrive a moment later.
const CONFIRM_POLL_MS = 3000
const CONFIRM_TIMEOUT_MS = 60_000

// A checkout still pending after this was left on CardCom's page without
// paying: it never finishes, so the history doesn't show it.
const ABANDONED_CHECKOUT_MS = 60 * 60_000

const formatPrice = (amount: number, lang: Lang) =>
  new Intl.NumberFormat(lang === 'en' ? 'en-IL' : 'he-IL', {
    style: 'currency',
    currency: 'ILS',
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount)

const longDate = (iso: string, lang: Lang) =>
  formatDate(israelDate(new Date(iso)), lang, { day: 'numeric', month: 'long', year: 'numeric' })

/** A plan-change error after which the card may have been charged: checked or refunded by hand. */
const isChargeIssue = (err: unknown) =>
  err instanceof BookingError && ['paymentUnconfirmed', 'upgradeRefundDue', 'upgradeInProgress'].includes(err.code)

/** Its period has ended but it's still running: past due, or waiting for the daily renewal run. */
const periodOver = (sub: Subscription) => sub.status === 'past_due' || Date.parse(sub.currentPeriodEnd) <= Date.now()

const planName = (plans: Plan[], code: string, lang: Lang) => plans.find((p) => p.code === code)?.name[lang] ?? code

/**
 * /dashboard/billing: the user's plan (or the plans they may buy). Their
 * payments are on PaymentHistoryPage, linked from here. Payment and
 * subscription statuses are only read here; the payment-webhook edge
 * function changes them.
 */
export default function BillingPage() {
  const { t } = useI18n()
  const { profile, reloadProfile } = useAccount()
  // CardCom sends the browser back with ?result=success or ?result=failed, and &payment=<id>.
  const [{ result, paymentId }] = useState(() => {
    const params = new URLSearchParams(window.location.search)
    return { result: params.get('result'), paymentId: params.get('payment') }
  })

  useEffect(() => {
    // Shown once: a reload or a shared link doesn't repeat it.
    if (window.location.search) window.history.replaceState(null, '', window.location.pathname)
  }, [])

  const load = useCallback(async (): Promise<Billing> => {
    const [plans, subs] = await Promise.all([fetchPlans(), fetchMySubscription(profile)])
    return { plans, subs }
  }, [profile])
  const { data, loading, error, refresh } = usePolledData<Billing | null>(load, null)

  // The payment went through: a personal buyer is an agent now.
  const onConfirmed = useCallback(() => {
    refresh()
    reloadProfile().catch(() => {})
  }, [refresh, reloadProfile])

  // Shown here, not in the card: moving to an agency plan replaces the card.
  const [upgraded, setUpgraded] = useState(false)
  const onUpgraded = useCallback(() => {
    setUpgraded(true)
    onConfirmed()
  }, [onConfirmed])
  const onPlanAction = useCallback(() => setUpgraded(false), [])

  // Which plans the user may buy (the database checks this again):
  // agency plans for an agency admin, agent plans outside an agency.
  const audience = profile.role === 'agency_admin' ? 'agency' : profile.orgId ? null : 'agent'

  return (
    <div className="space-y-6 pt-6">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t.billing.title}</h1>

      {result === 'success' && paymentId && <CheckoutResult paymentId={paymentId} onConfirmed={onConfirmed} />}
      {result === 'failed' && <Alert>{t.billing.failed}</Alert>}
      {upgraded && <Alert tone="info">{t.billing.upgraded}</Alert>}

      {error != null && (
        <Alert>
          {t.billing.loadError} {errorText(error, t)}
          {!data && (
            <Button variant="secondary" className="ms-2 px-3! py-1! text-xs" onClick={refresh}>
              {t.billing.retry}
            </Button>
          )}
        </Alert>
      )}

      {!data ? (
        loading && <Loading label={t.dashboard.loading} />
      ) : (
        <>
          {data.subs.agency && (
            <SubscriptionCard title={t.billing.agencyTitle} sub={data.subs.agency} plans={data.plans}>
              <PlanChange sub={data.subs.agency} plans={data.plans} onStart={onPlanAction} onUpgraded={onUpgraded} onChanged={refresh} />
              <RenewalControl sub={data.subs.agency} coveredByAgency={false} onStart={onPlanAction} onChanged={refresh} />
            </SubscriptionCard>
          )}
          {data.subs.own && (
            <SubscriptionCard title={t.billing.ownTitle} sub={data.subs.own} plans={data.plans}>
              {/* An agency admin's own agent plan, from before the agency, can move to it. */}
              {profile.role === 'agency_admin' && !data.subs.agency && (
                <PlanChange sub={data.subs.own} plans={data.plans} onStart={onPlanAction} onUpgraded={onUpgraded} onChanged={refresh} />
              )}
              <RenewalControl
                sub={data.subs.own}
                coveredByAgency={profile.role === 'agent' ? !!profile.orgId : !!data.subs.agency}
                onStart={onPlanAction}
                onChanged={refresh}
              />
            </SubscriptionCard>
          )}
          {audience === null && (
            <Alert tone="info">{profile.agencyPlanActive ? t.billing.covered : t.properties.agencyNeedsPlan}</Alert>
          )}
          {audience && !data.subs[audience === 'agency' ? 'agency' : 'own'] && (
            <PlanPicker audience={audience} plans={data.plans.filter((p) => p.audience === audience)} />
          )}
          <p className="text-sm">
            <Link href="/dashboard/billing/history" className="font-medium text-indigo-600 hover:underline">
              {t.billing.historyLink}
            </Link>
          </p>
        </>
      )}
    </div>
  )
}

/** /dashboard/billing/history: the user's payments, linked from the billing page only. */
export function PaymentHistoryPage() {
  const { t } = useI18n()
  const load = useCallback(async (): Promise<History> => {
    const [plans, payments] = await Promise.all([fetchPlans(), fetchMyPayments()])
    return { plans, payments }
  }, [])
  const { data, loading, error, refresh } = usePolledData<History | null>(load, null)

  return (
    <div className="space-y-6 pt-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t.billing.historyTitle}</h1>
        <Link href="/dashboard/billing" className="text-sm font-medium text-indigo-600 hover:underline">
          {t.billing.backToBilling}
        </Link>
      </div>

      {error != null && (
        <Alert>
          {t.billing.historyLoadError} {errorText(error, t)}
          {!data && (
            <Button variant="secondary" className="ms-2 px-3! py-1! text-xs" onClick={refresh}>
              {t.billing.retry}
            </Button>
          )}
        </Alert>
      )}

      {!data ? loading && <Loading label={t.dashboard.loading} /> : <PaymentHistory payments={data.payments} plans={data.plans} />}
    </div>
  )
}

/** "Confirming your payment…" until the checkout CardCom sent the browser back from is no longer pending. */
function CheckoutResult({ paymentId, onConfirmed }: { paymentId: string; onConfirmed: () => void }) {
  const { t } = useI18n()
  const [state, setState] = useState<'confirming' | 'paid' | 'failed' | 'refund' | 'timeout'>('confirming')
  // Called once; a newer callback (after the profile reloads) doesn't restart polling.
  const confirmed = useRef(onConfirmed)
  useEffect(() => {
    confirmed.current = onConfirmed
  }, [onConfirmed])

  useEffect(() => {
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const deadline = Date.now() + CONFIRM_TIMEOUT_MS

    async function check() {
      try {
        const payment = (await fetchMyPayments()).find((p) => p.id === paymentId)
        if (stopped) return
        if (payment && payment.status !== 'pending') {
          // Paid, but the payer already had a plan: no second one, refunded by hand.
          setState(payment.refund ? 'refund' : payment.status)
          if (payment.status === 'paid') confirmed.current()
          return
        }
      } catch {
        // A network blip: the next check tries again.
      }
      if (stopped) return
      if (Date.now() >= deadline) setState('timeout')
      else timer = setTimeout(check, CONFIRM_POLL_MS)
    }

    check()
    return () => {
      stopped = true
      clearTimeout(timer)
    }
  }, [paymentId])

  if (state === 'confirming') {
    return (
      <Alert tone="info">
        <span className="inline-flex items-center gap-2">
          <Spinner /> {t.billing.confirming}
        </span>
      </Alert>
    )
  }
  if (state === 'paid') return <Alert tone="info">{t.billing.paid}</Alert>
  if (state === 'refund') return <Alert>{t.billing.checkoutRefundDue}</Alert>
  if (state === 'failed') return <Alert>{t.billing.failed}</Alert>
  return (
    <Alert>
      {t.billing.stillConfirming} <ContactLink />
    </Alert>
  )
}

function SubscriptionCard({
  title,
  sub,
  plans,
  children,
}: {
  title: string
  sub: Subscription
  plans: Plan[]
  children?: ReactNode
}) {
  const { t, lang } = useI18n()
  const end = longDate(sub.currentPeriodEnd, lang)
  // A downgrade scheduled for the renewal is charged at that plan's price.
  const nextPlan = sub.nextPlanCode ? plans.find((p) => p.code === sub.nextPlanCode) : undefined
  const nextPrice = nextPlan?.price || sub.price

  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-medium uppercase tracking-wide text-slate-500">{title}</h2>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
            sub.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
          }`}
        >
          {t.billing.status[sub.status]}
        </span>
      </div>
      <div>
        <p className="text-lg font-semibold text-slate-900">{planName(plans, sub.planCode, lang)}</p>
        <p className="text-sm text-slate-600">
          {formatPrice(sub.price, lang)} {t.billing.perPeriod[sub.period]}
        </p>
      </div>
      {sub.status === 'past_due' && !sub.cancelAtPeriodEnd && <Alert>{t.billing.pastDue}</Alert>}
      <p className="text-sm text-slate-600">
        {sub.cancelAtPeriodEnd
          ? periodOver(sub)
            ? t.billing.endsSoon
            : t.billing.endsOn(end)
          : t.billing.nextCharge(end, formatPrice(nextPrice, lang))}
      </p>
      {nextPlan?.agentSeats && !sub.cancelAtPeriodEnd && (
        <p className="text-sm text-slate-600">{t.billing.downgradeScheduled(nextPlan.agentSeats, end)}</p>
      )}
      {children}
    </Card>
  )
}

/**
 * Stops the automatic renewal (the plan stays until the end of its period)
 * or resumes it. An own plan the agency covers can't be resumed (the
 * database checks this again).
 */
function RenewalControl({
  sub,
  coveredByAgency,
  onStart,
  onChanged,
}: {
  sub: Subscription
  coveredByAgency: boolean
  onStart: () => void
  onChanged: () => void
}) {
  const { t, lang } = useI18n()
  const confirm = useConfirm()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const end = longDate(sub.currentPeriodEnd, lang)

  // The period has ended: the plan ends (or is charged) at the next renewal run.
  const over = periodOver(sub)

  async function change(renew: boolean) {
    const ok = renew
      ? await confirm(over ? t.billing.resumeRenewalSoon : t.billing.resumeRenewalConfirm(end), {
          confirmLabel: t.billing.resumeRenewal,
        })
      : await confirm(
          [
            over ? t.billing.endsSoon : t.billing.cancelRenewalConfirm(end),
            // The agency's agents are covered by this plan.
            sub.orgId ? t.billing.cancelRenewalAgency : '',
          ].join(' '),
          { tone: 'danger', confirmLabel: t.billing.cancelRenewalConfirmLabel },
        )
    if (!ok) return
    setBusy(true)
    onStart()
    setError(null)
    try {
      await setRenewal(sub.id, renew)
      onChanged()
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  if (sub.cancelAtPeriodEnd && coveredByAgency) {
    return <p className="text-sm text-slate-500">{t.billing.coveredByAgency}</p>
  }

  return (
    <div className="space-y-3 border-t border-slate-100 pt-3">
      {sub.cancelAtPeriodEnd ? (
        <Button variant="secondary" onClick={() => change(true)} disabled={busy}>
          {busy && <Spinner />} {t.billing.resumeRenewal}
        </Button>
      ) : (
        <Button variant="danger" onClick={() => change(false)} disabled={busy}>
          {busy && <Spinner />} {t.billing.cancelRenewal}
        </Button>
      )}
      {error != null && (
        <Alert>
          {t.billing.renewalError} {errorText(error, t)}
        </Alert>
      )}
    </div>
  )
}

/**
 * Plan changes, for an active subscription that isn't cancelling (the
 * database checks this again): an agent plan moves to an agency plan, and an
 * agency plan moves up (charged now, prorated) or down (at the next renewal)
 * a seat tier, in the same period. CardCom is called only by the change-plan
 * edge function.
 */
function PlanChange({
  sub,
  plans,
  onStart,
  onUpgraded,
  onChanged,
}: {
  sub: Subscription
  plans: Plan[]
  /** A plan action starts: an earlier "plan changed" notice no longer applies. */
  onStart: () => void
  onUpgraded: () => void
  onChanged: () => void
}) {
  const { t, lang } = useI18n()
  const confirm = useConfirm()
  // The plan being changed to (or the current plan, while keeping it).
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<unknown>(null)

  const current = plans.find((p) => p.code === sub.planCode)
  if (sub.status !== 'active' || sub.cancelAtPeriodEnd || !current) return null

  const end = longDate(sub.currentPeriodEnd, lang)
  const agencyPlans = plans
    .filter((p) => p.audience === 'agency' && p.period === sub.period && p.agentSeats)
    .sort((a, b) => a.agentSeats! - b.agentSeats!)
  const seats = current.agentSeats ?? 0
  const upgrades = current.audience === 'agent' ? agencyPlans : agencyPlans.filter((p) => p.agentSeats! > seats)
  const downgrades = current.audience === 'agency' ? agencyPlans.filter((p) => p.agentSeats! < seats) : []

  async function act(code: string, action: () => Promise<void>) {
    setBusy(code)
    onStart()
    setError(null)
    try {
      await action()
    } catch (err) {
      setError(err)
      // The card may have been charged: the plan may have changed (the history shows the payment).
      if (isChargeIssue(err)) onChanged()
    } finally {
      setBusy(null)
    }
  }

  const upgrade = (plan: Plan) =>
    act(plan.code, async () => {
      const quote = await quotePlanChange(plan.code)
      if (quote.change !== 'upgrade') throw new BookingError('planChangeNotAllowed')
      const price = formatPrice(plan.price, lang)
      const per = t.billing.perPeriod[plan.period]
      const message =
        quote.amount > 0
          ? t.billing.upgradeConfirm(formatPrice(quote.amount, lang), end, price, per)
          : t.billing.upgradeFree(end, price, per)
      if (!(await confirm(message, { confirmLabel: t.billing.upgradeConfirmLabel }))) return
      await upgradePlan(plan.code, lang)
      onUpgraded()
    })

  const downgrade = (plan: Plan) =>
    act(plan.code, async () => {
      const message = t.billing.downgradeConfirm(plan.agentSeats!, end, formatPrice(plan.price, lang), t.billing.perPeriod[plan.period])
      if (!(await confirm(message))) return
      await scheduleDowngrade(plan.code)
      onChanged()
    })

  // Scheduling the current plan cancels the scheduled downgrade.
  const keep = () =>
    act(current.code, async () => {
      await scheduleDowngrade(current.code)
      onChanged()
    })

  if (!upgrades.length && !downgrades.length) return null

  return (
    <div className="space-y-3 border-t border-slate-100 pt-3">
      {current.audience === 'agent' && (
        <div>
          <h3 className="font-semibold text-slate-900">{t.billing.moveToAgency}</h3>
          <p className="mt-1 text-sm text-slate-500">{t.billing.moveToAgencyHelp}</p>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {upgrades.map((plan) => (
          <Button key={plan.code} onClick={() => upgrade(plan)} disabled={busy !== null}>
            {busy === plan.code && <Spinner />}{' '}
            {current.audience === 'agent' ? t.billing.agencySeats(plan.agentSeats!) : t.billing.upgradeSeats(plan.agentSeats!)}
          </Button>
        ))}
        {sub.nextPlanCode ? (
          <Button variant="secondary" onClick={keep} disabled={busy !== null}>
            {busy === current.code && <Spinner />} {t.billing.keepSeats(seats)}
          </Button>
        ) : (
          downgrades.map((plan) => (
            <Button key={plan.code} variant="secondary" onClick={() => downgrade(plan)} disabled={busy !== null}>
              {busy === plan.code && <Spinner />} {t.billing.downgradeSeats(plan.agentSeats!)}
            </Button>
          ))
        )}
      </div>
      {error != null && (
        <Alert>
          {t.billing.changeError} {errorText(error, t)}
          {isChargeIssue(error) && (
            <>
              {' '}
              <ContactLink />
            </>
          )}
        </Alert>
      )}
    </div>
  )
}

function PlanPicker({ audience, plans }: { audience: 'agent' | 'agency'; plans: Plan[] }) {
  const { t, lang } = useI18n()
  const [period, setPeriod] = useState<Period>('month')
  // The plan being paid for, while the browser leaves for CardCom.
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<unknown>(null)

  async function pay(code: string) {
    setBusy(code)
    setError(null)
    try {
      window.location.assign(await startCheckout(code, lang))
    } catch (err) {
      setError(err)
      setBusy(null)
    }
  }

  const shown = plans.filter((p) => p.period === period)

  return (
    <Card className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-slate-900">{t.billing.chooseTitle}</h2>
          <p className="mt-1 text-sm text-slate-500">{audience === 'agency' ? t.billing.chooseAgency : t.billing.chooseAgent}</p>
        </div>
        <div className="inline-flex rounded-xl border border-slate-300 bg-white p-0.5 text-sm">
          {PERIODS.map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={period === p}
              onClick={() => setPeriod(p)}
              className={`rounded-lg px-3 py-1.5 font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                period === p ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {t.billing.period[p]}
            </button>
          ))}
        </div>
      </div>

      <ul className="grid gap-4 sm:grid-cols-2">
        {shown.map((plan) => (
          <li key={plan.code} className="flex flex-col rounded-2xl border border-slate-200 p-5">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-semibold text-slate-900">{plan.name[lang]}</h3>
              {plan.discountPercent > 0 && (
                <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                  {t.billing.discount(plan.discountPercent)}
                </span>
              )}
            </div>
            <p className="mt-3">
              <span className="text-2xl font-bold text-slate-900">{formatPrice(plan.price, lang)}</span>{' '}
              <span className="text-sm text-slate-500">{t.billing.perPeriod[plan.period]}</span>
            </p>
            {plan.listPrice > plan.price && (
              <p className="text-sm text-slate-400">
                <s>{t.billing.listPrice(formatPrice(plan.listPrice, lang))}</s>
              </p>
            )}
            {plan.agentSeats && <p className="mt-2 text-sm text-slate-600">{t.billing.seats(plan.agentSeats)}</p>}
            <Button className="mt-4 w-full" onClick={() => pay(plan.code)} disabled={busy !== null}>
              {busy === plan.code && <Spinner />} {t.billing.pay}
            </Button>
          </li>
        ))}
      </ul>

      {audience === 'agency' && (
        <p className="text-sm text-slate-500">
          {t.billing.moreAgents} <ContactLink />
        </p>
      )}
      {error != null && (
        <Alert>
          {t.billing.payError} {errorText(error, t)}
          {error instanceof BookingError && error.code === 'checkoutUnavailable' && (
            <>
              {' '}
              <ContactLink />
            </>
          )}
        </Alert>
      )}
      <p className="text-xs text-slate-500">{t.billing.payNote}</p>
    </Card>
  )
}

function PaymentHistory({ payments, plans }: { payments: Payment[]; plans: Plan[] }) {
  const { t, lang } = useI18n()
  const statusStyle = { pending: 'bg-slate-100 text-slate-700', paid: 'bg-emerald-50 text-emerald-700', failed: 'bg-rose-50 text-rose-700' }
  const abandonedBefore = Date.now() - ABANDONED_CHECKOUT_MS
  const shown = payments.filter(
    (p) => !(p.kind === 'checkout' && p.status === 'pending' && Date.parse(p.createdAt) < abandonedBefore),
  )

  return (
    <Card>
      {shown.length === 0 ? (
        <p className="text-sm text-slate-500">{t.billing.noPayments}</p>
      ) : (
        <ul className="-my-3 divide-y divide-slate-100">
          {shown.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3 text-sm">
              <div className="min-w-0">
                <p className="font-medium text-slate-800">
                  {planName(plans, p.planCode, lang)} · {t.billing.kind[p.kind]}
                </p>
                <p className="text-xs text-slate-500">
                  {longDate(p.paidAt ?? p.createdAt, lang)}
                  {p.documentNumber != null && ` · ${t.billing.document(p.documentNumber)}`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-medium text-slate-900">{formatPrice(p.amount, lang)}</span>
                {p.refund ? (
                  <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-800">
                    {p.refund === 'due' ? t.billing.refundDue : t.billing.refunded}
                  </span>
                ) : (
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusStyle[p.status]}`}>
                    {t.billing.paymentStatus[p.status]}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function ContactLink() {
  const { t } = useI18n()
  return (
    <a href={`mailto:${CONTACT_EMAIL}`} className="font-medium text-indigo-600 hover:underline">
      {t.billing.contact}
    </a>
  )
}
