import { useState } from 'react'
import { bookSlot, fetchRecord, findBookingByPhone, rescheduleBooking, SlotTakenError } from '../lib/bookingStore'
import { useBookings } from '../hooks/useBookings'
import { errorText, useI18n } from '../i18n/I18nProvider'
import DetailsForm from './DetailsForm'
import SlotPicker from './SlotPicker'
import Confirmation from './Confirmation'

const STEP_INDEX = { details: 0, pick: 1, done: 2 }

export default function BookingPage() {
  const { t } = useI18n()
  const { bookings, instructions, setRecord, loading, error: loadError, refresh } = useBookings()
  const [step, setStep] = useState('details')
  const [details, setDetails] = useState({ name: '', phone: '' })
  const [checking, setChecking] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  // 'new' = first booking for this phone; 'reschedule' = moving an existing booking.
  const [mode, setMode] = useState('new')
  // The visitor's booking: { slot, name, phone, kind: 'booked' | 'rescheduled' | 'existing', previousSlot? }
  const [result, setResult] = useState(null)

  function showExisting({ slot, booking }) {
    setResult({ slot, name: booking.name, phone: booking.phone, kind: 'existing' })
    setStep('done')
  }

  // The phone number is the visitor's identity: if it already has a booking,
  // show that booking (with the option to change the time) instead of booking again.
  async function handleDetails(d) {
    setDetails(d)
    setSubmitError('')
    setChecking(true)
    let latest = bookings
    try {
      const record = await fetchRecord()
      setRecord(record)
      latest = record.bookings
    } catch {
      // Fall back to the last loaded data; bookSlot re-checks on the server anyway.
    } finally {
      setChecking(false)
    }
    const existing = findBookingByPhone(latest, d.phone)
    if (existing) {
      showExisting(existing)
    } else {
      setMode('new')
      setStep('pick')
    }
  }

  async function handleConfirm(slot) {
    setSubmitting(true)
    setSubmitError('')
    try {
      if (mode === 'reschedule') {
        setRecord(await rescheduleBooking(result.phone, slot, { name: result.name }))
        setResult({ ...result, slot, kind: 'rescheduled', previousSlot: result.slot })
      } else {
        setRecord(await bookSlot(slot, details))
        setResult({ slot, name: details.name, phone: details.phone, kind: 'booked' })
      }
      setStep('done')
    } catch (err) {
      if (err.code === 'duplicate') {
        // Booked from another device in the meantime — show that booking.
        const record = await fetchRecord().catch(() => null)
        const existing = record && findBookingByPhone(record.bookings, details.phone)
        if (record) setRecord(record)
        if (existing) return showExisting(existing)
      }
      setSubmitError(errorText(err, t))
      if (err instanceof SlotTakenError) refresh()
    } finally {
      setSubmitting(false)
    }
  }

  function startReschedule() {
    setMode('reschedule')
    setSubmitError('')
    setStep('pick')
    refresh()
  }

  const rescheduling = mode === 'reschedule'

  return (
    <div className="space-y-6">
      <div className="pt-4 text-center">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">{t.event.title}</h1>
        <p className="mt-2 text-slate-500">{t.event.subtitle}</p>
      </div>

      <Stepper step={STEP_INDEX[step]} />

      {step === 'details' && <DetailsForm initial={details} busy={checking} onSubmit={handleDetails} />}

      {step === 'pick' && (
        <SlotPicker
          bookings={bookings}
          loading={loading}
          loadError={loadError}
          submitError={submitError}
          submitting={submitting}
          name={rescheduling ? result.name : details.name}
          currentSlot={rescheduling ? result.slot : null}
          onBack={() => {
            setSubmitError('')
            setStep(rescheduling ? 'done' : 'details')
          }}
          onConfirm={handleConfirm}
        />
      )}

      {step === 'done' && <Confirmation result={result} instructions={instructions} onChangeTime={startReschedule} />}
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
