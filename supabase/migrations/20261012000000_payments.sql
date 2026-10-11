-- Phase 5 (payments): CardCom subscriptions for agents and agencies.
-- See docs/cardcom-integration.md. Apply after 20261010000000_booking_notes.sql.
-- Safe to run again.
--
-- Billing tables are written only by the edge functions (service role):
-- create-checkout, payment-webhook, change-plan and renew-subscriptions. The
-- browser reads them through row-level security, never the card token.

-- ===========================================================================
-- Tables
-- ===========================================================================

-- What we sell. Prices can change here without a deploy; a running
-- subscription keeps the price it was bought at (subscriptions.price).
create table if not exists public.plans (
  code text primary key,
  audience text not null check (audience in ('agent', 'agency')),
  period text not null check (period in ('month', 'year')),
  -- Charged (final, no VAT). list_price is only shown struck out in the app.
  price numeric(10,2) not null check (price > 0),
  list_price numeric(10,2) not null check (list_price >= price),
  discount_percent int not null default 0 check (discount_percent between 0 and 99),
  -- Agents an agency plan includes (the admin isn't counted).
  agent_seats int check (agent_seats > 0),
  name_he text not null,
  name_en text not null,
  active boolean not null default true,
  check ((audience = 'agent') = (agent_seats is null))
);

insert into public.plans (code, audience, period, price, list_price, discount_percent, agent_seats, name_he, name_en) values
  ('agent_monthly',        'agent',  'month',   23,   33, 30, null, 'סוכן – חודשי',              'Agent – monthly'),
  ('agent_yearly',         'agent',  'year',   216,  309, 30, null, 'סוכן – שנתי',               'Agent – yearly'),
  ('agency_small_monthly', 'agency', 'month',   60,   92, 35, 2,    'משרד עד 2 סוכנים – חודשי', 'Agency, up to 2 agents – monthly'),
  ('agency_small_yearly',  'agency', 'year',   576,  886, 35, 2,    'משרד עד 2 סוכנים – שנתי',  'Agency, up to 2 agents – yearly'),
  ('agency_large_monthly', 'agency', 'month',  120,  185, 35, 5,    'משרד עד 5 סוכנים – חודשי', 'Agency, up to 5 agents – monthly'),
  ('agency_large_yearly',  'agency', 'year',  1152, 1772, 35, 5,    'משרד עד 5 סוכנים – שנתי',  'Agency, up to 5 agents – yearly')
-- Running again keeps prices changed since.
on conflict (code) do nothing;

-- One row per purchase that renews. The payer is a user (agent plans) or an
-- agency (agency plans), like the owner of a property.
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete cascade,
  org_id uuid references public.organizations (id) on delete cascade,
  plan_code text not null references public.plans (code),
  price numeric(10,2) not null check (price > 0),
  period text not null check (period in ('month', 'year')),
  status public.subscription_status not null default 'active' check (status <> 'none'),
  current_period_start timestamptz not null,
  current_period_end timestamptz not null,
  cancel_at_period_end boolean not null default false,
  failed_renewals int not null default 0,
  -- A downgrade the renewal job applies at the end of the period.
  next_plan_code text references public.plans (code),
  -- Why it was canceled: replaced by an upgrade, renewal stopped by the user,
  -- or 3 failed renewals.
  ended_reason text check (ended_reason in ('upgraded', 'canceled', 'failed')),
  created_at timestamptz not null default now(),
  canceled_at timestamptz,
  -- The saved card (CardCom TokenInfo). Never readable by the browser: see the
  -- column grants below.
  cardcom_token text,
  cardcom_token_card_year int,
  cardcom_token_card_month int,
  cardcom_token_approval_number text,
  cardcom_token_card_owner_identity_number text,
  cardcom_token_expires_on date,
  check ((user_id is null) <> (org_id is null)),
  check ((status = 'canceled') = (canceled_at is not null))
);
create index if not exists subscriptions_user_id_idx on public.subscriptions (user_id);
create index if not exists subscriptions_org_id_idx on public.subscriptions (org_id);
-- A payer has at most one running subscription.
create unique index if not exists subscriptions_one_running_idx
  on public.subscriptions ((coalesce(user_id, org_id))) where status in ('active', 'past_due');

-- CardCom's "orders": the first charge, each renewal and each upgrade.
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid references public.subscriptions (id) on delete set null,
  -- The payer, as on subscriptions.
  user_id uuid references public.profiles (id) on delete cascade,
  org_id uuid references public.organizations (id) on delete cascade,
  -- Who clicked pay (null for renewals).
  bought_by uuid references public.profiles (id) on delete set null,
  plan_code text not null references public.plans (code),
  amount numeric(10,2) not null check (amount > 0),
  kind text not null check (kind in ('checkout', 'renewal', 'upgrade')),
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed')),
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  cardcom_low_profile_id text unique,
  cardcom_operation text,
  cardcom_tranzaction_id bigint,
  cardcom_response_code int,
  -- CardCom's error text: logged and kept for support, never shown in the app.
  cardcom_description text,
  cardcom_document_type text,
  cardcom_document_number int,
  check ((user_id is null) <> (org_id is null))
);
create index if not exists payments_subscription_id_idx on public.payments (subscription_id);
create index if not exists payments_user_id_idx on public.payments (user_id);
create index if not exists payments_org_id_idx on public.payments (org_id);

-- ===========================================================================
-- Row Level Security
-- ===========================================================================

alter table public.plans enable row level security;
alter table public.subscriptions enable row level security;
alter table public.payments enable row level security;

drop policy if exists "everyone reads plans" on public.plans;
create policy "everyone reads plans" on public.plans
  for select to anon, authenticated using (true);

drop policy if exists "payers read their subscriptions" on public.subscriptions;
create policy "payers read their subscriptions" on public.subscriptions
  for select to authenticated using (user_id = auth.uid() or public.is_org_admin(org_id));

drop policy if exists "payers read their payments" on public.payments;
create policy "payers read their payments" on public.payments
  for select to authenticated using (user_id = auth.uid() or public.is_org_admin(org_id));

-- No writes from the browser, and no token, approval number, ID number or
-- CardCom error text. The app must name the columns it selects (select * fails).
revoke all on public.plans, public.subscriptions, public.payments from anon, authenticated;
grant select on public.plans to anon, authenticated;
grant select (id, user_id, org_id, plan_code, price, period, status,
              current_period_start, current_period_end, cancel_at_period_end,
              failed_renewals, next_plan_code, ended_reason, created_at, canceled_at)
  on public.subscriptions to authenticated;
grant select (id, subscription_id, user_id, org_id, bought_by, plan_code, amount, kind,
              status, created_at, paid_at, cardcom_document_type, cardcom_document_number)
  on public.payments to authenticated;

-- ===========================================================================
-- Helpers
-- ===========================================================================

create or replace function public.period_interval(p_period text) returns interval
language sql immutable set search_path = ''
as $$ select case p_period when 'month' then interval '1 month' when 'year' then interval '1 year' end $$;

-- The payer's running subscription's status, else 'canceled' if they ever had
-- one, else 'none'. Pass the user or the agency.
create or replace function public.payer_subscription_status(p_user_id uuid, p_org_id uuid)
returns public.subscription_status
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select s.status from public.subscriptions s
    where s.user_id = p_user_id or s.org_id = p_org_id
    order by s.status in ('active', 'past_due') desc, s.created_at desc
    limit 1
  ), 'none')
$$;

-- Copies the payer's status to profiles / organizations.subscription_status,
-- which the property gate and the app read. Called after every change.
create or replace function public.sync_subscription_status(p_user_id uuid, p_org_id uuid) returns void
language sql security definer set search_path = ''
as $$
  update public.profiles set subscription_status = public.payer_subscription_status(id, null)
  where id = p_user_id;
  update public.organizations set subscription_status = public.payer_subscription_status(null, id)
  where id = p_org_id;
$$;

-- ===========================================================================
-- The property gate: the free plan's limits for personal users; for agents
-- and agencies, a running subscription. Replaces enforce_personal_property_limit.
-- Existing properties are never touched when a subscription ends.
-- ===========================================================================

create or replace function public.enforce_property_plan() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  prof public.profiles;
begin
  -- An agency's property (create_agency_property or the insert policy).
  if new.owner_org_id is not null then
    if not exists (
      select 1 from public.organizations
      where id = new.owner_org_id and subscription_status in ('active', 'past_due')
    ) then
      raise exception 'subscription_required';
    end if;
    return new;
  end if;

  -- Lock the profile so two concurrent inserts can't both pass the checks.
  select * into prof from public.profiles where id = new.owner_user_id for update;

  if prof.role = 'personal' then
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
  end if;

  -- An agent or agency admin: their own subscription, or their agency's.
  if prof.subscription_status in ('active', 'past_due')
     or exists (
       select 1 from public.organizations
       where id = prof.org_id and subscription_status in ('active', 'past_due')
     ) then
    return new;
  end if;
  raise exception 'subscription_required';
end
$$;

drop trigger if exists enforce_personal_property_limit on public.properties;
drop function if exists public.enforce_personal_property_limit();
drop trigger if exists enforce_property_plan on public.properties;
create trigger enforce_property_plan
  before insert on public.properties
  for each row execute function public.enforce_property_plan();

-- ===========================================================================
-- Agency seats: joining needs a running agency subscription with a free seat.
-- Agencies above their limit (after a lapse or a downgrade) keep their agents.
-- ===========================================================================

create or replace function public.accept_agency_invite(p_code text) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  inv public.agency_invites;
  prof public.profiles;
  seats int;
  agents int;
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

  -- Locked, so two invites accepted at once can't both take the last seat.
  perform 1 from public.organizations where id = inv.org_id for update;

  -- With a downgrade scheduled, the smaller plan's limit already applies.
  select least(cur.agent_seats, coalesce(nxt.agent_seats, cur.agent_seats)) into seats
  from public.subscriptions s
  join public.plans cur on cur.code = s.plan_code
  left join public.plans nxt on nxt.code = s.next_plan_code
  where s.org_id = inv.org_id and s.status in ('active', 'past_due');
  if not found then
    raise exception 'subscription_required';
  end if;

  select count(*) into agents from public.profiles where org_id = inv.org_id and role = 'agent';
  if agents >= seats then
    raise exception 'agency_seat_limit';
  end if;

  update public.profiles set role = 'agent', org_id = inv.org_id where id = prof.id;
  update public.agency_invites set used_by = prof.id, used_at = now() where code = inv.code;
  -- The agency covers them from now on: their own subscription runs out. No refund.
  update public.subscriptions set cancel_at_period_end = true
  where user_id = prof.id and status in ('active', 'past_due');
  return inv.org_id;
end
$$;

-- ===========================================================================
-- First purchase (create-checkout, payment-webhook)
-- ===========================================================================

-- Who pays for a plan bought by p_user_id: (user_id, null) for agent plans,
-- (null, org_id) for agency plans. Raises plan_not_allowed, already_subscribed
-- or use_upgrade.
create or replace function public.checkout_payer(p_user_id uuid, p_plan text)
returns table (payer_user_id uuid, payer_org_id uuid)
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
  else
    -- Create the agency first, from the agency page.
    if prof.role <> 'agency_admin' then
      raise exception 'plan_not_allowed';
    end if;
    payer_org_id := prof.org_id;
  end if;

  if exists (
    select 1 from public.subscriptions s
    where (s.user_id = payer_user_id or s.org_id = payer_org_id)
      and s.status in ('active', 'past_due')
  ) then
    raise exception 'already_subscribed';
  end if;

  -- An agency admin whose own agent subscription can be upgraded (Task 6)
  -- shouldn't pay twice for the same period.
  if payer_org_id is not null and exists (
    select 1 from public.subscriptions s
    where s.user_id = prof.id and s.status = 'active' and not s.cancel_at_period_end
      and s.period = pl.period
  ) then
    raise exception 'use_upgrade';
  end if;

  return next;
end
$$;

-- The webhook's successful GetLpResult, in one transaction: the payment is
-- paid, the subscription starts with the saved card, a personal buyer of an
-- agent plan becomes an agent. Returns { result: 'paid' | 'duplicate' |
-- 'already_done', subscription_id }. 'duplicate': the payer got another
-- running subscription meanwhile (two tabs); the payment is paid anyway and
-- must be refunded by hand.
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
    return jsonb_build_object('result', 'already_done', 'subscription_id', pay.subscription_id);
  end if;

  update public.payments
  set status = 'paid', paid_at = now(), cardcom_tranzaction_id = p_tranzaction_id
  where id = pay.id;

  select * into pl from public.plans where code = pay.plan_code;
  begin
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
  exception when unique_violation then
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
-- Plan changes (change-plan): upgrades now, prorated, on the saved card;
-- downgrades at the next renewal. Same period only.
-- ===========================================================================

-- Validates moving p_user_id's subscription to p_plan. Returns the
-- subscription, 'upgrade' or 'downgrade', the prorated amount to charge now
-- (0 under ₪1, and for downgrades) and the agency that pays afterwards.
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
    -- Agent -> agency: the caller has since created an agency.
    if prof.role <> 'agency_admin' then
      raise exception 'plan_change_not_allowed';
    end if;
    change := 'upgrade';
    new_org_id := prof.org_id;
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

-- The billing page's quote for the confirm dialog.
create or replace function public.plan_change_quote(p_plan text)
returns table (subscription_id uuid, change text, amount numeric, new_org_id uuid)
language sql stable security definer set search_path = ''
as $$ select * from public.plan_change_check(auth.uid(), p_plan) $$;

-- After the upgrade's charge succeeded (or without a payment when the amount
-- is 0), in one transaction: the old subscription ends ('upgraded'), and the
-- agency gets a new one on the new plan with the same period and the same
-- saved card. Returns { result: 'upgraded' | 'duplicate' | 'already_done',
-- subscription_id }. 'duplicate': the subscription changed meanwhile (two
-- tabs); the payment is paid anyway and must be refunded by hand.
create or replace function public.complete_upgrade(
  p_user_id uuid, p_plan text, p_payment_id uuid, p_tranzaction_id bigint
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  pay public.payments;
  q record;
  old public.subscriptions;
  pl public.plans;
  new_id uuid;
begin
  if p_payment_id is not null then
    select * into pay from public.payments where id = p_payment_id for update;
    if not found or pay.kind <> 'upgrade' then
      raise exception 'payment_not_found';
    end if;
    if pay.status <> 'pending' then
      return jsonb_build_object('result', 'already_done', 'subscription_id', pay.subscription_id);
    end if;
    update public.payments
    set status = 'paid', paid_at = now(), cardcom_tranzaction_id = p_tranzaction_id
    where id = pay.id;
  end if;

  begin
    select * into q from public.plan_change_check(p_user_id, p_plan);
    -- The payment was made for this subscription (change-plan links it).
    if q.change <> 'upgrade' or (pay.id is not null and q.subscription_id is distinct from pay.subscription_id) then
      raise exception 'plan_change_not_allowed';
    end if;

    select * into old from public.subscriptions where id = q.subscription_id for update;
    if old.status <> 'active' or old.cancel_at_period_end then
      raise exception 'plan_change_not_allowed';
    end if;
    select * into pl from public.plans where code = p_plan;

    update public.subscriptions
    set status = 'canceled', canceled_at = now(), ended_reason = 'upgraded', next_plan_code = null
    where id = old.id;

    insert into public.subscriptions (
      org_id, plan_code, price, period, status, current_period_start, current_period_end,
      cardcom_token, cardcom_token_expires_on, cardcom_token_card_year, cardcom_token_card_month,
      cardcom_token_approval_number, cardcom_token_card_owner_identity_number
    ) values (
      q.new_org_id, pl.code, pl.price, pl.period, 'active', old.current_period_start, old.current_period_end,
      old.cardcom_token, old.cardcom_token_expires_on, old.cardcom_token_card_year, old.cardcom_token_card_month,
      old.cardcom_token_approval_number, old.cardcom_token_card_owner_identity_number
    )
    returning id into new_id;
  exception when raise_exception or unique_violation then
    -- Without a payment there is nothing to keep: the caller gets the error.
    if pay.id is null then
      raise;
    end if;
    return jsonb_build_object('result', 'duplicate', 'subscription_id', null);
  end;

  if pay.id is not null then
    update public.payments set subscription_id = new_id where id = pay.id;
  end if;
  perform public.sync_subscription_status(old.user_id, old.org_id);
  perform public.sync_subscription_status(null, q.new_org_id);
  return jsonb_build_object('result', 'upgraded', 'subscription_id', new_id);
end
$$;

-- Downgrade large -> small at the next renewal. Called again with the
-- current plan, it undoes the scheduled change.
create or replace function public.schedule_plan_change(p_plan text) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  prof public.profiles;
  q record;
  seats int;
begin
  select * into prof from public.profiles where id = auth.uid();
  if prof.role is distinct from 'agency_admin' then
    raise exception 'not_agency_admin';
  end if;

  update public.subscriptions set next_plan_code = null
  where org_id = prof.org_id and status in ('active', 'past_due') and plan_code = p_plan;
  if found then
    return;
  end if;

  select * into q from public.plan_change_check(prof.id, p_plan);
  if q.change <> 'downgrade' then
    raise exception 'plan_change_not_allowed';
  end if;

  -- Locked, so an invite accepted meanwhile waits and then sees the smaller limit.
  perform 1 from public.organizations where id = prof.org_id for update;
  select agent_seats into seats from public.plans where code = p_plan;
  if (select count(*) from public.profiles where org_id = prof.org_id and role = 'agent') > seats then
    raise exception 'agency_seat_limit';
  end if;

  update public.subscriptions set next_plan_code = p_plan where id = q.subscription_id;
end
$$;

-- ===========================================================================
-- Renewals (renew-subscriptions, daily)
-- ===========================================================================

-- Starts the renewal of a subscription whose period has ended: inserts a
-- pending payment (the scheduled downgrade's current price, else the
-- subscription's price). Returns { payment_id, amount, plan_code }, or
-- { skipped: reason } when there is nothing to charge now:
--   not_due        renewed, canceled, cancelling, or the period hasn't ended
--   retried_today  a renewal of it failed in the last 20 hours (one try a day)
--   pending        an earlier charge never finished: check it in CardCom's
--                  dashboard, then mark the payment paid or failed by hand
create or replace function public.start_renewal(p_subscription_id uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  sub public.subscriptions;
  charge_plan text;
  charge_amount numeric(10,2);
  pay_id uuid;
begin
  select * into sub from public.subscriptions where id = p_subscription_id for update;
  if not found or sub.status not in ('active', 'past_due') or sub.cancel_at_period_end
     or sub.current_period_end > now() then
    return jsonb_build_object('skipped', 'not_due');
  end if;
  if exists (
    select 1 from public.payments
    where subscription_id = sub.id and kind = 'renewal' and status = 'pending'
  ) then
    return jsonb_build_object('skipped', 'pending');
  end if;
  if exists (
    select 1 from public.payments
    where subscription_id = sub.id and kind = 'renewal' and status = 'failed'
      and created_at > now() - interval '20 hours'
  ) then
    return jsonb_build_object('skipped', 'retried_today');
  end if;

  charge_plan := coalesce(sub.next_plan_code, sub.plan_code);
  if sub.next_plan_code is null then
    charge_amount := sub.price;
  else
    select price into charge_amount from public.plans where code = sub.next_plan_code;
  end if;

  insert into public.payments (subscription_id, user_id, org_id, plan_code, amount, kind)
  values (sub.id, sub.user_id, sub.org_id, charge_plan, charge_amount, 'renewal')
  returning id into pay_id;
  return jsonb_build_object('payment_id', pay_id, 'amount', charge_amount, 'plan_code', charge_plan);
end
$$;

-- The renewal's result, in one transaction. Paid: the period moves forward
-- from the old end (and a scheduled downgrade takes effect). Failed:
-- past_due, and canceled after the 3rd failure in a row. Returns
-- { status } (the subscription's new status), { already_done: true } if the
-- payment was finished before, or { status, refund: true } when the card was
-- charged but the subscription had ended meanwhile (only possible when a
-- payment is finished by hand): the payment is paid, the subscription
-- untouched, and the money must be refunded in CardCom's dashboard.
drop function if exists public.finish_renewal(uuid, boolean, bigint);
create function public.finish_renewal(p_payment_id uuid, p_paid boolean, p_tranzaction_id bigint)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  pay public.payments;
  sub public.subscriptions;
begin
  select * into pay from public.payments where id = p_payment_id for update;
  if not found or pay.kind <> 'renewal' then
    raise exception 'payment_not_found';
  end if;
  if pay.status <> 'pending' then
    return jsonb_build_object('already_done', true);
  end if;

  select * into sub from public.subscriptions where id = pay.subscription_id for update;
  if sub.status not in ('active', 'past_due') then
    update public.payments
    set status = case when p_paid then 'paid' else 'failed' end,
        paid_at = case when p_paid then now() end,
        cardcom_tranzaction_id = p_tranzaction_id
    where id = pay.id;
    return jsonb_build_object('status', sub.status, 'refund', p_paid);
  end if;

  if p_paid then
    update public.payments
    set status = 'paid', paid_at = now(), cardcom_tranzaction_id = p_tranzaction_id
    where id = pay.id;
    update public.subscriptions
    set status = 'active', failed_renewals = 0,
        current_period_start = current_period_end,
        current_period_end = current_period_end + public.period_interval(period),
        plan_code = pay.plan_code, price = pay.amount, next_plan_code = null
    where id = pay.subscription_id
    returning * into sub;
  else
    update public.payments set status = 'failed' where id = pay.id;
    update public.subscriptions
    set failed_renewals = failed_renewals + 1,
        status = case when failed_renewals + 1 >= 3 then 'canceled' else 'past_due' end::public.subscription_status,
        canceled_at = case when failed_renewals + 1 >= 3 then now() end,
        ended_reason = case when failed_renewals + 1 >= 3 then 'failed' end
    where id = pay.subscription_id
    returning * into sub;
  end if;

  perform public.sync_subscription_status(sub.user_id, sub.org_id);
  return jsonb_build_object('status', sub.status);
end
$$;

-- Ends the subscriptions whose renewal was stopped and whose period is over,
-- without charging. A subscription with a renewal charge in flight (or never
-- finished) is left alone until that payment is finished: the renewal may
-- have been charged before the user stopped it. Returns { expired: count,
-- pending: [subscription ids left alone] }.
drop function if exists public.expire_subscriptions();
create function public.expire_subscriptions() returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  r record;
  n int := 0;
  pending uuid[];
begin
  for r in
    update public.subscriptions s
    set status = 'canceled', canceled_at = now(), ended_reason = 'canceled'
    where s.cancel_at_period_end and s.status in ('active', 'past_due') and s.current_period_end <= now()
      and not exists (
        select 1 from public.payments p
        where p.subscription_id = s.id and p.kind = 'renewal' and p.status = 'pending'
      )
    returning s.user_id, s.org_id
  loop
    perform public.sync_subscription_status(r.user_id, r.org_id);
    n := n + 1;
  end loop;

  select coalesce(array_agg(s.id), '{}') into pending
  from public.subscriptions s
  where s.cancel_at_period_end and s.status in ('active', 'past_due') and s.current_period_end <= now();
  return jsonb_build_object('expired', n, 'pending', to_jsonb(pending));
end
$$;

-- ===========================================================================
-- Stop / resume the renewal (billing page). The subscription stays active
-- until current_period_end; then expire_subscriptions() ends it.
-- ===========================================================================

create or replace function public.set_subscription_renewal(p_subscription_id uuid, p_renew boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  sub public.subscriptions;
begin
  select * into sub from public.subscriptions
  where id = p_subscription_id and status in ('active', 'past_due')
    and (user_id = auth.uid() or public.is_org_admin(org_id))
  for update;
  if not found then
    raise exception 'subscription_not_found';
  end if;
  -- An agency member's own subscription ran out when they joined (the agency
  -- covers them); it can't be resumed.
  if p_renew and sub.user_id is not null and public.my_org_id() is not null then
    raise exception 'plan_not_allowed';
  end if;
  update public.subscriptions set cancel_at_period_end = not p_renew where id = sub.id;
end
$$;

-- ===========================================================================
-- Function access. Supabase grants new functions to anon and authenticated
-- by default: everything here is service role only, except what the billing
-- page calls itself.
-- ===========================================================================

revoke execute on function
  public.payer_subscription_status(uuid, uuid),
  public.sync_subscription_status(uuid, uuid),
  public.checkout_payer(uuid, text),
  public.complete_checkout(uuid, bigint, text, date, int, int, text, text),
  public.plan_change_check(uuid, text),
  public.complete_upgrade(uuid, text, uuid, bigint),
  public.start_renewal(uuid),
  public.finish_renewal(uuid, boolean, bigint),
  public.expire_subscriptions(),
  public.plan_change_quote(text),
  public.schedule_plan_change(text),
  public.set_subscription_renewal(uuid, boolean)
from public, anon, authenticated;

grant execute on function
  public.plan_change_quote(text),
  public.schedule_plan_change(text),
  public.set_subscription_renewal(uuid, boolean)
to authenticated;

-- The edge functions call these as service_role.
grant execute on function
  public.sync_subscription_status(uuid, uuid),
  public.checkout_payer(uuid, text),
  public.complete_checkout(uuid, bigint, text, date, int, int, text, text),
  public.plan_change_check(uuid, text),
  public.complete_upgrade(uuid, text, uuid, bigint),
  public.start_renewal(uuid),
  public.finish_renewal(uuid, boolean, bigint),
  public.expire_subscriptions()
to service_role;
