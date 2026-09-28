// Data layer for bookings.
//
// Bookings are stored as a single JSON document in a jsonbin.io bin:
//
//   {
//     "bookings": { "16:00": { "name": "...", "phone": "...", "createdAt": "..." } },
//     "instructions": "Free text the admin writes; shown to visitors after booking."
//   }
//
// If no jsonbin.io credentials are configured, the store falls back to the
// browser's localStorage so the app can be tried out locally ("demo mode").

import { JSONBIN, TIME_SLOTS } from '../config'

const API_BASE = 'https://api.jsonbin.io/v3/b'
const LOCAL_KEY = 'apartment-viewing-bookings'

export const isDemoMode = !JSONBIN.binId || !(JSONBIN.accessKey || JSONBIN.masterKey)

// Errors carry a `code` (+ `params`) so the UI can show them in the active language.
export class BookingError extends Error {
  constructor(code, params = {}, message = code) {
    super(message)
    this.name = 'BookingError'
    this.code = code
    this.params = params
  }
}

export class SlotTakenError extends BookingError {
  constructor(slot) {
    super('slotTaken', { slot })
  }
}

function authHeaders() {
  // Prefer the scoped Access Key; fall back to the Master Key if that is all we have.
  return JSONBIN.accessKey
    ? { 'X-Access-Key': JSONBIN.accessKey }
    : { 'X-Master-Key': JSONBIN.masterKey }
}

function normalize(record) {
  const bookings = record && typeof record.bookings === 'object' && record.bookings ? record.bookings : {}
  const instructions = typeof record?.instructions === 'string' ? record.instructions : ''
  return { bookings, instructions }
}

async function request(url, options) {
  let res
  try {
    res = await fetch(url, options)
  } catch {
    throw new BookingError('network')
  }
  if (!res.ok) {
    let detail = ''
    try {
      detail = (await res.json()).message || ''
    } catch {
      // ignore non-JSON error bodies
    }
    throw new BookingError('server', { status: res.status, detail })
  }
  return res.json()
}

async function readRecord() {
  if (isDemoMode) {
    try {
      return normalize(JSON.parse(localStorage.getItem(LOCAL_KEY)))
    } catch {
      return normalize(null)
    }
  }
  const data = await request(`${API_BASE}/${JSONBIN.binId}/latest`, {
    headers: { ...authHeaders(), 'X-Bin-Meta': 'false' },
    cache: 'no-store',
  })
  return normalize(data)
}

async function writeRecord(record) {
  if (isDemoMode) {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(record))
    return record
  }
  await request(`${API_BASE}/${JSONBIN.binId}`, {
    method: 'PUT',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(record),
  })
  return record
}

/** Returns the current record: { bookings: { [slot]: { name, phone, createdAt } }, instructions } */
export function fetchRecord() {
  return readRecord()
}

// The phone number is the visitor's identity: one booking per number.
// Compare digits only, and treat the Israeli +972 prefix like a leading 0,
// so "050-123-4567" and "+972 50 123 4567" are the same visitor.
export function phoneKey(phone) {
  const digits = String(phone).replace(/\D/g, '')
  return digits.startsWith('972') ? `0${digits.slice(3)}` : digits
}

/** Finds a visitor's booking by phone: { slot, booking } or null. */
export function findBookingByPhone(bookings, phone) {
  const key = phoneKey(phone)
  const entry = Object.entries(bookings).find(([, b]) => phoneKey(b.phone) === key)
  return entry ? { slot: entry[0], booking: entry[1] } : null
}

/**
 * Books a slot. Re-reads the latest data right before writing so a slot that
 * was taken in the meantime is rejected instead of overwritten.
 */
export async function bookSlot(slot, { name, phone }) {
  if (!TIME_SLOTS.includes(slot)) throw new BookingError('unknownSlot')

  const record = await readRecord()
  if (record.bookings[slot]) throw new SlotTakenError(slot)

  const existing = findBookingByPhone(record.bookings, phone)
  if (existing) throw new BookingError('duplicate', { slot: existing.slot })

  const next = {
    ...record,
    bookings: {
      ...record.bookings,
      [slot]: { name: name.trim(), phone: phone.trim(), createdAt: new Date().toISOString() },
    },
  }
  return writeRecord(next)
}

/**
 * Moves a visitor's booking (found by phone) to a new slot and frees the old
 * one in the same write. If the booking no longer exists (e.g. the admin
 * released it), the visitor is simply booked into the new slot.
 */
export async function rescheduleBooking(phone, newSlot, { name } = {}) {
  if (!TIME_SLOTS.includes(newSlot)) throw new BookingError('unknownSlot')

  const record = await readRecord()
  const existing = findBookingByPhone(record.bookings, phone)
  if (existing?.slot === newSlot) return record
  if (record.bookings[newSlot]) throw new SlotTakenError(newSlot)

  const bookings = { ...record.bookings }
  const now = new Date().toISOString()
  if (existing) {
    delete bookings[existing.slot]
    bookings[newSlot] = { ...existing.booking, updatedAt: now }
  } else {
    bookings[newSlot] = { name: (name || '').trim(), phone: phone.trim(), createdAt: now }
  }
  return writeRecord({ ...record, bookings })
}

/**
 * Cancels a visitor's booking (found by phone), making its slot available
 * again. Does nothing if the booking no longer exists.
 */
export async function cancelBooking(phone) {
  const record = await readRecord()
  const existing = findBookingByPhone(record.bookings, phone)
  if (!existing) return record
  const { [existing.slot]: _removed, ...rest } = record.bookings
  return writeRecord({ ...record, bookings: rest })
}

/** Removes the booking for a slot, making it available again. */
export async function releaseSlot(slot) {
  const record = await readRecord()
  const { [slot]: _removed, ...rest } = record.bookings
  return writeRecord({ ...record, bookings: rest })
}

/** Saves the admin's instructions shown to visitors after they book. */
export async function saveInstructions(text) {
  const record = await readRecord()
  return writeRecord({ ...record, instructions: text.trim() })
}
