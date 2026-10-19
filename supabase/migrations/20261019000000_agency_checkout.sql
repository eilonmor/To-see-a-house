-- Pay to open an agency: the agency is created when its first plan is paid,
-- not before. A user outside an agency buys an agency plan with the agency's
-- name (create-checkout), or an agent moves their agent plan to it
-- (change-plan); the agency is opened in the same transaction that records
-- the payment. create_agency() is no longer callable from the app: an agency
-- without a plan left its admin with no way to add properties or leave.
-- See docs/cardcom-integration.md. Apply after 20261012000000_payments.sql.
-- Safe to run again.

-- The name of the agency a payment opens. Set only on a payment for a new
-- agency, whose payer is the buyer until it's paid; the payment then moves
-- to the agency (user_id null, org_id the new agency).
alter table public.payments
  add column if not exists agency_name text check (agency_name is null or length(trim(agency_name)) > 0);

drop function if exists public.create_agency(text);

-- Opens an agency named p_name with p_user_id as its admin. Raises
-- missing_agency_name or already_in_agency. Called only by complete_checkout
-- and complete_upgrade, after the payment.
create or replace function public.open_agency(p_user_id uuid, p_name text) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  prof public.profiles;
  new_org uuid;
begin
  if trim(coalesce(p_name, '')) = '' then
    raise exception 'missing_agency_name';
  end if;
  select * into prof from public.profiles where id = p_user_id for update;
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

-- ===========================================================================
-- First purchase
-- ===========================================================================

-- Who pays for a plan bought by p_user_id: (user_id, null) for agent plans,
-- (null, org_id) for an agency admin's agency plan, and (user_id, null) with
-- the agency's name for an agency plan bought by a user outside an agency
-- (the agency is opened when it's paid). Raises plan_not_allowed,
-- missing_agency_name, already_subscribed or use_upgrade.
drop function if exists public.checkout_payer(uuid, text);
create function public.checkout_payer(p_user_id uuid, p_plan text, p_agency_name text default null)
returns table (payer_user_id uuid, payer_org_id uuid, agency_name text)
language plpgsql stable security definer set search_path = ''
as $$
declare
  pl public.plans;
  prof public.profiles;
begin
  select * into pl from public.plans p where p.code = p_plan and p.active;
  if not found then
    raise exception 'plan_not_allowed';
  end if;
  select * into prof from public.profiles p where p.id = p_user_id;
  if not found then
    raise exception 'not_authenticated';
  end if;

  if pl.audience = 'agent' then
    -- Agency members are covered by the agency.
    if prof.org_id is not null then
      raise exception 'plan_not_allowed';
    end if;
    payer_user_id := prof.id;
  elsif prof.role = 'agency_admin' then
    -- An agency whose plan ended buys a new one.
    payer_org_id := prof.org_id;
  elsif prof.org_id is not null then
    -- An agent inside an agency.
    raise exception 'plan_not_allowed';
  else
    if trim(coalesce(p_agency_name, '')) = '' then
      raise exception 'missing_agency_name';
    end if;
    agency_name := trim(p_agency_name);
  end if;

  -- A new agency has no subscription yet; the buyer's own agent plan doesn't
  -- count (it runs out once the agency's is paid).
  if agency_name is null and exists (
    select 1 from public.subscriptions s
    where (s.user_id = payer_user_id or s.org_id = payer_org_id)
      and s.status in ('active', 'past_due')
  ) then
    raise exception 'already_subscribed';
  end if;

  -- A buyer whose own agent subscription can move to the agency (Task 6)
  -- shouldn't pay twice for the same period.
  if pl.audience = 'agency' and exists (
    select 1 from public.subscriptions s
    where s.user_id = prof.id and s.status = 'active' and not s.cancel_at_period_end
      and s.period = pl.period
  ) then
    raise exception 'use_upgrade';
  end if;

  if agency_name is not null then
    payer_user_id := prof.id;
  end if;
  return next;
end
$$;

-- The webhook's successful GetLpResult, in one transaction: the payment is
-- paid, a new agency is opened (payments.agency_name), the subscription
-- starts with the saved card, a personal buyer of an agent plan becomes an
-- agent. Returns { result: 'paid' | 'duplicate' | 'already_done',
-- subscription_id }. 'duplicate': the payer got another running
-- subscription meanwhile (two tabs, or a payment page left open), or the
-- buyer of a new agency joined or opened one meanwhile; the payment is paid
-- anyway, with refund_reason set, and must be refunded by hand. Called
-- again, it answers 'duplicate' again.
create or replace function public.complete_checkout(
  p_payment_id uuid,
  p_tranzaction_id bigint,
  p_token text,
  p_token_expires_on date,
  p_card_year int,
  p_card_month int,
  p_approval_number text,
  p_owner_identity_number text
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  pay public.payments;
  pl public.plans;
  sub_id uuid;
  starts timestamptz := now();
begin
  select * into pay from public.payments where id = p_payment_id for update;
  if not found or pay.kind <> 'checkout' then
    raise exception 'payment_not_found';
  end if;
  if pay.status <> 'pending' then
    return jsonb_build_object(
      'result', case when pay.refund_reason is not null then 'duplicate' else 'already_done' end,
      'subscription_id', pay.subscription_id);
  end if;

  update public.payments
  set status = 'paid', paid_at = now(), cardcom_tranzaction_id = p_tranzaction_id
  where id = pay.id;

  select * into pl from public.plans where code = pay.plan_code;
  begin
    if pay.agency_name is not null then
      -- The agency pays from now on, this payment included.
      pay.org_id := public.open_agency(pay.user_id, pay.agency_name);
      pay.user_id := null;
      update public.payments set user_id = null, org_id = pay.org_id where id = pay.id;
    end if;

    insert into public.subscriptions (
      user_id, org_id, plan_code, price, period, status, current_period_start, current_period_end,
      cardcom_token, cardcom_token_expires_on, cardcom_token_card_year, cardcom_token_card_month,
      cardcom_token_approval_number, cardcom_token_card_owner_identity_number
    ) values (
      pay.user_id, pay.org_id, pl.code, pay.amount, pl.period, 'active',
      starts, starts + public.period_interval(pl.period),
      p_token, p_token_expires_on, p_card_year, p_card_month,
      p_approval_number, p_owner_identity_number
    )
    returning id into sub_id;
  exception when unique_violation or raise_exception then
    -- raise_exception: open_agency's already_in_agency.
    update public.payments set refund_reason = 'duplicate_checkout' where id = pay.id;
    return jsonb_build_object('result', 'duplicate', 'subscription_id', null);
  end;

  update public.payments set subscription_id = sub_id where id = pay.id;

  if pl.audience = 'agent' then
    -- The same change become_agent() makes.
    update public.profiles set role = 'agent'
    where id = pay.user_id and role = 'personal' and org_id is null;
  else
    -- The buyer's own agent subscription (from before the agency) runs out:
    -- the agency covers them now.
    update public.subscriptions set cancel_at_period_end = true
    where user_id = pay.bought_by and status in ('active', 'past_due');
    perform public.sync_subscription_status(pay.bought_by, null);
  end if;

  perform public.sync_subscription_status(pay.user_id, pay.org_id);
  return jsonb_build_object('result', 'paid', 'subscription_id', sub_id);
end
$$;

-- ===========================================================================
-- Agent -> agency upgrades: an agent outside an agency moves their plan to a
-- new agency, opened when the upgrade is completed.
-- ===========================================================================

-- Validates moving p_user_id's subscription to p_plan. Returns the
-- subscription, 'upgrade' or 'downgrade', the prorated amount to charge now
-- (0 under ג‚×1, and for downgrades) and the agency that pays afterwards (null:
-- a new agency, opened by complete_upgrade).
create or replace function public.plan_change_check(p_user_id uuid, p_plan text)
returns table (subscription_id uuid, change text, amount numeric, new_org_id uuid)
language plpgsql stable security definer set search_path = ''
as $$
declare
  pl public.plans;
  cur public.plans;
  prof public.profiles;
  sub public.subscriptions;
begin
  select * into pl from public.plans p where p.code = p_plan and p.active;
  if not found then
    raise exception 'plan_change_not_allowed';
  end if;
  select * into prof from public.profiles p where p.id = p_user_id;
  if not found then
    raise exception 'not_authenticated';
  end if;

  -- An admin's agency subscription, else the caller's own.
  if prof.role = 'agency_admin' then
    select * into sub from public.subscriptions s
    where s.org_id = prof.org_id and s.status in ('active', 'past_due');
  end if;
  if sub.id is null then
    select * into sub from public.subscriptions s
    where s.user_id = prof.id and s.status in ('active', 'past_due');
  end if;
  if sub.id is null then
    raise exception 'plan_change_not_allowed';
  end if;
  select * into cur from public.plans p where p.code = sub.plan_code;

  if pl.code = cur.code or pl.period <> cur.period or pl.audience <> 'agency'
     or sub.status <> 'active' or sub.cancel_at_period_end or sub.current_period_end <= now() then
    raise exception 'plan_change_not_allowed';
  end if;

  if cur.audience = 'agent' then
    -- Agent -> agency: the admin's agency (one whose plan ended), or a new
    -- one. An agent inside an agency is covered by it.
    if prof.role = 'agency_admin' then
      new_org_id := prof.org_id;
    elsif prof.org_id is null then
      new_org_id := null;
    else
      raise exception 'plan_change_not_allowed';
    end if;
    change := 'upgrade';
  elsif pl.agent_seats > cur.agent_seats then
    change := 'upgrade';
    new_org_id := sub.org_id;
  elsif pl.agent_seats < cur.agent_seats then
    change := 'downgrade';
    new_org_id := sub.org_id;
  else
    raise exception 'plan_change_not_allowed';
  end if;

  subscription_id := sub.id;
  amount := 0;
  if change = 'upgrade' then
    amount := round(
      (pl.price - sub.price)
      * extract(epoch from sub.current_period_end - now())
      / extract(epoch from sub.current_period_end - sub.current_period_start),
      2);
    if amount < 1 then
      amount := 0;
    end if;
  end if;
  return next;
end
$$;

-- Before change-plan charges an upgrade, in one transaction: locks the
-- subscription, checks the change again (an upgrade from another tab may have
-- just finished) and that no other upgrade of it is being charged, then
-- inserts the pending payment. p_agency_name is required when the upgrade
-- opens a new agency (missing_agency_name); the payment's payer is then the
-- user until it's completed. Returns { subscription_id, amount, new_org_id,
-- agency_name, payment_id }; payment_id is null when the amount is 0 (no
-- charge: call complete_upgrade without a payment).
drop function if exists public.start_upgrade(uuid, text);
create function public.start_upgrade(p_user_id uuid, p_plan text, p_agency_name text default null) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  q record;
  locked uuid;
  pay_id uuid;
  new_name text;
begin
  select * into q from public.plan_change_check(p_user_id, p_plan);
  if q.change <> 'upgrade' then
    raise exception 'plan_change_not_allowed';
  end if;
  select id into locked from public.subscriptions where id = q.subscription_id for update;
  -- Waited for whoever held the lock: check against what they committed.
  select * into q from public.plan_change_check(p_user_id, p_plan);
  if q.change <> 'upgrade' or q.subscription_id is distinct from locked then
    raise exception 'plan_change_not_allowed';
  end if;
  perform public.assert_no_pending_upgrade(locked);

  if q.new_org_id is null then
    new_name := nullif(trim(coalesce(p_agency_name, '')), '');
    if new_name is null then
      raise exception 'missing_agency_name';
    end if;
  end if;

  if q.amount > 0 then
    insert into public.payments (subscription_id, user_id, org_id, bought_by, plan_code, amount, kind, agency_name)
    values (locked, case when q.new_org_id is null then p_user_id end, q.new_org_id, p_user_id,
            p_plan, q.amount, 'upgrade', new_name)
    returning id into pay_id;
  end if;
  return jsonb_build_object('subscription_id', locked, 'amount', q.amount,
                            'new_org_id', q.new_org_id, 'agency_name', new_name, 'payment_id', pay_id);
end
$$;

-- After the upgrade's charge succeeded (or without a payment when the amount
-- is 0), in one transaction: a new agency is opened if the upgrade is for one
-- (the payment's agency_name, else p_agency_name), the old subscription ends
-- ('upgraded'), and the agency gets a new one on the new plan with the same
-- period and the same saved card. Returns { result: 'upgraded' | 'duplicate'
-- | 'already_done', subscription_id }. 'duplicate': the change isn't allowed
-- any more (the agency's own checkout was paid, the buyer joined or opened an
-- agency, the plan was deactivated, or the subscription changed by hand
-- while it was being charged); the payment is paid anyway, with
-- refund_reason set, and must be refunded by hand. Called again, it answers
-- 'duplicate' again.
drop function if exists public.complete_upgrade(uuid, text, uuid, bigint);
create function public.complete_upgrade(
  p_user_id uuid, p_plan text, p_payment_id uuid, p_tranzaction_id bigint, p_agency_name text default null
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  pay public.payments;
  q record;
  old public.subscriptions;
  pl public.plans;
  org uuid;
  new_id uuid;
begin
  if p_payment_id is not null then
    select * into pay from public.payments where id = p_payment_id for update;
    if not found or pay.kind <> 'upgrade' then
      raise exception 'payment_not_found';
    end if;
    -- Finished by hand with the wrong plan: the payment is for pay.plan_code.
    if pay.plan_code <> p_plan then
      raise exception 'plan_change_not_allowed';
    end if;
    if pay.status <> 'pending' then
      return jsonb_build_object(
        'result', case when pay.refund_reason is not null then 'duplicate' else 'already_done' end,
        'subscription_id', pay.subscription_id);
    end if;
    update public.payments
    set status = 'paid', paid_at = now(), cardcom_tranzaction_id = p_tranzaction_id
    where id = pay.id;
  end if;

  begin
    select * into q from public.plan_change_check(p_user_id, p_plan);
    -- The payment was made for this subscription (change-plan links it), and
    -- for the same agency: a new one, or the one it names.
    if q.change <> 'upgrade'
       or (pay.id is not null and (q.subscription_id is distinct from pay.subscription_id
                                   or q.new_org_id is distinct from pay.org_id)) then
      raise exception 'plan_change_not_allowed';
    end if;

    select * into old from public.subscriptions where id = q.subscription_id for update;
    if old.status <> 'active' or old.cancel_at_period_end then
      raise exception 'plan_change_not_allowed';
    end if;
    -- A free upgrade waits for a charged one of the same subscription.
    if pay.id is null then
      perform public.assert_no_pending_upgrade(old.id);
    end if;
    select * into pl from public.plans where code = p_plan;

    org := q.new_org_id;
    if org is null then
      -- Raises missing_agency_name or already_in_agency.
      org := public.open_agency(p_user_id, coalesce(pay.agency_name, p_agency_name));
    end if;

    update public.subscriptions
    set status = 'canceled', canceled_at = now(), ended_reason = 'upgraded', next_plan_code = null
    where id = old.id;

    insert into public.subscriptions (
      org_id, plan_code, price, period, status, current_period_start, current_period_end,
      cardcom_token, cardcom_token_expires_on, cardcom_token_card_year, cardcom_token_card_month,
      cardcom_token_approval_number, cardcom_token_card_owner_identity_number
    ) values (
      org, pl.code, pl.price, pl.period, 'active', old.current_period_start, old.current_period_end,
      old.cardcom_token, old.cardcom_token_expires_on, old.cardcom_token_card_year, old.cardcom_token_card_month,
      old.cardcom_token_approval_number, old.cardcom_token_card_owner_identity_number
    )
    returning id into new_id;
  exception when raise_exception or unique_violation then
    -- Without a payment there is nothing to keep: the caller gets the error.
    if pay.id is null then
      raise;
    end if;
    update public.payments set refund_reason = 'duplicate_upgrade' where id = pay.id;
    return jsonb_build_object('result', 'duplicate', 'subscription_id', null);
  end;

  if pay.id is not null then
    -- A new agency's payment moves to it, like the subscription.
    update public.payments
    set subscription_id = new_id, user_id = null, org_id = org
    where id = pay.id;
  end if;
  perform public.sync_subscription_status(old.user_id, old.org_id);
  perform public.sync_subscription_status(null, org);
  return jsonb_build_object('result', 'upgraded', 'subscription_id', new_id);
end
$$;

-- ===========================================================================
-- Function access: service role only (the edge functions).
-- ===========================================================================

revoke execute on function
  public.open_agency(uuid, text),
  public.checkout_payer(uuid, text, text),
  public.start_upgrade(uuid, text, text),
  public.complete_upgrade(uuid, text, uuid, bigint, text)
from public, anon, authenticated;

grant execute on function
  public.checkout_payer(uuid, text, text),
  public.start_upgrade(uuid, text, text),
  public.complete_upgrade(uuid, text, uuid, bigint, text)
to service_role;
