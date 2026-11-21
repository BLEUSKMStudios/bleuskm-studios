-- BLEUSKM Studio OS, Phase 1 step 1B: access foundation.
--
-- One Production Hub. The owner has full access. Everyone else gets
-- No access / View / Edit per section, per production (or at Studio level),
-- and the database itself enforces it with Row Level Security.
--
-- Conventions
--   * Tables live in `public` (exposed through the Data API, always behind RLS).
--   * Permission helpers live in `private`, which is NOT exposed through the
--     Data API. They are SECURITY DEFINER with an empty search_path.
--   * `anon` (signed-out visitors) has no privileges on any hub table.
--   * Departments are labels only. Nothing here grants access by department.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
create type public.access_level as enum ('view', 'edit');
create type public.profile_status as enum ('active', 'deactivated');
create type public.production_type as enum ('film', 'commercial', 'photography', 'creative');
create type public.production_status as enum ('planning', 'active', 'wrapped', 'archived');
create type public.lifecycle_stage as enum (
  'development', 'preproduction', 'production', 'postproduction',
  'marketing', 'distribution', 'analytics'
);
create type public.stage_status as enum ('not_started', 'in_progress', 'complete');

-- ---------------------------------------------------------------------------
-- Shared trigger: keep updated_at current
-- ---------------------------------------------------------------------------
create function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles: one row per hub login (created by the owner, never self sign-up)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id             uuid primary key references auth.users (id) on delete cascade,
  email          text not null,
  full_name      text not null check (length(btrim(full_name)) > 0),
  job_title      text,                       -- display only, never used for access
  is_owner       boolean not null default false,
  status         public.profile_status not null default 'active',
  deactivated_at timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint profiles_email_lower check (email = lower(email)),
  constraint profiles_owner_active check (not is_owner or status = 'active'),
  constraint profiles_deactivated_at check ((status = 'deactivated') = (deactivated_at is not null))
);
create unique index profiles_email_key on public.profiles (email);
-- Exactly one owner can exist.
create unique index profiles_single_owner on public.profiles ((true)) where is_owner;

create trigger profiles_touch before update on public.profiles
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------------
-- sections: the fixed permission units (seeded here, changed only by migration)
-- ---------------------------------------------------------------------------
create table public.sections (
  key                   text primary key check (key ~ '^[a-z][a-z_]*$'),
  label                 text not null,
  in_main_menu          boolean not null,
  grantable             boolean not null,
  applies_to_studio     boolean not null,
  applies_to_production boolean not null,
  sort                  integer not null unique
);

insert into public.sections
  (key, label, in_main_menu, grantable, applies_to_studio, applies_to_production, sort) values
  -- Always visible to active users, limited to productions they hold a grant in.
  ('overview',         'Studio Overview',       true,  false, true,  true,  10),
  ('productions',      'Productions',           true,  false, true,  true,  20),
  -- Grantable main areas: Studio level (studio-wide records) and per production.
  ('casting',          'Casting',               true,  true,  true,  true,  30),
  ('crew',             'Crew',                  true,  true,  true,  true,  40),
  ('scheduling',       'Scheduling',            true,  true,  true,  true,  50),
  ('locations',        'Locations',             true,  true,  true,  true,  60),
  ('documents',        'Documents',             true,  true,  true,  true,  70),
  ('communications',   'Communications',        true,  true,  true,  true,  80),
  -- Production-only sections (inside each production's workspace).
  ('script_breakdown', 'Script and Breakdown',  false, true,  false, true,  90),
  ('budget',           'Budget',                false, true,  false, true,  100),
  ('set_records',      'Set Records',           false, true,  false, true,  110),
  ('tasks',            'Tasks',                 false, true,  false, true,  120),
  -- Owner only. Never grantable.
  ('settings',         'Settings',              true,  false, false, false, 130);

-- ---------------------------------------------------------------------------
-- productions and their structure
-- ---------------------------------------------------------------------------
create table public.productions (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title           text not null check (length(btrim(title)) > 0),
  type            public.production_type not null,
  status          public.production_status not null default 'planning',
  current_stage   public.lifecycle_stage not null default 'development',
  start_date      date,
  end_date        date,
  drive_folder_id text,
  legacy_source   text,           -- e.g. 'airtable' for The Final Hand import (later step)
  created_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint productions_dates check (end_date is null or start_date is null or end_date >= start_date)
);
create trigger productions_touch before update on public.productions
  for each row execute function private.touch_updated_at();

create table public.production_stages (
  id            uuid primary key default gen_random_uuid(),
  production_id uuid not null references public.productions (id) on delete cascade,
  stage         public.lifecycle_stage not null,
  status        public.stage_status not null default 'not_started',
  started_on    date,
  completed_on  date,
  unique (production_id, stage)
);

-- Which sections a production uses. A disabled section is closed to everyone
-- except the owner, whatever their grants say.
create table public.production_sections (
  production_id uuid not null references public.productions (id) on delete cascade,
  section_key   text not null references public.sections (key),
  enabled       boolean not null default true,
  primary key (production_id, section_key)
);

-- Departments are organizing labels inside a production. Never used for access.
create table public.production_departments (
  id            uuid primary key default gen_random_uuid(),
  production_id uuid not null references public.productions (id) on delete cascade,
  name          text not null check (length(btrim(name)) > 0),
  sort          integer not null default 0,
  unique (production_id, name)
);

create index production_stages_production_idx on public.production_stages (production_id);
create index production_departments_production_idx on public.production_departments (production_id);

-- ---------------------------------------------------------------------------
-- access_grants: the permission grid. production_id null = Studio level.
-- No row = No access.
-- ---------------------------------------------------------------------------
create table public.access_grants (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  production_id uuid references public.productions (id) on delete cascade,
  section_key   text not null references public.sections (key),
  level         public.access_level not null,
  granted_by    uuid references public.profiles (id) on delete set null,
  granted_at    timestamptz not null default now(),
  constraint access_grants_one_per_cell unique nulls not distinct (user_id, production_id, section_key)
);
create index access_grants_lookup_idx on public.access_grants (user_id, section_key, production_id);
create index access_grants_production_idx on public.access_grants (production_id);

-- Reject grants that make no sense (non-grantable section, wrong scope).
create function private.validate_access_grant()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  s public.sections%rowtype;
begin
  select * into s from public.sections where key = new.section_key;
  if not s.grantable then
    raise exception 'Section "%" cannot be granted', new.section_key using errcode = 'check_violation';
  end if;
  if new.production_id is null and not s.applies_to_studio then
    raise exception 'Section "%" has no Studio level; grant it per production', new.section_key using errcode = 'check_violation';
  end if;
  if new.production_id is not null and not s.applies_to_production then
    raise exception 'Section "%" cannot be granted on a production', new.section_key using errcode = 'check_violation';
  end if;
  -- Record who granted it (the signed-in owner), whatever the client sent.
  if auth.uid() is not null then
    new.granted_by := auth.uid();
  end if;
  return new;
end;
$$;
create trigger access_grants_validate before insert or update on public.access_grants
  for each row execute function private.validate_access_grant();

-- ---------------------------------------------------------------------------
-- audit_log: written only by triggers. Readable only by the owner.
-- ---------------------------------------------------------------------------
create table public.audit_log (
  id            bigint generated always as identity primary key,
  at            timestamptz not null default now(),
  actor_id      uuid,            -- auth.uid() of the caller; null for migrations/service tasks
  action        text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  table_name    text not null,
  record_id     text,
  production_id uuid,
  old_row       jsonb,
  new_row       jsonb
);
create index audit_log_at_idx on public.audit_log (at desc);
create index audit_log_production_idx on public.audit_log (production_id);

create function private.write_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  o jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  n jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  r jsonb := coalesce(n, o);
begin
  insert into public.audit_log (actor_id, action, table_name, record_id, production_id, old_row, new_row)
  values (
    auth.uid(),
    tg_op,
    tg_table_name,
    coalesce(r ->> 'id', r ->> 'production_id'),
    case
      when tg_table_name = 'productions' then (r ->> 'id')::uuid
      else (r ->> 'production_id')::uuid
    end,
    o,
    n
  );
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Permission helpers (private schema; used by RLS policies and server code)
-- ---------------------------------------------------------------------------

-- Core rule, for any user id. Owner: always. Others: active, and holding the
-- needed level for exactly this production (or Studio level when null) and
-- section, and the section is enabled on that production.
create function private.user_has_access(
  p_user uuid, p_production uuid, p_section text, p_level public.access_level
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    p_user is not null
    and exists (
      select 1 from public.profiles p
      where p.id = p_user and p.status = 'active'
        and (
          p.is_owner
          or exists (
            select 1
            from public.access_grants g
            where g.user_id = p_user
              and g.section_key = p_section
              and g.production_id is not distinct from p_production
              and (g.level = 'edit' or p_level = 'view')
              and (
                p_production is null
                or exists (
                  select 1 from public.production_sections ps
                  where ps.production_id = p_production
                    and ps.section_key = p_section
                    and ps.enabled
                )
              )
          )
        )
    );
$$;

create function private.has_access(p_production uuid, p_section text, p_level public.access_level)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.user_has_access(auth.uid(), p_production, p_section, p_level);
$$;

create function private.is_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and is_owner and status = 'active'
  );
$$;

-- A production is visible to the owner, and to active users holding at least
-- one grant on an enabled section of it.
create function private.can_see_production(p_production uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_owner()
    or exists (
      select 1
      from public.access_grants g
      join public.profiles p on p.id = g.user_id and p.status = 'active'
      join public.production_sections ps
        on ps.production_id = g.production_id and ps.section_key = g.section_key and ps.enabled
      where g.user_id = auth.uid() and g.production_id = p_production
    );
$$;

revoke all on all functions in schema private from public;
grant execute on function private.has_access(uuid, text, public.access_level) to authenticated, service_role;
grant execute on function private.is_owner() to authenticated, service_role;
grant execute on function private.can_see_production(uuid) to authenticated, service_role;
grant execute on function private.user_has_access(uuid, uuid, text, public.access_level) to service_role;

-- ---------------------------------------------------------------------------
-- Standard rules for every section table (current and future).
--
-- A section table has a `production_id uuid` column (null = Studio-level
-- record). Calling this once installs the four policies that tie every row
-- to its production and section. New sections reuse it, so the permission
-- model never has to be rebuilt.
-- ---------------------------------------------------------------------------
create function private.apply_section_rls(p_table regclass, p_section text)
returns void
language plpgsql
set search_path = ''
as $$
declare
  t text := p_table::text;
begin
  if not exists (select 1 from public.sections where key = p_section and grantable) then
    raise exception 'Unknown or non-grantable section: %', p_section;
  end if;
  if not exists (
    select 1 from pg_attribute
    where attrelid = p_table and attname = 'production_id' and not attisdropped
  ) then
    raise exception '% has no production_id column', t;
  end if;

  execute format('alter table %s enable row level security', t);
  execute format('revoke all on %s from anon', t);
  execute format(
    'create policy section_select on %s for select to authenticated using (private.has_access(production_id, %L, ''view''))',
    t, p_section);
  execute format(
    'create policy section_insert on %s for insert to authenticated with check (private.has_access(production_id, %L, ''edit''))',
    t, p_section);
  execute format(
    'create policy section_update on %s for update to authenticated using (private.has_access(production_id, %L, ''edit'')) with check (private.has_access(production_id, %L, ''edit''))',
    t, p_section, p_section);
  execute format(
    'create policy section_delete on %s for delete to authenticated using (private.has_access(production_id, %L, ''edit''))',
    t, p_section);
end;
$$;
revoke all on function private.apply_section_rls(regclass, text) from public, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Integrity triggers
-- ---------------------------------------------------------------------------

-- New productions start with every production section enabled and all seven
-- lifecycle stages listed.
create function private.init_production()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.production_sections (production_id, section_key)
  select new.id, key from public.sections where applies_to_production and grantable;

  insert into public.production_stages (production_id, stage)
  select new.id, s from unnest(enum_range(null::public.lifecycle_stage)) as s;

  return new;
end;
$$;
create trigger productions_init after insert on public.productions
  for each row execute function private.init_production();

-- The owner can't be demoted or deactivated, and ownership can't be handed
-- out by an update.
create function private.protect_owner()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.is_owner and (not new.is_owner or new.status <> 'active') then
    raise exception 'The owner account cannot be demoted or deactivated' using errcode = 'insufficient_privilege';
  end if;
  if not old.is_owner and new.is_owner then
    raise exception 'Ownership cannot be granted by an update' using errcode = 'insufficient_privilege';
  end if;
  if new.id <> old.id then
    raise exception 'Profile id cannot change' using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;
create trigger profiles_protect_owner before update on public.profiles
  for each row execute function private.protect_owner();

create function private.protect_owner_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.is_owner then
    raise exception 'The owner account cannot be deleted' using errcode = 'insufficient_privilege';
  end if;
  return old;
end;
$$;
create trigger profiles_protect_owner_delete before delete on public.profiles
  for each row execute function private.protect_owner_delete();

-- Audit every change to access and structure.
create trigger audit_profiles after insert or update or delete on public.profiles
  for each row execute function private.write_audit();
create trigger audit_productions after insert or update or delete on public.productions
  for each row execute function private.write_audit();
create trigger audit_production_stages after insert or update or delete on public.production_stages
  for each row execute function private.write_audit();
create trigger audit_production_sections after insert or update or delete on public.production_sections
  for each row execute function private.write_audit();
create trigger audit_production_departments after insert or update or delete on public.production_departments
  for each row execute function private.write_audit();
create trigger audit_access_grants after insert or update or delete on public.access_grants
  for each row execute function private.write_audit();

-- ---------------------------------------------------------------------------
-- Privileges and Row Level Security
-- ---------------------------------------------------------------------------
revoke all on public.profiles, public.sections, public.productions, public.production_stages,
  public.production_sections, public.production_departments, public.access_grants,
  public.audit_log from anon, authenticated;

grant select, insert, update, delete on public.profiles, public.productions, public.production_stages,
  public.production_sections, public.production_departments, public.access_grants to authenticated;
grant select on public.sections, public.audit_log to authenticated;

alter table public.profiles               enable row level security;
alter table public.sections               enable row level security;
alter table public.productions            enable row level security;
alter table public.production_stages      enable row level security;
alter table public.production_sections    enable row level security;
alter table public.production_departments enable row level security;
alter table public.access_grants          enable row level security;
alter table public.audit_log              enable row level security;

-- profiles: you see yourself; the owner sees and manages everyone.
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or private.is_owner());
create policy profiles_insert on public.profiles for insert to authenticated
  with check (private.is_owner() and not is_owner);
create policy profiles_update on public.profiles for update to authenticated
  using (private.is_owner()) with check (private.is_owner());
create policy profiles_delete on public.profiles for delete to authenticated
  using (private.is_owner());

-- sections: the list itself is not sensitive; any active user may read it.
create policy sections_select on public.sections for select to authenticated
  using (exists (select 1 from public.profiles where id = auth.uid() and status = 'active'));

-- productions and their structure: visible per grants, managed by the owner.
create policy productions_select on public.productions for select to authenticated
  using (private.can_see_production(id));
create policy productions_write on public.productions for all to authenticated
  using (private.is_owner()) with check (private.is_owner());

create policy production_stages_select on public.production_stages for select to authenticated
  using (private.can_see_production(production_id));
create policy production_stages_write on public.production_stages for all to authenticated
  using (private.is_owner()) with check (private.is_owner());

create policy production_sections_select on public.production_sections for select to authenticated
  using (private.can_see_production(production_id));
create policy production_sections_write on public.production_sections for all to authenticated
  using (private.is_owner()) with check (private.is_owner());

create policy production_departments_select on public.production_departments for select to authenticated
  using (private.can_see_production(production_id));
create policy production_departments_write on public.production_departments for all to authenticated
  using (private.is_owner()) with check (private.is_owner());

-- access_grants: you see your own grants; only the owner can change any.
create policy access_grants_select on public.access_grants for select to authenticated
  using (user_id = auth.uid() or private.is_owner());
create policy access_grants_write on public.access_grants for all to authenticated
  using (private.is_owner()) with check (private.is_owner());

-- audit_log: owner reads; nobody writes directly (triggers only).
create policy audit_log_select on public.audit_log for select to authenticated
  using (private.is_owner());

-- ---------------------------------------------------------------------------
-- RPCs for the hub's server code (exposed through the Data API)
-- ---------------------------------------------------------------------------

-- The signed-in caller's own access check. Fails closed for signed-out callers.
create function public.check_access(p_production uuid, p_section text, p_level public.access_level)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select private.has_access(p_production, p_section, p_level);
$$;
revoke all on function public.check_access(uuid, text, public.access_level) from public, anon;
grant execute on function public.check_access(uuid, text, public.access_level) to authenticated;

-- Server-only check for a given user (used by integrations running with the
-- secret key, which bypasses RLS and therefore must check explicitly).
create function public.check_access_for(p_user uuid, p_production uuid, p_section text, p_level public.access_level)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select private.user_has_access(p_user, p_production, p_section, p_level);
$$;
revoke all on function public.check_access_for(uuid, uuid, text, public.access_level) from public, anon, authenticated;
grant execute on function public.check_access_for(uuid, uuid, text, public.access_level) to service_role;

-- Health summary for the Preview status page. Server-only. Contains no
-- personal data: counts and schema facts only.
create function public.system_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  migrations jsonb := '[]'::jsonb;
begin
  -- Present once migrations are applied with the Supabase CLI.
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    execute 'select coalesce(jsonb_agg(version order by version), ''[]''::jsonb) from supabase_migrations.schema_migrations'
      into migrations;
  end if;

  return jsonb_build_object(
    'migrations', migrations,
    'tables', (
      select jsonb_agg(jsonb_build_object(
        'name', c.relname,
        'rls', c.relrowsecurity,
        'policies', (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname)
      ) order by c.relname)
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
    ),
    'sections', (
      select jsonb_agg(jsonb_build_object(
        'key', key, 'label', label, 'grantable', grantable,
        'studio', applies_to_studio, 'production', applies_to_production) order by sort)
      from public.sections
    ),
    'counts', jsonb_build_object(
      'profiles', (select count(*) from public.profiles),
      'productions', (select count(*) from public.productions),
      'access_grants', (select count(*) from public.access_grants),
      'audit_log', (select count(*) from public.audit_log)
    ),
    'anon_table_privileges', (
      select count(*) from information_schema.role_table_grants
      where table_schema = 'public' and grantee = 'anon'
    )
  );
end;
$$;
revoke all on function public.system_status() from public, anon, authenticated;
grant execute on function public.system_status() to service_role;

-- Future tables in public: never give signed-out visitors anything by default.
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on functions from anon;
alter default privileges in schema public revoke all on sequences from anon;
