import { useEffect, useState } from 'react'
import { acceptInvite, forgetInvite, previewInvite, rememberInvite } from '../lib/agencyStore'
import { BookingError } from '../lib/bookingStore'
import { useSession } from '../hooks/useSession'
import { navigate } from '../hooks/useRoute'
import { errorText, useI18n } from '../i18n/I18nProvider'
import AccountGate, { useAccount } from './AccountGate'
import { Alert, Button, Card, Link, Loading, Spinner } from './ui'

/**
 * /join/<code>: an agency invite. Visitors without a session log in here, or
 * sign up; the code is remembered so the dashboard sends them back afterwards.
 */
export default function JoinRoute({ code }: { code: string }) {
  const { t } = useI18n()
  const session = useSession()

  useEffect(() => {
    if (session === null) rememberInvite(code)
  }, [session, code])

  return (
    <>
      {session === null && (
        <div className="mx-auto mt-8 max-w-sm">
          <Alert tone="info">{t.join.loginFirst}</Alert>
        </div>
      )}
      <AccountGate>
        <JoinPage code={code} />
      </AccountGate>
    </>
  )
}

function JoinPage({ code }: { code: string }) {
  const { t } = useI18n()
  const { profile, reloadProfile } = useAccount()
  const [agencyName, setAgencyName] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // After joining, the profile has an agency: don't flash "already a member".
  const [joined, setJoined] = useState(false)

  // The remembered invite brought the user here; it isn't needed any more.
  useEffect(() => forgetInvite(), [])

  useEffect(() => {
    previewInvite(code).then(setAgencyName, setLoadError)
  }, [code])

  async function handleAccept() {
    setBusy(true)
    setError('')
    try {
      await acceptInvite(code)
      setJoined(true)
      await reloadProfile()
      navigate('/dashboard/agency', { replace: true })
    } catch (err) {
      setError(`${t.join.joinError} ${errorText(err, t)}`)
      setBusy(false)
    }
  }

  let body
  if (joined) body = <Loading label={t.dashboard.loading} />
  else if (profile.orgId) {
    body = (
      <>
        <Alert tone="info">{t.join.alreadyMember}</Alert>
        <Link href="/dashboard/agency" className="mt-4 inline-block font-medium text-indigo-600 hover:underline">
          {t.join.toAgency}
        </Link>
      </>
    )
  } else if (loadError != null) {
    body = (
      <Alert>
        {loadError instanceof BookingError && loadError.code === 'invalidInvite' ? t.join.invalid : errorText(loadError, t)}
      </Alert>
    )
  } else if (agencyName === null) body = <Loading label={t.dashboard.loading} />
  else {
    body = (
      <>
        <p className="text-lg font-semibold text-slate-900">{t.join.question(agencyName)}</p>
        <p className="mt-2 text-sm text-slate-500">{t.join.body}</p>
        {profile.role === 'personal' && <p className="mt-2 text-sm text-slate-500">{t.join.becomesAgent}</p>}
        {error && (
          <div className="mt-4">
            <Alert>{error}</Alert>
          </div>
        )}
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <Button variant="secondary" onClick={() => navigate('/dashboard', { replace: true })} disabled={busy}>
            {t.join.decline}
          </Button>
          <Button onClick={handleAccept} disabled={busy}>
            {busy && <Spinner />} {t.join.accept}
          </Button>
        </div>
      </>
    )
  }

  return (
    <Card className="mx-auto mt-6 max-w-md">
      <h1 className="mb-4 text-sm font-medium uppercase tracking-wide text-slate-500">{t.join.title}</h1>
      {body}
    </Card>
  )
}
