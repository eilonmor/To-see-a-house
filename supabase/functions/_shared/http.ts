// Request handling shared by the guest edge functions: CORS, JSON in and out,
// and errors as { error: 'snake_case_code' } for the app to translate.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

/** An error the app shows to the guest, by its code (e.g. 'otp_wrong_code'). */
export class ApiError extends Error {
  constructor(public code: string, public status = 400) {
    super(code)
  }
}

export const SNAKE_CODE = /^[a-z]+(_[a-z]+)+$/

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

export type Body = Record<string, unknown>

/** Wraps a function that takes the JSON body and returns the JSON response. */
export function handler(fn: (body: Body, req: Request) => Promise<unknown>) {
  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
    if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
    try {
      let body: unknown
      try {
        body = await req.json()
      } catch {
        throw new ApiError('bad_request')
      }
      if (!body || typeof body !== 'object') throw new ApiError('bad_request')
      return json((await fn(body as Body, req)) ?? {})
    } catch (err) {
      if (err instanceof ApiError) return json({ error: err.code }, err.status)
      console.error(err)
      return json({ error: 'server' }, 500)
    }
  }
}

/**
 * The caller's IP address, or null if unknown (the per-IP limit is then skipped).
 * Supabase sits behind Cloudflare, which sets cf-connecting-ip itself. Not
 * x-forwarded-for: the caller can put any address at its start.
 */
export function clientIp(req: Request): string | null {
  const ip = req.headers.get('cf-connecting-ip')?.trim() ?? ''
  return /^[0-9a-fA-F:.]{3,45}$/.test(ip) ? ip : null
}

/** A string field from the body ('' if missing). */
export const str = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')
