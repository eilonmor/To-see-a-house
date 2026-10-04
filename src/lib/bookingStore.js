// Guest-side data layer: everything a visitor can do without logging in.
//
// Visitors never read tables directly. They go through security-definer
// database functions (see supabase/migrations) that never expose other
// visitors' names or phone numbers.

import { BookingError, run } from './supabase'

export { BookingError } from './supabase'

// Postgres returns times as 'HH:MM:SS'; the app works with 'HH:MM'.
export const hhmm = (time) => String(time).slice(0, 5)

const toMinutes = (time) => {
  const [h, m] = hhmm(time).split(':').map(Number)
  return h * 60 + m
}

const fromMinutes = (total) =>
  `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`

/** A visit day's slots: from start_time (inclusive) to end_time (exclusive), every slot_minutes. */
export function daySlots({ start_time, end_time, slot_minutes }) {
  const slots = []
  for (let t = toMinutes(start_time); t < toMinutes(end_time); t += slot_minutes) slots.push(fromMinutes(t))
  return slots
}

/** Today's date in Israel as 'YYYY-MM-DD' (the database decides "past" by this date). */
export function israelToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date())
}

/** Formats a 'YYYY-MM-DD' date for display, day first in both languages, e.g. "Sun 12/10". */
export function formatDate(date, lang, options = { weekday: 'short', day: 'numeric', month: 'numeric' }) {
  const locale = lang === 'en' ? 'en-GB' : lang
  return new Date(`${date}T00:00:00Z`).toLocaleDateString(locale, { ...options, timeZone: 'UTC' })
}

// The phone number is the visitor's identity. Same rule as public.phone_key()
// in the database: digits only, and the Israeli +972 prefix counts as a leading 0,
// so "050-123-4567" and "+972 50 123 4567" are the same visitor.
export function phoneKey(phone) {
  const digits = String(phone).replace(/\D/g, '')
  return digits.startsWith('972') ? `0${digits.slice(3)}` : digits
}

/** Israeli numbers only (landline or mobile), the format the database accepts. */
export const isValidPhone = (phone) => /^0\d{8,9}$/.test(phoneKey(phone))

/**
 * Loads a property's public page:
 * { id, title, address, days: [{ id, date, slots: ['17:00', ...], taken: ['17:10', ...] }] }
 */
export async function fetchProperty(slug) {
  const data = await run((db) => db.rpc('get_public_property', { p_slug: slug }))
  if (!data) throw new BookingError('propertyNotFound')
  return {
    ...data,
    days: data.days.map((d) => ({ id: d.id, date: d.date, slots: daySlots(d), taken: d.taken.map(hhmm) })),
  }
}

/** The visitor's upcoming bookings for a property: [{ dayId, date, slot, name, instructions }] */
export async function findGuestBookings(slug, phone) {
  const rows = await run((db) => db.rpc('find_guest_bookings', { p_slug: slug, p_phone: phone }))
  return rows.map((b) => ({ dayId: b.day_id, date: b.date, slot: hhmm(b.slot), name: b.name, instructions: b.instructions }))
}

/**
 * Books a slot. If the visitor already has a booking on that day, it moves to
 * the new slot in the same transaction. Returns the property's instructions.
 */
export async function bookSlot(dayId, slot, { name, phone }) {
  try {
    const data = await run((db) =>
      db.rpc('book_guest_slot', { p_day_id: dayId, p_slot: slot, p_name: name, p_phone: phone }),
    )
    return { instructions: data.instructions }
  } catch (err) {
    err.params = { slot, ...err.params }
    throw err
  }
}

/**
 * Moves a visitor's booking ({ dayId }) to another slot. On the same day the
 * database moves it in one step; to another day, the new slot is booked first
 * and the old one is freed only after that succeeded.
 */
export async function rescheduleBooking(current, dayId, slot, details) {
  const result = await bookSlot(dayId, slot, details)
  if (current.dayId !== dayId) await cancelBooking(current.dayId, details.phone)
  return result
}

/** Cancels the visitor's booking on a day. Does nothing if there is none. */
export async function cancelBooking(dayId, phone) {
  await run((db) => db.rpc('cancel_guest_booking', { p_day_id: dayId, p_phone: phone }))
}
