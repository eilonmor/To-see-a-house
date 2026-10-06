// POST { phone, lang? } → {}. Sends a 6-digit code by SMS to an Israeli mobile
// number. Limits (per phone, per IP and in total) are checked in public.issue_otp().

import { rpc, admin } from '../_shared/db.ts'
import { ApiError, clientIp, handler, str } from '../_shared/http.ts'
import { isMobileKey, phoneKey } from '../_shared/phone.ts'
import { sendSms } from '../_shared/sms.ts'
import { otpHash } from '../_shared/token.ts'

const MESSAGES = {
  he: (code: string) => `קוד האימות שלך לתיאום הצפייה: ${code}`,
  en: (code: string) => `Your viewing booking code: ${code}`,
}

Deno.serve(
  handler(async (body, req) => {
    const key = phoneKey(str(body.phone))
    if (!isMobileKey(key)) throw new ApiError('invalid_mobile')

    const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, '0')
    const id = await rpc<string>('issue_otp', {
      p_phone_key: key,
      p_code_hash: await otpHash(key, code),
      p_ip: clientIp(req),
    })

    const message = body.lang === 'en' ? MESSAGES.en : MESSAGES.he
    try {
      await sendSms(key, message(code))
    } catch (err) {
      console.error(err)
      // An unsent code shouldn't count toward the guest's limits.
      await admin.from('otp_requests').delete().eq('id', id)
      throw new ApiError('sms_failed', 502)
    }
    return {}
  }),
)
