// Database access as service_role. SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
// are set by Supabase for every edge function.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { ApiError, SNAKE_CODE } from './http.ts'

export const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
})

/** The user whose Supabase session called the function (verify_jwt = true), or 401 not_authenticated. */
export async function sessionUser(req: Request) {
  const jwt = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  const { data } = jwt ? await admin.auth.getUser(jwt) : { data: { user: null } }
  if (!data.user) throw new ApiError('not_authenticated', 401)
  return data.user
}

/** A query's data, or throws (with `what` in the message) on an error or no row. */
export function must<R extends { data: unknown; error: { code?: string; message: string } | null }>(
  res: R,
  what: string,
): NonNullable<R['data']> {
  if (res.error || res.data == null) throw new Error(`${what}: ${res.error?.code ?? ''} ${res.error?.message ?? 'not found'}`)
  return res.data as NonNullable<R['data']>
}

/**
 * Calls a database function. Codes it raises (e.g. 'slot_taken') reach the
 * app as ApiErrors; malformed input (e.g. a day id that isn't a uuid) as 'bad_request'.
 */
export async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await admin.rpc(fn, args)
  if (!error) return data as T
  if (SNAKE_CODE.test(error.message)) throw new ApiError(error.message)
  if (error.code?.startsWith('22')) throw new ApiError('bad_request')
  throw new Error(`${fn}: ${error.code} ${error.message}`)
}
