-- Phase 3: guests prove they own their phone number with a one-time SMS code.
-- The send-otp and verify-otp edge functions (service role) call these
-- functions; the browser can't. Codes are stored as HMAC hashes (the secret
-- lives in the edge functions), never in plain text.
-- Apply after 20261006000000_phone_10_digits.sql. Safe to run again.

create index if not exists otp_requests_created_at_idx on public.otp_requests (created_at);
create index if not exists otp_requests_ip_idx on public.otp_requests (ip, created_at);

-- Records a new code for an Israeli mobile number (05X, 10 digits), after
-- checking the send limits. A new code replaces the phone's earlier ones.
-- Used codes stay in the table (expired) so they still count toward the limits.
create or replace function public.issue_otp(p_phone_key text, p_code_hash text, p_ip inet)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  new_id uuid;
begin
  if p_phone_key !~ '^05[0-9]{8}$' then
    raise exception 'invalid_mobile';
  end if;
  -- One request per phone at a time, so concurrent requests can't both pass the limits.
  perform pg_advisory_xact_lock(hashtext('otp:' || p_phone_key));

  if exists (select 1 from public.otp_requests
             where phone_key = p_phone_key and created_at > now() - interval '60 seconds') then
    raise exception 'otp_too_soon';
  end if;
  -- Per phone: 15 codes a day. Per IP: 10 an hour. In total: 1000 a day (caps the SMS bill).
  if (select count(*) from public.otp_requests
      where phone_key = p_phone_key and created_at > now() - interval '1 day') >= 15
     or (p_ip is not null and (select count(*) from public.otp_requests
         where ip = p_ip and created_at > now() - interval '1 hour') >= 10)
     or (select count(*) from public.otp_requests
         where created_at > now() - interval '1 day') >= 1000 then
    raise exception 'otp_rate_limited';
  end if;

  update public.otp_requests set expires_at = now()
  where phone_key = p_phone_key and expires_at > now();

  delete from public.otp_requests where created_at < now() - interval '2 days';

  insert into public.otp_requests (phone_key, code_hash, expires_at, ip)
  values (p_phone_key, p_code_hash, now() + interval '10 minutes', p_ip)
  returning id into new_id;
  return new_id;
end
$$;

-- Checks a code against the phone's latest unexpired one. Returns 'ok',
-- 'otp_wrong_code', 'otp_too_many_attempts' or 'otp_expired' instead of
-- raising, so the attempt counter is saved. Each code allows 5 tries.
create or replace function public.check_otp(p_phone_key text, p_code_hash text)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  req public.otp_requests;
begin
  select * into req
  from public.otp_requests
  where phone_key = p_phone_key and expires_at > now()
  order by created_at desc
  limit 1
  for update;
  if not found then
    return 'otp_expired';
  end if;

  if req.code_hash <> p_code_hash then
    update public.otp_requests
    set attempts = attempts + 1,
        expires_at = case when attempts + 1 >= 5 then now() else expires_at end
    where id = req.id;
    return case when req.attempts + 1 >= 5 then 'otp_too_many_attempts' else 'otp_wrong_code' end;
  end if;

  update public.otp_requests set expires_at = now() where id = req.id;
  update public.guests set verified_at = now() where phone_key = p_phone_key;
  return 'ok';
end
$$;

revoke execute on function
  public.issue_otp(text, text, inet),
  public.check_otp(text, text)
from public, anon, authenticated;

grant execute on function
  public.issue_otp(text, text, inet),
  public.check_otp(text, text)
to service_role;

-- The guest-bookings edge function calls the booking functions as service_role.
-- (Anon access is revoked separately in 20261007000001_revoke_guest_anon.sql.)
grant execute on function
  public.find_guest_bookings(text, text),
  public.book_guest_slot(uuid, time, text, text),
  public.cancel_guest_booking(uuid, text),
  public.reschedule_guest_booking(uuid, uuid, time, text, text)
to service_role;
