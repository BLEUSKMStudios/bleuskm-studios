-- BLEUSKM Studio OS, Phase 1 step 1C: sign-in support.
--
-- Every Studio OS account is created by an invitation (public sign-up is off).
-- When Supabase Auth creates the account, this migration creates its profile
-- automatically, so a person can never exist without a profile.
--
-- Owner bootstrap: the very first account whose email matches the configured
-- owner email (studio@bleuskm.com) becomes the owner, and only while no owner
-- exists. Every other account starts as an ordinary active user with no access.

-- Settings that only migrations and the database itself can read.
create table private.app_settings (
  key   text primary key,
  value text not null
);
revoke all on private.app_settings from public, anon, authenticated;

insert into private.app_settings (key, value) values ('owner_email', 'studio@bleuskm.com');

-- Create the profile for a new account.
create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(new.email);
  v_owner_email text;
  v_name text;
begin
  if v_email is null or v_email = '' then
    raise exception 'Studio OS accounts must have an email address' using errcode = 'check_violation';
  end if;

  select value into v_owner_email from private.app_settings where key = 'owner_email';
  v_name := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), '');

  insert into public.profiles (id, email, full_name, is_owner, status)
  values (
    new.id,
    v_email,
    coalesce(v_name, split_part(v_email, '@', 1)),
    v_email = lower(v_owner_email) and not exists (select 1 from public.profiles where is_owner),
    'active'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- Keep the profile email in step if the account email changes.
create function private.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles set email = lower(new.email) where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row
  when (new.email is distinct from old.email and new.email is not null)
  execute function private.handle_user_email_change();

revoke all on function private.handle_new_user() from public, anon, authenticated;
revoke all on function private.handle_user_email_change() from public, anon, authenticated;

-- The hub reads the signed-in person's own profile on every page.
-- (profiles_select already allows reading your own row.) Nothing else changes.
