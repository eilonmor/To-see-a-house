import { useState, type FormEvent } from 'react'
import { signIn } from '../lib/auth'
import { errorText, useI18n } from '../i18n/I18nProvider'
import { Button, Card, Field, Link, Spinner } from './ui'
import GoogleButton from './GoogleButton'

/** Email + password login. On success, useSession() picks up the new session. */
export default function LoginForm({ onSuccess }: { onSuccess?: () => void }) {
  const { t } = useI18n()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await signIn(email, password)
      onSuccess?.()
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
      <div className="mt-6">
        <GoogleButton />
      </div>
      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
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
        <div className="text-end text-sm">
          <Link href="/forgot-password" className="text-indigo-600 hover:underline">
            {t.login.forgot}
          </Link>
        </div>
        <Button type="submit" className="w-full" disabled={!email || !password || busy}>
          {busy && <Spinner />} {t.login.submit}
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-slate-500">
        {t.login.noAccount}{' '}
        <Link href="/signup" className="font-medium text-indigo-600 hover:underline">
          {t.login.signupLink}
        </Link>
      </p>
    </Card>
  )
}
