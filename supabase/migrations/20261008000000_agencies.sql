-- Phase 4 (agencies): what the agency screens need on top of the agency
-- functions in 20261004000000_init.sql, and property ownership for agency
-- members (choose at creation, or hand an own property to the agency).
-- Apply after 20261007000000_guest_otp.sql. It doesn't depend on
-- 20261007000001_revoke_guest_anon.sql, so it can go in while that one is
-- held back (see README). Safe to run again.

-- An empty name now raises a code the app can translate, instead of the
-- organizations check constraint's generic error.
create or replace function public.create_agency(p_name text) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  prof public.profiles;
  new_org uuid;
begin
  if trim(coalesce(p_name, '')) = '' then
    raise exception 'missing_agency_name';
  end if;

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

-- The agency an invite leads to, so the join page can ask "Join <name>?"
-- before accepting. Raises invalid_invite for unknown, used or expired codes.
create or replace function public.preview_agency_invite(p_code text) returns text
language plpgsql stable security definer set search_path = ''
as $$
declare
  org_name text;
begin
  select o.name into org_name
  from public.agency_invites i
  join public.organizations o on o.id = i.org_id
  where i.code = upper(trim(p_code)) and i.used_at is null and i.expires_at > now();
  if not found then
    raise exception 'invalid_invite';
  end if;
  return org_name;
end
$$;

-- The caller's agency members, admin first. Emails live in auth.users, which
-- the browser can't read: members see each other's so the admin can tell
-- accounts apart (Google users may have no name).
create or replace function public.agency_members()
returns table (id uuid, role public.user_role, full_name text, phone text, email text)
language sql stable security definer set search_path = ''
as $$
  select p.id, p.role, p.full_name, p.phone, coalesce(u.email, '')::text
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.org_id = public.my_org_id()
  order by p.role = 'agency_admin' desc, p.full_name, u.email
$$;

-- A new property owned by the caller's agency: agency members (admin and
-- agents) choose the agency or themselves when they create a property. An
-- agent who creates one is assigned to it, or they couldn't see it.
create or replace function public.create_agency_property(p_title text, p_address text) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  prof public.profiles;
  new_id uuid;
begin
  -- Locked, so leaving or being removed meanwhile (detach_agent) waits for
  -- this, or this sees its result.
  select * into prof from public.profiles where id = auth.uid() for update;
  if prof.org_id is null then
    raise exception 'not_in_agency';
  end if;
  if trim(coalesce(p_title, '')) = '' then
    raise exception 'missing_title';
  end if;

  insert into public.properties (owner_org_id, title, address)
  values (prof.org_id, trim(p_title), trim(coalesce(p_address, '')))
  returning id into new_id;
  if prof.role = 'agent' then
    insert into public.property_agents (property_id, agent_id) values (new_id, prof.id);
  end if;
  return new_id;
end
$$;

-- Hands a property the caller owns to their agency, with its dates and
-- bookings (e.g. one they had before joining). One-way: the agency doesn't
-- hand properties back. An agent stays assigned to it, until the admin
-- unassigns them or they leave the agency.
create or replace function public.transfer_property_to_agency(p_property_id uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  prof public.profiles;
begin
  -- Locked, so leaving or being removed meanwhile (detach_agent) waits for
  -- this, or this sees its result.
  select * into prof from public.profiles where id = auth.uid() for update;
  if prof.org_id is null then
    raise exception 'not_in_agency';
  end if;

  update public.properties set owner_user_id = null, owner_org_id = prof.org_id
  where id = p_property_id and owner_user_id = prof.id;
  if not found then
    raise exception 'not_own_property';
  end if;
  if prof.role = 'agent' then
    insert into public.property_agents (property_id, agent_id) values (p_property_id, prof.id)
    on conflict do nothing;
  end if;
end
$$;

-- Locks the agent's profile before removing their assignments: a property
-- passed to the agency at the same moment (transfer_property_to_agency) then
-- either finishes first and its assignment is removed here, or sees that the
-- agent is no longer a member. Before, the assignment could outlive the
-- membership, and the admin couldn't remove it.
create or replace function public.detach_agent(agent uuid, org uuid) returns void
language sql security definer set search_path = ''
as $$
  select 1 from public.profiles where id = agent for update;

  delete from public.property_agents pa
  using public.properties p
  where pa.property_id = p.id and pa.agent_id = agent and p.owner_org_id = org;

  update public.profiles set org_id = null where id = agent and org_id = org;
$$;
revoke execute on function public.detach_agent(uuid, uuid) from public, anon, authenticated;

revoke execute on function
  public.preview_agency_invite(text),
  public.agency_members(),
  public.create_agency_property(text, text),
  public.transfer_property_to_agency(uuid)
from public, anon;

grant execute on function
  public.create_agency(text),
  public.preview_agency_invite(text),
  public.agency_members(),
  public.create_agency_property(text, text),
  public.transfer_property_to_agency(uuid)
to authenticated;
