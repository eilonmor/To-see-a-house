import { useCallback, useState } from 'react'
import {
  BookingError,
  bookSlot,
  cancelBooking,
  fetchProperty,
  findGuestBookings,
  formatDate,
  isVerified,
  rescheduleBooking,
  sendCode,
  verifyCode,
  type GuestBooking,
  type GuestDetails,
  type PublicProperty,
  type SlotChoice,
} from '../lib/bookingStore'
import { usePolledData } from '../hooks/usePolledData'
import { errorText, useI18n } from '../i18n/I18nProvider'
import { Alert, Card, Spinner } from './ui'
import { useConfirm } from './ConfirmDialog'
import DetailsForm from './DetailsForm'
import OtpForm from './OtpForm'
import SlotPicker from './SlotPicker'
import Confirmation, { type BookingResult } from './Confirmation'

// 'verify' (the SMS code) is part of the first step in the stepper.
type Step = 'details' | 'verify' | 'pick' | 'done'
const STEP_INDEX: Record<Step, number> = { details: 0, verify: 0, pick: 1, done: 2 }

export default function BookingPage({ slug }: { slug: string }) {
  const { t, lang } = useI18n()
  const confirm = useConfirm()
  const load = useCallback(() => fetchProperty(slug), [slug])
  const { data: property, loading, error: loadError, refresh } = usePolledData<PublicProperty | null>(load, null)
  const [step, setStep] = useState<Step>('details')
  const [details, setDetails] = useState<GuestDetails>({ name: '', phone: '' })
  const [checking, setChecking] = useState(false)
  const [verifyError, setVerifyError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  // 'new' = first booking for this phone; 'reschedule' = moving an existing booking.
  const [mode, setMode] = useState<'new' | 'reschedule'>('new')
  const [result, setResult] = useState<BookingResult | null>(null)
  const [cancelling, setCancelling] = useState(false)
  const [cancelError, setCancelError] = useState('')

  const when = ({ date, slot }: { date: string; slot: string }) => `${formatDate(date, lang)} ${slot}`

  // The phone number is the visitor's identity, so they first prove it's theirs
  // with an SMS code (skipped if this browser already did).
  async function handleDetails(d: GuestDetails) {
    setDetails(d)
    setSubmitError('')
    if (isVerified(d.phone)) {
      await lookUp(d)
      return
    }
    setChecking(true)
    try {
      await sendCode(d.phone, lang)
      setVerifyError('')
      setStep('verify')
    } catch (err) {
      setSubmitError(errorText(err, t))
    } finally {
      setChecking(false)
    }
  }

  async function handleVerify(code: string) {
    setChecking(true)
    setVerifyError('')
    try {
      await verifyCode(details.phone, code)
    } catch (err) {
      setVerifyError(errorText(err, t))
      setChecking(false)
      return
    }
    await lookUp(details)
  }

  // If the phone already has a booking, show it (with the option to change the
  // time) instead of booking again.
  async function lookUp(d: GuestDetails) {
    setChecking(true)
    let existing: GuestBooking[]
    try {
      existing = await findGuestBookings(slug, d.phone)
    } catch (err) {
      // Stop here: booking without knowing about an existing booking would
      // silently move it (the database moves a phone's booking within a day).
      // The details form shows the error; submitting it again retries.
      setSubmitError(
        err instanceof BookingError && err.code === 'verificationRequired'
          ? errorText(err, t)
          : `${t.details.lookupError} ${errorText(err, t)}`,
      )
      setStep('details')
      return
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

  // An expired or rejected token sends the visitor back to the details form
  // to verify again; other errors show `message` where they are.
  function handleGuestError(err: unknown, message: string, show: (text: string) => void = setSubmitError) {
    if (err instanceof BookingError && err.code === 'verificationRequired') {
      setSubmitError(errorText(err, t))
      setStep('details')
    } else {
      show(message)
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
      handleGuestError(err, errorText(err, t))
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
    if (!result || !(await confirm(t.confirmation.confirmCancel(when(result)), { tone: 'danger', confirmLabel: t.confirmation.cancel }))) return
    setCancelling(true)
    setCancelError('')
    try {
      await cancelBooking(result.dayId, result.phone)
      setResult({ ...result, kind: 'cancelled' })
      refresh()
    } catch (err) {
      handleGuestError(err, `${t.confirmation.cancelError} ${errorText(err, t)}`, setCancelError)
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

      {step === 'verify' && (
        <OtpForm
          phone={details.phone}
          busy={checking}
          error={verifyError}
          onVerify={handleVerify}
          onResend={() => sendCode(details.phone, lang)}
          onBack={() => {
            setVerifyError('')
            setStep('details')
          }}
        />
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
          property={property}
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
