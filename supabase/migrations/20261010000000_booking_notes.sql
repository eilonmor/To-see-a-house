-- Private notes on each booking (age, profession, did they like the place,
-- what they asked…). Written by whoever manages the property; never shown to
-- the guest: the guest functions return named fields only, and this isn't one.
-- Apply after 20261009000000_calendar_feed.sql. Safe to run again.

alter table public.bookings
  add column if not exists host_note text not null default ''
    constraint bookings_host_note_length check (char_length(host_note) <= 2000);

-- Managers may change the note and nothing else on a booking.
drop policy if exists "managers write notes" on public.bookings;
create policy "managers write notes" on public.bookings
  for update to authenticated
  using (public.can_manage_visit_day(visit_day_id)) with check (public.can_manage_visit_day(visit_day_id));
revoke update on public.bookings from authenticated;
grant update (host_note) on public.bookings to authenticated;

-- As before, but the note moves with the booking to the new day (a move
-- within the same day keeps the row, and so the note, already). It doesn't
-- overwrite a note the guest's booking on the new day already has.
create or replace function public.reschedule_guest_booking(
  p_from_day_id uuid, p_to_day_id uuid, p_slot time, p_name text, p_phone text
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  note text := '';
  result jsonb;
begin
  if p_from_day_id <> p_to_day_id then
    delete from public.bookings
    where visit_day_id = p_from_day_id and guest_phone_key = public.phone_key(p_phone)
    returning host_note into note;
    if not found then
      raise exception 'booking_not_found';
    end if;
  end if;
  result := public.book_guest_slot(p_to_day_id, p_slot, p_name, p_phone);
  if note <> '' then
    update public.bookings set host_note = note
    where visit_day_id = p_to_day_id and guest_phone_key = public.phone_key(p_phone) and host_note = '';
  end if;
  return result;
end
$$;
