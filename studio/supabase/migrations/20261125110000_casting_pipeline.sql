-- Casting and crew pipeline: custom statuses, self-tape invitations with a
-- secure BLEUSKM upload link, and selected people joining the production
-- roster automatically. Additive only; the public LMLT intake is unchanged.

-- ---------------------------------------------------------------------------
-- Custom statuses (per production, shown next to the standard pipeline)
-- ---------------------------------------------------------------------------
create table public.casting_custom_statuses (
  id            uuid primary key default gen_random_uuid(),
  production_id uuid not null references public.productions (id) on delete cascade,
  label         text not null check (length(btrim(label)) between 1 and 60),
  tone          text not null default 'info' check (tone in ('good', 'warn', 'info', 'bad', 'muted')),
  sort          integer not null default 0,
  created_at    timestamptz not null default now(),
  unique (production_id, label)
);
revoke all on public.casting_custom_statuses from anon, authenticated;
grant select, insert, update, delete on public.casting_custom_statuses to authenticated;
select private.apply_section_rls('public.casting_custom_statuses', 'casting');
create trigger audit_casting_custom_statuses after insert or update or delete on public.casting_custom_statuses
  for each row execute function private.write_audit();

alter table public.casting_applications
  add column custom_status_id uuid references public.casting_custom_statuses (id) on delete set null;
grant select (custom_status_id) on public.casting_applications to authenticated;
grant update (custom_status_id) on public.casting_applications to authenticated;

-- ---------------------------------------------------------------------------
-- Self-tape invitations
-- ---------------------------------------------------------------------------
-- The link holds a random token; only its SHA-256 hash is stored, so nobody
-- reading the database (or a backup) can use an invitation link.
create table public.selftape_invitations (
  id             uuid primary key default gen_random_uuid(),
  production_id  uuid not null references public.productions (id) on delete cascade,
  application_id uuid not null references public.casting_applications (id) on delete cascade,
  contact_id     uuid references public.contacts (id) on delete set null,
  token_hash     text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  instructions   text check (length(instructions) <= 10000),
  deadline       timestamptz,
  sides_url      text check (length(sides_url) <= 1000 and sides_url ~* '^https://'),
  sides_document_id uuid references public.documents (id) on delete set null,
  treatment_document_id uuid references public.documents (id) on delete set null,
  allow_links    boolean not null default true,     -- a Vimeo/YouTube/Drive link instead of a file
  status         text not null default 'draft'
                 check (status in ('draft', 'sent', 'opened', 'submitted', 'expired', 'cancelled')),
  message_id     uuid references public.comm_messages (id) on delete set null,
  sent_at        timestamptz,
  opened_at      timestamptz,
  submitted_at   timestamptz,
  reminder_sent_at timestamptz,
  created_by     uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index selftape_invitations_application_idx on public.selftape_invitations (application_id);
revoke all on public.selftape_invitations from anon, authenticated;
grant select, insert, update on public.selftape_invitations to authenticated;
select private.apply_section_rls('public.selftape_invitations', 'casting');
create trigger selftape_invitations_touch before update on public.selftape_invitations
  for each row execute function private.touch_updated_at();
create trigger selftape_invitations_author before insert or update on public.selftape_invitations
  for each row execute function private.stamp_created_by();
create trigger audit_selftape_invitations after insert or update or delete on public.selftape_invitations
  for each row execute function private.write_audit();

-- An invitation takes its application's production and contact.
create function private.selftape_inherit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select production_id, contact_id into new.production_id, new.contact_id
  from public.casting_applications where id = new.application_id;
  if new.production_id is null then
    raise exception 'Unknown application' using errcode = 'foreign_key_violation';
  end if;
  return new;
end;
$$;
create trigger selftape_invitations_inherit before insert or update of application_id on public.selftape_invitations
  for each row execute function private.selftape_inherit();

alter table public.casting_materials
  add column invitation_id uuid references public.selftape_invitations (id) on delete set null;

-- ---------------------------------------------------------------------------
-- Selected people join the production roster (cast and crew)
-- ---------------------------------------------------------------------------
alter table public.production_team
  add column application_id uuid references public.casting_applications (id) on delete set null;
create unique index production_team_application_key on public.production_team (application_id)
  where application_id is not null;

create function private.application_to_roster()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_crew boolean;
  v_role text;
  v_status text;
begin
  if new.status is not distinct from old.status then return null; end if;
  v_status := case new.status::text
    when 'selected' then 'offered' when 'offered' then 'offered' when 'cast' then 'confirmed' else null end;
  if v_status is null then
    -- Declined or withdrawn after an offer: the roster place is released.
    if new.status::text in ('not_selected', 'withdrawn') then
      update public.production_team set status = 'released' where application_id = new.id and status <> 'released';
    end if;
    return null;
  end if;
  select c.public_slug like '%-crew', r.name into v_crew, v_role
  from public.casting_calls c join public.casting_roles r on r.id = new.role_id where c.id = new.call_id;
  insert into public.production_team (production_id, contact_id, application_id, full_name, position, team, status, email, phone)
  values (new.production_id, new.contact_id, new.id, new.full_name, coalesce(v_role, 'To be confirmed'),
          case when v_crew then 'crew' else 'cast' end, v_status, new.email, new.phone)
  on conflict (application_id) where application_id is not null do update
    set status = case when public.production_team.status = 'confirmed' and excluded.status = 'offered'
                      then public.production_team.status else excluded.status end;
  perform private.log_activity(case when v_crew then 'crew' else 'casting' end, new.production_id, new.contact_id,
    'crew.roster', case when v_status = 'confirmed' then 'Confirmed on the roster as ' else 'Added to the roster (offered) as ' end
      || coalesce(v_role, 'a position'), 'casting_applications', new.id);
  return null;
end;
$$;
create trigger casting_applications_roster after update of status on public.casting_applications
  for each row execute function private.application_to_roster();

-- ---------------------------------------------------------------------------
-- Pipeline email templates (added to every production's casting templates)
-- ---------------------------------------------------------------------------
create function private.casting_pipeline_templates(p_production uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.casting_templates (production_id, key, name, subject, body, sets_status, sort)
  select p_production, t.key, t.name, t.subject, t.body, t.sets_status::public.casting_application_status, t.sort
  from (values
    ('selftape_invite', 'Self-tape invitation',
     'Self-tape request: {{role}} in {{film}}',
     E'Hi {{first_name}},\n\nThank you for your submission for {{role}} in {{film}}. We would love to see a self-tape.\n\n{{instructions}}\n\nPlease send it by {{deadline}}.\n{{#sides_link}}\nSides: {{sides_link}}\n{{/sides_link}}{{#treatment_link}}Treatment: {{treatment_link}}\n{{/treatment_link}}\nUpload your self-tape securely here (this link is personal to you):\n{{upload_link}}\n\nWarmly,\nBLEUSKM Studios Casting',
     'selftape_invited', 25),
    ('selftape_reminder', 'Self-tape reminder',
     'Reminder: your self-tape for {{film}}',
     E'Hi {{first_name}},\n\nA friendly reminder that we would love to receive your self-tape for {{role}} in {{film}} by {{deadline}}.\n\nYour personal upload link:\n{{upload_link}}\n\nWarmly,\nBLEUSKM Studios Casting',
     null, 26),
    ('selftape_received', 'Self-tape received',
     'We received your self-tape for {{film}}',
     E'Hi {{first_name}},\n\nThank you. Your self-tape for {{role}} in {{film}} has arrived safely, and our casting team will review it.\n\nWarmly,\nBLEUSKM Studios Casting',
     null, 27),
    ('selected', 'Selected / acceptance',
     'Welcome to {{film}}',
     E'Hi {{first_name}},\n\nWe are delighted to let you know you have been selected for {{role}} in {{film}}.\n\nYour agreement and onboarding materials will follow from this address. Please reply with any questions.\n\nWarmly,\nBLEUSKM Studios',
     'selected', 45)
  ) as t(key, name, subject, body, sets_status, sort)
  where not exists (select 1 from public.casting_templates x where x.production_id = p_production and x.key = t.key);
$$;
revoke all on function private.casting_pipeline_templates(uuid) from public;

create function private.casting_seed_pipeline()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.casting_pipeline_templates(new.production_id);
  return new;
end;
$$;
-- Runs after the original seeding trigger (names sort alphabetically).
create trigger casting_calls_seed_zpipeline after insert on public.casting_calls
  for each row execute function private.casting_seed_pipeline();

do $$
declare r record;
begin
  for r in select distinct production_id from public.casting_templates loop
    perform private.casting_pipeline_templates(r.production_id);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Self-tape files: their own private bucket
-- ---------------------------------------------------------------------------
-- Kept apart from the website's casting-materials bucket so the live LMLT
-- upload limits stay exactly as they are. Path: <application id>/<invitation
-- id>/<file>. Uploads only happen through Studio OS's server after it checks
-- the invitation link (signed upload URLs); hub users read with Casting access.
-- 50 MB is the Supabase Free plan's per-file maximum; raise it on Pro.
insert into storage.buckets (id, name) values ('selftapes', 'selftapes') on conflict (id) do nothing;
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'storage' and table_name = 'buckets' and column_name = 'file_size_limit') then
    execute $q$update storage.buckets set public = false, file_size_limit = 52428800,
      allowed_mime_types = array['video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v', 'video/3gpp', 'application/pdf']
      where id = 'selftapes'$q$;
  end if;
end;
$$;

alter table public.casting_materials
  add column storage_bucket text not null default 'casting-materials'
    check (storage_bucket in ('casting-materials', 'selftapes'));

create function intake_guard.selftape_object_access(p_name text, p_level public.access_level)
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
  if auth.uid() is null or array_length(parts, 1) <> 3
     or parts[1] !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  select production_id into v_production from public.casting_applications where id = parts[1]::uuid;
  return v_production is not null and private.has_access(v_production, 'casting', p_level);
end;
$$;
revoke all on function intake_guard.selftape_object_access(text, public.access_level) from public;
grant execute on function intake_guard.selftape_object_access(text, public.access_level) to authenticated, service_role;

create policy selftapes_staff_read on storage.objects for select to authenticated
  using (bucket_id = 'selftapes' and intake_guard.selftape_object_access(name, 'view'));
create policy selftapes_staff_delete on storage.objects for delete to authenticated
  using (bucket_id = 'selftapes' and intake_guard.selftape_object_access(name, 'edit'));
