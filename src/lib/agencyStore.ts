// Agency side: creating an agency, invites, members, and which agents are
// assigned to the agency's properties. Membership and roles change only
// through database functions; row-level security limits the rest.

import type { Role } from './auth'
import { BookingError, run } from './supabase'

export type Agency = { id: string; name: string }

export type Member = { id: string; role: Role; fullName: string; phone: string; email: string }

export type Invite = { code: string; expiresAt: string }

/** How to show a member: their name, or their email when they have none (e.g. some Google accounts). */
export const memberName = (m: Member) => m.fullName || m.email

/** The user's agency. Throws 'agencyNotFound' if they're no longer a member. */
export async function fetchAgency(orgId: string): Promise<Agency> {
  const row = await run((db) => db.from('organizations').select('id, name').eq('id', orgId).maybeSingle())
  if (!row) throw new BookingError('agencyNotFound')
  return row
}

/** Creates an agency with the user as its admin. Returns its id. */
export async function createAgency(name: string): Promise<string> {
  return run((db) => db.rpc('create_agency', { p_name: name.trim() }))
}

export async function renameAgency(orgId: string, name: string): Promise<Agency> {
  return run((db) => db.from('organizations').update({ name: name.trim() }).eq('id', orgId).select('id, name').single())
}

/** Everyone in the user's agency, admin first. */
export async function fetchMembers(): Promise<Member[]> {
  const rows = await run((db) => db.rpc('agency_members'))
  return rows.map((m) => ({ id: m.id, role: m.role, fullName: m.full_name, phone: m.phone, email: m.email }))
}

/** Removes an agent from the agency (admin only). Their own properties stay theirs. */
export async function removeAgent(agentId: string): Promise<void> {
  await run((db) => db.rpc('remove_agent', { p_agent_id: agentId }))
}

/** Leaves the agency (agents only). The agency's properties stay with the agency. */
export async function leaveAgency(): Promise<void> {
  await run((db) => db.rpc('leave_agency'))
}

/** Invites that can still be used, newest first (admin only). */
export async function fetchInvites(orgId: string): Promise<Invite[]> {
  const rows = await run((db) =>
    db
      .from('agency_invites')
      .select('code, expires_at')
      .eq('org_id', orgId)
      .is('used_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false }),
  )
  return rows.map((r) => ({ code: r.code, expiresAt: r.expires_at }))
}

/** Creates a one-time invite, valid for 7 days. Returns its code. */
export async function createInvite(): Promise<string> {
  return run((db) => db.rpc('create_agency_invite'))
}

export async function revokeInvite(code: string): Promise<void> {
  await run((db) => db.from('agency_invites').delete().eq('code', code))
}

export const inviteUrl = (code: string) => `${window.location.origin}/join/${code}`

/** The name of the agency an invite leads to. Throws 'invalidInvite' if it can't be used. */
export async function previewInvite(code: string): Promise<string> {
  return run((db) => db.rpc('preview_agency_invite', { p_code: code }))
}

export async function acceptInvite(code: string): Promise<void> {
  await run((db) => db.rpc('accept_agency_invite', { p_code: code }))
}

// An invite link opened before logging in or signing up. Login keeps the
// /join URL, but sign-up and Google both land on /dashboard, which sends
// the user back to /join/<code> while one is remembered.
const PENDING_INVITE_KEY = 'pending-agency-invite'

export function rememberInvite(code: string) {
  try {
    localStorage.setItem(PENDING_INVITE_KEY, code)
  } catch {
    // storage unavailable — the user opens the link again after signing up
  }
}

export function pendingInvite(): string | null {
  try {
    return localStorage.getItem(PENDING_INVITE_KEY)
  } catch {
    return null
  }
}

export function forgetInvite() {
  try {
    localStorage.removeItem(PENDING_INVITE_KEY)
  } catch {
    // storage unavailable — nothing was saved
  }
}

/** Ids of the agents assigned to a property. */
export async function fetchAssignedAgents(propertyId: string): Promise<string[]> {
  const rows = await run((db) => db.from('property_agents').select('agent_id').eq('property_id', propertyId))
  return rows.map((r) => r.agent_id)
}

/** Assigns or unassigns an agency agent to one of the agency's properties (admin only). */
export async function setAgentAssigned(propertyId: string, agentId: string, assigned: boolean): Promise<void> {
  if (assigned) {
    // Already assigned (e.g. from another tab) is fine.
    await run((db) =>
      db.from('property_agents').upsert({ property_id: propertyId, agent_id: agentId }, { ignoreDuplicates: true }),
    )
  } else {
    await run((db) => db.from('property_agents').delete().eq('property_id', propertyId).eq('agent_id', agentId))
  }
}
