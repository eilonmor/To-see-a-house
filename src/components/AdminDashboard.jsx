import { useCallback, useEffect, useState } from 'react'
import { deleteDay, fetchDays, fetchMyProperty, releaseBooking, signOut } from '../lib/adminStore'
import { formatDate, israelToday } from '../lib/bookingStore'
import { usePolledData } from '../hooks/usePolledData'
import { errorText, useI18n } from '../i18n/I18nProvider'
import { Alert, Button, Card, Spinner } from './ui'
import InstructionsEditor from './InstructionsEditor'
import PropertySetup from './PropertySetup'
import AddDayForm from './AddDayForm'

export default function AdminDashboard({ user }) {
  const { t, lang } = useI18n()
  // undefined while loading, then the user's property or null.
  const [property, setProperty] = useState(undefined)
  const [propertyError, setPropertyError] = useState(null)
  const [busy, setBusy] = useState(null) // id of the booking / day being changed
  const [actionError, setActionError] = useState('')

  useEffect(() => {
    fetchMyProperty().then(setProperty, setPropertyError)
  }, [])

  const propertyId = property?.id
  const load = useCallback(() => fetchDays(propertyId), [propertyId])
  const { data: days, loading, error, lastUpdated, refresh } = usePolledData(propertyId ? load : null, [])

  const today = israelToday()
  const upcoming = days.filter((d) => d.date >= today)
  const totalSlots = upcoming.reduce((n, d) => n + d.slots.length, 0)
  const bookedCount = upcoming.reduce((n, d) => n + d.slots.filter((s) => d.bookings[s]).length, 0)

  async function act(id, confirmText, errorPrefix, action) {
    if (!window.confirm(confirmText)) return
    setBusy(id)
    setActionError('')
    try {
      await action()
      await refresh()
    } catch (err) {
      setActionError(`${errorPrefix} ${errorText(err, t)}`)
    } finally {
      setBusy(null)
    }
  }

  const when = (day, slot) => `${formatDate(day.date, lang)} ${slot}`
  const handleRelease = (day, slot, booking) =>
    act(booking.id, t.dashboard.confirmRelease(when(day, slot), booking.name), t.dashboard.releaseError(when(day, slot)), () =>
      releaseBooking(booking.id),
    )
  const handleDeleteDay = (day) =>
    act(day.id, t.dashboard.confirmDeleteDay(formatDate(day.date, lang), Object.keys(day.bookings).length), t.dashboard.deleteDayError, () =>
      deleteDay(day.id),
    )

  return (
    <div className="space-y-6 pt-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t.dashboard.title}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {user.email}
            {property && (
              <>
                {' · '}
                {lastUpdated ? t.dashboard.lastUpdated(lastUpdated.toLocaleTimeString(lang)) : t.dashboard.loading} ·{' '}
                {t.dashboard.auto}
              </>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          {property && (
            <Button variant="secondary" onClick={refresh} disabled={loading}>
              {loading ? <Spinner /> : '↻'} {t.dashboard.refresh}
            </Button>
          )}
          <Button variant="secondary" onClick={() => signOut().catch(() => {})}>
            {t.dashboard.logout}
          </Button>
        </div>
      </div>

      {propertyError && (
        <Alert>
          {t.dashboard.loadError} {errorText(propertyError, t)}
        </Alert>
      )}

      {property === undefined && !propertyError && (
        <div className="flex items-center justify-center gap-2 py-16 text-slate-500">
          <Spinner /> {t.dashboard.loading}
        </div>
      )}

      {property === null && <PropertySetup userId={user.id} onCreated={setProperty} />}

      {property && (
        <>
          <ShareLink property={property} />

          <div className="grid grid-cols-3 gap-3">
            <Stat label={t.dashboard.total} value={totalSlots} />
            <Stat label={t.dashboard.booked} value={bookedCount} tone="indigo" />
            <Stat label={t.dashboard.available} value={totalSlots - bookedCount} tone="emerald" />
          </div>

          {error && (
            <Alert>
              {t.dashboard.loadError} {errorText(error, t)}
            </Alert>
          )}
          {actionError && <Alert>{actionError}</Alert>}

          {loading ? (
            <Card className="flex items-center justify-center gap-2 py-16 text-slate-500">
              <Spinner /> {t.dashboard.loading}
            </Card>
          ) : days.length === 0 ? (
            <Alert tone="info">{t.dashboard.noDays}</Alert>
          ) : (
            [...upcoming, ...days.filter((d) => d.date < today).reverse()].map((day) => (
              <DayTable
                key={day.id}
                day={day}
                archived={day.date < today}
                busy={busy}
                onRelease={handleRelease}
                onDelete={handleDeleteDay}
              />
            ))
          )}

          <AddDayForm propertyId={property.id} onAdded={refresh} />

          <InstructionsEditor
            propertyId={property.id}
            instructions={property.instructions}
            onSaved={(instructions) => setProperty((p) => ({ ...p, instructions }))}
          />
        </>
      )}
    </div>
  )
}

function ShareLink({ property }) {
  const { t } = useI18n()
  const [copied, setCopied] = useState(false)
  const url = `${window.location.origin}${window.location.pathname}#/p/${property.public_slug}`

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard unavailable — the link is still selectable
    }
  }

  return (
    <Card>
      <h2 className="text-lg font-semibold text-slate-900">{property.title}</h2>
      {property.address && <p className="mt-1 text-sm text-slate-500">{property.address}</p>}
      <p className="mt-4 text-sm font-medium text-slate-700">{t.dashboard.shareLink}</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <a href={url} dir="ltr" className="min-w-0 flex-1 break-all text-sm text-indigo-600 hover:underline">
          {url}
        </a>
        <Button variant="secondary" className="px-3! py-1.5! text-xs" onClick={copy}>
          {copied ? `✓ ${t.dashboard.copied}` : t.dashboard.copy}
        </Button>
      </div>
    </Card>
  )
}

function DayTable({ day, archived, busy, onRelease, onDelete }) {
  const { t, lang } = useI18n()
  const booked = day.slots.filter((s) => day.bookings[s]).length

  return (
    <Card className={`overflow-hidden p-0! ${archived ? 'opacity-75' : ''}`}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-4 sm:px-6">
        <div>
          <h2 className="font-semibold text-slate-900">
            {formatDate(day.date, lang, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            {archived && (
              <span className="ms-2 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-500">
                {t.dashboard.archived}
              </span>
            )}
          </h2>
          <p className="mt-0.5 text-sm text-slate-500" dir="ltr">
            {day.startTime}–{day.endTime} · {t.dashboard.everyMinutes(day.slotMinutes)} · {t.dashboard.bookedOf(booked, day.slots.length)}
          </p>
        </div>
        <Button variant="danger" className="px-3! py-1.5! text-xs" onClick={() => onDelete(day)} disabled={busy !== null}>
          {busy === day.id ? <Spinner className="h-3 w-3" /> : null} {t.dashboard.deleteDay}
        </Button>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-start text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th scope="col" className="px-4 py-3 sm:px-6">
                {t.dashboard.colTime}
              </th>
              <th scope="col" className="px-4 py-3">
                {t.dashboard.colVisitor}
              </th>
              <th scope="col" className="px-4 py-3">
                {t.dashboard.colPhone}
              </th>
              <th scope="col" className="px-4 py-3 text-end sm:px-6">
                <span className="sr-only">{t.dashboard.colActions}</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {day.slots.map((slot) => {
              const booking = day.bookings[slot]
              return (
                <tr key={slot} className={booking ? 'bg-white' : 'bg-slate-50/50'}>
                  <td className="whitespace-nowrap px-4 py-4 font-semibold text-slate-900 sm:px-6">{slot}</td>
                  {booking ? (
                    <>
                      <td className="px-4 py-4 text-slate-800">{booking.name}</td>
                      <td className="whitespace-nowrap px-4 py-4">
                        <a href={`tel:${booking.phone}`} className="text-indigo-600 hover:underline" dir="ltr">
                          {booking.phone}
                        </a>
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 text-end sm:px-6">
                        <Button
                          variant="danger"
                          className="px-3! py-1.5! text-xs"
                          onClick={() => onRelease(day, slot, booking)}
                          disabled={busy !== null}
                        >
                          {busy === booking.id ? <Spinner className="h-3 w-3" /> : null} {t.dashboard.release}
                        </Button>
                      </td>
                    </>
                  ) : (
                    <td colSpan={3} className="px-4 py-4 sm:pe-6">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> {t.dashboard.availableBadge}
                      </span>
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

function Stat({ label, value, tone = 'slate' }) {
  const color = { slate: 'text-slate-900', indigo: 'text-indigo-600', emerald: 'text-emerald-600' }[tone]
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${color}`}>{value}</div>
    </div>
  )
}
