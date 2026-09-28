import { useState } from 'react'
import { bookSlot, SlotTakenError } from '../lib/bookingStore'
import { useBookings } from '../hooks/useBookings'
import { errorText, useI18n } from '../i18n/I18nProvider'
import DetailsForm from './DetailsForm'
import SlotPicker from './SlotPicker'
import Confirmation from './Confirmation'

export default function BookingPage() {
  const { t } = useI18n()
  const { bookings, setBookings, loading, error: loadError, refresh } = useBookings()
  const [step, setStep] = useState(0)
  const [details, setDetails] = useState({ name: '', phone: '' })
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [bookedSlot, setBookedSlot] = useState(null)

  async function handleBook(slot) {
    setSubmitting(true)
    setSubmitError('')
    try {
      setBookings(await bookSlot(slot, details))
      setBookedSlot(slot)
      setStep(2)
    } catch (err) {
      setSubmitError(errorText(err, t))
      if (err instanceof SlotTakenError) refresh()
    } finally {
      setSubmitting(false)
    }
  }

  function startOver() {
    setDetails({ name: '', phone: '' })
    setBookedSlot(null)
    setSubmitError('')
    setStep(0)
  }

  return (
    <div className="space-y-6">
      <div className="pt-4 text-center">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">{t.event.title}</h1>
        <p className="mt-2 text-slate-500">{t.event.subtitle}</p>
      </div>

      <Stepper step={step} />

      {step === 0 && (
        <DetailsForm
          initial={details}
          onSubmit={(d) => {
            setDetails(d)
            setSubmitError('')
            setStep(1)
          }}
        />
      )}

      {step === 1 && (
        <SlotPicker
          bookings={bookings}
          loading={loading}
          loadError={loadError}
          submitError={submitError}
          submitting={submitting}
          details={details}
          onBack={() => setStep(0)}
          onConfirm={handleBook}
        />
      )}

      {step === 2 && <Confirmation slot={bookedSlot} details={details} onDone={startOver} />}
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
