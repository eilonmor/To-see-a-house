-- Initial schema for the multi-user booking app (see PLAN.md).
-- Apply with the Supabase CLI (`supabase db push`) or paste into the SQL editor.

-- ===========================================================================
-- Types
-- ===========================================================================

create type public.user_role as enum ('personal', 'agent', 'agency_admin');
create type public.subscription_status as enum ('none', 'active', 'past_due', 'canceled');

-- ===========================================================================
-- Tables
-- ===========================================================================

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  subscription_status public.subscription_status not null default 'none',
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.user_role not null default 'personal',
  full_name text not null default '',
  phone text not null default '',
  org_id uuid references public.organizations (id) on delete set null,
  subscription_status public.subscription_status not null default 'none',
  -- Personal plan: when the user last created a property (1 per 30 days).
  last_property_created_at timestamptz,
  created_at timestamptz not null default now(),
  check (role <> 'personal' or org_id is null)
);
create index on public.profiles (org_id);

-- A property is owned by whoever pays for it: a user (personal / agent) or an agency.
create table public.properties (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid references public.profiles (id) on delete cascade,
  owner_org_id uuid references public.organizations (id) on delete cascade,
  title text not null check (length(trim(title)) > 0),
  address text not null default '',
  -- Shown to the guest after booking.
  instructions text not null default '',
  -- Used in the public booking link: /p/<public_slug>
  public_slug text not null unique default substr(replace(gen_random_uuid()::text, '-', ''), 1, 10),
  created_at timestamptz not null default now(),
  check ((owner_user_id is null) <> (owner_org_id is null))
);
create index on public.properties (owner_user_id);
create index on public.properties (owner_org_id);

-- Agents an agency made responsible for one of its properties (many per property).
create table public.property_agents (
  property_id uuid not null references public.properties (id) on delete cascade,
  agent_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (property_id, agent_id)
);
create index on public.property_agents (agent_id);

-- An open-house date. Slots run from start_time (inclusive) to end_time
-- (exclusive) every slot_minutes. A day is "archived" once its date has passed.
create table public.visit_days (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties (id) on delete cascade,
  date date not null,
  start_time time not null,
  end_time time not null,
  slot_minutes int not null check (slot_minutes between 5 and 240),
  created_at timestamptz not null default now(),
  check (end_time > start_time)
);
create index on public.visit_days (property_id, date);

-- Guests never get an account: their identity is the normalized phone number.
create table public.guests (
  phone_key text primary key check (phone_key ~ '^0[0-9]{8,9}$'),
  name text not null default '',
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  visit_day_id uuid not null references public.visit_days (id) on delete cascade,
  slot time not null,
  guest_phone_key text not null references public.guests (phone_key),
  guest_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  unique (visit_day_id, slot),
  unique (visit_day_id, guest_phone_key)
);

-- One-time invite: shared as a link (/join/<code>) or typed in as a code.
create table public.agency_invites (
  code text primary key,
  org_id uuid not null references public.organizations (id) on delete cascade,
  created_by uuid not null references public.profiles (id) on delete cascade,
  expires_at timestamptz not null default now() + interval '7 days',
  used_by uuid references public.profiles (id) on delete set null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.agency_invites (org_id);

-- Guest OTP codes (phase 3). Only edge functions (service role) touch this.
create table public.otp_requests (
  id uuid primary key default gen_random_uuid(),
  phone_key text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts int not null default 0,
  ip inet,
  created_at timestamptz not null default now()
);
create index on public.otp_requests (phone_key, created_at);

-- ===========================================================================
-- Helpers
-- ===========================================================================

create function public.israel_today() returns date
language sql stable set search_path = ''
as $$ select (now() at time zone 'Asia/Jerusalem')::date $$;

-- Same rule as phoneKey() in the frontend: digits only, +972 treated as a leading 0.
create function public.phone_key(phone text) returns text
language sql immutable set search_path = ''
as $$
  select case when d like '972%' then '0' || substr(d, 4) else d end
  from (select regexp_replace(coalesce(phone, ''), '\D', '', 'g') as d) s
$$;

create function public.my_org_id() returns uuid
language sql stable security definer set search_path = ''
as $$ select org_id from public.profiles where id = auth.uid() $$;

create function public.is_org_admin(org uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'agency_admin' and org_id = org
  )
$$;

create function public.is_assigned_agent(pid uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.property_agents
    where property_id = pid and agent_id = auth.uid()
  )
$$;

-- Owner, the owning agency's admin, or an assigned agent.
create function public.can_manage_property(pid uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.properties p
    where p.id = pid
      and (p.owner_user_id = auth.uid()
           or public.is_org_admin(p.owner_org_id)
           or public.is_assigned_agent(p.id))
  )
$$;

create function public.can_manage_visit_day(day_id uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.can_manage_property(property_id) from public.visit_days where id = day_id
$$;

-- The current user is admin of the agency that owns the property, and the
-- agent belongs to that agency.
create function public.can_assign_agent(pid uuid, agent uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.properties p
    join public.profiles a on a.id = agent and a.org_id = p.owner_org_id
    where p.id = pid and public.is_org_admin(p.owner_org_id)
  )
$$;

-- ===========================================================================
-- Sign-up: every auth user gets a profile. Users choose 'personal' or 'agent';
-- 'agency_admin' only comes from create_agency().
-- ===========================================================================

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, role, full_name, phone)
  values (
    new.id,
    case when new.raw_user_meta_data ->> 'role' = 'agent'
      then 'agent'::public.user_role else 'personal'::public.user_role end,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.raw_user_meta_data ->> 'phone', new.phone, '')
  );
  return new;
end
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ===========================================================================
-- Personal (free) plan limits
--   * 1 property in total, and a new one at most once every 30 days.
--   * Per property, 2 visit days in total (upcoming + archived): adding a day
--     when 2 exist deletes the oldest archived one; 2 upcoming days is the max.
-- ===========================================================================

create function public.enforce_personal_property_limit() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  prof public.profiles;
begin
  if new.owner_user_id is null then
    return new;
  end if;

  -- Lock the profile so two concurrent inserts can't both pass the checks.
  select * into prof from public.profiles where id = new.owner_user_id for update;
  if prof.role <> 'personal' then
    return new;
  end if;

  if exists (select 1 from public.properties where owner_user_id = prof.id) then
    raise exception 'personal_property_limit'
      using hint = 'The free plan allows one property. Delete the current one first.';
  end if;
  if prof.last_property_created_at > now() - interval '30 days' then
    raise exception 'personal_property_cooldown'
      using hint = 'The free plan allows one new property every 30 days.';
  end if;

  update public.profiles set last_property_created_at = now() where id = prof.id;
  return new;
end
$$;

create trigger enforce_personal_property_limit
  before insert on public.properties
  for each row execute function public.enforce_personal_property_limit();

create function public.enforce_visit_day_rules() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  today date := public.israel_today();
  owner_role public.user_role;
  upcoming int;
  total int;
begin
  if tg_op = 'UPDATE' then
    if new.property_id <> old.property_id then
      raise exception 'visit_day_property_immutable';
    end if;
    if new.date <> old.date and new.date < today then
      raise exception 'date_in_past';
    end if;
    return new;
  end if;

  if new.date < today then
    raise exception 'date_in_past';
  end if;

  -- Lock the property so two concurrent inserts can't both pass the checks.
  perform 1 from public.properties where id = new.property_id for update;

  select pr.role into owner_role
  from public.properties p
  join public.profiles pr on pr.id = p.owner_user_id
  where p.id = new.property_id;

  if owner_role is distinct from 'personal' then
    return new;
  end if;

  select count(*) filter (where date >= today), count(*)
  into upcoming, total
  from public.visit_days
  where property_id = new.property_id;

  if upcoming >= 2 then
    raise exception 'personal_date_limit'
      using hint = 'The free plan allows two upcoming open-house dates.';
  end if;

  if total >= 2 then
    delete from public.visit_days
    where id = (
      select id from public.visit_days
      where property_id = new.property_id and date < today
      order by date
      limit 1
    );
  end if;

  return new;
end
$$;

create trigger enforce_visit_day_rules
  before insert or update of date, property_id on public.visit_days
  for each row execute function public.enforce_visit_day_rules();

-- A booking's slot must be one of its day's slots, and the day must not have passed.
create function public.validate_booking_slot() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  d public.visit_days;
begin
  select * into d from public.visit_days where id = new.visit_day_id;
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

create trigger validate_booking_slot
  before insert or update of slot, visit_day_id on public.bookings
  for each row execute function public.validate_booking_slot();

-- ===========================================================================
-- Agencies
-- ===========================================================================

create function public.create_agency(p_name text) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  prof public.profiles;
  new_org uuid;
begin
  select * into prof from public.profiles where id = auth.uid() for update;
  if not found then
    raise exception 'not_authenticated';
  end if;
  if prof.org_id is not null then
    raise exception 'already_in_agency';
  end if;

  insert into public.organizations (name) values (trim(p_name)) returning id into new_org;
  update public.profiles set role = 'agency_admin', org_id = new_org where id = prof.id;
  return new_org;
end
$$;

-- Returns a 6-character code; the link is /join/<code>.
create function public.create_agency_invite() returns text
language plpgsql security definer set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';  -- no 0/O, 1/I
  org uuid := public.my_org_id();
  bytes bytea;
  new_code text;
begin
  if org is null or not public.is_org_admin(org) then
    raise exception 'not_agency_admin';
  end if;

  loop
    bytes := uuid_send(gen_random_uuid());
    new_code := '';
    for i in 0..5 loop
      new_code := new_code || substr(alphabet, 1 + get_byte(bytes, i) % 32, 1);
    end loop;
    exit when not exists (select 1 from public.agency_invites where code = new_code);
  end loop;

  insert into public.agency_invites (code, org_id, created_by) values (new_code, org, auth.uid());
  return new_code;
end
$$;

create function public.accept_agency_invite(p_code text) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  inv public.agency_invites;
  prof public.profiles;
begin
  select * into prof from public.profiles where id = auth.uid() for update;
  if not found then
    raise exception 'not_authenticated';
  end if;

  select * into inv from public.agency_invites where code = upper(trim(p_code)) for update;
  if not found or inv.used_at is not null or inv.expires_at < now() then
    raise exception 'invalid_invite';
  end if;
  if prof.org_id is not null then
    raise exception 'already_in_agency';
  end if;

  update public.profiles set role = 'agent', org_id = inv.org_id where id = prof.id;
  update public.agency_invites set used_by = prof.id, used_at = now() where code = inv.code;
  return inv.org_id;
end
$$;

-- Removes an agent from their agency. Properties the agency owns stay with the
-- agency; properties the agent owns stay with the agent.
create function public.detach_agent(agent uuid, org uuid) returns void
language sql security definer set search_path = ''
as $$
  delete from public.property_agents pa
  using public.properties p
  where pa.property_id = p.id and pa.agent_id = agent and p.owner_org_id = org;

  update public.profiles set org_id = null where id = agent and org_id = org;
$$;
revoke execute on function public.detach_agent(uuid, uuid) from public, anon, authenticated;

create function public.leave_agency() returns void
language plpgsql security definer set search_path = ''
as $$
declare
  prof public.profiles;
begin
  select * into prof from public.profiles where id = auth.uid();
  if prof.org_id is null then
    return;
  end if;
  if prof.role <> 'agent' then
    raise exception 'admin_cannot_leave';
  end if;
  perform public.detach_agent(prof.id, prof.org_id);
end
$$;

create function public.remove_agent(p_agent_id uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  org uuid := public.my_org_id();
begin
  if org is null or not public.is_org_admin(org) then
    raise exception 'not_agency_admin';
  end if;
  if p_agent_id = auth.uid() then
    raise exception 'admin_cannot_leave';
  end if;
  perform public.detach_agent(p_agent_id, org);
end
$$;

-- ===========================================================================
-- Public (guest) API — no login.
-- Phase 1: guests book through these functions directly.
-- Phase 3: anon access is revoked and an OTP-checking edge function calls them.
-- ===========================================================================

-- Property page: title, address and upcoming days with taken slots (no guest data).
create function public.get_public_property(p_slug text) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'id', p.id,
    'title', p.title,
    'address', p.address,
    'days', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', d.id,
        'date', d.date,
        'start_time', d.start_time,
        'end_time', d.end_time,
        'slot_minutes', d.slot_minutes,
        'taken', coalesce((
          select jsonb_agg(b.slot order by b.slot)
          from public.bookings b where b.visit_day_id = d.id
        ), '[]'::jsonb)
      ) order by d.date)
      from public.visit_days d
      where d.property_id = p.id and d.date >= public.israel_today()
    ), '[]'::jsonb)
  )
  from public.properties p
  where p.public_slug = p_slug
$$;

-- The guest's upcoming bookings for a property.
create function public.find_guest_bookings(p_slug text, p_phone text) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'day_id', d.id, 'date', d.date, 'slot', b.slot, 'name', b.guest_name
  ) order by d.date), '[]'::jsonb)
  from public.bookings b
  join public.visit_days d on d.id = b.visit_day_id
  join public.properties p on p.id = d.property_id
  where p.public_slug = p_slug
    and d.date >= public.israel_today()
    and b.guest_phone_key = public.phone_key(p_phone)
$$;

-- Books a slot, or moves the guest's existing booking on that day to it.
-- Returns the property's instructions for the confirmation screen.
create function public.book_guest_slot(p_day_id uuid, p_slot time, p_name text, p_phone text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  key text := public.phone_key(p_phone);
  guest_name text := trim(coalesce(p_name, ''));
  existing public.bookings;
  instr text;
begin
  if key !~ '^0[0-9]{8,9}$' then
    raise exception 'invalid_phone';
  end if;
  if guest_name = '' then
    raise exception 'missing_name';
  end if;

  insert into public.guests (phone_key, name) values (key, guest_name)
  on conflict (phone_key) do update set name = excluded.name;

  select * into existing
  from public.bookings
  where visit_day_id = p_day_id and guest_phone_key = key
  for update;

  begin
    if found then
      if existing.slot <> p_slot then
        update public.bookings set slot = p_slot, updated_at = now() where id = existing.id;
      end if;
    else
      insert into public.bookings (visit_day_id, slot, guest_phone_key, guest_name)
      values (p_day_id, p_slot, key, guest_name);
    end if;
  exception when unique_violation then
    raise exception 'slot_taken';
  end;

  select p.instructions into instr
  from public.visit_days d join public.properties p on p.id = d.property_id
  where d.id = p_day_id;

  return jsonb_build_object('slot', p_slot, 'instructions', coalesce(instr, ''));
end
$$;

create function public.cancel_guest_booking(p_day_id uuid, p_phone text) returns void
language sql security definer set search_path = ''
as $$
  delete from public.bookings
  where visit_day_id = p_day_id and guest_phone_key = public.phone_key(p_phone)
$$;

-- ===========================================================================
-- Row Level Security
-- ===========================================================================

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.properties enable row level security;
alter table public.property_agents enable row level security;
alter table public.visit_days enable row level security;
alter table public.guests enable row level security;
alter table public.bookings enable row level security;
alter table public.agency_invites enable row level security;
alter table public.otp_requests enable row level security;
-- guests and otp_requests have no policies: only security-definer functions
-- and edge functions (service role) can reach them.

-- organizations
create policy "members read their agency" on public.organizations
  for select to authenticated using (id = public.my_org_id());
create policy "admins rename their agency" on public.organizations
  for update to authenticated using (public.is_org_admin(id)) with check (public.is_org_admin(id));
revoke update on public.organizations from authenticated;
grant update (name) on public.organizations to authenticated;

-- profiles: users edit only their name and phone; role, agency and plan
-- change only through the functions above (and payment webhooks).
create policy "read self and agency members" on public.profiles
  for select to authenticated
  using (id = auth.uid() or (org_id is not null and org_id = public.my_org_id()));
create policy "edit own profile" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
revoke update on public.profiles from authenticated;
grant update (full_name, phone) on public.profiles to authenticated;

-- properties
create policy "managers read properties" on public.properties
  for select to authenticated
  -- Checks the row's own columns first so INSERT ... RETURNING sees the new row.
  using (owner_user_id = auth.uid()
         or public.is_org_admin(owner_org_id)
         or public.is_assigned_agent(id));
create policy "create own or agency property" on public.properties
  for insert to authenticated
  with check ((owner_user_id = auth.uid() and owner_org_id is null)
              or (owner_user_id is null and public.is_org_admin(owner_org_id)));
create policy "managers edit properties" on public.properties
  for update to authenticated
  using (public.can_manage_property(id)) with check (public.can_manage_property(id));
create policy "owners delete properties" on public.properties
  for delete to authenticated
  using (owner_user_id = auth.uid() or public.is_org_admin(owner_org_id));
revoke insert, update on public.properties from authenticated;
grant insert (owner_user_id, owner_org_id, title, address, instructions) on public.properties to authenticated;
grant update (title, address, instructions) on public.properties to authenticated;

-- property_agents
create policy "managers read assignments" on public.property_agents
  for select to authenticated using (public.can_manage_property(property_id));
create policy "agency admins assign agents" on public.property_agents
  for insert to authenticated with check (public.can_assign_agent(property_id, agent_id));
create policy "agency admins unassign agents" on public.property_agents
  for delete to authenticated using (public.can_assign_agent(property_id, agent_id));

-- visit_days
create policy "managers read days" on public.visit_days
  for select to authenticated using (public.can_manage_property(property_id));
create policy "managers add days" on public.visit_days
  for insert to authenticated with check (public.can_manage_property(property_id));
create policy "managers edit days" on public.visit_days
  for update to authenticated
  using (public.can_manage_property(property_id)) with check (public.can_manage_property(property_id));
create policy "managers delete days" on public.visit_days
  for delete to authenticated using (public.can_manage_property(property_id));
revoke update on public.visit_days from authenticated;
grant update (date, start_time, end_time, slot_minutes) on public.visit_days to authenticated;

-- bookings: managers see and release them; guests go through the functions above.
create policy "managers read bookings" on public.bookings
  for select to authenticated using (public.can_manage_visit_day(visit_day_id));
create policy "managers release bookings" on public.bookings
  for delete to authenticated using (public.can_manage_visit_day(visit_day_id));

-- agency_invites
create policy "admins read invites" on public.agency_invites
  for select to authenticated using (public.is_org_admin(org_id));
create policy "admins revoke invites" on public.agency_invites
  for delete to authenticated using (public.is_org_admin(org_id));

-- ===========================================================================
-- Function access
-- ===========================================================================

revoke execute on function
  public.create_agency(text),
  public.create_agency_invite(),
  public.accept_agency_invite(text),
  public.leave_agency(),
  public.remove_agent(uuid)
from public, anon;

grant execute on function
  public.create_agency(text),
  public.create_agency_invite(),
  public.accept_agency_invite(text),
  public.leave_agency(),
  public.remove_agent(uuid)
to authenticated;

grant execute on function
  public.get_public_property(text),
  public.find_guest_bookings(text, text),
  public.book_guest_slot(uuid, time, text, text),
  public.cancel_guest_booking(uuid, text)
to anon, authenticated;
