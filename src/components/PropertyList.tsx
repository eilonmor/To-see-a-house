import { useState } from 'react'
import { fetchProperties, type PropertySummary } from '../lib/adminStore'
import { pendingInvite } from '../lib/agencyStore'
import { nextPropertyAllowedAt, upgradeToAgent } from '../lib/auth'
import { formatDate, israelDate } from '../lib/bookingStore'
import { usePolledData } from '../hooks/usePolledData'
import { errorText, useI18n } from '../i18n/I18nProvider'
import { useAccount } from './AccountGate'
import { Alert, Button, Card, Link, Loading, Redirect, Spinner } from './ui'

/** The dashboard home: every property the user manages. */
export default function PropertyList() {
  const { t, lang } = useI18n()
  const { profile } = useAccount()
  const { data: properties, loading, error } = usePolledData<PropertySummary[]>(fetchProperties, [])

  // Personal (free) plan: one property, and a new one at most every 30 days.
  // The database enforces this too; here it only explains why the button is off.
  const nextAllowed = nextPropertyAllowedAt(profile)
  let blockedReason = ''
  if (profile.role === 'personal' && !loading) {
    if (properties.length > 0) blockedReason = t.properties.limitReached
    else if (nextAllowed) {
      blockedReason = t.properties.cooldown(formatDate(israelDate(nextAllowed), lang, { day: 'numeric', month: 'long', year: 'numeric' }))
    }
  }

  // An agency invite opened before signing up (sign-up and Google land here).
  const invite = pendingInvite()
  if (invite) return <Redirect to={`/join/${encodeURIComponent(invite)}`} />

  return (
    <div className="space-y-6 pt-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t.properties.title}</h1>
        {!loading && !blockedReason && (
          <Link
            href="/dashboard/new"
            className="inline-flex items-center justify-center rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
          >
            {t.properties.new}
          </Link>
        )}
      </div>

      {profile.role === 'personal' && <FreePlanNote />}

      {error != null && (
        <Alert>
          {t.properties.loadError} {errorText(error, t)}
        </Alert>
      )}

      {loading ? (
        <Loading label={t.dashboard.loading} />
      ) : (
        <>
          {blockedReason && <Alert tone="info">{blockedReason}</Alert>}
          {properties.length === 0 && error == null && !blockedReason && <Alert tone="info">{t.properties.empty}</Alert>}
          <ul className="grid gap-4 sm:grid-cols-2">
            {properties.map((property) => (
              <li key={property.id}>
                <PropertyCard property={property} />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

/** The free plan's limits, and the way out of them. */
function FreePlanNote() {
  const { t } = useI18n()
  const { reloadProfile } = useAccount()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function upgrade() {
    if (!window.confirm(t.properties.confirmUpgrade)) return
    setBusy(true)
    setError('')
    try {
      await upgradeToAgent()
      // The profile is now an agent's: this note goes away.
      await reloadProfile()
    } catch (err) {
      setError(`${t.properties.upgradeError} ${errorText(err, t)}`)
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-white/70 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 text-sm">
          <p className="text-slate-600">{t.properties.freePlan}</p>
          <p className="mt-0.5 text-slate-500">{t.properties.upgradeHelp}</p>
        </div>
        <Button variant="secondary" className="px-3! py-1.5! text-xs" onClick={upgrade} disabled={busy}>
          {busy && <Spinner className="h-3 w-3" />} {t.properties.upgrade}
        </Button>
      </div>
      {error && <Alert>{error}</Alert>}
    </div>
  )
}

function PropertyCard({ property }: { property: PropertySummary }) {
  const { t, lang } = useI18n()
  return (
    <Link
      href={`/dashboard/p/${property.id}`}
      className="block h-full rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
    >
      <Card className="h-full p-5! transition hover:border-indigo-300 hover:shadow-md sm:p-6!">
        <div className="flex items-start justify-between gap-2">
          <h2 className="font-semibold text-slate-900">{property.title}</h2>
          {property.owner_org_id && (
            <span className="shrink-0 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700">
              {t.properties.agencyBadge}
            </span>
          )}
        </div>
        {property.address && <p className="mt-0.5 text-sm text-slate-500">{property.address}</p>}
        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
          {property.upcomingDates.length === 0 ? (
            <span className="text-slate-400">{t.properties.noDates}</span>
          ) : (
            <>
              <span className="text-slate-500">{t.properties.nextDates}</span>
              {property.upcomingDates.slice(0, 3).map((date) => (
                <span key={date} className="rounded-full bg-slate-100 px-2.5 py-0.5 font-medium text-slate-700">
                  {formatDate(date, lang)}
                </span>
              ))}
              {property.upcomingDates.length > 3 && <span className="text-slate-400">+{property.upcomingDates.length - 3}</span>}
              <span className="ms-auto rounded-full bg-indigo-50 px-2.5 py-0.5 font-medium text-indigo-700">
                {t.properties.bookings(property.upcomingBookings)}
              </span>
            </>
          )}
        </div>
      </Card>
    </Link>
  )
}
