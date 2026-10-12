// Requests to CardCom's API v11 (https://secure.cardcom.solutions/api/v11).
// Needs the secrets CARDCOM_TERMINAL_NUMBER and CARDCOM_API_NAME (test
// terminal: 1000 / CardTest1994). There are no auth headers: both go in the
// body, and cardcomPost adds them, so callers never handle the credentials.
// See docs/cardcom-integration.md.

const BASE_URL = 'https://secure.cardcom.solutions/api/v11/'
const TIMEOUT_MS = 5000
// A card authorization can take more than 5 seconds.
const CHARGE_TIMEOUT_MS = 30_000
// CardCom's answer to an ExternalUniqTranId it has seen before, when it
// doesn't return the original transaction instead.
const DUPLICATE_ID = 608

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
 * after `timeoutMs` (default 5 seconds); a network error, timeout or non-200
 * status is retried once (unless `retry: false`), then thrown.
 *
 * Charges go through cardcomCharge, not this.
 */
export async function cardcomPost<T = Record<string, unknown>>(
  path: string,
  body: Record<string, unknown>,
  { retry = true, timeoutMs = TIMEOUT_MS }: { retry?: boolean; timeoutMs?: number } = {},
): Promise<T> {
  const payload = JSON.stringify({ ...body, ...credentials() })
  let lastError: unknown
  for (let attempt = 1; attempt <= (retry ? 2 : 1); attempt++) {
    try {
      const res = await fetch(BASE_URL + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        signal: AbortSignal.timeout(timeoutMs),
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

export type TransactionResponse = {
  ResponseCode?: number | null
  Description?: string | null
  TranzactionId?: number | null
  DocumentNumber?: number | null
  DocumentType?: string | null
}

/**
 * 'paid' / 'declined': CardCom's answer. 'unknown': the card may or may not
 * have been charged (the request failed, or CardCom answered 608 or without
 * a ResponseCode). Leave the payment pending; it is sent again later with the
 * same ExternalUniqTranId (renewals: start_renewal's resend).
 */
export type ChargeResult = { outcome: 'paid' | 'declined' | 'unknown'; response: TransactionResponse | null }

/**
 * Charges a saved token with Transactions/Transaction. `ExternalUniqTranId`
 * must be the payment id. ExternalUniqUniqTranIdResponse: true makes CardCom
 * answer a repeated id with the original transaction's response instead of
 * charging again, so sending the same payment again is safe.
 *
 * Not retried right away: the first attempt may still be in progress at
 * CardCom, and a duplicate of it could come back as 608. An unknown outcome
 * is resolved by sending it again later.
 */
export async function cardcomCharge(body: Record<string, unknown> & { ExternalUniqTranId: string }): Promise<ChargeResult> {
  let response: TransactionResponse
  try {
    response = await cardcomPost<TransactionResponse>(
      'Transactions/Transaction',
      { ...body, ExternalUniqUniqTranIdResponse: true },
      { retry: false, timeoutMs: CHARGE_TIMEOUT_MS },
    )
  } catch (err) {
    console.error('[cardcom] charge outcome unknown', body.ExternalUniqTranId, err instanceof Error ? err.message : String(err))
    return { outcome: 'unknown', response: null }
  }
  const code = response.ResponseCode
  if (typeof code !== 'number' || code === DUPLICATE_ID) {
    console.error('[cardcom] charge outcome unknown', body.ExternalUniqTranId, code, response.Description)
    return { outcome: 'unknown', response }
  }
  return { outcome: code === 0 ? 'paid' : 'declined', response }
}
