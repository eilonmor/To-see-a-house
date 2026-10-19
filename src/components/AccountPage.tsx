import { useState, type FormEvent } from 'react'
import { deleteAccount } from '../lib/auth'
import { fetchAgency } from '../lib/agencyStore'
import { fetchMySubscription } from '../lib/billingStore'
import { navigate } from '../hooks/useRoute'
import { errorText, useI18n } from '../i18n/I18nProvider'
import { useAccount } from './AccountGate'
import { longDate } from './BillingPage'
import { useConfirm } from './ConfirmDialog'
import { Alert, Button, Card, Field, Spinner } from './ui'

/** The user's details, and deleting the account. */
export default function AccountPage() {
  const { t } = useI18n()
  const { user, profile } = useAccount()

  return (
    <div className="space-y-6 pt-6">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t.account.title}</h1>

      <Card>
        <dl className="grid gap-4 text-sm sm:grid-cols-3">
          <Detail label={t.account.name} value={profile.fullName || '—'} />
          <Detail label={t.account.email} value={user.email ?? '—'} dir="ltr" />
          <Detail label={t.account.type} value={t.account.plan[profile.role]} />
        </dl>
      </Card>

      <DeleteAccount />
    </div>
  )
}

function Detail({ label, value, dir }: { label: string; value: string; dir?: 'ltr' }) {
  return (
    <div className="min-w-0">
      <dt className="text-slate-500">{label}</dt>
      <dd className="mt-0.5 truncate font-medium text-slate-900" dir={dir}>
        {value}
      </dd>
    </div>
  )
}

/**
 * Deleting is guarded several times over: a warning, one about the paid plan
 * (renewal canceled, no refund) and one about the agency (for its admin),
 * then typing "delete", then a last confirmation.
 */
function DeleteAccount() {
  const { t, lang } = useI18n()
  const { profile } = useAccount()
  const confirm = useConfirm()
  const [typing, setTyping] = useState(false)
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const word = t.account.typeWord
  const matches = typed.trim().toLowerCase() === word

  async function start() {
    setError('')
    if (!(await confirm(t.account.deleteConfirm, { tone: 'danger', confirmLabel: t.account.continue }))) return

    // Checked now rather than on load, so the warnings match what will be canceled.
    setBusy(true)
    let subs, agencyName
    try {
      const agencyId = profile.role === 'agency_admin' ? profile.orgId : null
      ;[subs, agencyName] = await Promise.all([
        fetchMySubscription(profile),
        agencyId ? fetchAgency(agencyId).then((a) => a.name) : null,
      ])
    } catch (err) {
      setError(`${t.account.subscriptionLoadError} ${errorText(err, t)}`)
      return
    } finally {
      setBusy(false)
    }

    const paid = [
      subs.own && t.account.deleteSubscription(longDate(subs.own.currentPeriodEnd, lang)),
      subs.agency && t.account.deleteAgencySubscription(longDate(subs.agency.currentPeriodEnd, lang)),
    ].filter(Boolean)
    if (paid.length && !(await confirm(paid.join(' '), { tone: 'danger', confirmLabel: t.account.deleteSubscriptionLabel }))) {
      return
    }
    if (agencyName != null && !(await confirm(t.account.deleteAgency(agencyName), { tone: 'danger', confirmLabel: t.account.deleteAgencyLabel }))) {
      return
    }
    setTyped('')
    setTyping(true)
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!matches || busy) return
    if (!(await confirm(t.account.deleteLast, { tone: 'danger', confirmLabel: t.account.deleteForever }))) return
    setBusy(true)
    setError('')
    try {
      await deleteAccount()
      navigate('/')
    } catch (err) {
      setError(`${t.account.deleteError} ${errorText(err, t)}`)
      setBusy(false)
    }
  }

  return (
    <Card className="space-y-4 border-rose-200!">
      <div>
        <h2 className="text-lg font-semibold text-rose-700">{t.account.deleteTitle}</h2>
        <p className="mt-1 text-sm text-slate-600">{t.account.deleteIntro}</p>
      </div>

      {typing ? (
        <form onSubmit={submit} className="space-y-4">
          <Field
            id="delete-confirm"
            label={`${t.account.typePrompt} "${word}"`}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={word}
            dir="ltr"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            autoFocus
            disabled={busy}
          />
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button type="button" variant="secondary" onClick={() => setTyping(false)} disabled={busy}>
              {t.dialog.cancel}
            </Button>
            <Button type="submit" variant="dangerSolid" disabled={!matches || busy}>
              {busy && <Spinner />} {busy ? t.account.deleting : t.account.deleteForever}
            </Button>
          </div>
        </form>
      ) : (
        <Button variant="danger" onClick={start} disabled={busy}>
          {busy && <Spinner />} {t.account.deleteButton}
        </Button>
      )}

      {error && <Alert>{error}</Alert>}
    </Card>
  )
}
