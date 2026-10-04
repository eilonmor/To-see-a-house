// Admin-side data layer. Runs as the logged-in Supabase user; row-level
// security limits every query to the properties that user manages.

import { daySlots, hhmm } from './bookingStore'
import { run } from './supabase'

export async function signIn(email, password) {
  await run((db) => db.auth.signInWithPassword({ email: email.trim(), password }))
}

export async function signOut() {
  await run((db) => db.auth.signOut())
}

/** The first property the user manages, or null. (Phase 2 adds a property list.) */
export async function fetchMyProperty() {
  const rows = await run((db) =>
    db.from('properties').select('id, title, address, instructions, public_slug').order('created_at').limit(1),
  )
  return rows[0] || null
}

export async function createProperty(userId, { title, address }) {
  return run((db) =>
    db
      .from('properties')
      .insert({ owner_user_id: userId, title: title.trim(), address: address.trim() })
      .select('id, title, address, instructions, public_slug')
      .single(),
  )
}

/** Saves the instructions shown to visitors after they book. Returns the saved text. */
export async function saveInstructions(propertyId, text) {
  const row = await run((db) =>
    db.from('properties').update({ instructions: text.trim() }).eq('id', propertyId).select('instructions').single(),
  )
  return row.instructions
}

/**
 * The property's visit days with their bookings, newest date last:
 * [{ id, date, startTime, endTime, slotMinutes, slots, bookings: { 'HH:MM': { id, name, phone } } }]
 */
export async function fetchDays(propertyId) {
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

export async function addDay(propertyId, { date, startTime, endTime, slotMinutes }) {
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
export async function deleteDay(dayId) {
  await run((db) => db.from('visit_days').delete().eq('id', dayId))
}

/** Removes a booking, making its slot available again. */
export async function releaseBooking(bookingId) {
  await run((db) => db.from('bookings').delete().eq('id', bookingId))
}
