import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'
import { applyPendingAccountType, fetchProfile, signOut, type Profile } from '../lib/auth'
import { useSession } from '../hooks/useSession'
import { navigate, useRoute } from '../hooks/useRoute'
import { errorText, useI18n } from '../i18n/I18nProvider'
import { Alert, Button, Link, Loading } from './ui'
import LoginForm from './LoginForm'

/**
 * `reloadProfile` throws when the profile can't be loaded, so that a flow
 * waiting on it (e.g. after joining an agency) can stop and say so. The gate
 * also shows the error above the page until a reload succeeds.
 */
type Account = { user: User; profile: Profile; reloadProfile: () => Promise<void> }

const AccountContext = createContext<Account | null>(null)

/** The logged-in user and their profile. Only inside <AccountGate>. */
export function useAccount(): Account {
  const value = useContext(AccountContext)
  if (!value) throw new Error('useAccount must be used inside <AccountGate>')
  return value
}

/**
 * Shows its children only to a logged-in user, with their profile loaded;
 * otherwise the login form, on the same URL.
 */
export default function AccountGate({ children }: { children: ReactNode }) {
  const { t } = useI18n()
  const session = useSession()
  const user = session?.user
  const userId = user?.id
  const [profile, setProfile] = useState<Profile | null>(null)
  const [error, setError] = useState<unknown>(null)

  const reloadProfile = useCallback(async () => {
    if (!userId) return
    try {
      const loaded = await fetchProfile(userId)
      let upgraded = false
      try {
        upgraded = await applyPendingAccountType(loaded)
      } catch {
        // The choice is kept and retried on the next load; meanwhile the account works as personal.
      }
      setProfile(upgraded ? await fetchProfile(userId) : loaded)
      setError(null)
    } catch (err) {
      setError(err)
      throw err
    }
  }, [userId])

  useEffect(() => {
    // Shown below: in place of the page, or above it once a profile has loaded.
    reloadProfile().catch(() => {})
  }, [reloadProfile])

  if (session === undefined) return <Loading label={t.dashboard.loading} />
  if (!user) return <LoginForm />

  // A profile left over from a previous user doesn't count.
  const current = profile?.id === user.id ? profile : null
  if (!current) {
    return error != null ? (
      <div className="pt-8">
        <Alert>
          {t.account.loadError} {errorText(error, t)}
        </Alert>
      </div>
    ) : (
      <Loading label={t.dashboard.loading} />
    )
  }

  return (
    <AccountContext.Provider value={{ user, profile: current, reloadProfile }}>
      <AccountBar user={user} profile={current} />
      {error != null && (
        <div className="mt-4">
          <Alert>
            {t.account.reloadError} {errorText(error, t)}
          </Alert>
        </div>
      )}
      {children}
    </AccountContext.Provider>
  )
}

function AccountBar({ user, profile }: { user: User; profile: Profile }) {
  const { t } = useI18n()
  const route = useRoute()
  const links = [
    { href: '/dashboard', label: t.nav.myProperties },
    { href: '/dashboard/agency', label: t.agency.nav },
    { href: '/dashboard/calendar', label: t.calendar.nav },
  ]

  async function logout() {
    // Supabase clears the local session even when the request fails.
    await signOut().catch(() => {})
    navigate('/')
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white/70 px-4 py-2.5 text-sm shadow-sm">
      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate font-medium text-slate-800">{profile.fullName || user.email}</span>
        <span className="shrink-0 rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700">
          {t.account.plan[profile.role]}
        </span>
      </div>
      <div className="flex items-center gap-1">
        {links.map((link) => {
          const active = route.replace(/\/+$/, '') === link.href
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={active ? 'page' : undefined}
              className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                active ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {link.label}
            </Link>
          )
        })}
        <Button variant="secondary" className="ms-1 px-3! py-1.5! text-xs" onClick={logout}>
          {t.account.logout}
        </Button>
      </div>
    </div>
  )
}
