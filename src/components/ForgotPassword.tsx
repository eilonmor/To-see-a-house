import { useState, type FormEvent } from 'react'
import { requestPasswordReset } from '../lib/auth'
import { errorText, useI18n } from '../i18n/I18nProvider'
import { Alert, Button, Card, Field, Link, Spinner } from './ui'

/** Asks Supabase to email a link to /reset-password. */
export default function ForgotPassword() {
  const { t } = useI18n()
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [sentTo, setSentTo] = useState('')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await requestPasswordReset(email)
      setSentTo(email.trim())
    } catch (err) {
      setError(errorText(err, t))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="mx-auto mt-8 max-w-sm">
      <h1 className="text-center text-xl font-semibold text-slate-900">{t.forgot.title}</h1>
      {sentTo ? (
        <div className="mt-6">
          <Alert tone="info">{t.forgot.sent(sentTo)}</Alert>
        </div>
      ) : (
        <>
          <p className="mt-1 text-center text-sm text-slate-500">{t.forgot.subtitle}</p>
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <Field
              id="email"
              label={t.login.email}
              type="email"
              autoComplete="email"
              dir="ltr"
              autoFocus
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                setError('')
              }}
            />
            {error && <Alert>{error}</Alert>}
            <Button type="submit" className="w-full" disabled={!email || busy}>
              {busy && <Spinner />} {t.forgot.submit}
            </Button>
          </form>
        </>
      )}
      <p className="mt-6 text-center text-sm">
        <Link href="/login" className="font-medium text-indigo-600 hover:underline">
          {t.forgot.back}
        </Link>
      </p>
    </Card>
  )
}
