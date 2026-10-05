import { useState, type FormEvent } from 'react'
import { MIN_PASSWORD_LENGTH, updatePassword } from '../lib/auth'
import { useSession } from '../hooks/useSession'
import { navigate } from '../hooks/useRoute'
import { errorText, useI18n } from '../i18n/I18nProvider'
import { Alert, Button, Card, Field, Link, Loading, Spinner } from './ui'

/**
 * Where the password-reset email leads. Supabase exchanges the link's code
 * for a session on load; with that session the user sets a new password.
 */
export default function ResetPassword() {
  const { t } = useI18n()
  const session = useSession()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (password.length < MIN_PASSWORD_LENGTH) return setError(t.signup.passwordError(MIN_PASSWORD_LENGTH))
    if (password !== confirm) return setError(t.reset.mismatch)
    setBusy(true)
    setError('')
    try {
      await updatePassword(password)
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setError(errorText(err, t))
      setBusy(false)
    }
  }

  if (session === undefined) return <Loading label={t.dashboard.loading} />

  return (
    <Card className="mx-auto mt-8 max-w-sm">
      <h1 className="text-center text-xl font-semibold text-slate-900">{t.reset.title}</h1>
      {!session ? (
        <>
          <div className="mt-6">
            <Alert>{t.reset.invalidLink}</Alert>
          </div>
          <p className="mt-6 text-center text-sm">
            <Link href="/forgot-password" className="font-medium text-indigo-600 hover:underline">
              {t.reset.requestNew}
            </Link>
          </p>
        </>
      ) : (
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <p className="text-center text-sm text-slate-500" dir="ltr">
            {session.user.email}
          </p>
          <Field
            id="password"
            label={t.reset.password}
            type="password"
            autoComplete="new-password"
            autoFocus
            value={password}
            onChange={(e) => {
              setPassword(e.target.value)
              setError('')
            }}
          />
          <Field
            id="confirm"
            label={t.reset.confirm}
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => {
              setConfirm(e.target.value)
              setError('')
            }}
          />
          {error && <Alert>{error}</Alert>}
          <Button type="submit" className="w-full" disabled={!password || !confirm || busy}>
            {busy && <Spinner />} {t.reset.submit}
          </Button>
        </form>
      )}
    </Card>
  )
}
