-- Studio OS reorganization: the production modules behind the lifecycle menu.
--
-- Adds the records for Development, Pre-Production, Production,
-- Post-Production, Distribution and Studio Operations, plus the bookkeeping
-- for the Final Hand import (source ids, migration runs, private files).
--
-- Every table is a section table: it has a production_id (null = Studio
-- level where the section allows it) and gets the standard four policies from
-- private.apply_section_rls, so the owner's No/View/Edit grid covers it with
-- no new permission code. Additive only: nothing existing is dropped or moved.

-- ---------------------------------------------------------------------------
-- Sections: four new permission units, two clearer labels
-- ---------------------------------------------------------------------------
insert into public.sections
  (key, label, in_main_menu, grantable, applies_to_studio, applies_to_production, sort) values
  ('development',  'Development Resources',  true, true, true,  true,  82),
  ('contacts',     'Contacts',               true, true, true,  false, 84),
  ('post',         'Post-Production',        true, true, false, true,  115),
  ('distribution', 'Distribution',           true, true, false, true,  117)
on conflict (key) do nothing;

update public.sections set label = 'Scripts and Treatments' where key = 'script_breakdown';
update public.sections set label = 'Production Tracking'    where key = 'tasks';

-- Existing productions get the new production sections switched on (new
-- productions get them from private.init_production automatically).
insert into public.production_sections (production_id, section_key)
select p.id, s.key
from public.productions p
cross join public.sections s
where s.key in ('development', 'post', 'distribution')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------

-- Imported rows remember where they came from (e.g. 'airtable:tbl9V7tnVsuccyNsv'
-- + the Airtable record id). The pair is unique, so re-running an import
-- updates instead of duplicating.
create function private.check_source()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.source is null) <> (new.source_id is null) then
    raise exception 'source and source_id go together' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

-- Record who created a row (the signed-in person), whatever the client sent.
create function private.stamp_created_by()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then new.created_by := auth.uid(); end if;
  else
    new.created_by := old.created_by;
  end if;
  return new;
end;
$$;

-- Installs the shared columns' triggers and the standard RLS on one table.
create function private.setup_module_table(p_table regclass, p_section text)
returns void
language plpgsql
set search_path = ''
as $$
declare
  t text := p_table::text;
  n text := replace(split_part(p_table::text, '.', 2), '"', '');
begin
  execute format('create trigger %I before update on %s for each row execute function private.touch_updated_at()', n || '_touch', t);
  execute format('create trigger %I before insert or update on %s for each row execute function private.check_source()', n || '_source', t);
  execute format('create trigger %I before insert or update on %s for each row execute function private.stamp_created_by()', n || '_author', t);
  execute format('create trigger %I after insert or update or delete on %s for each row execute function private.write_audit()', 'audit_' || n, t);
  execute format('create unique index %I on %s (source, source_id) where source is not null', n || '_source_key', t);
  execute format('create index %I on %s (production_id)', n || '_production_idx', t);
  execute format('revoke all on %s from anon, authenticated', t);
  execute format('grant select, insert, update, delete on %s to authenticated', t);
  perform private.apply_section_rls(p_table, p_section);
end;
$$;
revoke all on function private.setup_module_table(regclass, text) from public, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Studio Operations: Contacts (Studio level only)
-- ---------------------------------------------------------------------------
create table public.contacts (
  id            uuid primary key default gen_random_uuid(),
  production_id uuid references public.productions (id) on delete cascade
                check (production_id is null),          -- contacts are studio-wide
  full_name     text not null check (length(btrim(full_name)) between 1 and 200),
  kind          text not null default 'person' check (kind in ('person', 'company')),
  category      text not null default 'crew' check (category in ('crew', 'cast', 'client', 'vendor', 'location', 'festival', 'press', 'other')),
  company       text check (length(company) <= 200),
  roles         text check (length(roles) <= 500),
  email         text check (email = lower(email) and length(email) <= 254),
  phone         text check (length(phone) <= 40),
  city          text check (length(city) <= 200),
  website       text check (length(website) <= 1000 and website ~* '^https?://'),
  notes         text check (length(notes) <= 10000),
  source        text check (length(source) <= 100),
  source_id     text check (length(source_id) <= 100),
  created_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index contacts_email_idx on public.contacts (email);
select private.setup_module_table('public.contacts', 'contacts');

-- ---------------------------------------------------------------------------
-- Development
-- ---------------------------------------------------------------------------
-- Scripts & Treatments (section script_breakdown)
create table public.scripts (
  id            uuid primary key default gen_random_uuid(),
  production_id uuid not null references public.productions (id) on delete cascade,
  title         text not null check (length(btrim(title)) between 1 and 200),
  kind          text not null default 'script' check (kind in ('script', 'treatment', 'outline', 'pitch', 'breakdown', 'shot_list', 'other')),
  version       text check (length(version) <= 40),
  draft_date    date,
  status        text not null default 'draft' check (status in ('draft', 'in_review', 'locked', 'archived')),
  drive_url     text check (length(drive_url) <= 1000 and drive_url ~* '^https?://'),
  storage_path  text check (length(storage_path) <= 500),
  notes         text check (length(notes) <= 10000),
  source        text check (length(source) <= 100),
  source_id     text check (length(source_id) <= 100),
  created_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
select private.setup_module_table('public.scripts', 'script_breakdown');

-- Development resources (research, lookbooks, references). Studio level allowed.
create table public.dev_resources (
  id            uuid primary key default gen_random_uuid(),
  production_id uuid references public.productions (id) on delete cascade,
  title         text not null check (length(btrim(title)) between 1 and 200),
  kind          text not null default 'reference' check (kind in ('research', 'lookbook', 'reference', 'pitch_deck', 'mood_board', 'rights', 'other')),
  url           text check (length(url) <= 1000 and url ~* '^https?://'),
  notes         text check (length(notes) <= 10000),
  source        text check (length(source) <= 100),
  source_id     text check (length(source_id) <= 100),
  created_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
select private.setup_module_table('public.dev_resources', 'development');

-- ---------------------------------------------------------------------------
-- Pre-Production
-- ---------------------------------------------------------------------------
-- Crew: the team on a production. Name and contact details are kept on the
-- row (people with Crew access may not have Contacts access); contact_id
-- links back to the studio contact when there is one.
create table public.production_team (
  id            uuid primary key default gen_random_uuid(),
  production_id uuid not null references public.productions (id) on delete cascade,
  contact_id    uuid references public.contacts (id) on delete set null,
  full_name     text not null check (length(btrim(full_name)) between 1 and 200),
  position      text not null check (length(btrim(position)) between 1 and 200),
  team          text not null default 'crew' check (team in ('crew', 'cast', 'producer', 'other')),
  department    text check (length(department) <= 120),   -- a label only, never used for access
  status        text not null default 'confirmed' check (status in ('prospect', 'offered', 'confirmed', 'wrapped', 'released')),
  email         text check (email = lower(email) and length(email) <= 254),
  phone         text check (length(phone) <= 40),
  notes         text check (length(notes) <= 5000),
  source        text check (length(source) <= 100),
  source_id     text check (length(source_id) <= 100),
  created_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
select private.setup_module_table('public.production_team', 'crew');

create table public.locations (
  id            uuid primary key default gen_random_uuid(),
  production_id uuid references public.productions (id) on delete cascade,
  name          text not null check (length(btrim(name)) between 1 and 200),
  address       text check (length(address) <= 1000),
  contact_name  text check (length(contact_name) <= 200),
  phone         text check (length(phone) <= 40),
  email         text check (email = lower(email) and length(email) <= 254),
  status        text not null default 'scouting' check (status in ('scouting', 'pending', 'confirmed', 'declined', 'wrapped')),
  drive_url     text check (length(drive_url) <= 1000 and drive_url ~* '^https?://'),
  notes         text check (length(notes) <= 10000),
  source        text check (length(source) <= 100),
  source_id     text check (length(source_id) <= 100),
  created_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
select private.setup_module_table('public.locations', 'locations');

-- Scheduling: milestones, meetings, deadlines and shoot days.
create table public.schedule_events (
  id            uuid primary key default gen_random_uuid(),
  production_id uuid references public.productions (id) on delete cascade,
  title         text not null check (length(btrim(title)) between 1 and 200),
  kind          text not null default 'milestone' check (kind in ('milestone', 'meeting', 'deadline', 'shoot_day', 'callback', 'other')),
  starts_on     date,
  ends_on       date,
  start_time    time,
  date_label    text check (length(date_label) <= 120),   -- free text, e.g. "Week of July 12"
  department    text check (length(department) <= 120),   -- a label only
  status        text not null default 'upcoming' check (status in ('upcoming', 'active', 'complete', 'cancelled')),
  location_id   uuid references public.locations (id) on delete set null,
  description   text check (length(description) <= 10000),
  sort          integer not null default 0,
  source        text check (length(source) <= 100),
  source_id     text check (length(source_id) <= 100),
  created_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint schedule_events_dates check (ends_on is null or starts_on is null or ends_on >= starts_on)
);
create index schedule_events_starts_idx on public.schedule_events (starts_on);
select private.setup_module_table('public.schedule_events', 'scheduling');

-- Documents (contracts, releases, permits, reports). Files live in Google
-- Drive (link) or the private production-files bucket (storage_path).
create table public.documents (
  id             uuid primary key default gen_random_uuid(),
  production_id  uuid references public.productions (id) on delete cascade,
  title          text not null check (length(btrim(title)) between 1 and 200),
  category       text not null default 'other' check (category in ('contract', 'release', 'permit', 'insurance', 'schedule', 'report', 'guide', 'other')),
  contract_type  text check (length(contract_type) <= 120),
  status         text not null default 'draft' check (status in ('draft', 'sent', 'signed', 'filed', 'expired', 'void')),
  signer_name    text check (length(signer_name) <= 200),
  signer_email   text check (signer_email = lower(signer_email) and length(signer_email) <= 254),
  signer_role    text check (length(signer_role) <= 200),
  signed_on      date,
  contact_id     uuid references public.contacts (id) on delete set null,
  drive_url      text check (length(drive_url) <= 1000 and drive_url ~* '^https?://'),
  storage_path   text check (length(storage_path) <= 500),
  details        text check (length(details) <= 10000),
  source         text check (length(source) <= 100),
  source_id      text check (length(source_id) <= 100),
  created_by     uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
select private.setup_module_table('public.documents', 'documents');

-- ---------------------------------------------------------------------------
-- Production
-- ---------------------------------------------------------------------------
create table public.call_sheets (
  id              uuid primary key default gen_random_uuid(),
  production_id   uuid not null references public.productions (id) on delete cascade,
  shoot_date      date not null,
  title           text not null check (length(btrim(title)) between 1 and 200),
  general_call    time,
  location_id     uuid references public.locations (id) on delete set null,
  location_text   text check (length(location_text) <= 500),
  parking         text check (length(parking) <= 2000),
  nearest_hospital text check (length(nearest_hospital) <= 1000),
  weather         text check (length(weather) <= 500),
  schedule        text check (length(schedule) <= 10000),
  notes           text check (length(notes) <= 10000),
  status          text not null default 'draft' check (status in ('draft', 'final', 'sent')),
  source          text check (length(source) <= 100),
  source_id       text check (length(source_id) <= 100),
  created_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
select private.setup_module_table('public.call_sheets', 'scheduling');

-- One line per person on a call sheet. Always carries the sheet's production.
create table public.call_sheet_entries (
  id             uuid primary key default gen_random_uuid(),
  production_id  uuid not null references public.productions (id) on delete cascade,
  call_sheet_id  uuid not null references public.call_sheets (id) on delete cascade,
  full_name      text not null check (length(btrim(full_name)) between 1 and 200),
  position       text check (length(position) <= 200),
  call_time      time,
  notes          text check (length(notes) <= 2000),
  sort           integer not null default 0,
  source         text check (length(source) <= 100),
  source_id      text check (length(source_id) <= 100),
  created_by     uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index call_sheet_entries_sheet_idx on public.call_sheet_entries (call_sheet_id, sort);
select private.setup_module_table('public.call_sheet_entries', 'scheduling');

create function private.call_sheet_entry_production()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v uuid;
begin
  select production_id into v from public.call_sheets where id = new.call_sheet_id;
  if v is null then
    raise exception 'Call sheet not found' using errcode = 'foreign_key_violation';
  end if;
  new.production_id := v;
  return new;
end;
$$;
create trigger call_sheet_entries_production before insert or update on public.call_sheet_entries
  for each row execute function private.call_sheet_entry_production();

-- Production Tracking (section tasks)
create table public.production_tasks (
  id            uuid primary key default gen_random_uuid(),
  production_id uuid not null references public.productions (id) on delete cascade,
  title         text not null check (length(btrim(title)) between 1 and 200),
  description   text check (length(description) <= 10000),
  stage         public.lifecycle_stage,
  assignee      text check (length(assignee) <= 200),
  status        text not null default 'todo' check (status in ('todo', 'in_progress', 'blocked', 'done')),
  due_on        date,
  completed_on  date,
  source        text check (length(source) <= 100),
  source_id     text check (length(source_id) <= 100),
  created_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index production_tasks_due_idx on public.production_tasks (due_on);
select private.setup_module_table('public.production_tasks', 'tasks');

-- Production notes and set records (portal notes, sound moments, casting
-- notes, continuity). Replies point at their parent note.
create table public.production_notes (
  id            uuid primary key default gen_random_uuid(),
  production_id uuid not null references public.productions (id) on delete cascade,
  parent_id     uuid references public.production_notes (id) on delete cascade,
  title         text not null check (length(btrim(title)) between 1 and 200),
  body          text check (length(body) <= 20000),
  category      text not null default 'general' check (category in ('general', 'announcement', 'sound', 'camera', 'continuity', 'casting', 'take_log', 'other')),
  audience      text check (length(audience) <= 120),
  author_name   text check (length(author_name) <= 200),
  status        text not null default 'open' check (status in ('open', 'resolved', 'archived')),
  noted_at      timestamptz not null default now(),
  source        text check (length(source) <= 100),
  source_id     text check (length(source_id) <= 100),
  created_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
select private.setup_module_table('public.production_notes', 'set_records');

-- ---------------------------------------------------------------------------
-- Post-Production
-- ---------------------------------------------------------------------------
create table public.edit_milestones (
  id            uuid primary key default gen_random_uuid(),
  production_id uuid not null references public.productions (id) on delete cascade,
  title         text not null check (length(btrim(title)) between 1 and 200),
  phase         text not null default 'edit' check (phase in ('assembly', 'rough_cut', 'fine_cut', 'picture_lock', 'edit', 'color', 'sound', 'music', 'vfx', 'titles', 'final')),
  status        text not null default 'not_started' check (status in ('not_started', 'in_progress', 'in_review', 'approved')),
  owner_name    text check (length(owner_name) <= 200),
  due_on        date,
  completed_on  date,
  review_url    text check (length(review_url) <= 1000 and review_url ~* '^https?://'),
  notes         text check (length(notes) <= 10000),
  source        text check (length(source) <= 100),
  source_id     text check (length(source_id) <= 100),
  created_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
select private.setup_module_table('public.edit_milestones', 'post');

create table public.deliverables (
  id            uuid primary key default gen_random_uuid(),
  production_id uuid not null references public.productions (id) on delete cascade,
  name          text not null check (length(btrim(name)) between 1 and 200),
  kind          text not null default 'video' check (kind in ('video', 'audio', 'subtitles', 'artwork', 'trailer', 'stills', 'press_kit', 'paperwork', 'other')),
  spec          text check (length(spec) <= 2000),
  recipient     text check (length(recipient) <= 200),
  status        text not null default 'not_started' check (status in ('not_started', 'in_progress', 'ready', 'delivered', 'accepted')),
  due_on        date,
  delivered_on  date,
  file_url      text check (length(file_url) <= 1000 and file_url ~* '^https?://'),
  notes         text check (length(notes) <= 10000),
  source        text check (length(source) <= 100),
  source_id     text check (length(source_id) <= 100),
  created_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
select private.setup_module_table('public.deliverables', 'post');

-- ---------------------------------------------------------------------------
-- Distribution
-- ---------------------------------------------------------------------------
create table public.festival_submissions (
  id               uuid primary key default gen_random_uuid(),
  production_id    uuid not null references public.productions (id) on delete cascade,
  festival         text not null check (length(btrim(festival)) between 1 and 200),
  category         text check (length(category) <= 200),
  platform         text check (length(platform) <= 120),       -- e.g. FilmFreeway
  deadline         date,
  submitted_on     date,
  notification_on  date,
  event_dates      text check (length(event_dates) <= 120),
  status           text not null default 'researching' check (status in ('researching', 'planned', 'submitted', 'accepted', 'declined', 'withdrawn')),
  url              text check (length(url) <= 1000 and url ~* '^https?://'),
  notes            text check (length(notes) <= 10000),
  source           text check (length(source) <= 100),
  source_id        text check (length(source_id) <= 100),
  created_by       uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index festival_submissions_deadline_idx on public.festival_submissions (deadline);
select private.setup_module_table('public.festival_submissions', 'distribution');

create table public.releases (
  id            uuid primary key default gen_random_uuid(),
  production_id uuid not null references public.productions (id) on delete cascade,
  title         text not null check (length(btrim(title)) between 1 and 200),
  channel       text not null default 'online' check (channel in ('online', 'streaming', 'theatrical', 'screening', 'premiere', 'broadcast', 'social', 'other')),
  platform      text check (length(platform) <= 200),
  release_on    date,
  status        text not null default 'planned' check (status in ('planned', 'scheduled', 'released', 'cancelled')),
  url           text check (length(url) <= 1000 and url ~* '^https?://'),
  notes         text check (length(notes) <= 10000),
  source        text check (length(source) <= 100),
  source_id     text check (length(source_id) <= 100),
  created_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
select private.setup_module_table('public.releases', 'distribution');

-- ---------------------------------------------------------------------------
-- Communications history (Zoho, Brevo and the hub). Studio level allowed.
-- ---------------------------------------------------------------------------
create table public.comm_messages (
  id            uuid primary key default gen_random_uuid(),
  production_id uuid references public.productions (id) on delete cascade,
  direction     text not null default 'outbound' check (direction in ('outbound', 'inbound')),
  channel       text not null default 'hub' check (channel in ('hub', 'brevo', 'zoho', 'portal')),
  from_address  text check (length(from_address) <= 254),
  to_addresses  text check (length(to_addresses) <= 5000),
  subject       text check (length(subject) <= 500),
  body          text check (length(body) <= 100000),
  status        text not null default 'logged' check (status in ('logged', 'sent', 'failed', 'blocked', 'received')),
  sent_by_name  text check (length(sent_by_name) <= 200),
  sent_at       timestamptz,
  provider_id   text check (length(provider_id) <= 300),
  source        text check (length(source) <= 100),
  source_id     text check (length(source_id) <= 100),
  created_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index comm_messages_sent_idx on public.comm_messages (sent_at desc);
select private.setup_module_table('public.comm_messages', 'communications');

-- ---------------------------------------------------------------------------
-- Migration runs (Final Hand import and later imports). Owner reads only;
-- written by the import job with the service role.
-- ---------------------------------------------------------------------------
create table public.migration_runs (
  id           bigint generated always as identity primary key,
  name         text not null check (length(name) <= 120),
  mode         text not null check (mode in ('dry_run', 'apply', 'validate')),
  status       text not null check (status in ('running', 'succeeded', 'failed')),
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  summary      jsonb not null default '{}'::jsonb
);
revoke all on public.migration_runs from anon, authenticated;
grant select on public.migration_runs to authenticated;
alter table public.migration_runs enable row level security;
create policy migration_runs_select on public.migration_runs for select to authenticated
  using (private.is_owner());

-- ---------------------------------------------------------------------------
-- Private bucket for production files (imported signatures, scripts).
-- No policies: hub users never touch it directly. The server checks access
-- with the database first, then hands out a short-lived signed link.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name) values ('production-files', 'production-files')
on conflict (id) do nothing;
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'storage' and table_name = 'buckets' and column_name = 'file_size_limit') then
    execute $q$update storage.buckets set public = false, file_size_limit = 52428800 where id = 'production-files'$q$;
  end if;
end;
$$;

revoke all on all functions in schema private from public;
