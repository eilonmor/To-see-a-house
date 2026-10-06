import { createClient, FunctionsFetchError, FunctionsHttpError, type SupabaseClient } from '@supabase/supabase-js'
import { SUPABASE } from '../config'
import type { Database } from './database.types'

export type Db = SupabaseClient<Database>

export const isConfigured = Boolean(SUPABASE.url && SUPABASE.anonKey)

// Without configuration the app shows a setup banner instead of crashing.
// PKCE: links in sign-up and password-reset emails come back as "?code=…",
// which the client exchanges for a session on load.
export const supabase: Db | null = isConfigured
  ? createClient<Database>(SUPABASE.url, SUPABASE.anonKey, { auth: { flowType: 'pkce' } })
  : null

export type ErrorParams = Record<string, string | number>

// Errors carry a `code` (+ `params`) so the UI can show them in the active language.
export class BookingError extends Error {
  code: string
  params: ErrorParams

  constructor(code: string, params: ErrorParams = {}, message: string = code) {
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

type ErrorLike = { message?: string; code?: string | number; status?: number }

/** Converts a Supabase error into a BookingError. */
export function toBookingError(error: unknown): BookingError {
  if (error instanceof BookingError) return error
  const { message = '', code, status } = (error ?? {}) as ErrorLike
  const snake = [message, code].find((c): c is string => typeof c === 'string' && SNAKE_CODE.test(c))
  if (snake) {
    return new BookingError(snake.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase()), {}, message)
  }
  if (/fetch|network/i.test(message)) return new BookingError('network')
  return new BookingError('server', { status: status ?? code ?? '?', detail: message }, message)
}

/**
 * Runs a query built from the client and unwraps the response: returns its
 * data or throws a BookingError. Usage: run((db) => db.from('x').select())
 */
export async function run<R extends { data: unknown; error: unknown }>(
  build: (db: Db) => PromiseLike<R>,
): Promise<SuccessData<R>> {
  if (!supabase) throw new BookingError('notConfigured')
  let res
  try {
    res = await build(supabase)
  } catch (err) {
    throw toBookingError(err)
  }
  if (res.error) throw toBookingError(res.error)
  return res.data as SuccessData<R>
}

/**
 * Calls an edge function (see supabase/functions) and returns its JSON, or
 * throws a BookingError. The functions report errors as { error: 'snake_code' }.
 */
export async function callFunction<T>(name: string, body: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new BookingError('notConfigured')
  const { data, error } = await supabase.functions.invoke(name, { body })
  if (!error) return data as T
  if (error instanceof FunctionsHttpError) {
    const res = error.context as Response
    const payload = (await res.json().catch(() => null)) as { error?: string } | null
    throw toBookingError({ message: payload?.error ?? '', status: res.status })
  }
  if (error instanceof FunctionsFetchError) throw new BookingError('network')
  throw toBookingError(error)
}

// Supabase responses are a union of { data, error: null } and { data: null, error }.
type SuccessData<R> = R extends { error: null } ? R extends { data: infer T } ? T : never : never
