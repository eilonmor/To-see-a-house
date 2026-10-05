-- Guest phone numbers must have 10 digits (e.g. 054-3918750 -> 0543918750).
-- Before, 9-digit landline numbers were accepted too. Existing guests and
-- bookings are kept as they are; only new bookings are checked.
-- Apply after 20261005000000_accounts.sql.

create or replace function public.book_guest_slot(p_day_id uuid, p_slot time, p_name text, p_phone text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  key text := public.phone_key(p_phone);
  guest_name text := trim(coalesce(p_name, ''));
  existing public.bookings;
  instr text;
begin
  if key !~ '^0[0-9]{9}$' then
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

