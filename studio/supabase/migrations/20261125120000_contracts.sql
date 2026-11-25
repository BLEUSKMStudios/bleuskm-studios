-- Contracts & Agreements: BLEUSKM's own electronic signing.
--
--  * contract_templates: versioned master templates. The owner edits and
--    approves them; an approved version can never change (a new edit makes a
--    new version).
--  * contract_requests: one agreement for one signer. Its wording is frozen
--    (with a SHA-256 hash the database checks) when it's approved for
--    sending, and a signed agreement can never be changed or deleted.
--  * contract_events: an append-only, hash-chained audit trail.
--  * contract_otps: one-time email codes that verify the signer (server only).
--
-- Files (the signer's signature image, the signed PDF) live in the private
-- production-files bucket under contracts/, which hub users can't reach
-- directly; the server hands out short-lived links after checking access.
-- Section: Documents.

-- ---------------------------------------------------------------------------
-- Templates (Studio level)
-- ---------------------------------------------------------------------------
create table public.contract_templates (
  id                uuid primary key default gen_random_uuid(),
  key               text not null check (key ~ '^[a-z][a-z0-9_]{1,59}$'),
  version           integer not null default 1 check (version >= 1),
  name              text not null check (length(btrim(name)) between 1 and 200),
  audience          text not null check (audience in ('cast', 'crew', 'other')),
  identity_key      text not null references public.email_identities (key),
  body              jsonb not null check (jsonb_typeof(body) = 'object'),
  status            text not null default 'draft' check (status in ('draft', 'approved', 'retired')),
  approved_by       uuid references public.profiles (id) on delete set null,
  approved_at       timestamptz,
  attorney_reviewed boolean not null default false,
  attorney_note     text check (length(attorney_note) <= 2000),
  change_note       text check (length(change_note) <= 1000),
  created_by        uuid references public.profiles (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (key, version)
);
create unique index contract_templates_one_approved on public.contract_templates (key) where status = 'approved';

alter table public.contract_templates enable row level security;
revoke all on public.contract_templates from anon, authenticated;
grant select, insert, update on public.contract_templates to authenticated;
-- Anyone who works with Documents can read templates; only the owner changes them.
create policy contract_templates_select on public.contract_templates for select to authenticated
  using (private.is_owner() or exists (
    select 1 from public.access_grants g join public.profiles p on p.id = g.user_id and p.status = 'active'
    where g.user_id = auth.uid() and g.section_key = 'documents'));
create policy contract_templates_insert on public.contract_templates for insert to authenticated
  with check (private.is_owner());
create policy contract_templates_update on public.contract_templates for update to authenticated
  using (private.is_owner()) with check (private.is_owner());

create function private.contract_template_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and old.status <> 'draft' then
    -- Approved or retired wording is permanent. Only retiring, and the
    -- attorney-review note, may change.
    if new.body is distinct from old.body or new.key <> old.key or new.version <> old.version
       or new.name <> old.name or new.audience <> old.audience or new.identity_key <> old.identity_key
       or (old.status = 'retired' and new.status <> 'retired')
       or (old.status = 'approved' and new.status not in ('approved', 'retired')) then
      raise exception 'An approved template version cannot be changed; edit it to create a new version'
        using errcode = 'check_violation';
    end if;
  end if;
  if new.status = 'approved' and (tg_op = 'INSERT' or old.status = 'draft') then
    new.approved_by := auth.uid();
    new.approved_at := now();
    -- The previously approved version of this template is retired.
    update public.contract_templates set status = 'retired'
    where key = new.key and status = 'approved' and id <> new.id;
  end if;
  return new;
end;
$$;
create trigger contract_templates_guard before insert or update on public.contract_templates
  for each row execute function private.contract_template_guard();
create trigger contract_templates_touch before update on public.contract_templates
  for each row execute function private.touch_updated_at();
create trigger contract_templates_author before insert or update on public.contract_templates
  for each row execute function private.stamp_created_by();
create trigger audit_contract_templates after insert or update or delete on public.contract_templates
  for each row execute function private.write_audit();

-- ---------------------------------------------------------------------------
-- Agreements
-- ---------------------------------------------------------------------------
create table public.contract_requests (
  id                uuid primary key default gen_random_uuid(),
  production_id     uuid not null references public.productions (id) on delete restrict,
  template_id       uuid not null references public.contract_templates (id),
  template_key      text not null,
  template_version  integer not null,
  application_id    uuid references public.casting_applications (id) on delete set null,
  team_id           uuid references public.production_team (id) on delete set null,
  contact_id        uuid references public.contacts (id) on delete set null,
  signer_name       text not null check (length(btrim(signer_name)) between 1 and 200),
  signer_email      text not null check (signer_email = lower(signer_email) and signer_email ~ '^[^\s@]+@[^\s@]+\.[a-z]{2,}$'),
  identity_key      text not null references public.email_identities (key),
  fields            jsonb not null default '{}'::jsonb check (jsonb_typeof(fields) = 'object'),
  -- Frozen wording: the exact text the signer sees and signs.
  content_text      text check (length(content_text) <= 400000),
  content_hash      text check (content_hash ~ '^[0-9a-f]{64}$'),
  status            text not null default 'draft'
                    check (status in ('draft', 'sent', 'viewed', 'signed', 'declined', 'voided', 'expired')),
  token_hash        text unique check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at        timestamptz,
  studio_signer     jsonb check (studio_signer is null or jsonb_typeof(studio_signer) = 'object'),
  approved_by       uuid references public.profiles (id) on delete set null,
  approved_at       timestamptz,
  sent_at           timestamptz,
  viewed_at         timestamptz,
  reminder_sent_at  timestamptz,
  voided_at         timestamptz,
  void_reason       text check (length(void_reason) <= 1000),
  -- Signature record (written only by the server when the signer signs).
  signed_at         timestamptz,
  signed_name       text check (length(signed_name) <= 200),
  signature_kind    text check (signature_kind in ('typed', 'drawn')),
  signature_path    text check (length(signature_path) <= 500),
  consent_at        timestamptz,
  verified_at       timestamptz,
  signer_ip         text check (length(signer_ip) <= 100),
  signer_agent      text check (length(signer_agent) <= 500),
  pdf_path          text check (length(pdf_path) <= 500),
  pdf_sha256        text check (pdf_sha256 ~ '^[0-9a-f]{64}$'),
  document_id       uuid references public.documents (id) on delete set null,
  created_by        uuid references public.profiles (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint contract_content_hash check (
    content_text is null or content_hash = encode(sha256(convert_to(content_text, 'UTF8')), 'hex')),
  constraint contract_frozen_when_sent check (status = 'draft' or (content_text is not null and approved_at is not null)),
  constraint contract_signed_complete check (status <> 'signed' or (
    signed_at is not null and signed_name is not null and signature_kind is not null and consent_at is not null
    and verified_at is not null and pdf_path is not null and pdf_sha256 is not null))
);
create index contract_requests_production_idx on public.contract_requests (production_id, status);
create index contract_requests_application_idx on public.contract_requests (application_id);
create index contract_requests_team_idx on public.contract_requests (team_id);
create index contract_requests_contact_idx on public.contract_requests (contact_id);

revoke all on public.contract_requests from anon, authenticated;
grant select, insert, delete on public.contract_requests to authenticated;
-- Staff can prepare, approve, send and void. The signature columns are not
-- writable by hub users at all; only the server's signing route sets them.
grant update (template_id, template_key, template_version, signer_name, signer_email, identity_key, fields,
              content_text, content_hash, status, token_hash, expires_at, studio_signer, approved_by, approved_at,
              sent_at, reminder_sent_at, voided_at, void_reason, application_id, team_id, contact_id)
  on public.contract_requests to authenticated;
select private.apply_section_rls('public.contract_requests', 'documents');
create trigger contract_requests_touch before update on public.contract_requests
  for each row execute function private.touch_updated_at();
create trigger contract_requests_author before insert or update on public.contract_requests
  for each row execute function private.stamp_created_by();
create trigger audit_contract_requests after insert or update or delete on public.contract_requests
  for each row execute function private.write_audit();

create function private.contract_request_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_service boolean := current_user in ('service_role', 'postgres', 'supabase_admin');
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'Only a draft agreement can be deleted; void it instead' using errcode = 'check_violation';
    end if;
    return old;
  end if;
  if tg_op = 'INSERT' then
    if new.status <> 'draft' then
      raise exception 'A new agreement starts as a draft' using errcode = 'check_violation';
    end if;
    return new;
  end if;
  -- A signed agreement is permanent. The only later change is linking the
  -- Documents record the database creates for it.
  if old.status = 'signed' then
    if (to_jsonb(new) - 'document_id' - 'updated_at') is distinct from (to_jsonb(old) - 'document_id' - 'updated_at')
       or (old.document_id is not null and new.document_id is distinct from old.document_id) then
      raise exception 'A signed agreement cannot be changed' using errcode = 'check_violation';
    end if;
    return new;
  end if;
  if old.status in ('voided', 'declined') and (new.status <> old.status or new.content_text is distinct from old.content_text) then
    raise exception 'This agreement is closed; prepare a new one' using errcode = 'check_violation';
  end if;
  -- Once approved, the wording and the signer can't change.
  if old.content_text is not null and (
       new.content_text is distinct from old.content_text or new.signer_email <> old.signer_email
       or new.signer_name <> old.signer_name or new.fields is distinct from old.fields
       or new.template_id <> old.template_id) then
    raise exception 'The wording of an approved agreement cannot be changed; void it and prepare a new one'
      using errcode = 'check_violation';
  end if;
  if new.status in ('signed', 'viewed', 'declined') and new.status <> old.status and not v_service then
    raise exception 'Only the signer can do that' using errcode = 'insufficient_privilege';
  end if;
  if new.status = 'signed' and old.status not in ('sent', 'viewed') then
    raise exception 'Only a sent agreement can be signed' using errcode = 'check_violation';
  end if;
  if new.status in ('voided', 'expired') and new.status <> old.status then
    new.token_hash := null;          -- the link stops working
    if new.status = 'voided' then new.voided_at := coalesce(new.voided_at, now()); end if;
  end if;
  return new;
end;
$$;
create trigger contract_requests_guard before insert or update or delete on public.contract_requests
  for each row execute function private.contract_request_guard();

-- The approved template must be the version the request names.
create function private.contract_request_template()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.contract_templates%rowtype;
begin
  select * into t from public.contract_templates where id = new.template_id;
  if t.id is null then raise exception 'Unknown template' using errcode = 'foreign_key_violation'; end if;
  new.template_key := t.key;
  new.template_version := t.version;
  if new.content_text is not null and (tg_op = 'INSERT' or old.content_text is null) and t.status <> 'approved' then
    raise exception 'This template version has not been approved by the owner yet' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger contract_requests_template before insert or update of template_id, content_text on public.contract_requests
  for each row execute function private.contract_request_template();

-- ---------------------------------------------------------------------------
-- Audit trail: append-only and hash-chained per agreement
-- ---------------------------------------------------------------------------
create table public.contract_events (
  id            bigint generated always as identity primary key,
  request_id    uuid not null references public.contract_requests (id) on delete restrict,
  production_id uuid not null references public.productions (id) on delete restrict,
  at            timestamptz not null default clock_timestamp(),
  kind          text not null check (kind ~ '^[a-z_]{2,40}$'),
  actor         text not null check (actor in ('staff', 'signer', 'system')),
  actor_id      uuid,
  actor_name    text check (length(actor_name) <= 200),
  ip            text check (length(ip) <= 100),
  user_agent    text check (length(user_agent) <= 500),
  detail        jsonb not null default '{}'::jsonb,
  prev_hash     text check (prev_hash ~ '^[0-9a-f]{64}$'),
  hash          text not null check (hash ~ '^[0-9a-f]{64}$')
);
create index contract_events_request_idx on public.contract_events (request_id, id);
alter table public.contract_events enable row level security;
revoke all on public.contract_events from anon, authenticated;
grant select on public.contract_events to authenticated;
create policy contract_events_select on public.contract_events for select to authenticated
  using (private.has_access(production_id, 'documents', 'view'));

create function private.contract_event_hash(e public.contract_events)
returns text
language sql
stable
set search_path = ''
as $$
  select encode(sha256(convert_to(concat_ws('|',
    coalesce(e.prev_hash, ''), e.request_id::text, e.kind, e.actor, coalesce(e.actor_id::text, ''),
    to_char(e.at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    coalesce(e.ip, ''), coalesce(e.user_agent, ''), e.detail::text), 'UTF8')), 'hex');
$$;

create function private.contract_event_chain()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op <> 'INSERT' then
    raise exception 'The agreement audit trail cannot be changed' using errcode = 'insufficient_privilege';
  end if;
  perform pg_advisory_xact_lock(hashtext('contract:' || new.request_id::text));
  select production_id into new.production_id from public.contract_requests where id = new.request_id;
  new.at := clock_timestamp();
  new.detail := coalesce(new.detail, '{}'::jsonb);
  select hash into new.prev_hash from public.contract_events where request_id = new.request_id order by id desc limit 1;
  new.hash := private.contract_event_hash(new);
  return new;
end;
$$;
create trigger contract_events_chain before insert or update or delete on public.contract_events
  for each row execute function private.contract_event_chain();
create trigger contract_events_no_truncate before truncate on public.contract_events
  for each statement execute function private.contract_event_chain();

-- Checks the chain for one agreement (true = every link is intact).
create function public.contract_verify_chain(p_request uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  e public.contract_events;
  prev text := null;
begin
  if not exists (select 1 from public.contract_requests r where r.id = p_request
                 and (private.has_access(r.production_id, 'documents', 'view') or auth.role() = 'service_role' or session_user = 'postgres')) then
    return null;
  end if;
  for e in select * from public.contract_events where request_id = p_request order by id loop
    if e.prev_hash is distinct from prev or e.hash <> private.contract_event_hash(e) then
      return false;
    end if;
    prev := e.hash;
  end loop;
  return true;
end;
$$;
revoke all on function public.contract_verify_chain(uuid) from public, anon;
grant execute on function public.contract_verify_chain(uuid) to authenticated, service_role;

-- Status changes are recorded in the trail, on the person's timeline and in
-- the roster's onboarding status. A signed agreement is filed in Documents.
create function private.contract_request_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_name text := (select full_name from public.profiles where id = v_actor);
  v_tpl text := (select name from public.contract_templates where id = new.template_id);
  v_team uuid := coalesce(new.team_id, (select id from public.production_team where application_id = new.application_id));
  v_doc uuid;
  v_kind text;
begin
  if tg_op = 'INSERT' then
    insert into public.contract_events (request_id, kind, actor, actor_id, actor_name, detail)
    values (new.id, 'created', 'staff', v_actor, v_name, jsonb_build_object('template', new.template_key, 'version', new.template_version));
    return null;
  end if;
  if new.content_hash is distinct from old.content_hash and new.content_hash is not null then
    insert into public.contract_events (request_id, kind, actor, actor_id, actor_name, detail)
    values (new.id, 'approved', 'staff', v_actor, v_name,
            jsonb_build_object('content_sha256', new.content_hash, 'template', new.template_key, 'version', new.template_version));
  end if;
  if new.token_hash is distinct from old.token_hash and new.token_hash is not null and old.token_hash is not null then
    insert into public.contract_events (request_id, kind, actor, actor_id, actor_name, detail)
    values (new.id, 'link_replaced', 'staff', v_actor, v_name, '{}'::jsonb);
  end if;
  if new.status is not distinct from old.status then return null; end if;

  v_kind := case new.status when 'sent' then 'sent' when 'viewed' then 'viewed' when 'signed' then 'signed'
                 when 'voided' then 'voided' when 'expired' then 'expired' when 'declined' then 'declined' end;
  if new.status in ('sent', 'voided', 'expired') then
    insert into public.contract_events (request_id, kind, actor, actor_id, actor_name, detail)
    values (new.id, v_kind, case when v_actor is null then 'system' else 'staff' end, v_actor, v_name,
            case when new.status = 'voided' then jsonb_build_object('reason', new.void_reason)
                 when new.status = 'sent' then jsonb_build_object('to', new.signer_email, 'identity', new.identity_key, 'expires_at', new.expires_at)
                 else '{}'::jsonb end);
  elsif new.status = 'signed' then
    insert into public.contract_events (request_id, kind, actor, actor_name, ip, user_agent, detail)
    values (new.id, 'signed', 'signer', new.signed_name, new.signer_ip, new.signer_agent,
            jsonb_build_object('content_sha256', new.content_hash, 'signature', new.signature_kind,
                               'pdf_sha256', new.pdf_sha256, 'verified_at', new.verified_at, 'consent_at', new.consent_at));
  end if;

  if new.status = 'sent' and v_team is not null then
    update public.production_team set onboarding = 'paperwork_sent' where id = v_team and onboarding = 'not_started';
  elsif new.status = 'signed' then
    insert into public.documents (production_id, title, category, contract_type, status, signer_name, signer_email,
                                  signer_role, signed_on, contact_id, storage_path, details, source, source_id)
    values (new.production_id, left(coalesce(v_tpl, 'Agreement') || ' — ' || new.signed_name, 200),
            case when new.template_key like '%release%' then 'release' else 'contract' end,
            v_tpl, 'signed', new.signed_name, new.signer_email, new.fields ->> 'role',
            (new.signed_at at time zone 'America/Chicago')::date, new.contact_id, new.pdf_path,
            'Signed electronically in BLEUSKM Studio OS. Agreement SHA-256 ' || new.content_hash || '; signed PDF SHA-256 ' || new.pdf_sha256 || '.',
            'contract', new.id::text)
    returning id into v_doc;
    update public.contract_requests set document_id = v_doc where id = new.id;
    if v_team is not null then
      update public.production_team
      set onboarding = case when onboarding in ('not_started', 'paperwork_sent') then 'paperwork_signed' else onboarding end,
          status = case when status in ('prospect', 'offered') then 'confirmed' else status end
      where id = v_team;
    end if;
  end if;

  perform private.log_activity('documents', new.production_id, new.contact_id, 'contract.' || v_kind,
    case new.status
      when 'sent' then coalesce(v_tpl, 'Agreement') || ' sent to ' || new.signer_email || ' for signature'
      when 'viewed' then coalesce(v_tpl, 'Agreement') || ' opened by ' || new.signer_name
      when 'signed' then coalesce(v_tpl, 'Agreement') || ' signed by ' || new.signed_name
      when 'voided' then coalesce(v_tpl, 'Agreement') || ' voided'
      when 'expired' then coalesce(v_tpl, 'Agreement') || ' link expired'
      else coalesce(v_tpl, 'Agreement') || ' ' || new.status end,
    'contract_requests', new.id, jsonb_build_object('template', new.template_key));
  return null;
end;
$$;
create trigger contract_requests_changed after insert or update on public.contract_requests
  for each row execute function private.contract_request_changed();

-- Filed signed agreements stay in Documents: no deleting them or swapping
-- the file.
create function private.documents_protect_signed()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.source = 'contract' then
    if tg_op = 'DELETE' then
      raise exception 'A signed agreement is kept permanently' using errcode = 'check_violation';
    end if;
    if new.storage_path is distinct from old.storage_path or new.status <> old.status
       or new.source is distinct from old.source or new.source_id is distinct from old.source_id
       or new.signer_email is distinct from old.signer_email or new.production_id is distinct from old.production_id then
      raise exception 'A signed agreement''s record cannot be changed' using errcode = 'check_violation';
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
create trigger documents_protect_signed before update or delete on public.documents
  for each row execute function private.documents_protect_signed();

-- ---------------------------------------------------------------------------
-- One-time email codes (server only: no grants, no policies)
-- ---------------------------------------------------------------------------
create table public.contract_otps (
  id          uuid primary key default gen_random_uuid(),
  request_id  uuid not null references public.contract_requests (id) on delete cascade,
  code_hash   text not null check (code_hash ~ '^[0-9a-f]{64}$'),
  expires_at  timestamptz not null,
  attempts    integer not null default 0,
  used_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index contract_otps_request_idx on public.contract_otps (request_id, created_at desc);
alter table public.contract_otps enable row level security;
revoke all on public.contract_otps from anon, authenticated;
create policy contract_otps_server_only on public.contract_otps for select to authenticated using (false);

grant select, insert, update on public.contract_requests, public.contract_otps to service_role;
grant select, insert on public.contract_events to service_role;
grant select, insert, update on public.contract_templates to service_role;
