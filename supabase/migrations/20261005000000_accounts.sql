-- Phase 2 (accounts): owners can now edit an open-house date after creating it.
-- Apply after 20261004000000_init.sql.

-- Changing a day's hours or slot length must not strand a booking on a slot
-- that no longer exists: the guest would hold a time the day doesn't offer.
create function public.check_day_bookings_fit() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if exists (
    select 1 from public.bookings b
    where b.visit_day_id = new.id
      and (b.slot < new.start_time
           or b.slot >= new.end_time
           or extract(epoch from b.slot - new.start_time)::int % (new.slot_minutes * 60) <> 0)
  ) then
    raise exception 'bookings_outside_hours'
      using hint = 'Some booked slots would no longer exist. Release them first.';
  end if;
  return new;
end
$$;

create trigger check_day_bookings_fit
  before update of start_time, end_time, slot_minutes on public.visit_days
  for each row execute function public.check_day_bookings_fit();

-- A booking made while the owner changes the day's hours must be checked
-- against the new hours: lock the day row, so the check waits for the change
-- to commit and then reads it.
create or replace function public.validate_booking_slot() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  d public.visit_days;
begin
  select * into d from public.visit_days where id = new.visit_day_id for share;
  if d.date < public.israel_today() then
    raise exception 'day_closed';
  end if;
  if new.slot < d.start_time
     or new.slot >= d.end_time
     or extract(epoch from new.slot - d.start_time)::int % (d.slot_minutes * 60) <> 0 then
    raise exception 'unknown_slot';
  end if;
  return new;
end
$$;

-- Google sign-up can't carry the chosen account type the way the email form
-- does (as user metadata), so every Google user starts as 'personal'. When
-- they picked "agent", the app calls this right after they return.
-- Only personal -> agent: agency members and admins change role through the
-- agency functions. (From phase 5, agents need a subscription for new properties.)
create function public.become_agent() returns void
language sql security definer set search_path = ''
as $$
  update public.profiles set role = 'agent'
  where id = auth.uid() and role = 'personal' and org_id is null
$$;

revoke execute on function public.become_agent() from public, anon;
grant execute on function public.become_agent() to authenticated;

-- Users who signed up before the on_auth_user_created trigger existed have no
-- profile, and the app can't load their account. Give them one (as 'personal').
-- Google puts the user's name in 'full_name' or 'name'.
insert into public.profiles (id, full_name, phone)
select u.id,
       coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name', ''),
       coalesce(u.raw_user_meta_data ->> 'phone', u.phone, '')
from auth.users u
on conflict (id) do nothing;
