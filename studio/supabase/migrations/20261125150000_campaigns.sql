-- Campaigns: newsletters and film updates written in Studio OS, approved by
-- the owner, and sent only to people subscribed to the audience.
--
--  * campaigns: draft -> submitted -> approved (owner only, on the exact
--    wording) -> sending -> sent. Editing the wording after submitting or
--    approval sends it back to draft. Only marketing audiences, from the
--    newsletter@, films@ or studio@ identity.
--  * campaign_recipients: one row per person per campaign (never twice).
--    The database refuses anyone who is not currently subscribed and
--    deliverable. Each row carries an unsubscribe link token (hashed).
-- Additive only. Section: Communications (Studio level).

create table public.campaigns (
  id             uuid primary key default gen_random_uuid(),
  production_id  uuid references public.productions (id) on delete cascade check (production_id is null),
  name           text not null check (length(btrim(name)) between 1 and 200),
  audience_id    uuid not null references public.audiences (id),
  identity_key   text not null references public.email_identities (key) check (identity_key in ('newsletter', 'films', 'studio')),
  subject        text not null check (length(btrim(subject)) between 1 and 300),
  preview_text   text check (length(preview_text) <= 300),
  body           text not null check (length(btrim(body)) between 1 and 50000),
  status         text not null default 'draft' check (status in ('draft', 'submitted', 'approved', 'sending', 'sent', 'cancelled')),
  submitted_at   timestamptz,
  approved_by    uuid references public.profiles (id) on delete set null,
  approved_at    timestamptz,
  approved_hash  text check (approved_hash ~ '^[0-9a-f]{64}$'),
  test_sent_at   timestamptz,
  test_sent_to   text check (length(test_sent_to) <= 254),
  send_started_at timestamptz,
  sent_at        timestamptz,
  recipient_count integer not null default 0,
  source         text check (length(source) <= 100),
  source_id      text check (length(source_id) <= 100),
  created_by     uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
select private.setup_module_table('public.campaigns', 'communications');

-- What the owner approves: the exact subject, preview, wording, audience and sender.
create function private.campaign_hash(c public.campaigns)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(sha256(convert_to(concat_ws(chr(31), c.subject, coalesce(c.preview_text, ''), c.body, c.audience_id::text, c.identity_key), 'UTF8')), 'hex');
$$;

create function private.campaign_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_marketing boolean;
  v_server boolean := coalesce(nullif(current_setting('role', true), ''), 'none') not in ('authenticated', 'anon');
  v_content_changed boolean;
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' and not v_server then
      raise exception 'Only a draft can be deleted (cancel it instead)' using errcode = 'check_violation';
    end if;
    return old;
  end if;
  select marketing into v_marketing from public.audiences where id = new.audience_id;
  if not coalesce(v_marketing, false) then
    raise exception 'Campaigns go only to marketing audiences (people who opted in)' using errcode = 'check_violation';
  end if;

  if tg_op = 'INSERT' then
    if not v_server then
      new.status := 'draft'; new.approved_by := null; new.approved_at := null; new.approved_hash := null;
      new.submitted_at := null; new.sent_at := null; new.send_started_at := null; new.recipient_count := 0;
    end if;
    return new;
  end if;

  if old.status in ('sent', 'cancelled') then
    raise exception 'A sent or cancelled campaign cannot be changed' using errcode = 'check_violation';
  end if;

  v_content_changed := new.subject is distinct from old.subject or new.preview_text is distinct from old.preview_text
    or new.body is distinct from old.body or new.audience_id is distinct from old.audience_id or new.identity_key is distinct from old.identity_key;
  if v_content_changed and old.status in ('sending') then
    raise exception 'The campaign is being sent; its wording is locked' using errcode = 'check_violation';
  end if;

  -- Approval: the owner only, on the exact wording.
  if not v_server and new.status is not distinct from old.status
     and (new.approved_at is distinct from old.approved_at or new.approved_by is distinct from old.approved_by or new.approved_hash is distinct from old.approved_hash) then
    raise exception 'Approval is recorded only by approving' using errcode = 'insufficient_privilege';
  end if;
  if new.status = 'approved' and old.status <> 'approved' then
    if old.status <> 'submitted' then
      raise exception 'Submit the campaign for approval first' using errcode = 'check_violation';
    end if;
    if not (private.is_owner() or v_server) then
      raise exception 'Only the owner can approve a campaign' using errcode = 'insufficient_privilege';
    end if;
    new.approved_by := coalesce(auth.uid(), new.approved_by);
    new.approved_at := now();
    new.approved_hash := private.campaign_hash(new);
  end if;
  if new.status = 'submitted' and old.status <> 'submitted' then
    if old.status <> 'draft' then raise exception 'Only a draft can be submitted' using errcode = 'check_violation'; end if;
    new.submitted_at := now();
  end if;
  if new.status = 'sending' and old.status <> 'sending' then
    if old.status <> 'approved' or old.approved_hash is distinct from private.campaign_hash(new) then
      raise exception 'Only the approved wording can be sent' using errcode = 'check_violation';
    end if;
    new.send_started_at := now();
  end if;
  if new.status = 'sent' and old.status <> 'sent' then
    if old.status <> 'sending' then raise exception 'Only a campaign being sent can finish' using errcode = 'check_violation'; end if;
    new.sent_at := now();
  end if;
  if new.status = 'draft' and old.status not in ('draft', 'submitted', 'approved') then
    raise exception 'This campaign cannot go back to draft' using errcode = 'check_violation';
  end if;

  -- Any change to the wording withdraws the submission or approval.
  if v_content_changed and new.status in ('submitted', 'approved') then
    new.status := 'draft'; new.submitted_at := null;
  end if;
  if new.status = 'draft' then
    new.approved_by := null; new.approved_at := null; new.approved_hash := null;
  end if;
  return new;
end;
$$;
create trigger campaigns_guard before insert or update on public.campaigns
  for each row execute function private.campaign_guard();
create trigger campaigns_guard_delete before delete on public.campaigns
  for each row execute function private.campaign_guard();

create function private.campaign_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is not distinct from old.status then return null; end if;
  if new.status in ('submitted', 'approved', 'sending', 'sent', 'cancelled') then
    perform private.log_activity('communications', null, null, 'campaign.' || new.status,
      case new.status
        when 'submitted' then 'Campaign submitted for approval: ' || new.name
        when 'approved' then 'Campaign approved: ' || new.name
        when 'sending' then 'Campaign sending started: ' || new.name
        when 'sent' then 'Campaign sent: ' || new.name || ' (' || new.recipient_count || ' recipients)'
        else 'Campaign cancelled: ' || new.name end,
      'campaigns', new.id, '{}'::jsonb);
  end if;
  return null;
end;
$$;
create trigger campaigns_changed after update on public.campaigns
  for each row execute function private.campaign_changed();

-- ---------------------------------------------------------------------------
-- Recipients
-- ---------------------------------------------------------------------------
create table public.campaign_recipients (
  id            uuid primary key default gen_random_uuid(),
  production_id uuid references public.productions (id) on delete cascade check (production_id is null),
  campaign_id   uuid not null references public.campaigns (id) on delete cascade,
  contact_id    uuid not null references public.contacts (id) on delete cascade,
  email         text not null check (email = lower(email) and length(email) <= 254),
  status        text not null default 'queued' check (status in ('queued', 'sent', 'skipped', 'failed', 'blocked')),
  token_hash    text unique check (token_hash ~ '^[0-9a-f]{64}$'),
  message_id    uuid references public.comm_messages (id) on delete set null,
  error         text check (length(error) <= 500),
  unsubscribed_at timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (campaign_id, contact_id)
);
create index campaign_recipients_status_idx on public.campaign_recipients (campaign_id, status);
revoke all on public.campaign_recipients from anon, authenticated;
grant select, insert on public.campaign_recipients to authenticated;
grant update (status, message_id, error) on public.campaign_recipients to authenticated;
select private.apply_section_rls('public.campaign_recipients', 'communications');
create trigger campaign_recipients_touch before update on public.campaign_recipients
  for each row execute function private.touch_updated_at();
grant select, insert, update on public.campaign_recipients to service_role;

-- Only people subscribed to the campaign's audience, with a deliverable
-- address, and only while the campaign is being sent.
create function private.campaign_recipient_check()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_aud uuid;
  v_status text;
  v_ok boolean;
begin
  select audience_id, status into v_aud, v_status from public.campaigns where id = new.campaign_id;
  if v_status is distinct from 'sending' then
    raise exception 'Recipients are added only while an approved campaign is being sent' using errcode = 'check_violation';
  end if;
  select (s.status = 'subscribed' and c.email is not null and c.email = new.email and c.email_status = 'ok' and c.merged_into is null)
    into v_ok
    from public.contact_subscriptions s join public.contacts c on c.id = s.contact_id
   where s.contact_id = new.contact_id and s.audience_id = v_aud;
  if not coalesce(v_ok, false) then
    raise exception 'Only people subscribed to this audience, with a deliverable address, can receive it' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger campaign_recipients_check before insert on public.campaign_recipients
  for each row execute function private.campaign_recipient_check();
