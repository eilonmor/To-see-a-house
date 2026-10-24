-- Explicit Data API grants for every table in public. Safe to run again.
--
-- From October 30, 2026 Supabase stops granting select/insert/update/delete on
-- new public tables to anon, authenticated and service_role by default
-- (https://github.com/orgs/supabase/discussions/45329). Existing projects keep
-- their grants, but a database rebuilt from these migrations (new project,
-- preview branch, `supabase db reset`) would not have them.
--
-- These grants match what the existing projects already have, so on them this
-- migration changes nothing. Privileges removed earlier stay removed: column
-- grants (update on organizations, profiles, visit_days and bookings; insert
-- and update on properties) and the billing table grants (plans, subscriptions,
-- payments) are in the earlier migrations, so this one doesn't depend on
-- …_payments.sql having been applied. Row-level security still decides which rows each role can reach.
--
-- New tables: grant the privileges each role needs in the migration that
-- creates the table.

grant select, insert, update, delete on
  public.agency_invites,
  public.guests,
  public.otp_requests,
  public.property_agents
to anon, authenticated;

grant select, insert, update, delete on
  public.bookings,
  public.organizations,
  public.profiles,
  public.properties,
  public.visit_days
to anon;
grant select, insert, delete on
  public.bookings,
  public.organizations,
  public.profiles,
  public.visit_days
to authenticated;
grant select, delete on public.properties to authenticated;

grant select, delete on public.calendar_feeds to anon, authenticated;

grant select, insert, update, delete on
  public.agency_invites,
  public.bookings,
  public.calendar_feeds,
  public.guests,
  public.organizations,
  public.otp_requests,
  public.profiles,
  public.properties,
  public.property_agents,
  public.visit_days
to service_role;
