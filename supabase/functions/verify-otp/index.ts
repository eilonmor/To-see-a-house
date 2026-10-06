// POST { phone, code } → { token, expires_at }. Checks the SMS code and returns
// a token for that phone, valid for 30 days (see _shared/token.ts).

import { rpc } from '../_shared/db.ts'
import { ApiError, handler, str } from '../_shared/http.ts'
import { isMobileKey, phoneKey } from '../_shared/phone.ts'
import { issueToken, otpHash } from '../_shared/token.ts'

Deno.serve(
  handler(async (body) => {
    const key = phoneKey(str(body.phone))
    const code = str(body.code).replace(/\D/g, '')
    if (!isMobileKey(key)) throw new ApiError('invalid_mobile')
    if (code.length !== 6) throw new ApiError('otp_wrong_code')

    const result = await rpc<string>('check_otp', { p_phone_key: key, p_code_hash: await otpHash(key, code) })
    if (result !== 'ok') throw new ApiError(result)
    return issueToken(key)
  }),
)
