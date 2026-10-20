-- Terms of use and privacy policy: when each user accepted them. Apply after
-- 20261020000000_delete_account.sql. Safe to run again.
--
-- The email sign-up form sends terms_accepted = true as user metadata (the
-- form can't be sent without it), and the sign-up trigger records the time.
-- Everyone else (Google sign-ups, users from before this column, and users
-- after the documents change) is asked in the app, which calls accept_terms().
-- The time is always the database's, never the browser's.

alter table public.profiles add column if not exists terms_accepted_at timestamptz;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, role, full_name, phone, terms_accepted_at)
  values (
    new.id,
    case when new.raw_user_meta_data ->> 'role' = 'agent'
      then 'agent'::public.user_role else 'personal'::public.user_role end,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.raw_user_meta_data ->> 'phone', new.phone, ''),
    case when new.raw_user_meta_data ->> 'terms_accepted' = 'true' then now() end
  );
  return new;
end
$$;

-- Accepting again (after the documents change) moves the time forward.
create or replace function public.accept_terms() returns void
language sql security definer set search_path = ''
as $$
  update public.profiles set terms_accepted_at = now() where id = auth.uid()
$$;

revoke execute on function public.accept_terms() from public, anon;
grant execute on function public.accept_terms() to authenticated;
