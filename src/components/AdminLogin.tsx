import { useState, type FormEvent } from 'react'
import { signIn } from '../lib/adminStore'
import { errorText, useI18n } from '../i18n/I18nProvider'
import { Button, Card, Field, Spinner } from './ui'

export default function AdminLogin() {
  const { t } = useI18n()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  // On success, useSession() picks up the new session and shows the dashboard.
  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await signIn(email, password)
    } catch (err) {
      setError(errorText(err, t))
      setPassword('')
      setBusy(false)
    }
  }

  return (
    <Card className="mx-auto mt-8 max-w-sm">
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-indigo-100 text-indigo-600">
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="11" width="16" height="10" rx="2" />
          <path d="M8 11V7a4 4 0 118 0v4" />
        </svg>
      </div>
      <h1 className="mt-4 text-center text-xl font-semibold text-slate-900">{t.login.title}</h1>
      <p className="mt-1 text-center text-sm text-slate-500">{t.login.subtitle}</p>
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
        <Field
          id="password"
          label={t.login.password}
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value)
            setError('')
          }}
          error={error}
        />
        <Button type="submit" className="w-full" disabled={!email || !password || busy}>
          {busy && <Spinner />} {t.login.submit}
        </Button>
      </form>
    </Card>
  )
}
