// POST { token, action, ... } → what the database function returns.
// Every action runs on the phone number inside the token, never on a number
// the browser sends, so a guest only reaches their own bookings.
//
//   find        { slug }                          → upcoming bookings for the property
//   book        { dayId, slot, name }             → { slot, instructions }
//   reschedule  { fromDayId, dayId, slot, name }  → { slot, instructions }
//   cancel      { dayId }                         → {}

import { rpc } from '../_shared/db.ts'
import { ApiError, handler, str } from '../_shared/http.ts'
import { verifyToken } from '../_shared/token.ts'

Deno.serve(
  handler(async (body) => {
    const phone = await verifyToken(str(body.token))
    switch (body.action) {
      case 'find':
        return rpc('find_guest_bookings', { p_slug: str(body.slug), p_phone: phone })
      case 'book':
        return rpc('book_guest_slot', {
          p_day_id: str(body.dayId),
          p_slot: str(body.slot),
          p_name: str(body.name),
          p_phone: phone,
        })
      case 'reschedule':
        return rpc('reschedule_guest_booking', {
          p_from_day_id: str(body.fromDayId),
          p_to_day_id: str(body.dayId),
          p_slot: str(body.slot),
          p_name: str(body.name),
          p_phone: phone,
        })
      case 'cancel':
        await rpc('cancel_guest_booking', { p_day_id: str(body.dayId), p_phone: phone })
        return {}
      default:
        throw new ApiError('bad_request')
    }
  }),
)
