// Guest tokens and code hashes, both HMAC-SHA256 with GUEST_TOKEN_SECRET.
//
// A token is "<payload>.<signature>", where payload is base64url JSON
// { phone, exp }. It proves the browser received an SMS code on that phone.
// There is no server-side session: a token is valid until it expires.

import { ApiError } from './http.ts'

const TOKEN_DAYS = 30
const encoder = new TextEncoder()

let keyPromise: Promise<CryptoKey> | undefined

function key(): Promise<CryptoKey> {
  const secret = Deno.env.get('GUEST_TOKEN_SECRET') ?? ''
  if (secret.length < 32) throw new Error('GUEST_TOKEN_SECRET is missing or shorter than 32 characters')
  keyPromise ??= crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ])
  return keyPromise
}

const toBase64Url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

const fromBase64Url = (text: string): Uint8Array<ArrayBuffer> =>
  Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))

async function sign(text: string): Promise<string> {
  return toBase64Url(new Uint8Array(await crypto.subtle.sign('HMAC', await key(), encoder.encode(text))))
}

/** The hash stored for a code. Tied to the phone, so a hash can't be reused for another number. */
export const otpHash = (phoneKey: string, code: string): Promise<string> => sign(`otp:${phoneKey}:${code}`)

/** Signs a token for a verified phone. */
export async function issueToken(phoneKey: string): Promise<{ token: string; expires_at: string }> {
  const exp = Date.now() + TOKEN_DAYS * 24 * 60 * 60 * 1000
  const payload = toBase64Url(encoder.encode(JSON.stringify({ phone: phoneKey, exp })))
  return { token: `${payload}.${await sign(`guest:${payload}`)}`, expires_at: new Date(exp).toISOString() }
}

/** The phone a token was issued for. Throws 'invalid_token' if it's forged, malformed or expired. */
export async function verifyToken(token: string): Promise<string> {
  const invalid = new ApiError('invalid_token', 401)
  const [payload, signature, extra] = token.split('.')
  if (!payload || !signature || extra !== undefined) throw invalid
  let claims: { phone?: unknown; exp?: unknown }
  try {
    const valid = await crypto.subtle.verify(
      'HMAC',
      await key(),
      fromBase64Url(signature),
      encoder.encode(`guest:${payload}`),
    )
    if (!valid) throw invalid
    claims = JSON.parse(new TextDecoder().decode(fromBase64Url(payload)))
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('GUEST_TOKEN_SECRET')) throw err
    throw invalid
  }
  if (typeof claims.phone !== 'string' || typeof claims.exp !== 'number' || claims.exp < Date.now()) throw invalid
  return claims.phone
}
