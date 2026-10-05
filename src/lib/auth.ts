// Account side of Supabase Auth: sign-up, login, password reset, and the
// user's profile row (created by a database trigger on sign-up).

import type { Database } from './database.types'
import { BookingError, run } from './supabase'

export type Role = Database['public']['Enums']['user_role']

/** What a user picks at sign-up. 'agency_admin' only comes from creating an agency (phase 4). */
export type AccountType = Extract<Role, 'personal' | 'agent'>

export type Profile = {
  id: string
  role: Role
  fullName: string
  phone: string
  orgId: string | null
  lastPropertyCreatedAt: string | null
}

export type SignUpDetails = { accountType: AccountType; fullName: string; phone: string; email: string; password: string }

export const MIN_PASSWORD_LENGTH = 8

// Where links in Supabase emails lead back to. Each must be allowed under
// Supabase → Authentication → URL Configuration → Redirect URLs.
const appUrl = (path: string) => `${window.location.origin}${path}`

export async function signIn(email: string, password: string): Promise<void> {
  forgetPendingAccountType()
  await run((db) => db.auth.signInWithPassword({ email: email.trim(), password }))
}

/**
 * Creates the account. The role, name and phone travel as user metadata and
 * the database copies them into the profile. Returns whether the user still
 * has to confirm their email (when Supabase requires it, there's no session yet).
 */
export async function signUp({ accountType, fullName, phone, email, password }: SignUpDetails): Promise<{ needsConfirmation: boolean }> {
  forgetPendingAccountType()
  const data = await run((db) =>
    db.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: appUrl('/dashboard'),
        data: { role: accountType, full_name: fullName.trim(), phone: phone.trim() },
      },
    }),
  )
  return { needsConfirmation: !data.session }
}

// The account type picked on the sign-up page before leaving for Google.
const PENDING_ACCOUNT_TYPE_KEY = 'pending-account-type'

function forgetPendingAccountType() {
  try {
    sessionStorage.removeItem(PENDING_ACCOUNT_TYPE_KEY)
  } catch {
    // storage unavailable — nothing was saved
  }
}

/**
 * Signs in (or up) with Google: the browser leaves for Google and comes back
 * to /dashboard. Google users start as 'personal'; `accountType` 'agent' is
 * applied on return by applyPendingAccountType().
 */
export async function signInWithGoogle(accountType?: AccountType): Promise<void> {
  try {
    if (accountType === 'agent') sessionStorage.setItem(PENDING_ACCOUNT_TYPE_KEY, accountType)
    else sessionStorage.removeItem(PENDING_ACCOUNT_TYPE_KEY)
  } catch {
    // storage unavailable — the user stays on the free plan
  }
  await run((db) => db.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: appUrl('/dashboard') } }))
}

/** After a Google sign-up as an agent, makes the profile an agent. Returns whether it changed. */
export async function applyPendingAccountType(profile: Profile): Promise<boolean> {
  let pending: string | null = null
  try {
    pending = sessionStorage.getItem(PENDING_ACCOUNT_TYPE_KEY)
    sessionStorage.removeItem(PENDING_ACCOUNT_TYPE_KEY)
  } catch {
    return false
  }
  if (pending !== 'agent' || profile.role !== 'personal' || profile.orgId) return false
  await run((db) => db.rpc('become_agent'))
  return true
}

export async function signOut(): Promise<void> {
  await run(async (db) => ({ data: null, ...(await db.auth.signOut()) }))
}

/** Emails a link to /reset-password, where the user picks a new password. */
export async function requestPasswordReset(email: string): Promise<void> {
  await run((db) => db.auth.resetPasswordForEmail(email.trim(), { redirectTo: appUrl('/reset-password') }))
}

/** Sets a new password for the logged-in user (after following the reset link). */
export async function updatePassword(password: string): Promise<void> {
  await run((db) => db.auth.updateUser({ password }))
}

export async function fetchProfile(userId: string): Promise<Profile> {
  const row = await run((db) =>
    db.from('profiles').select('id, role, full_name, phone, org_id, last_property_created_at').eq('id', userId).maybeSingle(),
  )
  if (!row) throw new BookingError('profileNotFound')
  return {
    id: row.id,
    role: row.role,
    fullName: row.full_name,
    phone: row.phone,
    orgId: row.org_id,
    lastPropertyCreatedAt: row.last_property_created_at,
  }
}

/** Personal (free) plan: one new property every 30 days. The date the next one is allowed, or null if now. */
export const PERSONAL_PROPERTY_COOLDOWN_DAYS = 30

export function nextPropertyAllowedAt(profile: Profile): Date | null {
  if (profile.role !== 'personal' || !profile.lastPropertyCreatedAt) return null
  // Same as the database's "interval '30 days'" (which runs in UTC: no DST shifts).
  const next = new Date(Date.parse(profile.lastPropertyCreatedAt) + PERSONAL_PROPERTY_COOLDOWN_DAYS * 86_400_000)
  return next > new Date() ? next : null
}
