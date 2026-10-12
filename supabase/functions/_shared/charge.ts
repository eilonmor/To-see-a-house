// Charging a subscription's saved card (renewals and upgrades): who the
// charge and the document are for, and the Transactions/Transaction body.
// See docs/cardcom-integration.md, Tasks 5 and 6.

import type { cardcomCharge, TransactionResponse } from './cardcom.ts'
import { admin, must } from './db.ts'

export type ChargeBody = Parameters<typeof cardcomCharge>[0]

/** The subscription columns tokenChargeBody needs (service role only: never granted to the browser). */
export const CARD_COLUMNS =
  'cardcom_token, cardcom_token_card_month, cardcom_token_card_year, cardcom_token_card_owner_identity_number'

export type SavedCard = {
  cardcom_token: string | null
  cardcom_token_card_month: number | null
  cardcom_token_card_year: number | null
  cardcom_token_card_owner_identity_number: string | null
}

export type Payer = { fullName: string; email: string; documentName: string }

async function emailOf(userId: string): Promise<string> {
  const { data, error } = await admin.auth.admin.getUserById(userId)
  if (error) throw new Error(`auth user ${userId}: ${error.message}`)
  return data.user?.email ?? ''
}

/**
 * Who the charge and the document are for. A user pays for themselves; an
 * agency's card owner and email are its (oldest) agency admin's, and the
 * document is in the agency's name, as at checkout.
 */
export async function payerOf(sub: { user_id: string | null; org_id: string | null }): Promise<Payer> {
  if (sub.user_id) {
    const profile = must(await admin.from('profiles').select('full_name').eq('id', sub.user_id).single(), 'profiles')
    const fullName = profile.full_name.trim()
    return { fullName, email: await emailOf(sub.user_id), documentName: fullName }
  }
  const [orgRes, adminRes] = await Promise.all([
    admin.from('organizations').select('name').eq('id', sub.org_id!).single(),
    admin
      .from('profiles')
      .select('id, full_name')
      .eq('org_id', sub.org_id!)
      .eq('role', 'agency_admin')
      .order('created_at')
      .limit(1)
      .maybeSingle(),
  ])
  const org = must(orgRes, 'organizations')
  const orgAdmin = must(adminRes, 'agency admin')
  const fullName = orgAdmin.full_name.trim()
  return { fullName, email: await emailOf(orgAdmin.id), documentName: org.name.trim() || fullName }
}

/** Month zero-padded + the last 2 digits of the year (CardYear may be 28 or 2028), or null. */
function expirationMMYY(month: number | null, year: number | null): string | null {
  if (!Number.isInteger(month) || !Number.isInteger(year) || month! < 1 || month! > 12) return null
  return String(month).padStart(2, '0') + String(year! % 100).padStart(2, '0')
}

/** CardCom's answer to a charge, as the payments columns that keep it. */
export const responseFields = (response: TransactionResponse) => ({
  cardcom_response_code: typeof response.ResponseCode === 'number' ? response.ResponseCode : null,
  cardcom_description: response.Description ?? null,
  cardcom_document_type: response.DocumentType ?? null,
  cardcom_document_number: response.DocumentNumber ?? null,
})

/**
 * The body for cardcomCharge: `amount` on the saved card, with a receipt
 * for `product` emailed to the payer. Null if there is no saved token or
 * expiration date. ExternalUniqTranId is the payment id, so sending the same
 * payment again never charges twice.
 */
export function tokenChargeBody({
  paymentId,
  amount,
  card,
  payer,
  product,
  lang,
}: {
  paymentId: string
  amount: number
  card: SavedCard
  payer: Payer
  product: string
  lang: 'he' | 'en'
}): ChargeBody | null {
  const token = card.cardcom_token?.trim()
  // Never TokenExDate: a card expiring 10/2027 has 20271101.
  const mmyy = expirationMMYY(card.cardcom_token_card_month, card.cardcom_token_card_year)
  if (!token || !mmyy) return null

  const total = Math.round(amount * 100) / 100
  const documentName = payer.documentName || payer.email
  return {
    Amount: total,
    Token: token,
    CardExpirationMMYY: mmyy,
    ExternalUniqTranId: paymentId,
    NumOfPayments: 1,
    ISOCoinId: 1,
    CardOwnerInformation: {
      FullName: payer.fullName || documentName,
      IdentityNumber: card.cardcom_token_card_owner_identity_number?.trim() || undefined,
      CardOwnerEmail: payer.email,
    },
    // No IsAllowEditDocument: it only applies to CardCom's payment page.
    Document: {
      DocumentTypeToCreate: 'Auto',
      Name: documentName,
      Email: payer.email,
      IsSendByEmail: true,
      Language: lang,
      Products: [{ Description: product, UnitCost: total, Quantity: 1 }],
    },
  }
}
