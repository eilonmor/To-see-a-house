// Requests to CardCom's API v11 (https://secure.cardcom.solutions/api/v11).
// Needs the secrets CARDCOM_TERMINAL_NUMBER and CARDCOM_API_NAME (test
// terminal: 1000 / CardTest1994). There are no auth headers: both go in the
// body, and cardcomPost adds them, so callers never handle the credentials.
// See docs/cardcom-integration.md.

const BASE_URL = 'https://secure.cardcom.solutions/api/v11/'
const TIMEOUT_MS = 5000

function env(name: string): string {
  const value = Deno.env.get(name)
  if (!value) throw new Error(`${name} is not set`)
  return value
}

function credentials() {
  const terminal = Number(env('CARDCOM_TERMINAL_NUMBER'))
  if (!Number.isInteger(terminal)) throw new Error('CARDCOM_TERMINAL_NUMBER must be a number')
  return { TerminalNumber: terminal, ApiName: env('CARDCOM_API_NAME') }
}

/**
 * POSTs `body` (plus the terminal number and API name) to `path`, e.g.
 * 'LowProfile/Create', and returns the parsed JSON. Each attempt times out
 * after 5 seconds; a network error, timeout or non-200 status is retried once,
 * then thrown. A retried charge can't charge twice: Transactions/Transaction
 * calls send the payment id as ExternalUniqTranId.
 */
export async function cardcomPost<T = Record<string, unknown>>(path: string, body: Record<string, unknown>): Promise<T> {
  const payload = JSON.stringify({ ...body, ...credentials() })
  let lastError: unknown
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(BASE_URL + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
      if (res.ok) return (await res.json()) as T
      lastError = new Error(`HTTP ${res.status}`)
      await res.body?.cancel()
    } catch (err) {
      lastError = err
    }
  }
  throw new Error(`CardCom ${path} failed: ${lastError instanceof Error ? lastError.message : String(lastError)}`)
}
