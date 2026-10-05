import { useCallback, useState } from 'react'
import {
  BookingError,
  bookSlot,
  cancelBooking,
  fetchProperty,
  findGuestBookings,
  formatDate,
  isValidPhone,
  rescheduleBooking,
  type GuestBooking,
  type GuestDetails,
  type PublicProperty,
  type SlotChoice,
} from '../lib/bookingStore'
import { usePolledData } from '../hooks/usePolledData'
import { errorText, useI18n } from '../i18n/I18nProvider'
import { Alert, Card, Spinner } from './ui'
import DetailsForm from './DetailsForm'
import SlotPicker from './SlotPicker'
import Confirmation, { type BookingResult } from './Confirmation'

type Step = 'details' | 'pick' | 'done'
const STEP_INDEX: Record<Step, number> = { details: 0, pick: 1, done: 2 }

export default function BookingPage({ slug }: { slug: string }) {
  const { t, lang } = useI18n()
  const load = useCallback(() => fetchProperty(slug), [slug])
  const { data: property, loading, error: loadError, refresh } = usePolledData<PublicProperty | null>(load, null)
  const [step, setStep] = useState<Step>('details')
  const [details, setDetails] = useState<GuestDetails>({ name: '', phone: '' })
  const [checking, setChecking] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  // 'new' = first booking for this phone; 'reschedule' = moving an existing booking.
  const [mode, setMode] = useState<'new' | 'reschedule'>('new')
  const [result, setResult] = useState<BookingResult | null>(null)
  const [cancelling, setCancelling] = useState(false)
  const [cancelError, setCancelError] = useState('')

  const when = ({ date, slot }: { date: string; slot: string }) => `${formatDate(date, lang)} ${slot}`

  // The phone number is the visitor's identity: if it already has a booking,
  // show that booking (with the option to change the time) instead of booking again.
  async function handleDetails(d: GuestDetails) {
    setDetails(d)
    setSubmitError('')
    setChecking(true)
    let existing: GuestBooking[]
    try {
      existing = await findGuestBookings(slug, d.phone)
    } catch (err) {
      // Stop here: booking without knowing about an existing booking would
      // silently move it (the database moves a phone's booking within a day).
      setSubmitError(`${t.details.lookupError} ${errorText(err, t)}`)
      return
    } finally {
      setChecking(false)
    }
    if (existing.length > 0) {
      setResult({ ...existing[0], phone: d.phone, kind: 'existing' })
      setStep('done')
    } else if (!isValidPhone(d.phone)) {
      // A 9-digit number only reaches the bookings it already has.
      setSubmitError(t.details.phoneError)
    } else {
      setMode('new')
      setStep('pick')
    }
  }

  async function handleConfirm({ dayId, date, slot }: SlotChoice) {
    setSubmitting(true)
    setSubmitError('')
    try {
      if (mode === 'reschedule' && result) {
        const guest = { name: result.name, phone: result.phone }
        const { instructions } = await rescheduleBooking(result, dayId, slot, guest)
        setResult({ ...result, dayId, date, slot, instructions, kind: 'rescheduled', previousWhen: when(result) })
      } else {
        const { instructions } = await bookSlot(dayId, slot, details)
        setResult({ dayId, date, slot, ...details, instructions, kind: 'booked' })
      }
      setStep('done')
    } catch (err) {
      setSubmitError(errorText(err, t))
    } finally {
      setSubmitting(false)
      refresh()
    }
  }

  function startReschedule() {
    setMode('reschedule')
    setSubmitError('')
    setStep('pick')
    refresh()
  }

  async function handleCancel() {
    if (!result || !window.confirm(t.confirmation.confirmCancel(when(result)))) return
    setCancelling(true)
    setCancelError('')
    try {
      await cancelBooking(result.dayId, result.phone)
      setResult({ ...result, kind: 'cancelled' })
      refresh()
    } catch (err) {
      setCancelError(`${t.confirmation.cancelError} ${errorText(err, t)}`)
    } finally {
      setCancelling(false)
    }
  }

  function startNewBooking() {
    if (!result) return
    setDetails({ name: result.name, phone: result.phone })
    setMode('new')
    setSubmitError('')
    setStep('pick')
    refresh()
  }

  if (!property) {
    return (
      <div className="pt-8">
        {loading || !loadError ? (
          <div className="flex items-center justify-center gap-2 py-16 text-slate-500">
            <Spinner /> {t.slots.loading}
          </div>
        ) : loadError instanceof BookingError && loadError.code === 'propertyNotFound' ? (
          <Card className="mx-auto max-w-md text-center">
            <h1 className="text-xl font-semibold text-slate-900">{t.noProperty.title}</h1>
            <p className="mt-2 text-slate-500">{t.noProperty.notFound}</p>
          </Card>
        ) : (
          <Alert>
            {t.slots.loadError} {errorText(loadError, t)}
          </Alert>
        )}
      </div>
    )
  }

  // The booking being moved, while rescheduling.
  const rescheduling = mode === 'reschedule' ? result : null

  return (
    <div className="space-y-6">
      <div className="pt-4 text-center">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">{property.title}</h1>
        <p className="mt-2 text-slate-500">{property.address || t.event.subtitle}</p>
      </div>

      <Stepper step={STEP_INDEX[step]} />

      {step === 'details' && (
        <>
          {submitError && (
            <div className="mx-auto max-w-md">
              <Alert>{submitError}</Alert>
            </div>
          )}
          <DetailsForm initial={details} busy={checking} onSubmit={handleDetails} />
        </>
      )}

      {step === 'pick' && (
        <SlotPicker
          days={property.days}
          loadError={loadError}
          submitError={submitError}
          submitting={submitting}
          name={rescheduling ? rescheduling.name : details.name}
          current={rescheduling}
          onBack={() => {
            setSubmitError('')
            setStep(rescheduling ? 'done' : 'details')
          }}
          onConfirm={handleConfirm}
        />
      )}

      {step === 'done' && result && (
        <Confirmation
          result={result}
          cancelling={cancelling}
          cancelError={cancelError}
          onChangeTime={startReschedule}
          onCancel={handleCancel}
          onBookAgain={startNewBooking}
        />
      )}
    </div>
  )
}

function Stepper({ step }: { step: number }) {
  const { t } = useI18n()
  const STEPS = t.steps
  const finished = step === STEPS.length - 1
  return (
    <ol className="flex items-center justify-center gap-2 text-sm">
      {STEPS.map((label, i) => {
        const done = i < step || finished
        return (
          <li key={label} className="flex items-center gap-2">
            <span
              className={`grid h-7 w-7 place-items-center rounded-full text-xs font-semibold ${
                done ? 'bg-emerald-500 text-white' : i === step ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-500'
              }`}
            >
              {done ? '✓' : i + 1}
            </span>
            <span className={`hidden sm:inline ${i === step ? 'font-medium text-slate-900' : 'text-slate-500'}`}>{label}</span>
            {i < STEPS.length - 1 && <span className="mx-1 h-px w-6 bg-slate-300 sm:w-10" />}
          </li>
        )
      })}
    </ol>
  )
}
