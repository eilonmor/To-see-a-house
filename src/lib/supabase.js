import { createClient } from '@supabase/supabase-js'
import { SUPABASE } from '../config'

export const isConfigured = Boolean(SUPABASE.url && SUPABASE.anonKey)

// Without configuration the app shows a setup banner instead of crashing.
export const supabase = isConfigured ? createClient(SUPABASE.url, SUPABASE.anonKey) : null

// Errors carry a `code` (+ `params`) so the UI can show them in the active language.
export class BookingError extends Error {
  constructor(code, params = {}, message = code) {
    super(message)
    this.name = 'BookingError'
    this.code = code
    this.params = params
  }
}

// Database functions raise snake_case codes as the message (e.g. 'slot_taken',
// see PLAN.md); Supabase Auth puts them in `code` (e.g. 'invalid_credentials').
// The UI translates them by their camelCase name ('slotTaken'), and falls back
// to the original message for codes it has no text for.
const SNAKE_CODE = /^[a-z]+(_[a-z]+)+$/

/** Converts a Supabase error into a BookingError. */
export function toBookingError(error) {
  if (error instanceof BookingError) return error
  const message = error?.message || ''
  const code = [message, error?.code].find((c) => SNAKE_CODE.test(c || ''))
  if (code) {
    return new BookingError(code.replace(/_([a-z])/g, (_, c) => c.toUpperCase()), {}, message)
  }
  if (/fetch|network/i.test(message)) return new BookingError('network')
  return new BookingError('server', { status: error?.status || error?.code || '?', detail: message }, message)
}

/**
 * Runs a query built from the client and unwraps the response: returns its
 * data or throws a BookingError. Usage: run((db) => db.from('x').select())
 */
export async function run(build) {
  if (!supabase) throw new BookingError('notConfigured')
  let res
  try {
    res = await build(supabase)
  } catch (err) {
    throw toBookingError(err)
  }
  if (res.error) throw toBookingError(res.error)
  return res.data
}
