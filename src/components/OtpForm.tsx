import { useEffect, useState, type FormEvent } from 'react'
import { errorText, useI18n } from '../i18n/I18nProvider'
import { Alert, Button, Card, Field, Spinner } from './ui'

// Matches the 60-second gap public.issue_otp() requires between codes.
const RESEND_SECONDS = 60

type Props = {
  phone: string
  busy: boolean
  error: string
  onVerify: (code: string) => void
  onResend: () => Promise<void>
  onBack: () => void
}

/** Asks for the 6-digit code that was just sent by SMS to `phone`. */
export default function OtpForm({ phone, busy, error, onVerify, onResend, onBack }: Props) {
  const { t } = useI18n()
  const [code, setCode] = useState('')
  const [codeError, setCodeError] = useState('')
  const [wait, setWait] = useState(RESEND_SECONDS)
  const [resending, setResending] = useState(false)
  const [resendNote, setResendNote] = useState<{ tone: 'info' | 'error'; text: string } | null>(null)

  useEffect(() => {
    if (wait <= 0) return
    const timer = setTimeout(() => setWait((w) => w - 1), 1000)
    return () => clearTimeout(timer)
  }, [wait])

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    const digits = code.replace(/\D/g, '')
    if (digits.length !== 6) {
      setCodeError(t.otp.codeError)
      return
    }
    onVerify(digits)
  }

  async function handleResend() {
    setResending(true)
    setResendNote(null)
    try {
      await onResend()
      setCode('')
      setResendNote({ tone: 'info', text: t.otp.resent })
      setWait(RESEND_SECONDS)
    } catch (err) {
      setResendNote({ tone: 'error', text: errorText(err, t) })
    } finally {
      setResending(false)
    }
  }

  return (
    <Card className="mx-auto max-w-md">
      <h2 className="text-lg font-semibold text-slate-900">{t.otp.title}</h2>
      <p className="mt-1 text-sm text-slate-500">
        {t.otp.subtitle}{' '}
        <span dir="ltr" className="font-medium text-slate-700">
          {phone}
        </span>
      </p>
      <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-4">
        {error && <Alert>{error}</Alert>}
        <Field
          id="otp"
          label={t.otp.code}
          inputMode="numeric"
          autoComplete="one-time-code"
          dir="ltr"
          maxLength={6}
          placeholder="123456"
          value={code}
          onChange={(e) => {
            setCode(e.target.value.replace(/\D/g, '').slice(0, 6))
            setCodeError('')
          }}
          error={codeError}
          autoFocus
        />
        <Button type="submit" className="w-full" disabled={busy}>
          {busy && <Spinner />} {busy ? t.otp.verifying : t.otp.verify}
        </Button>
      </form>

      {resendNote && (
        <div className="mt-4">
          <Alert tone={resendNote.tone}>{resendNote.text}</Alert>
        </div>
      )}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm">
        <button type="button" onClick={onBack} className="font-medium text-indigo-600 hover:underline">
          {t.otp.changePhone}
        </button>
        {wait > 0 ? (
          <span className="text-slate-500">{t.otp.resendIn(wait)}</span>
        ) : (
          <button
            type="button"
            onClick={handleResend}
            // Not while a code is being checked: the new code would replace it.
            disabled={resending || busy}
            className="inline-flex items-center gap-1 font-medium text-indigo-600 hover:underline disabled:opacity-50"
          >
            {resending && <Spinner />} {t.otp.resend}
          </button>
        )}
      </div>
    </Card>
  )
}
