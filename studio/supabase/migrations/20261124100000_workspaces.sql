-- Studio OS workspaces (PR #10 revisions, Nov 23 2026).
--
-- Additive only: nothing is dropped, renamed or deleted.
--  * Scripts & Treatments becomes a document library: PDF and Fountain files
--    in the private production-files bucket, more document types, file
--    details, a "replaces" link for version history, and links to further
--    projects (one script can belong to several BLEUSKM projects).
--  * Crew roster: availability and onboarding status per person.
--  * Applications: the Airtable record id of imported historical
--    applications, unique, so a re-run never duplicates anyone.

-- ---------------------------------------------------------------------------
-- Scripts & Treatments library
-- ---------------------------------------------------------------------------
alter table public.scripts drop constraint scripts_kind_check;
alter table public.scripts add constraint scripts_kind_check check (kind in (
  'script', 'treatment', 'outline', 'synopsis', 'beat_sheet', 'pitch', 'series_bible',
  'lookbook', 'breakdown', 'shot_list', 'other'));

alter table public.scripts
  add column file_name    text check (length(file_name) <= 255),
  add column mime_type    text check (mime_type in ('application/pdf', 'text/plain')),
  add column size_bytes   bigint check (size_bytes between 1 and 52428800),
  add column supersedes_id uuid references public.scripts (id) on delete set null,
  add constraint scripts_not_self check (supersedes_id is null or supersedes_id <> id),
  -- A stored file always lives under scripts/<this record's id>/.
  add constraint scripts_storage_path check (
    storage_path is null or storage_path ~ ('^scripts/' || id::text || '/[A-Za-z0-9._-]{1,200}$'));
create index scripts_supersedes_idx on public.scripts (supersedes_id);

-- Further projects a script belongs to (besides its own production).
-- People with Scripts access on a linked project can read the script and its
-- file (never edit it). Adding or removing a link needs edit access on the
-- script's own production and on the linked project.
create table public.script_productions (
  script_id     uuid not null references public.scripts (id) on delete cascade,
  production_id uuid not null references public.productions (id) on delete cascade,
  created_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  primary key (script_id, production_id)
);
create index script_productions_production_idx on public.script_productions (production_id);

create function private.script_scope(p_script uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select production_id from public.scripts where id = p_script;
$$;
revoke all on function private.script_scope(uuid) from public, anon;
grant execute on function private.script_scope(uuid) to authenticated;

create function private.script_links_check()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.production_id = private.script_scope(new.script_id) then
    raise exception 'A script is already part of its own production' using errcode = 'check_violation';
  end if;
  if auth.uid() is not null then new.created_by := auth.uid(); end if;
  return new;
end;
$$;
create trigger script_productions_check before insert on public.script_productions
  for each row execute function private.script_links_check();

alter table public.script_productions enable row level security;
revoke all on public.script_productions from anon, authenticated;
grant select, insert, delete on public.script_productions to authenticated;
create policy script_links_select on public.script_productions for select to authenticated
  using (private.has_access(private.script_scope(script_id), 'script_breakdown', 'view')
      or private.has_access(production_id, 'script_breakdown', 'view'));
create policy script_links_insert on public.script_productions for insert to authenticated
  with check (private.has_access(private.script_scope(script_id), 'script_breakdown', 'edit')
          and private.has_access(production_id, 'script_breakdown', 'edit'));
create policy script_links_delete on public.script_productions for delete to authenticated
  using (private.has_access(private.script_scope(script_id), 'script_breakdown', 'edit'));
create trigger audit_script_productions after insert or delete on public.script_productions
  for each row execute function private.write_audit();

create function private.script_linked_view(p_script uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.script_productions sp where sp.script_id = p_script
                 and private.user_has_access(auth.uid(), sp.production_id, 'script_breakdown', 'view'));
$$;
revoke all on function private.script_linked_view(uuid) from public, anon;
grant execute on function private.script_linked_view(uuid) to authenticated;

-- Read-only, in addition to the section rules applied to scripts earlier.
create policy scripts_linked_read on public.scripts for select to authenticated
  using (private.script_linked_view(id));

-- Files: production-files/scripts/<script id>/<file>. Same rule as the record:
-- view access to read, edit access to upload or remove. No public access.
create function private.script_file_access(p_name text, p_level public.access_level)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  parts text[] := string_to_array(p_name, '/');
  sid uuid;
begin
  if array_length(parts, 1) <> 3 or parts[1] <> 'scripts'
     or parts[2] !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     or parts[3] !~ '^[A-Za-z0-9._-]{1,200}$' then
    return false;
  end if;
  sid := parts[2]::uuid;
  return exists (select 1 from public.scripts s where s.id = sid
                 and private.user_has_access(auth.uid(), s.production_id, 'script_breakdown', p_level))
      or (p_level = 'view' and private.script_linked_view(sid));
end;
$$;
revoke all on function private.script_file_access(text, public.access_level) from public, anon;
grant execute on function private.script_file_access(text, public.access_level) to authenticated;

create policy script_files_read on storage.objects for select to authenticated
  using (bucket_id = 'production-files' and private.script_file_access(name, 'view'));
create policy script_files_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'production-files' and private.script_file_access(name, 'edit'));

-- ---------------------------------------------------------------------------
-- Crew roster: availability and onboarding
-- ---------------------------------------------------------------------------
alter table public.production_team
  add column availability text check (length(availability) <= 1000),
  add column onboarding   text not null default 'not_started'
    check (onboarding in ('not_started', 'paperwork_sent', 'paperwork_signed', 'guide_sent', 'complete'));

-- ---------------------------------------------------------------------------
-- Applications: imported historical records keep their Airtable id
-- ---------------------------------------------------------------------------
alter table public.casting_applications
  add column source_record_id text check (source_record_id ~ '^rec[A-Za-z0-9]{14}$');
create unique index casting_applications_source_record on public.casting_applications (source_record_id)
  where source_record_id is not null;
grant select (source_record_id) on public.casting_applications to authenticated;
