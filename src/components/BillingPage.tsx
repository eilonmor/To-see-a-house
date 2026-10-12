import { useCallback, useEffect, useRef, useState } from 'react'
import { CONTACT_EMAIL } from '../config'
import {
  fetchMyPayments,
  fetchMySubscription,
  fetchPlans,
  startCheckout,
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
import { Alert, Button, Card, Loading, Spinner } from './ui'

type Billing = { plans: Plan[]; subs: MySubscriptions; payments: Payment[] }

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

const planName = (plans: Plan[], code: string, lang: Lang) => plans.find((p) => p.code === code)?.name[lang] ?? code

/**
 * /dashboard/billing: the user's plan (or the plans they may buy), and their
 * payments. Payment and subscription statuses are only read here; the
 * payment-webhook edge function changes them.
 */
export default function BillingPage() {
  const { t } = useI18n()
  const { user, profile, reloadProfile } = useAccount()
  // CardCom sends the browser back with ?result=success or ?result=failed.
  const [result] = useState(() => new URLSearchParams(window.location.search).get('result'))

  useEffect(() => {
    // Shown once: a reload or a shared link doesn't repeat it.
    if (window.location.search) window.history.replaceState(null, '', window.location.pathname)
  }, [])

  const load = useCallback(async (): Promise<Billing> => {
    const [plans, subs, payments] = await Promise.all([fetchPlans(), fetchMySubscription(profile), fetchMyPayments()])
    return { plans, subs, payments }
  }, [profile])
  const { data, loading, error, refresh } = usePolledData<Billing | null>(load, null)

  // The payment went through: a personal buyer is an agent now.
  const onConfirmed = useCallback(() => {
    refresh()
    reloadProfile().catch(() => {})
  }, [refresh, reloadProfile])

  // Which plans the user may buy (the database checks this again):
  // agency plans for an agency admin, agent plans outside an agency.
  const audience = profile.role === 'agency_admin' ? 'agency' : profile.orgId ? null : 'agent'

  return (
    <div className="space-y-6 pt-6">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t.billing.title}</h1>

      {result === 'success' && <CheckoutResult userId={user.id} onConfirmed={onConfirmed} />}
      {result === 'failed' && <Alert>{t.billing.failed}</Alert>}

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
          {data.subs.agency && <SubscriptionCard title={t.billing.agencyTitle} sub={data.subs.agency} plans={data.plans} />}
          {data.subs.own && <SubscriptionCard title={t.billing.ownTitle} sub={data.subs.own} plans={data.plans} />}
          {audience === null && <Alert tone="info">{t.billing.covered}</Alert>}
          {audience && !data.subs[audience === 'agency' ? 'agency' : 'own'] && (
            <PlanPicker audience={audience} plans={data.plans.filter((p) => p.audience === audience)} />
          )}
          <PaymentHistory payments={data.payments} plans={data.plans} />
        </>
      )}
    </div>
  )
}

/** "Confirming your payment…" until the user's latest checkout is no longer pending. */
function CheckoutResult({ userId, onConfirmed }: { userId: string; onConfirmed: () => void }) {
  const { t } = useI18n()
  const [state, setState] = useState<'confirming' | 'paid' | 'failed' | 'timeout'>('confirming')
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
        const latest = (await fetchMyPayments()).find((p) => p.kind === 'checkout' && p.boughtBy === userId)
        if (stopped) return
        if (latest && latest.status !== 'pending') {
          setState(latest.status)
          if (latest.status === 'paid') confirmed.current()
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
  }, [userId])

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
  if (state === 'failed') return <Alert>{t.billing.failed}</Alert>
  return (
    <Alert>
      {t.billing.stillConfirming} <ContactLink />
    </Alert>
  )
}

function SubscriptionCard({ title, sub, plans }: { title: string; sub: Subscription; plans: Plan[] }) {
  const { t, lang } = useI18n()
  const end = longDate(sub.currentPeriodEnd, lang)
  // A downgrade scheduled for the renewal is charged at that plan's price.
  const nextPrice = (sub.nextPlanCode && plans.find((p) => p.code === sub.nextPlanCode)?.price) || sub.price

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
      {sub.status === 'past_due' && <Alert>{t.billing.pastDue}</Alert>}
      <p className="text-sm text-slate-600">
        {sub.cancelAtPeriodEnd ? t.billing.endsOn(end) : t.billing.nextCharge(end, formatPrice(nextPrice, lang))}
      </p>
      {/* Plan changes (Task 6) and stopping / resuming the renewal (Task 7) go here. */}
    </Card>
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
      <h2 className="text-lg font-semibold text-slate-900">{t.billing.historyTitle}</h2>
      {shown.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">{t.billing.noPayments}</p>
      ) : (
        <ul className="mt-4 divide-y divide-slate-100">
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
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusStyle[p.status]}`}>
                  {t.billing.paymentStatus[p.status]}
                </span>
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
