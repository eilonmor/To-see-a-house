import { useCallback, useEffect, useState, type FormEvent } from 'react'
import {
  addDay,
  deleteDay,
  deleteProperty,
  fetchDays,
  fetchProperty,
  releaseBooking,
  updateDay,
  updateProperty,
  type AdminBooking,
  type AdminDay,
  type NewDay,
  type Property,
} from '../lib/adminStore'
import { BookingError, formatDate, israelToday } from '../lib/bookingStore'
import { usePolledData } from '../hooks/usePolledData'
import { navigate } from '../hooks/useRoute'
import { errorText, useI18n } from '../i18n/I18nProvider'
import { useAccount } from './AccountGate'
import { Alert, Button, Card, Field, Link, Loading, Spinner } from './ui'
import InstructionsEditor from './InstructionsEditor'
import DayForm from './DayForm'

/** One property: share link, bookings per day, dates, details and instructions. */
export default function PropertyEditor({ propertyId }: { propertyId: string }) {
  const { t, lang } = useI18n()
  const { profile, reloadProfile } = useAccount()
  // null while loading.
  const [property, setProperty] = useState<Property | null>(null)
  const [propertyError, setPropertyError] = useState<unknown>(null)
  const [busy, setBusy] = useState<string | null>(null) // id of the booking / day / property being changed
  const [actionError, setActionError] = useState('')
  const [editingDayId, setEditingDayId] = useState<string | null>(null)

  useEffect(() => {
    fetchProperty(propertyId).then(setProperty, setPropertyError)
  }, [propertyId])

  const load = useCallback(() => fetchDays(propertyId), [propertyId])
  const { data: days, loading, error, lastUpdated, refresh } = usePolledData<AdminDay[]>(property ? load : null, [])

  const today = israelToday()
  const upcoming = days.filter((d) => d.date >= today)
  const archived = days.filter((d) => d.date < today)
  const totalSlots = upcoming.reduce((n, d) => n + d.slots.length, 0)
  const bookedCount = upcoming.reduce((n, d) => n + d.slots.filter((s) => d.bookings[s]).length, 0)

  async function act(id: string, confirmText: string, errorPrefix: string, action: () => Promise<void>) {
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

  if (!property) {
    return (
      <div className="space-y-4 pt-6">
        <BackLink />
        {propertyError == null ? (
          <Loading label={t.dashboard.loading} />
        ) : (
          <Alert>
            {propertyError instanceof BookingError && propertyError.code === 'propertyNotFound'
              ? t.editor.notFound
              : `${t.dashboard.loadError} ${errorText(propertyError, t)}`}
          </Alert>
        )}
      </div>
    )
  }

  // Only the payer deletes: the owning user, or the owning agency's admin.
  const isOwner =
    property.owner_user_id === profile.id ||
    (property.owner_org_id !== null && profile.role === 'agency_admin' && profile.orgId === property.owner_org_id)
  const freePlan = property.owner_user_id === profile.id && profile.role === 'personal'

  // Free plan: two dates in total. The database enforces it; this explains it up front.
  let addDayNotice = ''
  if (freePlan && upcoming.length >= 2) addDayNotice = t.addDay.limitReached
  else if (freePlan && days.length >= 2 && archived.length > 0) addDayNotice = t.addDay.replacesOldest(formatDate(archived[0].date, lang))

  const when = (day: AdminDay, slot: string) => `${formatDate(day.date, lang)} ${slot}`
  const handleRelease = (day: AdminDay, slot: string, booking: AdminBooking) =>
    act(booking.id, t.dashboard.confirmRelease(when(day, slot), booking.name), t.dashboard.releaseError(when(day, slot)), () =>
      releaseBooking(booking.id),
    )
  const handleDeleteDay = (day: AdminDay) =>
    act(day.id, t.dashboard.confirmDeleteDay(formatDate(day.date, lang), Object.keys(day.bookings).length), t.dashboard.deleteDayError, () =>
      deleteDay(day.id),
    )

  async function handleEditDay(day: AdminDay, next: NewDay) {
    const booked = Object.keys(day.bookings).length
    if (next.date !== day.date && booked > 0) {
      if (!window.confirm(t.addDay.confirmMove(formatDate(day.date, lang), formatDate(next.date, lang), booked))) return
    }
    await updateDay(day.id, next)
    setEditingDayId(null)
    await refresh()
  }

  async function handleDeleteProperty() {
    if (!property || !window.confirm(t.editor.confirmDelete(property.title))) return
    setBusy(property.id)
    setActionError('')
    try {
      await deleteProperty(property.id)
      reloadProfile()
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setActionError(`${t.editor.deleteError} ${errorText(err, t)}`)
      setBusy(null)
    }
  }

  return (
    <div className="space-y-6 pt-6">
      <BackLink />

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{property.title}</h1>
          {property.address && <p className="mt-0.5 text-slate-500">{property.address}</p>}
          <p className="mt-1 text-sm text-slate-500">
            {lastUpdated ? t.dashboard.lastUpdated(lastUpdated.toLocaleTimeString(lang)) : t.dashboard.loading} · {t.dashboard.auto}
          </p>
        </div>
        <Button variant="secondary" onClick={refresh} disabled={loading}>
          {loading ? <Spinner /> : '↻'} {t.dashboard.refresh}
        </Button>
      </div>

      <ShareLink slug={property.public_slug} />

      <div className="grid grid-cols-3 gap-3">
        <Stat label={t.dashboard.total} value={totalSlots} />
        <Stat label={t.dashboard.booked} value={bookedCount} tone="indigo" />
        <Stat label={t.dashboard.available} value={totalSlots - bookedCount} tone="emerald" />
      </div>

      {error != null && (
        <Alert>
          {t.dashboard.loadError} {errorText(error, t)}
        </Alert>
      )}
      {actionError && <Alert>{actionError}</Alert>}

      {loading ? (
        <Card>
          <Loading label={t.dashboard.loading} />
        </Card>
      ) : days.length === 0 ? (
        <Alert tone="info">{t.dashboard.noDays}</Alert>
      ) : (
        [...upcoming, ...[...archived].reverse()].map((day) => (
          <DayTable
            key={day.id}
            day={day}
            archived={day.date < today}
            busy={busy}
            editing={editingDayId === day.id}
            onEdit={() => setEditingDayId(day.id)}
            onCancelEdit={() => setEditingDayId(null)}
            onSave={(next) => handleEditDay(day, next)}
            onRelease={handleRelease}
            onDelete={handleDeleteDay}
          />
        ))
      )}

      <Card>
        <h2 className="text-lg font-semibold text-slate-900">{t.addDay.title}</h2>
        <p className="mt-1 text-sm text-slate-500">{t.addDay.help}</p>
        {addDayNotice && (
          <div className="mt-4">
            <Alert tone="info">{addDayNotice}</Alert>
          </div>
        )}
        <div className="mt-4">
          <DayForm
            idPrefix="new-day"
            disabled={freePlan && upcoming.length >= 2}
            onSubmit={async (day) => {
              await addDay(property.id, day)
              await refresh()
            }}
          />
        </div>
      </Card>

      <DetailsEditor property={property} onSaved={setProperty} />

      <InstructionsEditor
        propertyId={property.id}
        instructions={property.instructions}
        onSaved={(instructions) => setProperty({ ...property, instructions })}
      />

      {isOwner && (
        <Card className="border-rose-200!">
          <h2 className="text-lg font-semibold text-slate-900">{t.editor.deleteTitle}</h2>
          <p className="mt-1 text-sm text-slate-500">{t.editor.deleteHelp}</p>
          {freePlan && <p className="mt-1 text-sm text-slate-500">{t.editor.deleteCooldown}</p>}
          <div className="mt-4 flex justify-end">
            <Button variant="danger" onClick={handleDeleteProperty} disabled={busy !== null}>
              {busy === property.id && <Spinner />} {t.editor.delete}
            </Button>
          </div>
        </Card>
      )}
    </div>
  )
}

function BackLink() {
  const { t } = useI18n()
  return (
    <Link href="/dashboard" className="inline-block text-sm text-slate-500 hover:text-slate-800">
      {t.editor.back}
    </Link>
  )
}

function ShareLink({ slug }: { slug: string }) {
  const { t } = useI18n()
  const [copied, setCopied] = useState(false)
  const url = `${window.location.origin}/p/${slug}`

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
    <Card className="p-5! sm:p-6!">
      <p className="text-sm font-medium text-slate-700">{t.dashboard.shareLink}</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <a href={url} target="_blank" rel="noopener" dir="ltr" className="min-w-0 flex-1 break-all text-sm text-indigo-600 hover:underline">
          {url}
        </a>
        <Button variant="secondary" className="px-3! py-1.5! text-xs" onClick={copy}>
          {copied ? `✓ ${t.dashboard.copied}` : t.dashboard.copy}
        </Button>
      </div>
    </Card>
  )
}

/** Title and address, shown at the top of the booking page. */
function DetailsEditor({ property, onSaved }: { property: Property; onSaved: (property: Property) => void }) {
  const { t } = useI18n()
  const [values, setValues] = useState({ title: property.title, address: property.address })
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<'saved' | { error: unknown } | null>(null)

  useEffect(() => {
    if (status !== 'saved') return
    const id = setTimeout(() => setStatus(null), 3000)
    return () => clearTimeout(id)
  }, [status])

  const dirty = values.title.trim() !== property.title || values.address.trim() !== property.address

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setStatus(null)
    try {
      const saved = await updateProperty(property.id, values)
      setValues({ title: saved.title, address: saved.address })
      onSaved(saved)
      setStatus('saved')
    } catch (err) {
      setStatus({ error: err })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <h2 className="text-lg font-semibold text-slate-900">{t.editor.details}</h2>
      <p className="mt-1 text-sm text-slate-500">{t.editor.detailsHelp}</p>
      <form onSubmit={handleSubmit} className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field
          id="property-title"
          label={t.setup.propertyTitle}
          value={values.title}
          onChange={(e) => {
            setValues((v) => ({ ...v, title: e.target.value }))
            setStatus(null)
          }}
          required
        />
        <Field
          id="property-address"
          label={t.setup.address}
          value={values.address}
          onChange={(e) => {
            setValues((v) => ({ ...v, address: e.target.value }))
            setStatus(null)
          }}
        />
        {status && status !== 'saved' && (
          <div className="sm:col-span-2">
            <Alert>
              {t.editor.saveError} {errorText(status.error, t)}
            </Alert>
          </div>
        )}
        <div className="flex items-center justify-end gap-3 sm:col-span-2">
          {status === 'saved' && <span className="text-sm font-medium text-emerald-600">✓ {t.editor.saved}</span>}
          <Button type="submit" disabled={!dirty || !values.title.trim() || busy}>
            {busy && <Spinner />} {t.editor.save}
          </Button>
        </div>
      </form>
    </Card>
  )
}

type DayTableProps = {
  day: AdminDay
  archived: boolean
  busy: string | null
  editing: boolean
  onEdit: () => void
  onCancelEdit: () => void
  onSave: (next: NewDay) => Promise<void>
  onRelease: (day: AdminDay, slot: string, booking: AdminBooking) => void
  onDelete: (day: AdminDay) => void
}

function DayTable({ day, archived, busy, editing, onEdit, onCancelEdit, onSave, onRelease, onDelete }: DayTableProps) {
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
        <div className="flex gap-2">
          {!archived && !editing && (
            <Button variant="secondary" className="px-3! py-1.5! text-xs" onClick={onEdit} disabled={busy !== null}>
              {t.addDay.edit}
            </Button>
          )}
          <Button variant="danger" className="px-3! py-1.5! text-xs" onClick={() => onDelete(day)} disabled={busy !== null}>
            {busy === day.id ? <Spinner className="h-3 w-3" /> : null} {t.dashboard.deleteDay}
          </Button>
        </div>
      </div>
      {editing && (
        <div className="border-b border-slate-200 bg-slate-50 px-4 py-4 sm:px-6">
          <DayForm
            idPrefix={`day-${day.id}`}
            initial={{ date: day.date, startTime: day.startTime, endTime: day.endTime, slotMinutes: day.slotMinutes }}
            onSubmit={onSave}
            onCancel={onCancelEdit}
          />
        </div>
      )}
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

function Stat({ label, value, tone = 'slate' }: { label: string; value: number; tone?: 'slate' | 'indigo' | 'emerald' }) {
  const color = { slate: 'text-slate-900', indigo: 'text-indigo-600', emerald: 'text-emerald-600' }[tone]
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${color}`}>{value}</div>
    </div>
  )
}
