// POST { confirm: 'delete' } with the user's session: deletes the user's
// account. delete_account_data does it all in one transaction: the running
// subscriptions (the user's own, and an agency admin's agency's) stop
// renewing and end with the account, so there's no further charge; charges
// already taken are not refunded. An agency admin's agency is deleted too.
// See supabase/migrations/20261020000000_delete_account.sql.

import { rpc, sessionUser } from '../_shared/db.ts'
import { ApiError, handler } from '../_shared/http.ts'

Deno.serve(
  handler(async (body, req) => {
    const user = await sessionUser(req)
    if (body.confirm !== 'delete') throw new ApiError('bad_request')

    // Raises payment_in_progress while a payment may still be charged.
    await rpc('delete_account_data', { p_user_id: user.id })
    return { deleted: true }
  }),
)
