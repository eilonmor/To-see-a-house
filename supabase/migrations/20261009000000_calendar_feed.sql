-- Phase 7 (calendar sync, part 1): a private ICS subscription link per user.
-- Calendar apps (Google, Apple, Outlook) fetch the link from the calendar-feed
-- edge function, which has no login: the secret token in the link is the only
-- credential. Apply after 20261008000000_agencies.sql. Safe to run again.

-- In its own table, not in profiles: agency members can read each other's
-- profiles, and must not see each other's links.
create table if not exists public.calendar_feeds (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  -- 64 hex characters (two random uuids, 244 random bits).
  token text not null unique,
  created_at timestamptz not null default now()
);

alter table public.calendar_feeds enable row level security;

drop policy if exists "users read their feed" on public.calendar_feeds;
create policy "users read their feed" on public.calendar_feeds
  for select to authenticated using (user_id = auth.uid());
drop policy if exists "users turn off their feed" on public.calendar_feeds;
create policy "users turn off their feed" on public.calendar_feeds
  for delete to authenticated using (user_id = auth.uid());
-- Tokens come only from create_calendar_feed(), never from the browser.
revoke insert, update on public.calendar_feeds from anon, authenticated;

-- Creates the caller's link, or replaces it: the old link stops working.
-- Returns the new token.
create or replace function public.create_calendar_feed() returns text
language plpgsql security definer set search_path = ''
as $$
declare
  new_token text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  insert into public.calendar_feeds (user_id, token) values (auth.uid(), new_token)
  on conflict (user_id) do update set token = excluded.token, created_at = now();
  return new_token;
end
$$;

-- What the feed shows: every open-house day, from 90 days back on, of the
-- properties the link's owner manages, with its bookings. "Manages" is the
-- rule in can_manage_property(), applied to the link's owner rather than
-- auth.uid(): a change to one must be made to the other. Times are returned
-- as instants (dates and times are stored in Israel time).
-- Null when no link has this token. Only the edge function calls this.
create or replace function public.calendar_feed_events(p_token text) returns jsonb
language sql stable security definer set search_path = ''
as $$
  with feed as (
    select pr.id as user_id, pr.role, pr.org_id
    from public.calendar_feeds f
    join public.profiles pr on pr.id = f.user_id
    where f.token = p_token
  )
  select case when exists (select 1 from feed) then coalesce((
    select jsonb_agg(jsonb_build_object(
      'day_id', d.id,
      'property_id', p.id,
      'title', p.title,
      'address', p.address,
      'start', (d.date + d.start_time) at time zone 'Asia/Jerusalem',
      'end', (d.date + d.end_time) at time zone 'Asia/Jerusalem',
      'bookings', coalesce((
        select jsonb_agg(jsonb_build_object('slot', b.slot, 'name', b.guest_name, 'phone', b.guest_phone_key) order by b.slot)
        from public.bookings b where b.visit_day_id = d.id
      ), '[]'::jsonb)
    ) order by d.date, d.start_time)
    from feed
    join public.properties p
      on p.owner_user_id = feed.user_id
      or (feed.role = 'agency_admin' and p.owner_org_id = feed.org_id)
      or exists (select 1 from public.property_agents pa where pa.property_id = p.id and pa.agent_id = feed.user_id)
    join public.visit_days d on d.property_id = p.id
    where d.date >= public.israel_today() - 90
  ), '[]'::jsonb) end
$$;

revoke execute on function public.create_calendar_feed() from public, anon;
grant execute on function public.create_calendar_feed() to authenticated;
revoke execute on function public.calendar_feed_events(text) from public, anon, authenticated;
-- The calendar-feed edge function calls it as service_role.
grant execute on function public.calendar_feed_events(text) to service_role;
