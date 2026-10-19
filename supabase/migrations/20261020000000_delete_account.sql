-- Account deletion: the delete-account edge function stops the renewals
-- (set_subscription_renewal), then calls delete_account_data and deletes the
-- auth user. Apply after 20261019000000_agency_checkout.sql. Safe to run again.
--
-- Deleting the auth user cascades to the profile, its properties (visit days,
-- bookings), subscriptions, payments and calendar feed. An agency admin's
-- agency is deleted here first, with its properties, invites, subscription
-- and payments; its agents stay as agents with no agency (profiles.org_id is
-- set null). Charges already taken are not refunded.

-- Raises:
--   payment_in_progress  a payment of the user (or their agency) is being
--                        charged, or a checkout started in the last hour (an
--                        open CardCom page whose webhook hasn't come)
--   renewal_not_stopped  a running subscription still renews (the edge
--                        function stops them first)
create or replace function public.delete_account_data(p_user_id uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  prof public.profiles;
  agency uuid;
begin
  select * into prof from public.profiles where id = p_user_id for update;
  if not found then
    return;
  end if;
  agency := case when prof.role = 'agency_admin' then prof.org_id end;

  -- Abandoned (and declined) checkouts stay pending for good: only a recent
  -- one may still be paid. A pending renewal or upgrade is always in flight.
  if exists (
    select 1 from public.payments
    where status = 'pending' and (user_id = prof.id or org_id = agency or bought_by = prof.id)
      and (kind <> 'checkout' or created_at > now() - interval '1 hour')
  ) then
    raise exception 'payment_in_progress';
  end if;

  if exists (
    select 1 from public.subscriptions
    where status in ('active', 'past_due') and not cancel_at_period_end
      and (user_id = prof.id or org_id = agency)
  ) then
    raise exception 'renewal_not_stopped';
  end if;

  if agency is not null then
    delete from public.organizations where id = agency;
  end if;
end
$$;

revoke execute on function public.delete_account_data(uuid) from public, anon, authenticated;
grant execute on function public.delete_account_data(uuid) to service_role;
