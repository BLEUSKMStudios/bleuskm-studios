-- BLEUSKM Studio OS: Casting.
--
-- Casting calls and roles for each production, applications from the public
-- website, materials (files in private storage, or links), review notes,
-- callbacks and auditions, email templates and a log of every email sent.
--
-- Access: every table here is a Casting section table. The standard rules
-- (private.apply_section_rls) tie each row to its production, so the owner's
-- No access / View / Edit grid decides who sees and changes what.
--
-- Public intake: signed-out visitors never get table privileges. They can only
-- call three functions: read an open casting call, submit an application, and
-- confirm the files they uploaded. Uploads go into a private bucket, only into
-- the folder of their own application, only for one hour, with size, type and
-- count limits.

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
create type public.casting_call_status as enum ('draft', 'open', 'closed');
create type public.casting_role_status as enum ('open', 'closed', 'cast');
create type public.casting_application_status as enum (
  'submitted', 'reviewing', 'shortlisted', 'callback', 'audition',
  'on_hold', 'offered', 'cast', 'not_selected', 'withdrawn'
);
create type public.casting_material_kind as enum ('headshot', 'resume', 'portfolio', 'reel', 'self_tape', 'other');
create type public.casting_session_kind as enum ('audition', 'callback', 'chemistry_read', 'self_tape');
create type public.casting_session_status as enum ('scheduled', 'completed', 'no_show', 'cancelled');
create type public.casting_message_status as enum ('sent', 'failed');

-- ---------------------------------------------------------------------------
-- Casting calls
-- ---------------------------------------------------------------------------
create table public.casting_calls (
  id              uuid primary key default gen_random_uuid(),
  production_id   uuid not null references public.productions (id) on delete cascade,
  public_slug     text not null unique check (public_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title           text not null check (length(btrim(title)) between 1 and 160),
  summary         text check (length(summary) <= 2000),
  description     text check (length(description) <= 20000),
  requirements    text check (length(requirements) <= 20000),
  instructions    text check (length(instructions) <= 5000),
  location        text check (length(location) <= 300),
  compensation    text check (length(compensation) <= 500),
  status          public.casting_call_status not null default 'draft',
  opens_at        timestamptz,
  deadline        timestamptz,
  -- Early access: before opens_at, a visitor holding one of these codes (from a
  -- private link) can already apply. Each code names a group, e.g. TFH-FAMILY.
  early_access_codes text[] not null default '{}'
    check (cardinality(early_access_codes) <= 10
       and array_to_string(early_access_codes, ',') ~ '^([A-Za-z0-9_-]{6,40}(,|$))*$'),
  created_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint casting_calls_dates check (deadline is null or opens_at is null or deadline > opens_at)
);
create index casting_calls_production_idx on public.casting_calls (production_id);
create trigger casting_calls_touch before update on public.casting_calls
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Roles
-- ---------------------------------------------------------------------------
create table public.casting_roles (
  id            uuid primary key default gen_random_uuid(),
  production_id uuid not null references public.productions (id) on delete cascade,
  call_id       uuid not null references public.casting_calls (id) on delete cascade,
  name          text not null check (length(btrim(name)) between 1 and 120),
  role_type     text check (length(role_type) <= 120),          -- e.g. Lead, Supporting, Background
  summary       text check (length(summary) <= 2000),
  description   text check (length(description) <= 10000),
  requirements  text check (length(requirements) <= 10000),
  age_min       smallint check (age_min between 0 and 120),
  age_max       smallint check (age_max between 0 and 120),
  deadline      timestamptz,                                    -- optional, overrides the call's
  status        public.casting_role_status not null default 'open',
  sort          integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint casting_roles_ages check (age_min is null or age_max is null or age_max >= age_min),
  unique (call_id, name)
);
create index casting_roles_call_idx on public.casting_roles (call_id, sort);
create index casting_roles_production_idx on public.casting_roles (production_id);
create trigger casting_roles_touch before update on public.casting_roles
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Applications (one per person per role)
-- ---------------------------------------------------------------------------
create table public.casting_applications (
  id                uuid primary key default gen_random_uuid(),
  production_id     uuid not null references public.productions (id) on delete cascade,
  call_id           uuid not null references public.casting_calls (id) on delete restrict,
  role_id           uuid not null references public.casting_roles (id) on delete restrict,
  full_name         text not null check (length(btrim(full_name)) between 1 and 200),
  email             text not null check (email = lower(email) and length(email) <= 254),
  phone             text check (length(phone) <= 40),
  age               smallint check (age between 0 and 120),
  location          text check (length(location) <= 200),
  pronouns          text check (length(pronouns) <= 60),
  about             text check (length(about) <= 5000),
  availability      text check (length(availability) <= 1000),
  source            text not null default 'website' check (source in ('website', 'hub', 'airtable')),
  access_code       text,          -- the early-access code used, if any
  status            public.casting_application_status not null default 'submitted',
  rating            smallint check (rating between 1 and 5),
  status_changed_at timestamptz not null default now(),
  upload_token      uuid,
  upload_expires_at timestamptz,
  intake_fingerprint text,         -- hashed network address, used only to slow down floods
  submitted_at      timestamptz not null default now(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create unique index casting_applications_one_per_role on public.casting_applications (role_id, email);
create index casting_applications_production_idx on public.casting_applications (production_id, status);
create index casting_applications_call_idx on public.casting_applications (call_id, role_id);
create index casting_applications_fingerprint_idx on public.casting_applications (intake_fingerprint, created_at);
create trigger casting_applications_touch before update on public.casting_applications
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Materials: a file in the private bucket, or a link
-- ---------------------------------------------------------------------------
create table public.casting_materials (
  id             uuid primary key default gen_random_uuid(),
  production_id  uuid not null references public.productions (id) on delete cascade,
  application_id uuid not null references public.casting_applications (id) on delete cascade,
  kind           public.casting_material_kind not null,
  storage_path   text check (length(storage_path) <= 500),
  url            text check (length(url) <= 1000 and url ~* '^https?://'),
  file_name      text check (length(file_name) <= 300),
  mime_type      text check (length(mime_type) <= 200),
  size_bytes     bigint,
  label          text check (length(label) <= 200),
  created_at     timestamptz not null default now(),
  constraint casting_materials_one_source check ((storage_path is null) <> (url is null))
);
create index casting_materials_application_idx on public.casting_materials (application_id);
create unique index casting_materials_path_key on public.casting_materials (storage_path) where storage_path is not null;

-- ---------------------------------------------------------------------------
-- Review notes
-- ---------------------------------------------------------------------------
create table public.casting_notes (
  id             uuid primary key default gen_random_uuid(),
  production_id  uuid not null references public.productions (id) on delete cascade,
  application_id uuid not null references public.casting_applications (id) on delete cascade,
  author_id      uuid references public.profiles (id) on delete set null,
  body           text not null check (length(btrim(body)) between 1 and 5000),
  created_at     timestamptz not null default now()
);
create index casting_notes_application_idx on public.casting_notes (application_id, created_at);

-- ---------------------------------------------------------------------------
-- Auditions, callbacks, chemistry reads, self-tape requests
-- ---------------------------------------------------------------------------
create table public.casting_sessions (
  id             uuid primary key default gen_random_uuid(),
  production_id  uuid not null references public.productions (id) on delete cascade,
  application_id uuid not null references public.casting_applications (id) on delete cascade,
  kind           public.casting_session_kind not null,
  starts_at      timestamptz,
  location       text check (length(location) <= 300),
  meeting_link   text check (length(meeting_link) <= 1000 and meeting_link ~* '^https?://'),
  status         public.casting_session_status not null default 'scheduled',
  notes          text check (length(notes) <= 5000),
  created_by     uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index casting_sessions_application_idx on public.casting_sessions (application_id);
create index casting_sessions_production_idx on public.casting_sessions (production_id, starts_at);
create trigger casting_sessions_touch before update on public.casting_sessions
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Email templates (per production) and the log of emails sent
-- ---------------------------------------------------------------------------
create table public.casting_templates (
  id            uuid primary key default gen_random_uuid(),
  production_id uuid not null references public.productions (id) on delete cascade,
  key           text not null check (key ~ '^[a-z][a-z0-9_]*$'),
  name          text not null check (length(btrim(name)) between 1 and 120),
  subject       text not null check (length(btrim(subject)) between 1 and 200),
  body          text not null check (length(btrim(body)) between 1 and 20000),
  sets_status   public.casting_application_status,   -- optional: move the applicant on send
  sort          integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (production_id, key)
);
create trigger casting_templates_touch before update on public.casting_templates
  for each row execute function private.touch_updated_at();

create table public.casting_messages (
  id             uuid primary key default gen_random_uuid(),
  production_id  uuid not null references public.productions (id) on delete cascade,
  application_id uuid not null references public.casting_applications (id) on delete cascade,
  template_id    uuid references public.casting_templates (id) on delete set null,
  to_email       text not null,
  subject        text not null,
  body           text not null,
  status         public.casting_message_status not null,
  provider_id    text,
  error          text,
  sent_by        uuid references public.profiles (id) on delete set null,
  sent_at        timestamptz not null default now()
);
create index casting_messages_application_idx on public.casting_messages (application_id, sent_at);

-- ---------------------------------------------------------------------------
-- Integrity: child rows always carry their parent's production
-- ---------------------------------------------------------------------------
create function private.casting_inherit_production()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_production uuid;
begin
  if tg_table_name = 'casting_roles' then
    select production_id into v_production from public.casting_calls where id = new.call_id;
  elsif tg_table_name = 'casting_applications' then
    select r.production_id into v_production
    from public.casting_roles r where r.id = new.role_id and r.call_id = new.call_id;
    if v_production is null then
      raise exception 'The role does not belong to this casting call' using errcode = 'check_violation';
    end if;
  else
    select production_id into v_production from public.casting_applications where id = new.application_id;
  end if;
  if v_production is null then
    raise exception 'Parent record not found' using errcode = 'foreign_key_violation';
  end if;
  if tg_op = 'UPDATE' and new.production_id is distinct from old.production_id and new.production_id <> v_production then
    raise exception 'Casting records cannot move between productions' using errcode = 'check_violation';
  end if;
  new.production_id := v_production;
  return new;
end;
$$;

create trigger casting_roles_production before insert or update on public.casting_roles
  for each row execute function private.casting_inherit_production();
create trigger casting_applications_production before insert or update of role_id, call_id, production_id on public.casting_applications
  for each row execute function private.casting_inherit_production();
create trigger casting_materials_production before insert or update on public.casting_materials
  for each row execute function private.casting_inherit_production();
create trigger casting_notes_production before insert or update on public.casting_notes
  for each row execute function private.casting_inherit_production();
create trigger casting_sessions_production before insert or update on public.casting_sessions
  for each row execute function private.casting_inherit_production();
create trigger casting_messages_production before insert or update on public.casting_messages
  for each row execute function private.casting_inherit_production();

-- Record who wrote a note / scheduled a session / sent an email, whatever the client sent.
create function private.casting_stamp_author()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is not null then
    if tg_table_name = 'casting_notes' then new.author_id := auth.uid();
    elsif tg_table_name = 'casting_messages' then new.sent_by := auth.uid();
    else new.created_by := auth.uid();
    end if;
  end if;
  return new;
end;
$$;
create trigger casting_notes_author before insert on public.casting_notes
  for each row execute function private.casting_stamp_author();
create trigger casting_sessions_author before insert on public.casting_sessions
  for each row execute function private.casting_stamp_author();
create trigger casting_messages_author before insert on public.casting_messages
  for each row execute function private.casting_stamp_author();
create trigger casting_calls_author before insert on public.casting_calls
  for each row execute function private.casting_stamp_author();

-- Notes can be removed only by their author or the owner; nobody rewrites them.
create function private.casting_protect_notes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    raise exception 'Notes cannot be edited; add a new note instead' using errcode = 'insufficient_privilege';
  end if;
  if auth.uid() is not null and old.author_id is distinct from auth.uid() and not private.is_owner() then
    raise exception 'Only the author or the owner can remove a note' using errcode = 'insufficient_privilege';
  end if;
  return old;
end;
$$;
create trigger casting_notes_protect before update or delete on public.casting_notes
  for each row execute function private.casting_protect_notes();

-- The email log is append-only for hub users.
create function private.casting_protect_messages()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is not null and not private.is_owner() then
    raise exception 'The email log cannot be changed' using errcode = 'insufficient_privilege';
  end if;
  return coalesce(new, old);
end;
$$;
create trigger casting_messages_protect before update or delete on public.casting_messages
  for each row execute function private.casting_protect_messages();

-- Keep status_changed_at honest.
create function private.casting_status_changed()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    new.status_changed_at := now();
  end if;
  return new;
end;
$$;
create trigger casting_applications_status before update on public.casting_applications
  for each row execute function private.casting_status_changed();

-- A new production gets the standard casting email templates the first time
-- a casting call is created for it. They can be edited afterwards.
create function private.casting_seed_templates()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.casting_templates where production_id = new.production_id) then
    return new;
  end if;
  insert into public.casting_templates (production_id, key, name, subject, body, sets_status, sort) values
  (new.production_id, 'received', 'Application received',
   'We received your submission for {{film}}',
   E'Hi {{first_name}},\n\nThank you for submitting for the role of {{role}} in {{film}}. Our casting team is reviewing every submission, and we will reach out directly if we would like to see more.\n\nWarmly,\nBLEUSKM Studios Casting',
   null, 10),
  (new.production_id, 'shortlist', 'Shortlisted / more materials',
   '{{film}}: next steps for {{role}}',
   E'Hi {{first_name}},\n\nThank you for your submission for {{role}} in {{film}}. We enjoyed your materials and would like to keep you in consideration.\n\n[Add what you need from them here, such as a self-tape and its deadline.]\n\nWarmly,\nBLEUSKM Studios Casting',
   'shortlisted', 20),
  (new.production_id, 'callback', 'Callback invitation',
   'Callback invitation: {{role}} in {{film}}',
   E'Hi {{first_name}},\n\nWe would love to see you for a callback for the role of {{role}} in {{film}}.\n\nWhen: {{session_time}}\nWhere: {{session_location}}\n\nPlease reply to this email to confirm.\n\nWarmly,\nBLEUSKM Studios Casting',
   'callback', 30),
  (new.production_id, 'audition', 'Audition scheduled',
   'Your audition for {{film}}',
   E'Hi {{first_name}},\n\nYour audition for {{role}} in {{film}} is scheduled.\n\nWhen: {{session_time}}\nWhere: {{session_location}}\n\nPlease reply to this email to confirm, or let us know if you need another time.\n\nWarmly,\nBLEUSKM Studios Casting',
   'audition', 40),
  (new.production_id, 'offer', 'Role offer',
   'An offer for {{role}} in {{film}}',
   E'Hi {{first_name}},\n\nWe are thrilled to offer you the role of {{role}} in {{film}}.\n\n[Add the next steps here.]\n\nWarmly,\nBLEUSKM Studios Casting',
   'offered', 50),
  (new.production_id, 'not_selected', 'Not selected',
   'Your submission for {{film}}',
   E'Hi {{first_name}},\n\nThank you for your interest in {{film}} and for the time you put into your submission for {{role}}. We have decided to move forward with other talent for this role.\n\nWe would love to see you for future BLEUSKM productions.\n\nWarmly,\nBLEUSKM Studios Casting',
   'not_selected', 60);
  return new;
end;
$$;
create trigger casting_calls_seed_templates after insert on public.casting_calls
  for each row execute function private.casting_seed_templates();

-- ---------------------------------------------------------------------------
-- Privileges, Row Level Security and audit
-- ---------------------------------------------------------------------------
revoke all on public.casting_calls, public.casting_roles, public.casting_applications,
  public.casting_materials, public.casting_notes, public.casting_sessions,
  public.casting_templates, public.casting_messages from anon, authenticated;
grant select, insert, update, delete on public.casting_calls, public.casting_roles,
  public.casting_applications, public.casting_materials, public.casting_notes,
  public.casting_sessions, public.casting_templates, public.casting_messages to authenticated;

select private.apply_section_rls('public.casting_calls', 'casting');
select private.apply_section_rls('public.casting_roles', 'casting');
select private.apply_section_rls('public.casting_applications', 'casting');
select private.apply_section_rls('public.casting_materials', 'casting');
select private.apply_section_rls('public.casting_notes', 'casting');
select private.apply_section_rls('public.casting_sessions', 'casting');
select private.apply_section_rls('public.casting_templates', 'casting');
select private.apply_section_rls('public.casting_messages', 'casting');

-- The upload token is a short-lived secret for the applicant's browser only.
-- Hub users never need it, so they can't read it.
revoke select on public.casting_applications from authenticated;
grant select (id, production_id, call_id, role_id, full_name, email, phone, age, location, pronouns,
  about, availability, source, access_code, status, rating, status_changed_at, submitted_at, created_at, updated_at)
  on public.casting_applications to authenticated;
revoke update on public.casting_applications from authenticated;
grant update (full_name, email, phone, age, location, pronouns, about, availability, status, rating)
  on public.casting_applications to authenticated;

create trigger audit_casting_calls after insert or update or delete on public.casting_calls
  for each row execute function private.write_audit();
create trigger audit_casting_roles after insert or update or delete on public.casting_roles
  for each row execute function private.write_audit();
create trigger audit_casting_applications after update or delete on public.casting_applications
  for each row execute function private.write_audit();
create trigger audit_casting_sessions after insert or update or delete on public.casting_sessions
  for each row execute function private.write_audit();
create trigger audit_casting_templates after insert or update or delete on public.casting_templates
  for each row execute function private.write_audit();

-- ---------------------------------------------------------------------------
-- Private storage for applicant files
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name) values ('casting-materials', 'casting-materials')
on conflict (id) do nothing;

-- Size and type limits (these columns exist on hosted Supabase Storage).
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'storage' and table_name = 'buckets' and column_name = 'file_size_limit') then
    execute $q$update storage.buckets set public = false, file_size_limit = 10485760,
      allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
        'application/pdf', 'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
      where id = 'casting-materials'$q$;
  end if;
end;
$$;

-- Applications can be deleted only by the owner (Edit lets crew review, not erase).
drop policy section_delete on public.casting_applications;
create policy casting_applications_delete on public.casting_applications for delete to authenticated
  using (private.is_owner());

-- Storage policies call these helpers as the visitor's own role, so they live
-- in a small schema of their own instead of `private` (which signed-out
-- visitors must never be able to use). The schema is not exposed by the Data API.
create schema if not exists intake_guard;
revoke all on schema intake_guard from public;
grant usage on schema intake_guard to anon, authenticated, service_role;

-- Path layout: intake/<application id>/<upload token>/<file name>
create function intake_guard.casting_upload_allowed(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  parts text[] := string_to_array(p_name, '/');
  uuid_re constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
begin
  if array_length(parts, 1) <> 4 or parts[1] <> 'intake'
     or parts[2] !~ uuid_re or parts[3] !~ uuid_re
     or length(parts[4]) not between 1 and 200 or parts[4] ~ '^\.' then
    return false;
  end if;
  return exists (
    select 1 from public.casting_applications a
    where a.id = parts[2]::uuid and a.upload_token = parts[3]::uuid and a.upload_expires_at > now()
  ) and (
    select count(*) from storage.objects o
    where o.bucket_id = 'casting-materials' and o.name like 'intake/' || parts[2] || '/%'
  ) < 8;
end;
$$;

-- Hub users see an applicant's files when they can view Casting on that production.
create function intake_guard.casting_object_access(p_name text, p_level public.access_level)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  parts text[] := string_to_array(p_name, '/');
  v_production uuid;
begin
  if auth.uid() is null or array_length(parts, 1) < 3 or parts[1] <> 'intake'
     or parts[2] !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  select production_id into v_production from public.casting_applications where id = parts[2]::uuid;
  return v_production is not null and private.has_access(v_production, 'casting', p_level);
end;
$$;

revoke all on function intake_guard.casting_upload_allowed(text) from public;
revoke all on function intake_guard.casting_object_access(text, public.access_level) from public;
grant execute on function intake_guard.casting_upload_allowed(text) to anon, authenticated, service_role;
grant execute on function intake_guard.casting_object_access(text, public.access_level) to authenticated, service_role;

create policy casting_intake_upload on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'casting-materials' and intake_guard.casting_upload_allowed(name));
create policy casting_staff_read on storage.objects for select to authenticated
  using (bucket_id = 'casting-materials' and intake_guard.casting_object_access(name, 'view'));
create policy casting_staff_delete on storage.objects for delete to authenticated
  using (bucket_id = 'casting-materials' and intake_guard.casting_object_access(name, 'edit'));

-- ---------------------------------------------------------------------------
-- Public intake functions (the only things signed-out visitors can call)
-- ---------------------------------------------------------------------------

-- Is a casting call taking submissions right now, for this visitor?
-- Before the public opening time, only a valid early-access code lets someone in.
create function private.casting_call_is_open(c public.casting_calls, p_access text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select c.status = 'open'
    and (c.deadline is null or c.deadline > now())
    and (c.opens_at is null or c.opens_at <= now()
         or (coalesce(p_access, '') <> '' and p_access = any (c.early_access_codes)));
$$;

-- An open (or closed, never draft) casting call and its roles, public fields only.
create function public.casting_public_call(p_slug text, p_access text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  c public.casting_calls%rowtype;
  v_open boolean;
begin
  select * into c from public.casting_calls where public_slug = p_slug and status <> 'draft';
  if not found then
    return jsonb_build_object('found', false);
  end if;
  v_open := private.casting_call_is_open(c, p_access);
  return jsonb_build_object(
    'found', true,
    'open', v_open,
    'early_access', v_open and c.opens_at is not null and c.opens_at > now(),
    'slug', c.public_slug,
    'title', c.title,
    'film', (select title from public.productions where id = c.production_id),
    'summary', c.summary,
    'description', c.description,
    'requirements', c.requirements,
    'instructions', c.instructions,
    'location', c.location,
    'compensation', c.compensation,
    'opens_at', c.opens_at,
    'deadline', c.deadline,
    'roles', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'name', r.name, 'role_type', r.role_type, 'summary', r.summary,
        'description', r.description, 'requirements', r.requirements,
        'age_min', r.age_min, 'age_max', r.age_max, 'deadline', r.deadline,
        'open', v_open and r.status = 'open' and (r.deadline is null or r.deadline > now())
      ) order by r.sort, r.name)
      from public.casting_roles r
      where r.call_id = c.id and r.status <> 'closed'
    ), '[]'::jsonb)
  );
end;
$$;

-- Submit an application. Returns the application id and a one-hour upload
-- token for the applicant's files, or { ok: false, error: <code> }.
create function public.casting_apply(p jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  c public.casting_calls%rowtype;
  r public.casting_roles%rowtype;
  v_name text := btrim(coalesce(p ->> 'full_name', ''));
  v_email text := lower(btrim(coalesce(p ->> 'email', '')));
  v_age_text text := btrim(coalesce(p ->> 'age', ''));
  v_age smallint;
  v_fp text;
  v_id uuid;
  v_token uuid := gen_random_uuid();
  v_link jsonb;
  v_links int := 0;
  v_url text;
  v_kind text;
begin
  if p is null or jsonb_typeof(p) <> 'object' then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;

  select * into c from public.casting_calls where public_slug = p ->> 'call';
  if not found or not private.casting_call_is_open(c, p ->> 'access') then
    return jsonb_build_object('ok', false, 'error', 'casting_closed');
  end if;
  if coalesce(p ->> 'role_id', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return jsonb_build_object('ok', false, 'error', 'role_required');
  end if;
  select * into r from public.casting_roles where id = (p ->> 'role_id')::uuid and call_id = c.id;
  if not found or r.status <> 'open' or (r.deadline is not null and r.deadline <= now()) then
    return jsonb_build_object('ok', false, 'error', 'role_closed');
  end if;

  if length(v_name) not between 1 and 200 then
    return jsonb_build_object('ok', false, 'error', 'name_required');
  end if;
  if length(v_email) > 254 or v_email !~ '^[^\s@<>()\[\]\\,;:"]+@[^\s@<>()\[\]\\,;:"]+\.[a-z]{2,}$' then
    return jsonb_build_object('ok', false, 'error', 'invalid_email');
  end if;
  if v_age_text <> '' then
    if v_age_text !~ '^\d{1,3}$' or v_age_text::int > 120 then
      return jsonb_build_object('ok', false, 'error', 'invalid_age');
    end if;
    v_age := v_age_text::smallint;
  end if;
  if length(coalesce(p ->> 'about', '')) > 5000 or length(coalesce(p ->> 'location', '')) > 200
     or length(coalesce(p ->> 'phone', '')) > 40 or length(coalesce(p ->> 'pronouns', '')) > 60
     or length(coalesce(p ->> 'availability', '')) > 1000 then
    return jsonb_build_object('ok', false, 'error', 'too_long');
  end if;
  if p ? 'links' and (jsonb_typeof(p -> 'links') <> 'array' or jsonb_array_length(p -> 'links') > 6) then
    return jsonb_build_object('ok', false, 'error', 'invalid_links');
  end if;
  for v_link in select * from jsonb_array_elements(coalesce(p -> 'links', '[]'::jsonb)) loop
    v_url := btrim(coalesce(v_link ->> 'url', ''));
    v_kind := coalesce(v_link ->> 'kind', '');
    if v_url = '' then continue; end if;
    if length(v_url) > 1000 or v_url !~* '^https?://[^\s]+$'
       or v_kind not in ('headshot', 'resume', 'portfolio', 'reel', 'self_tape', 'other') then
      return jsonb_build_object('ok', false, 'error', 'invalid_links');
    end if;
  end loop;

  -- Slow down floods from one network address (about 20 submissions an hour).
  v_fp := md5('bleuskm-casting:' || coalesce(
    split_part(coalesce(current_setting('request.headers', true), '{}')::jsonb ->> 'x-forwarded-for', ',', 1), ''));
  if (select count(*) from public.casting_applications
      where intake_fingerprint = v_fp and created_at > now() - interval '1 hour') >= 20 then
    return jsonb_build_object('ok', false, 'error', 'too_many');
  end if;

  if exists (select 1 from public.casting_applications where role_id = r.id and email = v_email) then
    return jsonb_build_object('ok', false, 'error', 'already_applied');
  end if;

  insert into public.casting_applications (
    production_id, call_id, role_id, full_name, email, phone, age, location, pronouns, about,
    availability, source, access_code, upload_token, upload_expires_at, intake_fingerprint
  ) values (
    c.production_id, c.id, r.id, v_name, v_email,
    nullif(btrim(coalesce(p ->> 'phone', '')), ''), v_age,
    nullif(btrim(coalesce(p ->> 'location', '')), ''),
    nullif(btrim(coalesce(p ->> 'pronouns', '')), ''),
    nullif(btrim(coalesce(p ->> 'about', '')), ''),
    nullif(btrim(coalesce(p ->> 'availability', '')), ''),
    'website',
    case when c.opens_at is not null and c.opens_at > now() then p ->> 'access' end,
    v_token, now() + interval '1 hour', v_fp
  ) returning id into v_id;

  for v_link in select * from jsonb_array_elements(coalesce(p -> 'links', '[]'::jsonb)) loop
    v_url := btrim(coalesce(v_link ->> 'url', ''));
    if v_url = '' then continue; end if;
    insert into public.casting_materials (production_id, application_id, kind, url, label)
    values (c.production_id, v_id, (v_link ->> 'kind')::public.casting_material_kind, v_url,
            nullif(left(btrim(coalesce(v_link ->> 'label', '')), 200), ''));
  end loop;

  return jsonb_build_object(
    'ok', true,
    'id', v_id,
    'upload_token', v_token,
    'upload_prefix', 'intake/' || v_id || '/' || v_token || '/',
    'film', (select title from public.productions where id = c.production_id),
    'role', r.name
  );
end;
$$;

-- Confirm the files the applicant uploaded and close the upload window.
create function public.casting_attach_files(p_id uuid, p_token uuid, p_files jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  a public.casting_applications%rowtype;
  v_prefix text;
  f jsonb;
  o record;
  v_kind text;
  v_count int := 0;
begin
  select * into a from public.casting_applications
  where id = p_id and upload_token = p_token and upload_expires_at > now();
  if not found then
    return jsonb_build_object('ok', false, 'error', 'upload_expired');
  end if;
  if p_files is null or jsonb_typeof(p_files) <> 'array' or jsonb_array_length(p_files) > 8 then
    return jsonb_build_object('ok', false, 'error', 'invalid_files');
  end if;
  v_prefix := 'intake/' || a.id || '/' || a.upload_token || '/';

  for f in select * from jsonb_array_elements(p_files) loop
    v_kind := coalesce(f ->> 'kind', '');
    if v_kind not in ('headshot', 'resume', 'portfolio', 'other') then continue; end if;
    if left(coalesce(f ->> 'path', ''), length(v_prefix)) <> v_prefix then continue; end if;
    select name, metadata into o from storage.objects
    where bucket_id = 'casting-materials' and name = f ->> 'path';
    if not found then continue; end if;
    insert into public.casting_materials (production_id, application_id, kind, storage_path, file_name, mime_type, size_bytes)
    values (
      a.production_id, a.id, v_kind::public.casting_material_kind, o.name,
      left(coalesce(nullif(btrim(f ->> 'name'), ''), split_part(o.name, '/', 4)), 300),
      left(o.metadata ->> 'mimetype', 200),
      case when (o.metadata ->> 'size') ~ '^\d+$' then (o.metadata ->> 'size')::bigint end
    )
    on conflict (storage_path) where storage_path is not null do nothing;
    v_count := v_count + 1;
  end loop;

  update public.casting_applications set upload_token = null, upload_expires_at = null where id = a.id;
  return jsonb_build_object('ok', true, 'files', v_count);
end;
$$;

revoke all on function private.casting_call_is_open(public.casting_calls, text) from public;
grant execute on function private.casting_call_is_open(public.casting_calls, text) to service_role;
revoke all on function public.casting_public_call(text, text) from public;
revoke all on function public.casting_apply(jsonb) from public;
revoke all on function public.casting_attach_files(uuid, uuid, jsonb) from public;
grant execute on function public.casting_public_call(text, text) to anon, authenticated, service_role;
grant execute on function public.casting_apply(jsonb) to anon, authenticated, service_role;
grant execute on function public.casting_attach_files(uuid, uuid, jsonb) to anon, authenticated, service_role;
revoke all on function private.casting_inherit_production() from public;
revoke all on function private.casting_seed_templates() from public;
revoke all on function private.casting_protect_notes() from public;
