import { useCallback, useState } from 'react'
import { bookSlot, cancelBooking, fetchProperty, findGuestBookings, formatDate, rescheduleBooking } from '../lib/bookingStore'
import { usePolledData } from '../hooks/usePolledData'
import { errorText, useI18n } from '../i18n/I18nProvider'
import { Alert, Card, Spinner } from './ui'
import DetailsForm from './DetailsForm'
import SlotPicker from './SlotPicker'
import Confirmation from './Confirmation'

const STEP_INDEX = { details: 0, pick: 1, done: 2 }

export default function BookingPage({ slug }) {
  const { t, lang } = useI18n()
  const load = useCallback(() => fetchProperty(slug), [slug])
  const { data: property, loading, error: loadError, refresh } = usePolledData(load, null)
  const [step, setStep] = useState('details')
  const [details, setDetails] = useState({ name: '', phone: '' })
  const [checking, setChecking] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  // 'new' = first booking for this phone; 'reschedule' = moving an existing booking.
  const [mode, setMode] = useState('new')
  // The visitor's booking: { dayId, date, slot, name, phone, instructions,
  //   kind: 'booked' | 'rescheduled' | 'existing' | 'cancelled', previousWhen? }
  const [result, setResult] = useState(null)
  const [cancelling, setCancelling] = useState(false)
  const [cancelError, setCancelError] = useState('')

  const when = ({ date, slot }) => `${formatDate(date, lang)} ${slot}`

  // The phone number is the visitor's identity: if it already has a booking,
  // show that booking (with the option to change the time) instead of booking again.
  async function handleDetails(d) {
    setDetails(d)
    setSubmitError('')
    setChecking(true)
    let existing = []
    try {
      existing = await findGuestBookings(slug, d.phone)
    } catch {
      // Continue to the slots; the database still allows one booking per phone per day.
    } finally {
      setChecking(false)
    }
    if (existing.length > 0) {
      setResult({ ...existing[0], phone: d.phone, kind: 'existing' })
      setStep('done')
    } else {
      setMode('new')
      setStep('pick')
    }
  }

  async function handleConfirm({ dayId, date, slot }) {
    setSubmitting(true)
    setSubmitError('')
    try {
      if (mode === 'reschedule') {
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
    if (!window.confirm(t.confirmation.confirmCancel(when(result)))) return
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
        ) : loadError.code === 'propertyNotFound' ? (
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

  const rescheduling = mode === 'reschedule'

  return (
    <div className="space-y-6">
      <div className="pt-4 text-center">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">{property.title}</h1>
        <p className="mt-2 text-slate-500">{property.address || t.event.subtitle}</p>
      </div>

      <Stepper step={STEP_INDEX[step]} />

      {step === 'details' && <DetailsForm initial={details} busy={checking} onSubmit={handleDetails} />}

      {step === 'pick' && (
        <SlotPicker
          days={property.days}
          loading={false}
          loadError={loadError}
          submitError={submitError}
          submitting={submitting}
          name={rescheduling ? result.name : details.name}
          current={rescheduling ? result : null}
          onBack={() => {
            setSubmitError('')
            setStep(rescheduling ? 'done' : 'details')
          }}
          onConfirm={handleConfirm}
        />
      )}

      {step === 'done' && (
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

function Stepper({ step }) {
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
