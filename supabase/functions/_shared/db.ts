// Database access as service_role. SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
// are set by Supabase for every edge function.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { ApiError, SNAKE_CODE } from './http.ts'

export const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
})

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
