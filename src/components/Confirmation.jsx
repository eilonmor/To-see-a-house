import { useI18n } from '../i18n/I18nProvider'
import { Alert, Button, Card, Spinner } from './ui'

/**
 * Shows the visitor's booking. `result.kind` is 'booked' (just booked),
 * 'rescheduled' (time just changed), 'existing' (this phone already had a booking)
 * or 'cancelled' (the visitor just cancelled it).
 */
export default function Confirmation({ result, instructions, cancelling, cancelError, onChangeTime, onCancel, onBookAgain }) {
  const { t } = useI18n()
  const { slot, name, phone, kind, previousSlot } = result
  const copy = t.confirmation[kind]

  if (kind === 'cancelled') {
    return (
      <Card className="mx-auto max-w-md text-center">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-slate-100 text-slate-500">
          <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </div>
        <h2 className="mt-5 text-2xl font-bold text-slate-900">{copy.title}</h2>
        <p className="mt-2 text-slate-500">{copy.body(name, slot)}</p>
        <Button variant="secondary" className="mt-6 w-full" onClick={onBookAgain}>
          {t.confirmation.bookAgain}
        </Button>
      </Card>
    )
  }

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
      <p className="mt-2 text-slate-500">{copy.body(name, previousSlot)}</p>

      <dl className="mt-6 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-slate-50 text-start text-sm">
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

// Renders plain text with any http(s) links made clickable (e.g. a Waze or Maps link).
function Linkified({ text }) {
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
