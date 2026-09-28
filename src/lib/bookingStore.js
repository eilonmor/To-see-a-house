// Data layer for bookings.
//
// Bookings are stored as a single JSON document in a jsonbin.io bin:
//
//   { "bookings": { "16:00": { "name": "...", "phone": "...", "createdAt": "..." } } }
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
  return { bookings }
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

/** Returns the current bookings map: { [slot]: { name, phone, createdAt } } */
export async function fetchBookings() {
  const { bookings } = await readRecord()
  return bookings
}

const digitsOnly = (phone) => phone.replace(/\D/g, '')

/**
 * Books a slot. Re-reads the latest data right before writing so a slot that
 * was taken in the meantime is rejected instead of overwritten.
 */
export async function bookSlot(slot, { name, phone }) {
  if (!TIME_SLOTS.includes(slot)) throw new BookingError('unknownSlot')

  const record = await readRecord()
  if (record.bookings[slot]) throw new SlotTakenError(slot)

  const existing = Object.entries(record.bookings).find(
    ([, b]) => digitsOnly(b.phone) === digitsOnly(phone),
  )
  if (existing) throw new BookingError('duplicate', { slot: existing[0] })

  const next = {
    ...record,
    bookings: {
      ...record.bookings,
      [slot]: { name: name.trim(), phone: phone.trim(), createdAt: new Date().toISOString() },
    },
  }
  await writeRecord(next)
  return next.bookings
}

/** Removes the booking for a slot, making it available again. */
export async function releaseSlot(slot) {
  const record = await readRecord()
  const { [slot]: _removed, ...rest } = record.bookings
  const next = { ...record, bookings: rest }
  await writeRecord(next)
  return next.bookings
}
