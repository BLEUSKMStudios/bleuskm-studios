-- Documents library and onboarding packages.
--
--  * Documents can hold a private file (production-files/documents/<id>/…),
--    with file details and a version chain (supersedes_id), and new kinds
--    used for onboarding: scripts, sides, treatments, call sheets, rehearsal
--    schedules, location and parking information.
--  * onboarding_packages: production materials sent to one person from their
--    profile, through a personal link; each file's first open and the
--    person's acknowledgment are recorded, and the roster's onboarding
--    status follows.
-- Additive only. Section: Documents.

alter table public.documents drop constraint documents_category_check;
alter table public.documents add constraint documents_category_check
  check (category in ('contract', 'release', 'permit', 'insurance', 'schedule', 'report', 'guide',
                      'script', 'sides', 'treatment', 'call_sheet', 'rehearsal', 'location_info', 'other'));

alter table public.documents
  add column file_name     text check (length(file_name) <= 255),
  add column mime_type     text check (length(mime_type) <= 120),
  add column size_bytes    bigint check (size_bytes >= 0),
  add column version       integer not null default 1 check (version >= 1),
  add column supersedes_id uuid references public.documents (id) on delete set null;
create index documents_supersedes_idx on public.documents (supersedes_id);

-- File paths are relative and can't climb out of their folder.
alter table public.documents add constraint documents_storage_path_shape
  check (storage_path is null or storage_path !~ '(^/|\.\.|//)');

-- A newer version must belong to the same production.
create function private.documents_version_check()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prod uuid;
  v_ver integer;
begin
  if new.supersedes_id is null then return new; end if;
  if new.supersedes_id = new.id then raise exception 'A document cannot replace itself' using errcode = 'check_violation'; end if;
  select production_id, version into v_prod, v_ver from public.documents where id = new.supersedes_id;
  if v_prod is distinct from new.production_id then
    raise exception 'A new version must belong to the same production' using errcode = 'check_violation';
  end if;
  if tg_op = 'INSERT' then new.version := coalesce(v_ver, 0) + 1; end if;
  return new;
end;
$$;
create trigger documents_version before insert or update of supersedes_id on public.documents
  for each row execute function private.documents_version_check();

-- ---------------------------------------------------------------------------
-- Onboarding packages
-- ---------------------------------------------------------------------------
create table public.onboarding_packages (
  id               uuid primary key default gen_random_uuid(),
  production_id    uuid not null references public.productions (id) on delete cascade,
  team_id          uuid references public.production_team (id) on delete set null,
  application_id   uuid references public.casting_applications (id) on delete set null,
  contact_id       uuid references public.contacts (id) on delete set null,
  recipient_name   text not null check (length(btrim(recipient_name)) between 1 and 200),
  recipient_email  text not null check (recipient_email = lower(recipient_email) and recipient_email ~ '^[^\s@]+@[^\s@]+\.[a-z]{2,}$'),
  identity_key     text not null references public.email_identities (key),
  subject          text not null check (length(subject) between 1 and 300),
  message          text check (length(message) <= 20000),
  require_ack      boolean not null default true,
  token_hash       text unique check (token_hash ~ '^[0-9a-f]{64}$'),
  status           text not null default 'draft' check (status in ('draft', 'sent', 'opened', 'acknowledged', 'cancelled')),
  message_id       uuid references public.comm_messages (id) on delete set null,
  sent_at          timestamptz,
  opened_at        timestamptz,
  acknowledged_at  timestamptz,
  ack_name         text check (length(ack_name) <= 200),
  ack_ip           text check (length(ack_ip) <= 100),
  created_by       uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index onboarding_packages_team_idx on public.onboarding_packages (team_id);
create index onboarding_packages_application_idx on public.onboarding_packages (application_id);
create index onboarding_packages_contact_idx on public.onboarding_packages (contact_id);
revoke all on public.onboarding_packages from anon, authenticated;
grant select, insert on public.onboarding_packages to authenticated;
grant update (status, token_hash, message_id, sent_at) on public.onboarding_packages to authenticated;
select private.apply_section_rls('public.onboarding_packages', 'documents');
create trigger onboarding_packages_touch before update on public.onboarding_packages
  for each row execute function private.touch_updated_at();
create trigger onboarding_packages_author before insert or update on public.onboarding_packages
  for each row execute function private.stamp_created_by();
create trigger audit_onboarding_packages after insert or update or delete on public.onboarding_packages
  for each row execute function private.write_audit();

create table public.onboarding_items (
  id            uuid primary key default gen_random_uuid(),
  package_id    uuid not null references public.onboarding_packages (id) on delete cascade,
  production_id uuid not null references public.productions (id) on delete cascade,
  document_id   uuid references public.documents (id) on delete set null,
  title         text not null check (length(btrim(title)) between 1 and 200),
  category      text not null,
  sort          integer not null default 0,
  first_opened_at timestamptz,
  open_count    integer not null default 0,
  created_at    timestamptz not null default now()
);
create index onboarding_items_package_idx on public.onboarding_items (package_id, sort);
revoke all on public.onboarding_items from anon, authenticated;
grant select, insert on public.onboarding_items to authenticated;
select private.apply_section_rls('public.onboarding_items', 'documents');

-- Items belong to their package's production, and only documents of that
-- production can be sent.
create function private.onboarding_item_check()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_doc_prod uuid;
begin
  select production_id into new.production_id from public.onboarding_packages where id = new.package_id;
  if new.production_id is null then raise exception 'Unknown package' using errcode = 'foreign_key_violation'; end if;
  if new.document_id is not null then
    select production_id into v_doc_prod from public.documents where id = new.document_id;
    if v_doc_prod is distinct from new.production_id then
      raise exception 'Only this production''s documents can be sent' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;
create trigger onboarding_items_check before insert or update on public.onboarding_items
  for each row execute function private.onboarding_item_check();

-- Staff can send or cancel a package; only the server (the person's own link)
-- records that it was opened or acknowledged. A cancelled or acknowledged
-- package stays that way.
create function private.onboarding_package_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Only signed-in staff are limited; the server key and maintenance run freely.
  if coalesce(nullif(current_setting('role', true), ''), 'none') not in ('authenticated', 'anon') then return new; end if;
  if new.status is distinct from old.status then
    if old.status in ('cancelled', 'acknowledged') then
      raise exception 'This package is closed' using errcode = 'check_violation';
    end if;
    if new.status not in ('sent', 'cancelled') or (new.status = 'sent' and old.status <> 'draft') then
      raise exception 'Only the recipient''s link can record opening or acknowledgment' using errcode = 'insufficient_privilege';
    end if;
  end if;
  if new.status = 'cancelled' then new.token_hash := null; end if;
  return new;
end;
$$;
create trigger onboarding_packages_guard before update on public.onboarding_packages
  for each row execute function private.onboarding_package_guard();

-- Status changes: timeline, and the roster's onboarding status.
create function private.onboarding_package_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_team uuid := coalesce(new.team_id, (select id from public.production_team where application_id = new.application_id));
begin
  if new.status is not distinct from old.status then return null; end if;
  if new.status = 'sent' and v_team is not null then
    update public.production_team set onboarding = 'guide_sent' where id = v_team and onboarding = 'paperwork_signed';
  elsif new.status = 'acknowledged' and v_team is not null then
    update public.production_team set onboarding = 'complete' where id = v_team and onboarding = 'guide_sent';
  end if;
  if new.status in ('sent', 'opened', 'acknowledged', 'cancelled') then
    perform private.log_activity('documents', new.production_id, new.contact_id, 'onboarding.' || new.status,
      case new.status
        when 'sent' then 'Onboarding package sent to ' || new.recipient_email || ': ' || new.subject
        when 'opened' then new.recipient_name || ' opened their onboarding package'
        when 'acknowledged' then new.recipient_name || ' confirmed receiving their onboarding package'
        else 'Onboarding package link cancelled' end,
      'onboarding_packages', new.id, '{}'::jsonb);
  end if;
  return null;
end;
$$;
create trigger onboarding_packages_changed after update on public.onboarding_packages
  for each row execute function private.onboarding_package_changed();

grant select, insert, update on public.onboarding_packages, public.onboarding_items to service_role;
