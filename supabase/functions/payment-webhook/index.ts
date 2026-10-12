// POST from CardCom after a checkout page is paid (or fails):
// { ResponseCode, Description, TerminalNumber, LowProfileId, Operation }.
//
// Unauthenticated (verify_jwt = false): the body is only used to find the
// payment, and its result is read from CardCom with GetLpResult. Returns 200
// once the payment is finished or can't be ours, so CardCom stops sending it;
// 500 when CardCom couldn't be asked, so it sends it again later.
// See docs/cardcom-integration.md, Task 3.

import { cardcomPost } from '../_shared/cardcom.ts'
import { admin, rpc } from '../_shared/db.ts'
import { str } from '../_shared/http.ts'

type LpResult = {
  ResponseCode?: number | null
  Description?: string | null
  TranzactionId?: number | null
  Operation?: string | null
  DocumentInfo?: { DocumentType?: string | null; DocumentNumber?: number | null } | null
  TokenInfo?: {
    Token?: string | null
    TokenExDate?: string | null
    CardYear?: number | null
    CardMonth?: number | null
    TokenApprovalNumber?: string | null
    CardOwnerIdentityNumber?: string | null
  } | null
}

type CheckoutResult = { result: 'paid' | 'duplicate' | 'already_done'; subscription_id: string | null }

const plain = (text: string, status = 200) => new Response(text, { status })

/**
 * A string or number field as trimmed text, or null. CardCom pads some
 * strings with spaces ("040617649 ") and may send digit-only values as numbers.
 */
function text(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null
  return String(value).trim() || null
}

/** CardCom's 'yyyyMMdd' as 'yyyy-MM-dd', or null. */
function isoDate(value: unknown): string | null {
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(text(value) ?? '')
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return plain('Method not allowed', 405)

  let lowProfileId: string
  try {
    lowProfileId = str(((await req.json()) as Record<string, unknown>)?.LowProfileId)
  } catch {
    return plain('Bad request', 400)
  }
  if (!lowProfileId) return plain('Bad request', 400)

  try {
    const { data: payment, error } = await admin
      .from('payments')
      .select('id, status')
      .eq('cardcom_low_profile_id', lowProfileId)
      .maybeSingle()
    if (error) throw new Error(`payments: ${error.code} ${error.message}`)
    if (!payment) {
      console.error('[cardcom] webhook for unknown LowProfileId', lowProfileId)
      return plain('OK')
    }
    if (payment.status !== 'pending') return plain('OK')

    let lp: LpResult
    try {
      lp = await cardcomPost<LpResult>('LowProfile/GetLpResult', { LowProfileId: lowProfileId })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('[cardcom]', message)
      return plain(message, 500)
    }

    const code = typeof lp.ResponseCode === 'number' ? lp.ResponseCode : null
    const saved = await admin
      .from('payments')
      .update({
        cardcom_response_code: code,
        cardcom_description: lp.Description ?? null,
        cardcom_document_type: lp.DocumentInfo?.DocumentType ?? null,
        cardcom_document_number: lp.DocumentInfo?.DocumentNumber ?? null,
        // Keep the operation create-checkout saved when CardCom doesn't repeat it.
        ...(lp.Operation ? { cardcom_operation: lp.Operation } : {}),
      })
      .eq('id', payment.id)
      .eq('status', 'pending')
    if (saved.error) throw new Error(`payments: ${saved.error.code} ${saved.error.message}`)

    if (code !== 0) {
      console.error('[cardcom] checkout failed', payment.id, code, lp.Description)
      const failed = await admin.from('payments').update({ status: 'failed' }).eq('id', payment.id).eq('status', 'pending')
      if (failed.error) throw new Error(`payments: ${failed.error.code} ${failed.error.message}`)
      return plain('OK')
    }

    const token = lp.TokenInfo ?? {}
    // Paid, but there will be nothing to charge at renewal.
    if (!text(token.Token)) console.error('[cardcom] paid checkout without a token', payment.id)

    // The ID number is sent back on every renewal. The renewal's
    // CardExpirationMMYY is built from CardMonth / CardYear, not TokenExDate
    // (a card expiring 10/2027 has TokenExDate 20271101).
    const done = await rpc<CheckoutResult>('complete_checkout', {
      p_payment_id: payment.id,
      p_tranzaction_id: lp.TranzactionId ?? null,
      p_token: text(token.Token),
      p_token_expires_on: isoDate(token.TokenExDate),
      p_card_year: token.CardYear ?? null,
      p_card_month: token.CardMonth ?? null,
      p_approval_number: text(token.TokenApprovalNumber),
      p_owner_identity_number: text(token.CardOwnerIdentityNumber),
    })
    if (done.result === 'duplicate') console.error('[cardcom] duplicate subscription payment', payment.id)
    return plain('OK')
  } catch (err) {
    console.error(err)
    return plain('Server error', 500)
  }
})
