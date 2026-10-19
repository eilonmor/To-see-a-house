-- Account deletion: the delete-account edge function calls delete_account_data,
-- which does all of it in one transaction. Apply after
-- 20261019000000_agency_checkout.sql. Safe to run again.
--
-- The user's running subscriptions (and an agency admin's agency's) end with
-- the account, so they are never charged again. Charges already taken are not
-- refunded. An admin's agency is deleted with its properties, invites,
-- subscription and payments; its agents stay as agents with no agency
-- (profiles.org_id is set null). Deleting the auth user cascades to the
-- profile, its properties (visit days, bookings), subscriptions, payments and
-- calendar feed.

-- Raises payment_in_progress while a payment of the user (or their agency)
-- may still be charged: a renewal or upgrade being charged (what
-- set_subscription_renewal checks too), or a checkout started in the last
-- 24 hours. A deleted payment row can't be matched by payment-webhook, so a
-- late charge would have no record; CardCom resends the webhook for about
-- 25 hours. Abandoned checkouts stay pending for good, hence the window.
create or replace function public.delete_account_data(p_user_id uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  prof public.profiles;
  agency uuid;
begin
  -- Locked until the user is deleted: a payment inserted meanwhile (its
  -- foreign key locks the same rows) waits, then fails.
  select * into prof from public.profiles where id = p_user_id for update;
  if found and prof.role = 'agency_admin' then
    agency := prof.org_id;
    perform 1 from public.organizations where id = agency for update;
  end if;

  if exists (
    select 1 from public.payments
    where status = 'pending'
      and (user_id = p_user_id or org_id = agency or bought_by = p_user_id)
      and (kind <> 'checkout' or created_at > now() - interval '24 hours')
  ) then
    raise exception 'payment_in_progress';
  end if;

  -- Stop the renewals first, as "cancel renewal" on the billing page does;
  -- the rows then go with the account below.
  update public.subscriptions set cancel_at_period_end = true
  where status in ('active', 'past_due') and (user_id = p_user_id or org_id = agency);

  if agency is not null then
    delete from public.organizations where id = agency;
  end if;
  delete from auth.users where id = p_user_id;
end
$$;

revoke execute on function public.delete_account_data(uuid) from public, anon, authenticated;
grant execute on function public.delete_account_data(uuid) to service_role;
