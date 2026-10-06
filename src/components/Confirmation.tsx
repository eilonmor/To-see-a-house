import { formatDate, phoneKey, type GuestBooking, type PublicProperty } from '../lib/bookingStore'
import { googleEventUrl, icsDataUrl, israelMoment, visitUid, type CalendarEvent } from '../lib/guestCalendar'
import { useI18n } from '../i18n/I18nProvider'
import { Alert, Button, Card, Spinner } from './ui'

/**
 * The visitor's booking. `kind` is 'booked' (just booked), 'rescheduled' (time
 * just changed), 'existing' (this phone already had a booking) or 'cancelled'
 * (the visitor just cancelled it). `previousWhen` is the old date and time
 * after a reschedule.
 */
export type BookingResult = GuestBooking & {
  phone: string
  kind: 'booked' | 'rescheduled' | 'existing' | 'cancelled'
  previousWhen?: string
}

type Props = {
  result: BookingResult
  property: PublicProperty
  cancelling: boolean
  cancelError: string
  onChangeTime: () => void
  onCancel: () => void
  onBookAgain: () => void
}

export default function Confirmation({ result, property, cancelling, cancelError, onChangeTime, onCancel, onBookAgain }: Props) {
  const { t, lang } = useI18n()
  const { date, slot, name, phone, instructions, kind, previousWhen = '' } = result

  if (kind === 'cancelled') {
    return (
      <Card className="mx-auto max-w-md text-center">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-slate-100 text-slate-500">
          <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </div>
        <h2 className="mt-5 text-2xl font-bold text-slate-900">{t.confirmation.cancelled.title}</h2>
        <p className="mt-2 text-slate-500">{t.confirmation.cancelled.body(name, `${formatDate(date, lang)} ${slot}`)}</p>
        <p className="mt-2 text-sm text-slate-400">{t.confirmation.calendar.removeAfterCancel}</p>
        <Button variant="secondary" className="mt-6 w-full" onClick={onBookAgain}>
          {t.confirmation.bookAgain}
        </Button>
      </Card>
    )
  }

  const copy = t.confirmation[kind]
  return (
    <Card className="mx-auto max-w-md text-center">
      <div
        className={`mx-auto grid h-16 w-16 place-items-center rounded-full ${
          kind === 'existing' ? 'bg-indigo-100 text-indigo-600' : 'bg-emerald-100 text-emerald-600'
        }`}
      >
        {kind === 'existing' ? (
          <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="17" rx="2" />
            <path d="M16 2v4M8 2v4M3 10h18" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 13l4 4L19 7" />
          </svg>
        )}
      </div>
      <h2 className="mt-5 text-2xl font-bold text-slate-900">{copy.title}</h2>
      <p className="mt-2 text-slate-500">{copy.body(name, previousWhen)}</p>

      <dl className="mt-6 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-slate-50 text-start text-sm">
        <div className="flex justify-between px-4 py-3">
          <dt className="text-slate-500">{t.confirmation.date}</dt>
          <dd className="font-semibold text-slate-900">{formatDate(date, lang, { weekday: 'long', day: 'numeric', month: 'long' })}</dd>
        </div>
        <div className="flex justify-between px-4 py-3">
          <dt className="text-slate-500">{t.confirmation.time}</dt>
          <dd className="font-semibold text-slate-900">{slot}</dd>
        </div>
        <div className="flex justify-between px-4 py-3">
          <dt className="text-slate-500">{t.confirmation.name}</dt>
          <dd className="font-medium text-slate-900">{name}</dd>
        </div>
        <div className="flex justify-between px-4 py-3">
          <dt className="text-slate-500">{t.confirmation.phone}</dt>
          <dd className="font-medium text-slate-900" dir="ltr">
            {phone}
          </dd>
        </div>
      </dl>

      {instructions && (
        <div className="mt-6 rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-4 text-start">
          <h3 className="text-sm font-semibold text-indigo-900">{t.confirmation.instructionsTitle}</h3>
          <p dir="auto" className="mt-2 whitespace-pre-line break-words text-sm leading-relaxed text-slate-700">
            <Linkified text={instructions} />
          </p>
        </div>
      )}

      <AddToCalendar result={result} property={property} />

      {cancelError && (
        <div className="mt-6">
          <Alert>{cancelError}</Alert>
        </div>
      )}

      <Button variant="secondary" className="mt-6 w-full" onClick={onChangeTime} disabled={cancelling}>
        {t.confirmation.changeTime}
      </Button>
      <Button variant="danger" className="mt-3 w-full" onClick={onCancel} disabled={cancelling}>
        {cancelling ? <Spinner /> : null} {cancelling ? t.confirmation.cancelling : t.confirmation.cancel}
      </Button>
    </Card>
  )
}

// Visits whose day is no longer listed (e.g. it was just deleted) get this length.
const DEFAULT_VISIT_MINUTES = 15

function AddToCalendar({ result, property }: { result: BookingResult; property: PublicProperty }) {
  const { t } = useI18n()
  const minutes = property.days.find((d) => d.id === result.dayId)?.slotMinutes ?? DEFAULT_VISIT_MINUTES
  const start = israelMoment(result.date, result.slot)
  // The booking page, where the visitor can change or cancel the booking.
  const pageUrl = `${window.location.origin}${window.location.pathname}`
  const event: CalendarEvent = {
    uid: visitUid(property.id, phoneKey(result.phone)),
    start,
    end: new Date(start.getTime() + minutes * 60_000),
    title: t.confirmation.calendar.eventTitle(property.title),
    details: [result.instructions, `${t.confirmation.calendar.manage} ${pageUrl}`].filter(Boolean).join('\n\n'),
    location: property.address,
  }
  const linkClass =
    'inline-flex flex-1 items-center justify-center rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2'

  return (
    <div className="mt-6">
      <h3 className="text-sm font-semibold text-slate-700">{t.confirmation.calendar.title}</h3>
      <div className="mt-2 flex gap-2">
        <a href={googleEventUrl(event)} target="_blank" rel="noopener noreferrer" className={linkClass}>
          Google
        </a>
        <a href={icsDataUrl(event)} download="viewing.ics" className={linkClass}>
          Apple / Outlook
        </a>
      </div>
    </div>
  )
}

// Renders plain text with any http(s) links made clickable (e.g. a Waze or Maps link).
function Linkified({ text }: { text: string }) {
  return text.split(/(https?:\/\/[^\s]+)/g).map((part, i) =>
    i % 2 === 1 ? (
      <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="font-medium text-indigo-600 underline" dir="ltr">
        {part}
      </a>
    ) : (
      part
    ),
  )
}
