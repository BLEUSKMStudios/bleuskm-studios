-- Reverses migration 20261121001000_access_foundation.
--
-- Only for the STAGING project, and only while it holds no real data: it
-- removes every Studio OS table, function and type, and the records in them.
-- Run by hand in the Supabase SQL editor, never automatically.
-- It does not touch Supabase's own schemas (auth, storage) or any user account.

begin;

-- Restore Supabase's default privileges for signed-out visitors.
alter default privileges in schema public grant all on tables to anon;
alter default privileges in schema public grant all on functions to anon;
alter default privileges in schema public grant all on sequences to anon;

drop function if exists public.system_status();
drop function if exists public.check_access_for(uuid, uuid, text, public.access_level);
drop function if exists public.check_access(uuid, text, public.access_level);

-- Tables (their triggers and policies go with them).
drop table if exists public.audit_log;
drop table if exists public.access_grants;
drop table if exists public.production_departments;
drop table if exists public.production_sections;
drop table if exists public.production_stages;
drop table if exists public.productions;
drop table if exists public.sections;
drop table if exists public.profiles;

-- Helper functions, then the private schema itself.
drop schema if exists private cascade;

drop type if exists public.stage_status;
drop type if exists public.lifecycle_stage;
drop type if exists public.production_status;
drop type if exists public.production_type;
drop type if exists public.profile_status;
drop type if exists public.access_level;

-- Forget the migration so it can be applied again.
do $$
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations where version = '20261121001000';
  end if;
end $$;

commit;
