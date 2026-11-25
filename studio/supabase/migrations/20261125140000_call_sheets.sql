-- Call sheets: more of a real call sheet, PDF export, sending and tracking.
--
--  * call_sheets gain crew call, sunrise/sunset, key contacts and safety
--    notes, and a version that goes up each time the sheet is sent again.
--  * call_sheet_entries can come from the roster (team_id) and carry the
--    person's email and team, so the sheet can be sent to each of them.
--  * call_sheet_sends: one row per person per version sent, with a personal
--    link; its first open and the person's confirmation are recorded.
-- Additive only. Section: Scheduling.

alter table public.call_sheets
  add column crew_call      time,
  add column sunrise        text check (length(sunrise) <= 20),
  add column sunset         text check (length(sunset) <= 20),
  add column key_contacts   text check (length(key_contacts) <= 2000),
  add column safety_notes   text check (length(safety_notes) <= 4000),
  add column version        integer not null default 0 check (version >= 0),
  add column last_sent_at   timestamptz;

alter table public.call_sheet_entries
  add column team_id   uuid references public.production_team (id) on delete set null,
  add column email     text check (email = lower(email) and length(email) <= 254),
  add column team      text not null default 'crew' check (team in ('crew', 'cast', 'producer', 'other'));
create index call_sheet_entries_team_idx on public.call_sheet_entries (team_id);

-- A roster member appears on a sheet once.
create unique index call_sheet_entries_one_per_person on public.call_sheet_entries (call_sheet_id, team_id) where team_id is not null;

-- A roster link must point at this production's roster.
create function private.call_sheet_entry_team_check()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v uuid;
begin
  if new.team_id is null then return new; end if;
  select production_id into v from public.production_team where id = new.team_id;
  if v is distinct from new.production_id then
    raise exception 'That person is not on this production''s roster' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
-- Runs after call_sheet_entries_production (alphabetical) has set production_id.
create trigger call_sheet_entries_team before insert or update of team_id on public.call_sheet_entries
  for each row execute function private.call_sheet_entry_team_check();

create table public.call_sheet_sends (
  id             uuid primary key default gen_random_uuid(),
  call_sheet_id  uuid not null references public.call_sheets (id) on delete cascade,
  production_id  uuid not null references public.productions (id) on delete cascade,
  entry_id       uuid references public.call_sheet_entries (id) on delete set null,
  team_id        uuid references public.production_team (id) on delete set null,
  version        integer not null check (version >= 1),
  recipient_name text not null check (length(btrim(recipient_name)) between 1 and 200),
  recipient_email text not null check (recipient_email = lower(recipient_email) and length(recipient_email) <= 254),
  identity_key   text not null references public.email_identities (key),
  token_hash     text unique check (token_hash ~ '^[0-9a-f]{64}$'),
  status         text not null default 'sent' check (status in ('sent', 'opened', 'confirmed', 'replaced', 'cancelled')),
  message_id     uuid references public.comm_messages (id) on delete set null,
  sent_at        timestamptz not null default now(),
  opened_at      timestamptz,
  confirmed_at   timestamptz,
  created_by     uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index call_sheet_sends_sheet_idx on public.call_sheet_sends (call_sheet_id, version);
create unique index call_sheet_sends_once on public.call_sheet_sends (call_sheet_id, version, recipient_email);
revoke all on public.call_sheet_sends from anon, authenticated;
grant select, insert on public.call_sheet_sends to authenticated;
grant update (status, token_hash, message_id) on public.call_sheet_sends to authenticated;
select private.apply_section_rls('public.call_sheet_sends', 'scheduling');
create trigger call_sheet_sends_touch before update on public.call_sheet_sends
  for each row execute function private.touch_updated_at();
create trigger call_sheet_sends_author before insert or update on public.call_sheet_sends
  for each row execute function private.stamp_created_by();
create trigger audit_call_sheet_sends after insert or update or delete on public.call_sheet_sends
  for each row execute function private.write_audit();
grant select, insert, update on public.call_sheet_sends to service_role;

-- A send belongs to its sheet's production. Staff can't record opening or
-- confirmation; only the person's link (the server) can.
create function private.call_sheet_send_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v uuid;
begin
  if tg_op = 'INSERT' then
    select production_id into v from public.call_sheets where id = new.call_sheet_id;
    if v is null then raise exception 'Unknown call sheet' using errcode = 'foreign_key_violation'; end if;
    new.production_id := v;
    if coalesce(nullif(current_setting('role', true), ''), 'none') in ('authenticated', 'anon') then
      new.status := 'sent'; new.opened_at := null; new.confirmed_at := null;
    end if;
    return new;
  end if;
  if coalesce(nullif(current_setting('role', true), ''), 'none') not in ('authenticated', 'anon') then return new; end if;
  if new.status is distinct from old.status then
    if old.status in ('cancelled', 'replaced') then raise exception 'This link is closed' using errcode = 'check_violation'; end if;
    if new.status not in ('cancelled', 'replaced') then
      raise exception 'Only the recipient''s link can record opening or confirmation' using errcode = 'insufficient_privilege';
    end if;
  end if;
  -- A replaced link keeps working only to say a newer version was sent.
  if new.status = 'cancelled' then new.token_hash := null; end if;
  return new;
end;
$$;
create trigger call_sheet_sends_guard before insert or update on public.call_sheet_sends
  for each row execute function private.call_sheet_send_guard();

-- Timeline
create function private.call_sheet_send_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title text;
  v_contact uuid;
begin
  select title into v_title from public.call_sheets where id = new.call_sheet_id;
  select contact_id into v_contact from public.production_team where id = new.team_id;
  if tg_op = 'INSERT' then
    perform private.log_activity('scheduling', new.production_id, v_contact, 'call_sheet.sent',
      'Call sheet "' || v_title || '" (v' || new.version || ') sent to ' || new.recipient_email,
      'call_sheet_sends', new.id, '{}'::jsonb);
  elsif new.status = 'confirmed' and old.status is distinct from 'confirmed' then
    perform private.log_activity('scheduling', new.production_id, v_contact, 'call_sheet.confirmed',
      new.recipient_name || ' confirmed call sheet "' || v_title || '" (v' || new.version || ')',
      'call_sheet_sends', new.id, '{}'::jsonb);
  end if;
  return null;
end;
$$;
create trigger call_sheet_sends_changed after insert or update on public.call_sheet_sends
  for each row execute function private.call_sheet_send_changed();
