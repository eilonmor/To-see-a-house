// Account side of Supabase Auth: sign-up, login, password reset, and the
// user's profile row (created by a database trigger on sign-up).

import type { Database } from './database.types'
import { phoneKey } from './bookingStore'
import { BookingError, callFunction, run } from './supabase'

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
  /**
   * A running subscription covers the user: their own or their agency's.
   * Agents and agency admins need one to add properties (the database checks
   * this too); personal users are on the free plan instead.
   */
  planActive: boolean
  /** The agency's subscription is running (false outside an agency). */
  agencyPlanActive: boolean
  /** Accepted the current terms of use and privacy policy (see TERMS_UPDATED_AT). */
  termsAccepted: boolean
}

/**
 * When the terms of use or the privacy policy (src/legal/) last changed in a
 * way users must accept again. Users who accepted before it are asked again,
 * so bump it with every material change to either document.
 */
export const TERMS_UPDATED_AT = new Date('2026-10-20T00:00:00+03:00')

const isRunning = (status: string | null | undefined) => status === 'active' || status === 'past_due'

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
        // The phone is saved normalized ("0543918750"), whatever way it was typed.
        // The sign-up page only gets here once the terms and privacy policy are
        // accepted; the database records the time.
        data: {
          role: accountType,
          full_name: fullName.trim(),
          phone: phone.trim() ? phoneKey(phone) : '',
          terms_accepted: true,
        },
      },
    }),
  )
  return { needsConfirmation: !data.session }
}

// What was picked on the sign-up page before leaving for Google: the account
// type, and that the terms were accepted.
const PENDING_ACCOUNT_TYPE_KEY = 'pending-account-type'
const PENDING_TERMS_KEY = 'pending-terms-accepted'

function forgetPendingAccountType() {
  try {
    sessionStorage.removeItem(PENDING_ACCOUNT_TYPE_KEY)
    sessionStorage.removeItem(PENDING_TERMS_KEY)
  } catch {
    // storage unavailable — nothing was saved
  }
}

/**
 * Signs in (or up) with Google: the browser leaves for Google and comes back
 * to /dashboard. Google users start as 'personal' without accepted terms;
 * `accountType` 'agent' and `termsAccepted` (the sign-up page's checkbox) are
 * applied on return by applyPendingAccountType().
 */
export async function signInWithGoogle(accountType?: AccountType, termsAccepted = false): Promise<void> {
  try {
    if (accountType === 'agent') sessionStorage.setItem(PENDING_ACCOUNT_TYPE_KEY, accountType)
    else sessionStorage.removeItem(PENDING_ACCOUNT_TYPE_KEY)
    if (termsAccepted) sessionStorage.setItem(PENDING_TERMS_KEY, 'true')
    else sessionStorage.removeItem(PENDING_TERMS_KEY)
  } catch {
    // storage unavailable — the user stays on the free plan, and is asked for the terms on return
  }
  await run((db) => db.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: appUrl('/dashboard') } }))
}

/**
 * After a Google sign-up, makes the profile an agent and records the accepted
 * terms, as picked on the sign-up page. Returns whether the profile changed.
 */
export async function applyPendingAccountType(profile: Profile): Promise<boolean> {
  let pendingType: string | null = null
  let pendingTerms = false
  try {
    pendingType = sessionStorage.getItem(PENDING_ACCOUNT_TYPE_KEY)
    pendingTerms = sessionStorage.getItem(PENDING_TERMS_KEY) === 'true'
  } catch {
    return false
  }
  if (!pendingType && !pendingTerms) return false
  const upgrade = pendingType === 'agent' && profile.role === 'personal' && !profile.orgId
  const accept = pendingTerms && !profile.termsAccepted
  // Throws on failure, keeping the choices so that loading the account again retries.
  if (upgrade) await upgradeToAgent()
  if (accept) await acceptTerms()
  forgetPendingAccountType()
  return upgrade || accept
}

/** Records that the user accepted the current terms of use and privacy policy (now, by the database's clock). */
export async function acceptTerms(): Promise<void> {
  await run((db) => db.rpc('accept_terms'))
}

/**
 * Free owner -> agent. Only from 'personal' (agency members already are
 * agents or admins). Used for Google sign-ups as an agent; the agent still
 * needs a subscription (billing page) to add properties.
 */
export async function upgradeToAgent(): Promise<void> {
  await run((db) => db.rpc('become_agent'))
}

export async function signOut(): Promise<void> {
  await run(async (db) => ({ data: null, ...(await db.auth.signOut()) }))
}

/**
 * Deletes the account for good (the delete-account edge function), in one
 * transaction: the user's (and an agency admin's agency's) subscription ends
 * with it, with no refund, and an admin's agency is deleted. Then signs out.
 * Raises payment_in_progress while a payment may still be charged.
 */
export async function deleteAccount(): Promise<void> {
  await callFunction<{ deleted: true }>('delete-account', { confirm: 'delete' })
  // The user is gone: only the local session is left to clear.
  await signOut().catch(() => {})
}

/** Emails a link to /reset-password, where the user picks a new password. */
export async function requestPasswordReset(email: string): Promise<void> {
  await run((db) => db.auth.resetPasswordForEmail(email.trim(), { redirectTo: appUrl('/reset-password') }))
}

/**
 * Logs in from a password-reset link of the form
 * /reset-password?token_hash=…&type=recovery (see README: the Reset Password
 * email template). Unlike the default "?code=" link, it works in any browser,
 * not only the one that asked for the reset.
 */
export async function verifyRecoveryLink(tokenHash: string): Promise<void> {
  await run((db) => db.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' }))
}

/** Sets a new password for the logged-in user (after following the reset link). */
export async function updatePassword(password: string): Promise<void> {
  await run((db) => db.auth.updateUser({ password }))
}

export async function fetchProfile(userId: string): Promise<Profile> {
  const row = await run((db) =>
    db
      .from('profiles')
      .select('id, role, full_name, phone, org_id, last_property_created_at, terms_accepted_at, subscription_status, organizations(subscription_status)')
      .eq('id', userId)
      .maybeSingle(),
  )
  if (!row) throw new BookingError('profileNotFound')
  return {
    id: row.id,
    role: row.role,
    fullName: row.full_name,
    phone: row.phone,
    orgId: row.org_id,
    lastPropertyCreatedAt: row.last_property_created_at,
    planActive: isRunning(row.subscription_status) || isRunning(row.organizations?.subscription_status),
    agencyPlanActive: isRunning(row.organizations?.subscription_status),
    termsAccepted: row.terms_accepted_at != null && new Date(row.terms_accepted_at) >= TERMS_UPDATED_AT,
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
