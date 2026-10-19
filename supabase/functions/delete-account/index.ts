// POST { confirm: 'delete' } with the user's session: deletes the user's
// account. Running subscriptions (the user's own, and an agency admin's
// agency's) first stop renewing through set_subscription_renewal, as the
// billing page's "cancel renewal" does: no further charge, and charges
// already taken are not refunded. An agency admin's agency is deleted too.
// See supabase/migrations/20261020000000_delete_account.sql.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { admin, must, rpc, sessionUser } from '../_shared/db.ts'
import { ApiError, SNAKE_CODE, handler } from '../_shared/http.ts'

Deno.serve(
  handler(async (body, req) => {
    const user = await sessionUser(req)
    if (body.confirm !== 'delete') throw new ApiError('bad_request')

    const profile = must(
      await admin.from('profiles').select('role, org_id').eq('id', user.id).maybeSingle(),
      'profile',
    )
    const agencyId = profile.role === 'agency_admin' ? profile.org_id : null

    const subs = must(
      await admin
        .from('subscriptions')
        .select('id, cancel_at_period_end')
        .or(agencyId ? `user_id.eq.${user.id},org_id.eq.${agencyId}` : `user_id.eq.${user.id}`)
        .in('status', ['active', 'past_due']),
      'subscriptions',
    )

    // set_subscription_renewal checks the caller with auth.uid(): call it as the user.
    const asUser = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    })
    for (const sub of subs.filter((s) => !s.cancel_at_period_end)) {
      // Raises upgrade_in_progress or renewal_in_progress while a charge is in flight.
      const { error } = await asUser.rpc('set_subscription_renewal', { p_subscription_id: sub.id, p_renew: false })
      if (error) {
        if (SNAKE_CODE.test(error.message)) throw new ApiError(error.message)
        throw new Error(`set_subscription_renewal: ${error.code} ${error.message}`)
      }
    }

    // Deletes the agency (for an admin). Raises payment_in_progress.
    await rpc('delete_account_data', { p_user_id: user.id })

    const deleted = await admin.auth.admin.deleteUser(user.id)
    if (deleted.error) throw new Error(`deleteUser: ${deleted.error.message}`)
    return { deleted: true }
  }),
)
