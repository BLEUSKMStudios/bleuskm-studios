-- Reverses migration 20261121130000_auth_profiles.
-- Run by hand in the Supabase SQL editor, only with the owner's approval.
-- Existing accounts and profiles are kept; only the automation is removed.

begin;
drop trigger if exists on_auth_user_email_changed on auth.users;
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists private.handle_user_email_change();
drop function if exists private.handle_new_user();
drop table if exists private.app_settings;
do $$
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations where version = '20261121130000';
  end if;
end $$;
commit;
