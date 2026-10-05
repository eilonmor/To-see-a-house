// Admin-side data layer. Runs as the logged-in Supabase user; row-level
// security limits every query to the properties that user manages.

import { daySlots, hhmm, israelToday } from './bookingStore'
import { BookingError, run } from './supabase'

export type Property = {
  id: string
  title: string
  address: string
  instructions: string
  public_slug: string
  // Exactly one is set: the user or the agency that owns (and pays for) the property.
  owner_user_id: string | null
  owner_org_id: string | null
}

/** A property in the list, with its upcoming dates and how many visits are booked on them. */
export type PropertySummary = Property & { upcomingDates: string[]; upcomingBookings: number }

export type PropertyDetails = { title: string; address: string }

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

const PROPERTY_COLUMNS = 'id, title, address, instructions, public_slug, owner_user_id, owner_org_id'

/** Every property the user manages, newest first. */
export async function fetchProperties(): Promise<PropertySummary[]> {
  const rows = await run((db) =>
    db
      .from('properties')
      .select(`${PROPERTY_COLUMNS}, visit_days (date, bookings (count))`)
      .order('created_at', { ascending: false }),
  )
  const today = israelToday()
  return rows.map(({ visit_days, ...property }) => {
    const upcoming = visit_days.filter((d) => d.date >= today)
    return {
      ...property,
      upcomingDates: upcoming.map((d) => d.date).sort(),
      upcomingBookings: upcoming.reduce((n, d) => n + (d.bookings[0]?.count ?? 0), 0),
    }
  })
}

/** One property by id. Throws 'propertyNotFound' if it doesn't exist or the user can't manage it. */
export async function fetchProperty(propertyId: string): Promise<Property> {
  const row = await run((db) => db.from('properties').select(PROPERTY_COLUMNS).eq('id', propertyId).maybeSingle())
  if (!row) throw new BookingError('propertyNotFound')
  return row
}

export async function createProperty(userId: string, { title, address }: PropertyDetails): Promise<Property> {
  return run((db) =>
    db
      .from('properties')
      .insert({ owner_user_id: userId, title: title.trim(), address: address.trim() })
      .select(PROPERTY_COLUMNS)
      .single(),
  )
}

export async function updateProperty(propertyId: string, { title, address }: PropertyDetails): Promise<Property> {
  return run((db) =>
    db
      .from('properties')
      .update({ title: title.trim(), address: address.trim() })
      .eq('id', propertyId)
      .select(PROPERTY_COLUMNS)
      .single(),
  )
}

/** Deletes a property with all its dates and bookings. */
export async function deleteProperty(propertyId: string): Promise<void> {
  const rows = await run((db) => db.from('properties').delete().eq('id', propertyId).select('id'))
  // Row-level security turns a forbidden delete into "0 rows" rather than an error.
  if (rows.length === 0) throw new BookingError('notPropertyOwner')
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

const dayColumns = ({ date, startTime, endTime, slotMinutes }: NewDay) => ({
  date,
  start_time: startTime,
  end_time: endTime,
  slot_minutes: slotMinutes,
})

export async function addDay(propertyId: string, day: NewDay): Promise<void> {
  await run((db) => db.from('visit_days').insert({ property_id: propertyId, ...dayColumns(day) }))
}

/** Changes a visit day's date or hours. The database refuses hours that would leave a booking out. */
export async function updateDay(dayId: string, day: NewDay): Promise<void> {
  await run((db) => db.from('visit_days').update(dayColumns(day)).eq('id', dayId))
}

/** Deletes a visit day and all of its bookings. */
export async function deleteDay(dayId: string): Promise<void> {
  await run((db) => db.from('visit_days').delete().eq('id', dayId))
}

/** Removes a booking, making its slot available again. */
export async function releaseBooking(bookingId: string): Promise<void> {
  await run((db) => db.from('bookings').delete().eq('id', bookingId))
}
