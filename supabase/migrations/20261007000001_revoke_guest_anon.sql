-- Phase 3: the browser can no longer call the guest booking functions with
-- any phone number it likes. Only the guest-bookings edge function can, with
-- the phone number from a token that verify-otp signed after an SMS code.
--
-- Apply only after the edge functions are deployed and the new frontend is
-- live: the old frontend calls these functions directly and stops working.
-- Safe to run again.

revoke execute on function
  public.find_guest_bookings(text, text),
  public.book_guest_slot(uuid, time, text, text),
  public.cancel_guest_booking(uuid, text),
  public.reschedule_guest_booking(uuid, uuid, time, text, text)
from public, anon, authenticated;
