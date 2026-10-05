// Guest-side data layer: everything a visitor can do without logging in.
//
// Visitors never read tables directly. They go through security-definer
// database functions (see supabase/migrations) that never expose other
// visitors' names or phone numbers.

import type { Lang } from '../i18n/translations'
import type { PostgrestSingleResponse } from '@supabase/supabase-js'
import type { Json } from './database.types'
import { BookingError, run, type Db } from './supabase'

export { BookingError } from './supabase'

/** A viewing day as the visitor page sees it. Times are 'HH:MM'. */
export type PublicDay = { id: string; date: string; slots: string[]; taken: string[] }

export type PublicProperty = { id: string; title: string; address: string; days: PublicDay[] }

/** A visitor's booking. */
export type GuestBooking = { dayId: string; date: string; slot: string; name: string; instructions: string }

export type GuestDetails = { name: string; phone: string }

/** A slot the visitor picked or holds. */
export type SlotChoice = { dayId: string; date: string; slot: string }

// What the database functions return (see supabase/migrations).
type DayRange = { start_time: string; end_time: string; slot_minutes: number }
type PublicPropertyJson = Omit<PublicProperty, 'days'> & {
  days: (DayRange & { id: string; date: string; taken: string[] })[]
}
type GuestBookingJson = { day_id: string; date: string; slot: string; name: string; instructions: string }

// Postgres returns times as 'HH:MM:SS'; the app works with 'HH:MM'.
export const hhmm = (time: string): string => String(time).slice(0, 5)

const toMinutes = (time: string): number => {
  const [h, m] = hhmm(time).split(':').map(Number)
  return h * 60 + m
}

const fromMinutes = (total: number): string =>
  `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`

/** A visit day's slots: from start_time (inclusive) to end_time (exclusive), every slot_minutes. */
export function daySlots({ start_time, end_time, slot_minutes }: DayRange): string[] {
  const slots: string[] = []
  for (let t = toMinutes(start_time); t < toMinutes(end_time); t += slot_minutes) slots.push(fromMinutes(t))
  return slots
}

/** A moment's date in Israel as 'YYYY-MM-DD'. */
export function israelDate(moment: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(moment)
}

/** Today's date in Israel as 'YYYY-MM-DD' (the database decides "past" by this date). */
export const israelToday = (): string => israelDate(new Date())

/** Formats a 'YYYY-MM-DD' date for display, day first in both languages, e.g. "Sun 12/10". */
export function formatDate(
  date: string,
  lang: Lang,
  options: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'numeric' },
): string {
  const locale = lang === 'en' ? 'en-GB' : lang
  return new Date(`${date}T00:00:00Z`).toLocaleDateString(locale, { ...options, timeZone: 'UTC' })
}

// The phone number is the visitor's identity. Same rule as public.phone_key()
// in the database: digits only, and the Israeli +972 prefix counts as a leading 0,
// so "054-3918750", "+972543918750" and "+972-54-3918750" are all saved as "0543918750".
export function phoneKey(phone: string): string {
  const digits = String(phone).replace(/\D/g, '')
  return digits.startsWith('972') ? `0${digits.slice(3)}` : digits
}

/** A 10-digit Israeli number (e.g. 054-3918750), the format the database accepts for new bookings. */
export const isValidPhone = (phone: string): boolean => /^0\d{9}$/.test(phoneKey(phone))

/** Loads a property's public page. */
export async function fetchProperty(slug: string): Promise<PublicProperty> {
  const data = (await run((db) => db.rpc('get_public_property', { p_slug: slug }))) as PublicPropertyJson | null
  if (!data) throw new BookingError('propertyNotFound')
  return {
    ...data,
    days: data.days.map((d) => ({ id: d.id, date: d.date, slots: daySlots(d), taken: d.taken.map(hhmm) })),
  }
}

/** The visitor's upcoming bookings for a property. */
export async function findGuestBookings(slug: string, phone: string): Promise<GuestBooking[]> {
  const rows = (await run((db) => db.rpc('find_guest_bookings', { p_slug: slug, p_phone: phone }))) as GuestBookingJson[]
  return rows.map((b) => ({ dayId: b.day_id, date: b.date, slot: hhmm(b.slot), name: b.name, instructions: b.instructions }))
}

/**
 * Books a slot. If the visitor already has a booking on that day, it moves to
 * the new slot in the same transaction. Returns the property's instructions.
 */
export function bookSlot(dayId: string, slot: string, { name, phone }: GuestDetails): Promise<{ instructions: string }> {
  return bookingCall(slot, (db) => db.rpc('book_guest_slot', { p_day_id: dayId, p_slot: slot, p_name: name, p_phone: phone }))
}

// Runs a booking function and returns its instructions; errors name the slot
// so the UI can say which one was taken.
async function bookingCall(
  slot: string,
  build: (db: Db) => PromiseLike<PostgrestSingleResponse<Json>>,
): Promise<{ instructions: string }> {
  try {
    const data = (await run(build)) as { instructions: string }
    return { instructions: data.instructions }
  } catch (err) {
    if (err instanceof BookingError) err.params = { slot, ...err.params }
    throw err
  }
}

/** Cancels the visitor's booking on a day. Does nothing if there is none. */
export async function cancelBooking(dayId: string, phone: string): Promise<void> {
  await run((db) => db.rpc('cancel_guest_booking', { p_day_id: dayId, p_phone: phone }))
}

/**
 * Moves a visitor's booking ({ dayId }) to a slot on the same or another day,
 * in one database transaction: if the new slot can't be booked, the current
 * booking is kept.
 */
export function rescheduleBooking(
  current: { dayId: string },
  dayId: string,
  slot: string,
  { name, phone }: GuestDetails,
): Promise<{ instructions: string }> {
  return bookingCall(slot, (db) =>
    db.rpc('reschedule_guest_booking', {
      p_from_day_id: current.dayId,
      p_to_day_id: dayId,
      p_slot: slot,
      p_name: name,
      p_phone: phone,
    }),
  )
}
