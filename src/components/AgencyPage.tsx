import { useCallback, useEffect, useState, type FormEvent } from 'react'
import {
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
import {
  fetchMySubscription,
  fetchPlans,
  startCheckout,
  upgradePlan,
  type Period,
  type Plan,
  type Subscription,
} from '../lib/billingStore'
import { BookingError, formatDate, israelDate } from '../lib/bookingStore'
import { usePolledData } from '../hooks/usePolledData'
import { navigate } from '../hooks/useRoute'
import { errorText, useI18n } from '../i18n/I18nProvider'
import { useAccount } from './AccountGate'
import {
  canMoveToAgency,
  ContactLink,
  isChargeIssue,
  LoadErrorAlert,
  PaymentErrorAlert,
  PeriodToggle,
  PlanOption,
  useUpgradeConfirm,
} from './BillingPage'
import { useConfirm } from './ConfirmDialog'
import { Alert, Button, Card, CopyButton, Field, Loading, Spinner } from './ui'

/** /dashboard/agency: set up or join an agency, or manage the one the user is in. */
export default function AgencyPage() {
  const { profile, reloadProfile } = useAccount()

  // The admin may have removed this agent since the profile was loaded.
  // A failure shows in the gate.
  useEffect(() => {
    reloadProfile().catch(() => {})
  }, [reloadProfile])

  return (
    <div className="space-y-6 pt-6">
      {profile.orgId ? <AgencyDetails key={profile.orgId} orgId={profile.orgId} /> : <NoAgency />}
    </div>
  )
}

function NoAgency() {
  const { t } = useI18n()
  const [code, setCode] = useState('')

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
      <OpenAgency />
      <div className="max-w-md">
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

type OpenData = { plans: Plan[]; own: Subscription | null }

/**
 * Opening an agency is buying its plan: the name, then 2 or 5 agents, monthly
 * or yearly. The agency exists once the plan is paid (complete_checkout).
 * An agent plan of the same period moves to the agency instead, charging
 * only the prorated difference on the saved card (change-plan).
 */
function OpenAgency() {
  const { t, lang } = useI18n()
  const confirmUpgrade = useUpgradeConfirm()
  const { profile, reloadProfile } = useAccount()
  const [name, setName] = useState('')
  const [nameMissing, setNameMissing] = useState(false)
  // Null until chosen: the agent plan's period, else monthly.
  const [period, setPeriod] = useState<Period | null>(null)
  // The plan being bought.
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<unknown>(null)
  // Opened, but the profile couldn't be reloaded: opening again would fail.
  const [opened, setOpened] = useState(false)

  // Loaded once, not polled: plans rarely change, and the database checks
  // the plan and the subscription again when paying.
  const [data, setData] = useState<OpenData | null>(null)
  const [loadError, setLoadError] = useState<unknown>(null)
  const load = useCallback(() => {
    setLoadError(null)
    Promise.all([fetchPlans(), fetchMySubscription(profile)]).then(
      ([plans, subs]) => setData({ plans: plans.filter((p) => p.audience === 'agency'), own: subs.own }),
      setLoadError,
    )
  }, [profile])
  useEffect(load, [load])

  const movable = data?.own && canMoveToAgency(data.own) ? data.own : null
  const shownPeriod = period ?? movable?.period ?? 'month'
  const moves = (plan: Plan) => movable?.period === plan.period

  async function open(plan: Plan) {
    if (!name.trim()) {
      setNameMissing(true)
      document.getElementById('agency-name')?.focus()
      return
    }
    setBusy(plan.code)
    setError(null)
    try {
      if (!moves(plan)) {
        // Stays busy while the browser leaves for CardCom.
        window.location.assign(await startCheckout(plan.code, lang, name))
        return
      }
      if (!(await confirmUpgrade(plan, movable!, t.agency.openConfirmLabel))) {
        setBusy(null)
        return
      }
      await upgradePlan(plan.code, lang, name)
    } catch (err) {
      setError(err)
      // The card may have been charged: the agency may be open already.
      if (isChargeIssue(err)) {
        load()
        reloadProfile().catch(() => {})
      }
      setBusy(null)
      return
    }
    try {
      // The profile now has the agency, and this page shows it.
      await reloadProfile()
    } catch {
      setOpened(true)
      setBusy(null)
    }
  }

  if (!data) {
    return loadError != null ? (
      <LoadErrorAlert prefix={t.billing.loadError} error={loadError} onRetry={load} />
    ) : (
      <Loading label={t.dashboard.loading} />
    )
  }

  const shown = data.plans.filter((p) => p.period === shownPeriod).sort((a, b) => a.agentSeats! - b.agentSeats!)

  return (
    <Card className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">{t.agency.createTitle}</h2>
        <p className="mt-1 text-sm text-slate-500">{t.agency.createHelp}</p>
        <ul className="mt-3 space-y-1 text-sm text-slate-700">
          {t.agency.benefits.map((line) => (
            <li key={line} className="flex gap-2">
              <span className="text-emerald-600" aria-hidden="true">
                ✓
              </span>
              {line}
            </li>
          ))}
        </ul>
      </div>

      <div className="max-w-md">
        <Field
          id="agency-name"
          label={t.agency.name}
          placeholder={t.agency.namePlaceholder}
          value={name}
          maxLength={100}
          error={nameMissing ? errorText(new BookingError('missingAgencyName'), t) : undefined}
          onChange={(e) => {
            setName(e.target.value)
            setNameMissing(false)
            setError(null)
          }}
          required
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-semibold text-slate-900">{t.agency.choosePlan}</h3>
        <PeriodToggle value={shownPeriod} onChange={setPeriod} />
      </div>
      {movable && <p className="text-sm text-slate-600">{t.agency.moveHint(t.billing.period[movable.period])}</p>}

      <ul className="grid gap-4 sm:grid-cols-2">
        {shown.map((plan) => (
          <PlanOption
            key={plan.code}
            plan={plan}
            label={moves(plan) ? t.agency.openWithPlan : t.agency.openAndPay}
            busy={busy === plan.code}
            disabled={busy !== null || opened}
            onSelect={() => open(plan)}
          />
        ))}
      </ul>

      <p className="text-sm text-slate-500">
        {t.billing.moreAgents} <ContactLink />
      </p>
      {error != null && <PaymentErrorAlert error={error} />}
      {opened && <Alert tone="info">{t.account.reloadAfterAction}</Alert>}
      <p className="text-xs text-slate-500">{t.billing.payNote}</p>
    </Card>
  )
}

type AgencyData = { agency: Agency; members: Member[]; invites: Invite[] }

function AgencyDetails({ orgId }: { orgId: string }) {
  const { t, lang } = useI18n()
  const confirm = useConfirm()
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
    if (removed) reloadProfile().catch(() => {}) // a failure shows in the gate
  }, [removed, reloadProfile])

  async function act(id: string, confirmText: string | null, errorPrefix: string, action: () => Promise<void>) {
    if (confirmText && !(await confirm(confirmText, { tone: 'danger' }))) return
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
    if (!(await confirm(t.agency.confirmLeave(agency.name), { tone: 'danger' }))) return
    setBusy('leave')
    setActionError('')
    try {
      await leaveAgency()
    } catch (err) {
      setActionError(`${t.agency.leaveError} ${errorText(err, t)}`)
      setBusy(null)
      return
    }
    try {
      await reloadProfile()
    } catch {
      setActionError(t.account.reloadAfterAction)
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
          maxLength={100}
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
