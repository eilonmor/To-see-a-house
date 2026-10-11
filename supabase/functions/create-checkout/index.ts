// POST { plan, lang } with the user's session → { url } of CardCom's payment
// page for that plan. The price and the payer come from the database, never
// from the browser. The payment is marked paid only by payment-webhook.
// See docs/cardcom-integration.md, Task 4.
//
// Needs the secrets APP_URL (where CardCom sends the browser back) and the
// CardCom ones (see _shared/cardcom.ts).

import { cardcomPost } from '../_shared/cardcom.ts'
import { admin, rpc } from '../_shared/db.ts'
import { ApiError, handler, str } from '../_shared/http.ts'

type CreateResult = { ResponseCode?: number | null; Description?: string | null; LowProfileId?: string | null; Url?: string | null }

const OPERATION = 'ChargeAndCreateToken'

function must<T>(res: { data: T | null; error: { code?: string; message: string } | null }, what: string): T {
  if (res.error || res.data === null) throw new Error(`${what}: ${res.error?.code ?? ''} ${res.error?.message ?? 'not found'}`)
  return res.data
}

Deno.serve(
  handler(async (body, req) => {
    const jwt = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? ''
    const { data: auth } = jwt ? await admin.auth.getUser(jwt) : { data: { user: null } }
    const user = auth.user
    if (!user) throw new ApiError('not_authenticated', 401)

    const plan = str(body.plan)
    const lang = str(body.lang)
    if (!plan || (lang !== 'he' && lang !== 'en')) throw new ApiError('bad_request')

    const appUrl = Deno.env.get('APP_URL')?.replace(/\/+$/, '')
    const supabaseUrl = Deno.env.get('SUPABASE_URL')?.replace(/\/+$/, '')
    if (!appUrl || !supabaseUrl) throw new Error('APP_URL and SUPABASE_URL must be set')

    const [payer] = await rpc<{ payer_user_id: string | null; payer_org_id: string | null }[]>('checkout_payer', {
      p_user_id: user.id,
      p_plan: plan,
    })
    if (!payer) throw new Error('checkout_payer returned no row')

    const [planRes, profileRes, orgRes] = await Promise.all([
      admin.from('plans').select('price, name_he, name_en').eq('code', plan).single(),
      admin.from('profiles').select('full_name, phone').eq('id', user.id).single(),
      payer.payer_org_id
        ? admin.from('organizations').select('name').eq('id', payer.payer_org_id).single()
        : Promise.resolve({ data: null, error: null }),
    ])
    const planRow = must(planRes, 'plans')
    const profile = must(profileRes, 'profiles')
    if (orgRes.error) throw new Error(`organizations: ${orgRes.error.code} ${orgRes.error.message}`)

    const amount = Math.round(Number(planRow.price) * 100) / 100
    const email = user.email ?? ''
    const fullName = profile.full_name.trim()
    const phone = profile.phone.trim()
    const documentName = (orgRes.data?.name.trim() || fullName) || email

    const payment = must(
      await admin
        .from('payments')
        .insert({
          user_id: payer.payer_user_id,
          org_id: payer.payer_org_id,
          bought_by: user.id,
          plan_code: plan,
          amount,
          kind: 'checkout',
          status: 'pending',
        })
        .select('id')
        .single(),
      'payments',
    )

    let res: CreateResult | null = null
    try {
      res = await cardcomPost<CreateResult>('LowProfile/Create', {
        Operation: OPERATION,
        ReturnValue: payment.id,
        Amount: amount,
        SuccessRedirectUrl: `${appUrl}/dashboard/billing?result=success`,
        FailedRedirectUrl: `${appUrl}/dashboard/billing?result=failed`,
        CancelRedirectUrl: `${appUrl}/dashboard/billing`,
        WebHookUrl: `${supabaseUrl}/functions/v1/payment-webhook`,
        Language: lang,
        ISOCoinId: 1,
        UIDefinition: {
          CardOwnerNameValue: fullName,
          CardOwnerPhoneValue: phone,
          CardOwnerEmailValue: email,
        },
        Document: {
          DocumentTypeToCreate: 'Auto',
          IsAllowEditDocument: true,
          Name: documentName,
          Email: email,
          Mobile: phone,
          Language: lang,
          Products: [{ Description: lang === 'he' ? planRow.name_he : planRow.name_en, UnitCost: amount, Quantity: 1 }],
        },
      })
    } catch (err) {
      console.error('[cardcom] create failed', err instanceof Error ? err.message : String(err))
    }

    if (res?.ResponseCode !== 0 || !res.LowProfileId || !res.Url) {
      if (res) console.error('[cardcom] create failed', res.ResponseCode, res.Description)
      const failed = await admin
        .from('payments')
        .update({
          status: 'failed',
          cardcom_operation: OPERATION,
          cardcom_response_code: typeof res?.ResponseCode === 'number' ? res.ResponseCode : null,
          cardcom_description: res?.Description ?? null,
        })
        .eq('id', payment.id)
      if (failed.error) console.error('[cardcom] could not mark payment failed', payment.id, failed.error.message)
      throw new ApiError('checkout_unavailable', 502)
    }

    // Saved before the user can pay: the webhook finds the payment by it.
    const saved = await admin
      .from('payments')
      .update({ cardcom_low_profile_id: res.LowProfileId, cardcom_operation: OPERATION })
      .eq('id', payment.id)
    if (saved.error) throw new Error(`payments: ${saved.error.code} ${saved.error.message}`)

    return { url: res.Url }
  }),
)
