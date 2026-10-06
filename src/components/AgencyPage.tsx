import { useCallback, useEffect, useState, type FormEvent } from 'react'
import {
  createAgency,
  createInvite,
  fetchAgency,
  fetchInvites,
  fetchMembers,
  inviteUrl,
  leaveAgency,
  memberName,
  removeAgent,
  renameAgency,
  revokeInvite,
  type Agency,
  type Invite,
  type Member,
} from '../lib/agencyStore'
import { BookingError, formatDate, israelDate } from '../lib/bookingStore'
import { usePolledData } from '../hooks/usePolledData'
import { navigate } from '../hooks/useRoute'
import { errorText, useI18n } from '../i18n/I18nProvider'
import { useAccount } from './AccountGate'
import { Alert, Button, Card, CopyButton, Field, Loading, Spinner } from './ui'

/** /dashboard/agency: set up or join an agency, or manage the one the user is in. */
export default function AgencyPage() {
  const { profile, reloadProfile } = useAccount()

  // The admin may have removed this agent since the profile was loaded.
  useEffect(() => {
    reloadProfile()
  }, [reloadProfile])

  return (
    <div className="space-y-6 pt-6">
      {profile.orgId ? <AgencyDetails key={profile.orgId} orgId={profile.orgId} /> : <NoAgency />}
    </div>
  )
}

function NoAgency() {
  const { t } = useI18n()
  const { reloadProfile } = useAccount()
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await createAgency(name)
      // The profile now has the agency, and this page shows it.
      await reloadProfile()
    } catch (err) {
      setError(errorText(err, t))
      setBusy(false)
    }
  }

  function handleJoin(e: FormEvent) {
    e.preventDefault()
    navigate(`/join/${encodeURIComponent(code.trim().toUpperCase())}`)
  }

  return (
    <>
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t.agency.noneTitle}</h1>
        <p className="mt-1 text-slate-500">{t.agency.noneBody}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="p-5! sm:p-6!">
          <h2 className="text-lg font-semibold text-slate-900">{t.agency.createTitle}</h2>
          <p className="mt-1 text-sm text-slate-500">{t.agency.createHelp}</p>
          <form onSubmit={handleCreate} className="mt-4 space-y-4">
            <Field
              id="agency-name"
              label={t.agency.name}
              placeholder={t.agency.namePlaceholder}
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                setError('')
              }}
              required
            />
            {error && <Alert>{error}</Alert>}
            <Button type="submit" className="w-full" disabled={!name.trim() || busy}>
              {busy && <Spinner />} {t.agency.create}
            </Button>
          </form>
        </Card>
        <Card className="p-5! sm:p-6!">
          <h2 className="text-lg font-semibold text-slate-900">{t.agency.joinTitle}</h2>
          <p className="mt-1 text-sm text-slate-500">{t.agency.joinHelp}</p>
          <form onSubmit={handleJoin} className="mt-4 space-y-4">
            <Field
              id="invite-code"
              label={t.agency.code}
              placeholder="ABC234"
              dir="ltr"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
            />
            <Button type="submit" variant="secondary" className="w-full" disabled={!code.trim()}>
              {t.agency.join}
            </Button>
          </form>
        </Card>
      </div>
    </>
  )
}

type AgencyData = { agency: Agency; members: Member[]; invites: Invite[] }

function AgencyDetails({ orgId }: { orgId: string }) {
  const { t, lang } = useI18n()
  const { profile, reloadProfile } = useAccount()
  const isAdmin = profile.role === 'agency_admin'
  const [busy, setBusy] = useState<string | null>(null) // id of the member / invite being changed
  const [actionError, setActionError] = useState('')

  const load = useCallback(async (): Promise<AgencyData> => {
    const [agency, members, invites] = await Promise.all([
      fetchAgency(orgId),
      fetchMembers(),
      isAdmin ? fetchInvites(orgId) : Promise.resolve([]),
    ])
    return { agency, members, invites }
  }, [orgId, isAdmin])
  const { data, setData, loading, error, refresh } = usePolledData<AgencyData | null>(load, null)

  // Removed from the agency meanwhile: the profile no longer has it.
  const removed = error instanceof BookingError && error.code === 'agencyNotFound'
  useEffect(() => {
    if (removed) reloadProfile()
  }, [removed, reloadProfile])

  async function act(id: string, confirmText: string | null, errorPrefix: string, action: () => Promise<void>) {
    if (confirmText && !window.confirm(confirmText)) return
    setBusy(id)
    setActionError('')
    try {
      await action()
      await refresh()
    } catch (err) {
      setActionError(`${errorPrefix} ${errorText(err, t)}`)
    } finally {
      setBusy(null)
    }
  }

  if (!data) {
    return error != null && !removed ? (
      <Alert>
        {t.agency.loadError} {errorText(error, t)}
      </Alert>
    ) : (
      <Loading label={t.dashboard.loading} />
    )
  }

  const { agency, members, invites } = data
  const expires = (invite: Invite) =>
    t.agency.expires(formatDate(israelDate(new Date(invite.expiresAt)), lang, { day: 'numeric', month: 'long' }))

  async function handleLeave() {
    if (!window.confirm(t.agency.confirmLeave(agency.name))) return
    setBusy('leave')
    setActionError('')
    try {
      await leaveAgency()
      await reloadProfile()
    } catch (err) {
      setActionError(`${t.agency.leaveError} ${errorText(err, t)}`)
      setBusy(null)
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{agency.name}</h1>
          <p className="mt-0.5 text-slate-500">{isAdmin ? t.agency.adminRole : t.agency.agentRole}</p>
        </div>
        <Button variant="secondary" onClick={refresh} disabled={loading}>
          {loading ? <Spinner /> : '↻'} {t.dashboard.refresh}
        </Button>
      </div>

      {error != null && !removed && (
        <Alert>
          {t.agency.loadError} {errorText(error, t)}
        </Alert>
      )}
      {actionError && <Alert>{actionError}</Alert>}

      {isAdmin && (
        <Card>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">{t.agency.invitesTitle}</h2>
              <p className="mt-1 text-sm text-slate-500">{t.agency.invitesHelp}</p>
            </div>
            <Button
              onClick={() => act('new-invite', null, t.agency.inviteError, async () => {
                await createInvite()
              })}
              disabled={busy !== null}
            >
              {busy === 'new-invite' && <Spinner />} {t.agency.newInvite}
            </Button>
          </div>
          {invites.length === 0 ? (
            <p className="mt-4 text-sm text-slate-400">{t.agency.noInvites}</p>
          ) : (
            <ul className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-200">
              {invites.map((invite) => (
                <li key={invite.code} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <span className="font-mono text-lg font-semibold tracking-widest text-slate-900" dir="ltr">
                      {invite.code}
                    </span>
                    <p className="text-xs text-slate-500">{expires(invite)}</p>
                  </div>
                  <CopyButton text={inviteUrl(invite.code)} label={t.agency.copyLink} copiedLabel={t.dashboard.copied} />
                  <Button
                    variant="danger"
                    className="px-3! py-1.5! text-xs"
                    onClick={() => act(invite.code, t.agency.confirmRevoke(invite.code), t.agency.revokeError, () => revokeInvite(invite.code))}
                    disabled={busy !== null}
                  >
                    {busy === invite.code && <Spinner className="h-3 w-3" />} {t.agency.revoke}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      <Card>
        <h2 className="text-lg font-semibold text-slate-900">{t.agency.members}</h2>
        <ul className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-200">
          {members.map((member) => (
            <li key={member.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate font-medium text-slate-800">{memberName(member)}</span>
                  {member.role === 'agency_admin' && (
                    <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700">{t.agency.admin}</span>
                  )}
                  {member.id === profile.id && (
                    <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">{t.agency.you}</span>
                  )}
                </div>
                <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-slate-500" dir="ltr">
                  {member.fullName && <span>{member.email}</span>}
                  {member.phone && (
                    <a href={`tel:${member.phone}`} className="text-indigo-600 hover:underline">
                      {member.phone}
                    </a>
                  )}
                </div>
              </div>
              {isAdmin && member.role === 'agent' && (
                <Button
                  variant="danger"
                  className="px-3! py-1.5! text-xs"
                  onClick={() =>
                    act(member.id, t.agency.confirmRemove(memberName(member)), t.agency.removeError, () => removeAgent(member.id))
                  }
                  disabled={busy !== null}
                >
                  {busy === member.id && <Spinner className="h-3 w-3" />} {t.agency.remove}
                </Button>
              )}
            </li>
          ))}
        </ul>
      </Card>

      {isAdmin ? (
        <NameEditor agency={agency} onSaved={(saved) => setData({ ...data, agency: saved })} />
      ) : (
        <Card className="border-rose-200!">
          <h2 className="text-lg font-semibold text-slate-900">{t.agency.leaveTitle}</h2>
          <p className="mt-1 text-sm text-slate-500">{t.agency.leaveHelp}</p>
          <div className="mt-4 flex justify-end">
            <Button variant="danger" onClick={handleLeave} disabled={busy !== null}>
              {busy === 'leave' && <Spinner />} {t.agency.leave}
            </Button>
          </div>
        </Card>
      )}
    </>
  )
}

function NameEditor({ agency, onSaved }: { agency: Agency; onSaved: (agency: Agency) => void }) {
  const { t } = useI18n()
  const [name, setName] = useState(agency.name)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<'saved' | { error: unknown } | null>(null)

  useEffect(() => {
    if (status !== 'saved') return
    const id = setTimeout(() => setStatus(null), 3000)
    return () => clearTimeout(id)
  }, [status])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setStatus(null)
    try {
      const saved = await renameAgency(agency.id, name)
      setName(saved.name)
      onSaved(saved)
      setStatus('saved')
    } catch (err) {
      setStatus({ error: err })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field
          id="agency-rename"
          label={t.agency.nameTitle}
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            setStatus(null)
          }}
          required
        />
        {status && status !== 'saved' && (
          <Alert>
            {t.agency.saveError} {errorText(status.error, t)}
          </Alert>
        )}
        <div className="flex items-center justify-end gap-3">
          {status === 'saved' && <span className="text-sm font-medium text-emerald-600">✓ {t.agency.saved}</span>}
          <Button type="submit" disabled={!name.trim() || name.trim() === agency.name || busy}>
            {busy && <Spinner />} {t.agency.save}
          </Button>
        </div>
      </form>
    </Card>
  )
}
