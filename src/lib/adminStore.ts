// Admin-side data layer. Runs as the logged-in Supabase user; row-level
// security limits every query to the properties that user manages.

import { daySlots, hhmm } from './bookingStore'
import { run } from './supabase'

export type Property = { id: string; title: string; address: string; instructions: string; public_slug: string }

export type AdminBooking = { id: string; name: string; phone: string }

/** A viewing day with its bookings by slot. Times are 'HH:MM'. */
export type AdminDay = {
  id: string
  date: string
  startTime: string
  endTime: string
  slotMinutes: number
  slots: string[]
  bookings: Record<string, AdminBooking | undefined>
}

export type NewDay = { date: string; startTime: string; endTime: string; slotMinutes: number }

const PROPERTY_COLUMNS = 'id, title, address, instructions, public_slug'

export async function signIn(email: string, password: string): Promise<void> {
  await run((db) => db.auth.signInWithPassword({ email: email.trim(), password }))
}

export async function signOut(): Promise<void> {
  await run(async (db) => ({ data: null, ...(await db.auth.signOut()) }))
}

/** The first property the user manages, or null. (Phase 2 adds a property list.) */
export async function fetchMyProperty(): Promise<Property | null> {
  const rows = await run((db) => db.from('properties').select(PROPERTY_COLUMNS).order('created_at').limit(1))
  return rows[0] ?? null
}

export async function createProperty(userId: string, { title, address }: { title: string; address: string }): Promise<Property> {
  return run((db) =>
    db
      .from('properties')
      .insert({ owner_user_id: userId, title: title.trim(), address: address.trim() })
      .select(PROPERTY_COLUMNS)
      .single(),
  )
}

/** Saves the instructions shown to visitors after they book. Returns the saved text. */
export async function saveInstructions(propertyId: string, text: string): Promise<string> {
  const row = await run((db) =>
    db.from('properties').update({ instructions: text.trim() }).eq('id', propertyId).select('instructions').single(),
  )
  return row.instructions
}

/** The property's visit days with their bookings, newest date last. */
export async function fetchDays(propertyId: string): Promise<AdminDay[]> {
  const rows = await run((db) =>
    db
      .from('visit_days')
      .select('id, date, start_time, end_time, slot_minutes, bookings (id, slot, guest_name, guest_phone_key)')
      .eq('property_id', propertyId)
      .order('date'),
  )
  return rows.map((d) => ({
    id: d.id,
    date: d.date,
    startTime: hhmm(d.start_time),
    endTime: hhmm(d.end_time),
    slotMinutes: d.slot_minutes,
    slots: daySlots(d),
    bookings: Object.fromEntries(
      d.bookings.map((b) => [hhmm(b.slot), { id: b.id, name: b.guest_name, phone: b.guest_phone_key }]),
    ),
  }))
}

export async function addDay(propertyId: string, { date, startTime, endTime, slotMinutes }: NewDay): Promise<void> {
  await run((db) =>
    db.from('visit_days').insert({
      property_id: propertyId,
      date,
      start_time: startTime,
      end_time: endTime,
      slot_minutes: slotMinutes,
    }),
  )
}

/** Deletes a visit day and all of its bookings. */
export async function deleteDay(dayId: string): Promise<void> {
  await run((db) => db.from('visit_days').delete().eq('id', dayId))
}

/** Removes a booking, making its slot available again. */
export async function releaseBooking(bookingId: string): Promise<void> {
  await run((db) => db.from('bookings').delete().eq('id', bookingId))
}
