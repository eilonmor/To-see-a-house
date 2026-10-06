import { useEffect, useState } from 'react'
import {
  calendarFeedUrl,
  createCalendarToken,
  deleteCalendarToken,
  fetchCalendarToken,
  googleCalendarUrl,
  webcalUrl,
} from '../lib/calendarStore'
import { errorText, useI18n } from '../i18n/I18nProvider'
import { useAccount } from './AccountGate'
import { useConfirm } from './ConfirmDialog'
import { Alert, Button, Card, CopyButton, Loading, Spinner } from './ui'

const linkButton =
  'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2'

/** /dashboard/calendar: the user's private calendar subscription link. */
export default function CalendarPage() {
  const { t, lang } = useI18n()
  const confirm = useConfirm()
  const { user } = useAccount()
  // undefined while loading, null when the user has no link.
  const [token, setToken] = useState<string | null | undefined>(undefined)
  const [loadError, setLoadError] = useState<unknown>(null)
  const [busy, setBusy] = useState<'create' | 'reset' | 'off' | null>(null)
  const [actionError, setActionError] = useState('')

  useEffect(() => {
    let cancelled = false
    fetchCalendarToken(user.id).then(
      (loaded) => !cancelled && setToken(loaded),
      (err) => !cancelled && setLoadError(err),
    )
    return () => {
      cancelled = true
    }
  }, [user.id])

  async function act(kind: 'create' | 'reset' | 'off', confirmText: string | null, action: () => Promise<string | null>) {
    if (confirmText && !(await confirm(confirmText, { tone: 'danger' }))) return
    setBusy(kind)
    setActionError('')
    try {
      setToken(await action())
    } catch (err) {
      setActionError(`${t.calendar.actionError} ${errorText(err, t)}`)
    } finally {
      setBusy(null)
    }
  }

  const feedUrl = token ? calendarFeedUrl(token, lang) : ''

  return (
    <div className="space-y-6 pt-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t.calendar.title}</h1>
        <p className="mt-1 text-slate-500">{t.calendar.subtitle}</p>
      </div>

      <Card>
        <h2 className="text-lg font-semibold text-slate-900">{t.calendar.howTitle}</h2>
        <ul className="mt-3 list-disc space-y-1.5 ps-5 text-sm text-slate-600">
          {t.calendar.how.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </Card>

      {actionError && <Alert>{actionError}</Alert>}

      {token === undefined ? (
        loadError != null ? (
          <Alert>
            {t.calendar.loadError} {errorText(loadError, t)}
          </Alert>
        ) : (
          <Loading label={t.dashboard.loading} />
        )
      ) : token === null ? (
        <div className="flex justify-center">
          <Button onClick={() => act('create', null, createCalendarToken)} disabled={busy !== null}>
            {busy === 'create' && <Spinner />} {t.calendar.create}
          </Button>
        </div>
      ) : (
        <Card>
          <h2 className="text-lg font-semibold text-slate-900">{t.calendar.linkTitle}</h2>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <code
              className="min-w-0 flex-1 truncate rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700"
              dir="ltr"
              title={feedUrl}
            >
              {feedUrl}
            </code>
            <CopyButton text={feedUrl} label={t.calendar.copy} copiedLabel={t.dashboard.copied} />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <a
              href={googleCalendarUrl(feedUrl)}
              target="_blank"
              rel="noopener noreferrer"
              className={`${linkButton} bg-indigo-600 text-white hover:bg-indigo-700`}
            >
              {t.calendar.addGoogle}
            </a>
            <a href={webcalUrl(feedUrl)} className={`${linkButton} border border-slate-300 bg-white text-slate-700 hover:bg-slate-50`}>
              {t.calendar.addApple}
            </a>
          </div>
          <p className="mt-3 text-sm text-slate-500">{t.calendar.manualHelp}</p>
          <div className="mt-4">
            <Alert tone="info">{t.calendar.privacy}</Alert>
          </div>
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => act('reset', t.calendar.confirmReset, createCalendarToken)}
              disabled={busy !== null}
            >
              {busy === 'reset' && <Spinner />} {t.calendar.reset}
            </Button>
            <Button
              variant="danger"
              onClick={() =>
                act('off', t.calendar.confirmTurnOff, async () => {
                  await deleteCalendarToken(user.id)
                  return null
                })
              }
              disabled={busy !== null}
            >
              {busy === 'off' && <Spinner />} {t.calendar.turnOff}
            </Button>
          </div>
        </Card>
      )}
    </div>
  )
}
