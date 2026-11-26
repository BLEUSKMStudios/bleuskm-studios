-- Studio OS shared core: one contact per person, consent-aware audiences,
-- one activity timeline, every website submission, and one email layer.
--
-- Everything else (casting, crew, documents, contracts, campaigns, the inbox)
-- builds on these tables. Additive only: no existing row, column or table is
-- removed. The live Love Me Like This intake (casting_apply) is not changed;
-- a trigger only reads its new rows afterwards and can never block them.

-- ---------------------------------------------------------------------------
-- Contacts: one row per person (unique email), wider categories, flags
-- ---------------------------------------------------------------------------
alter table public.contacts drop constraint contacts_category_check;
alter table public.contacts add constraint contacts_category_check
  check (category in ('crew', 'cast', 'client', 'vendor', 'location', 'festival', 'press',
                      'subscriber', 'inquiry', 'other'));

alter table public.contacts
  add column tags             text[] not null default '{}' check (cardinality(tags) <= 50),
  add column email_status     text not null default 'ok'
                              check (email_status in ('ok', 'bounced', 'complained', 'blocked')),
  add column brevo_id         bigint,
  add column last_activity_at timestamptz,
  add column merged_into      uuid references public.contacts (id) on delete set null;

-- One active contact per email address. Merged contacts keep their row (and
-- history) but point at the contact they were merged into.
create unique index contacts_email_key on public.contacts (email)
  where email is not null and merged_into is null;
create index contacts_tags_idx on public.contacts using gin (tags);

-- Find or create the contact for an email address. Fills empty fields only,
-- never overwrites what the studio already has, and adds the tag.
-- Called by intake and triggers (security definer); not callable by visitors.
create function private.upsert_contact(
  p_email text, p_name text, p_category text, p_tag text,
  p_phone text default null, p_city text default null, p_website text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_name  text := left(btrim(coalesce(nullif(btrim(p_name), ''), split_part(v_email, '@', 1))), 200);
  v_id    uuid;
begin
  if v_email = '' or v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
    return null;
  end if;
  select id into v_id from public.contacts where email = v_email and merged_into is null for update;
  if v_id is null then
    insert into public.contacts (full_name, email, category, phone, city, website, tags, last_activity_at)
    values (v_name, v_email, coalesce(p_category, 'other'), left(p_phone, 40), left(p_city, 200),
            case when p_website ~* '^https?://' then left(p_website, 1000) end,
            case when p_tag is null then '{}' else array[p_tag] end, now())
    on conflict (email) where email is not null and merged_into is null do nothing
    returning id into v_id;
    if v_id is null then
      select id into v_id from public.contacts where email = v_email and merged_into is null;
    end if;
  end if;
  update public.contacts c set
    full_name = case when c.full_name = split_part(c.email, '@', 1) and nullif(btrim(p_name), '') is not null
                     then v_name else c.full_name end,
    phone     = coalesce(c.phone, left(nullif(btrim(p_phone), ''), 40)),
    city      = coalesce(c.city, left(nullif(btrim(p_city), ''), 200)),
    website   = coalesce(c.website, case when p_website ~* '^https?://' then left(p_website, 1000) end),
    -- A subscriber or inquiry who later applies becomes cast/crew.
    category  = case when c.category in ('subscriber', 'inquiry', 'other') and p_category in ('cast', 'crew', 'client')
                     then p_category else c.category end,
    tags      = case when p_tag is null or p_tag = any (c.tags) or cardinality(c.tags) >= 50
                     then c.tags else c.tags || p_tag end,
    last_activity_at = now()
  where c.id = v_id;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Activity timeline: every meaningful event, on a contact and/or production
-- ---------------------------------------------------------------------------
-- Rows are written only by Studio OS itself (triggers and server code), never
-- edited or deleted. Each row names the section that governs who may see it,
-- so a contact's timeline shows each person only what their access allows.
create table public.activity (
  id            uuid primary key default gen_random_uuid(),
  production_id uuid references public.productions (id) on delete cascade,
  section       text not null references public.sections (key),
  contact_id    uuid references public.contacts (id) on delete cascade,
  kind          text not null check (kind ~ '^[a-z][a-z0-9_.]{1,60}$'),
  summary       text not null check (length(summary) between 1 and 500),
  subject_table text check (length(subject_table) <= 60),
  subject_id    uuid,
  details       jsonb not null default '{}' check (pg_column_size(details) <= 20000),
  actor_id      uuid references public.profiles (id) on delete set null,
  actor_name    text check (length(actor_name) <= 200),
  occurred_at   timestamptz not null default now()
);
create index activity_contact_idx on public.activity (contact_id, occurred_at desc);
create index activity_production_idx on public.activity (production_id, occurred_at desc);
create index activity_subject_idx on public.activity (subject_table, subject_id);
alter table public.activity enable row level security;
revoke all on public.activity from anon, authenticated;
grant select on public.activity to authenticated;
create policy activity_select on public.activity for select to authenticated
  using (private.has_access(production_id, section, 'view'));

create function private.log_activity(
  p_section text, p_production uuid, p_contact uuid, p_kind text, p_summary text,
  p_subject_table text default null, p_subject_id uuid default null, p_details jsonb default '{}',
  p_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_actor uuid := auth.uid();
begin
  insert into public.activity (production_id, section, contact_id, kind, summary, subject_table, subject_id,
                               details, actor_id, actor_name, occurred_at)
  values (p_production, p_section, p_contact, p_kind, left(p_summary, 500), p_subject_table, p_subject_id,
          coalesce(p_details, '{}'), v_actor,
          (select full_name from public.profiles where id = v_actor), coalesce(p_at, now()))
  returning id into v_id;
  if p_contact is not null then
    update public.contacts set last_activity_at = now() where id = p_contact;
  end if;
  return v_id;
end;
$$;

-- Server code logs an event for the signed-in person, who must be able to
-- edit the section it belongs to.
create function public.log_activity(
  p_section text, p_production uuid, p_contact uuid, p_kind text, p_summary text,
  p_subject_table text default null, p_subject_id uuid default null, p_details jsonb default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.has_access(p_production, p_section, 'edit') then
    raise exception 'Not allowed' using errcode = 'insufficient_privilege';
  end if;
  return private.log_activity(p_section, p_production, p_contact, p_kind, p_summary,
                              p_subject_table, p_subject_id, p_details);
end;
$$;

-- ---------------------------------------------------------------------------
-- Audiences and consent
-- ---------------------------------------------------------------------------
-- An audience is a mailing list in Studio OS terms. Marketing audiences
-- (newsletter, film updates) need explicit consent; operational ones
-- (applicants, inquiries) are only for messages about that submission.
create table public.audiences (
  id            uuid primary key default gen_random_uuid(),
  production_id uuid references public.productions (id) on delete cascade check (production_id is null),
  key           text not null unique check (key ~ '^[a-z0-9]+([:-][a-z0-9]+)*$' and length(key) <= 80),
  name          text not null check (length(btrim(name)) between 1 and 200),
  kind          text not null check (kind in ('newsletter', 'film', 'applicants', 'inquiries', 'custom')),
  marketing     boolean not null,
  film_production_id uuid references public.productions (id) on delete set null,
  film_title    text check (length(film_title) <= 200),
  brevo_list_id integer,
  identity_key  text,
  description   text check (length(description) <= 2000),
  source        text check (length(source) <= 100),
  source_id     text check (length(source_id) <= 100),
  created_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
select private.setup_module_table('public.audiences', 'contacts');

create table public.contact_subscriptions (
  id              uuid primary key default gen_random_uuid(),
  production_id   uuid references public.productions (id) on delete cascade check (production_id is null),
  contact_id      uuid not null references public.contacts (id) on delete cascade,
  audience_id     uuid not null references public.audiences (id) on delete cascade,
  status          text not null default 'subscribed' check (status in ('subscribed', 'unsubscribed', 'pending')),
  consent_source  text check (length(consent_source) <= 200),   -- e.g. "bleuskm.com newsletter form"
  consent_text    text check (length(consent_text) <= 2000),    -- what the person agreed to
  consented_at    timestamptz,
  unsubscribed_at timestamptz,
  unsubscribe_reason text check (length(unsubscribe_reason) <= 500),
  source          text check (length(source) <= 100),
  source_id       text check (length(source_id) <= 100),
  created_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (contact_id, audience_id)
);
select private.setup_module_table('public.contact_subscriptions', 'contacts');

-- Unsubscribing is permanent until the person opts in again: staff can't flip
-- a marketing unsubscribe back to subscribed by hand.
create function private.protect_unsubscribe()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and old.status = 'unsubscribed' and new.status = 'subscribed'
     and coalesce(new.consented_at, '-infinity') <= coalesce(old.unsubscribed_at, '-infinity')
     and current_user not in ('postgres', 'service_role', 'supabase_admin') then
    raise exception 'This person unsubscribed. They have to opt in again themselves.'
      using errcode = 'check_violation';
  end if;
  -- Marketing needs a recorded opt-in: where and how the person agreed.
  if new.status = 'subscribed' and nullif(btrim(coalesce(new.consent_source, '')), '') is null
     and (select marketing from public.audiences where id = new.audience_id) then
    raise exception 'Record where and how this person agreed before subscribing them.'
      using errcode = 'check_violation';
  end if;
  if new.status = 'unsubscribed' and new.unsubscribed_at is null then new.unsubscribed_at := now(); end if;
  if new.status = 'subscribed' and new.consented_at is null then new.consented_at := now(); end if;
  return new;
end;
$$;
create trigger contact_subscriptions_protect before insert or update on public.contact_subscriptions
  for each row execute function private.protect_unsubscribe();

insert into public.audiences (key, name, kind, marketing, brevo_list_id, identity_key, description) values
  ('newsletter', 'Newsletter', 'newsletter', true, 2, 'newsletter',
   'People who signed up for BLEUSKM Studios news on the website.'),
  ('casting-applicants', 'Casting applicants', 'applicants', false, 4, 'casting',
   'Everyone who applied to a casting call. Only for messages about their application.'),
  ('crew-applicants', 'Crew applicants', 'applicants', false, 6, 'crew',
   'Everyone who applied for a crew position. Only for messages about their application.'),
  ('inquiries', 'Project inquiries', 'inquiries', false, 5, 'studio',
   'People who sent a project or client inquiry.');

-- ---------------------------------------------------------------------------
-- Website submissions: every form on bleuskm.com lands here
-- ---------------------------------------------------------------------------
create table public.intake_submissions (
  id             uuid primary key default gen_random_uuid(),
  production_id  uuid references public.productions (id) on delete set null,
  section        text not null references public.sections (key),
  kind           text not null check (kind in ('casting', 'crew', 'newsletter', 'film_notify', 'inquiry',
                                               'client_inquiry', 'self_tape', 'contract', 'consent', 'other')),
  submission_key text not null unique check (length(submission_key) between 8 and 200),
  contact_id     uuid references public.contacts (id) on delete set null,
  email          text check (email = lower(email) and length(email) <= 254),
  full_name      text check (length(full_name) <= 200),
  film_title     text check (length(film_title) <= 200),
  payload        jsonb not null default '{}' check (pg_column_size(payload) <= 60000),
  consent        jsonb not null default '{}' check (pg_column_size(consent) <= 5000),
  subject_table  text check (length(subject_table) <= 60),
  subject_id     uuid,
  -- Who sends the confirmation for this submission, and what happened.
  confirmation   text not null default 'none' check (confirmation in ('none', 'website', 'studio')),
  status         text not null default 'received' check (status in ('received', 'processed', 'failed', 'spam')),
  error          text check (length(error) <= 500),
  origin         text not null default 'website' check (origin in ('website', 'studio', 'import')),
  received_at    timestamptz not null default now(),
  processed_at   timestamptz
);
create index intake_submissions_received_idx on public.intake_submissions (received_at desc);
create index intake_submissions_contact_idx on public.intake_submissions (contact_id);
alter table public.intake_submissions enable row level security;
revoke all on public.intake_submissions from anon, authenticated;
grant select on public.intake_submissions to authenticated;
create policy intake_select on public.intake_submissions for select to authenticated
  using (private.has_access(production_id, section, 'view'));
create trigger audit_intake_submissions after insert or update or delete on public.intake_submissions
  for each row execute function private.write_audit();

-- ---------------------------------------------------------------------------
-- Sender identities (casting@, crew@, newsletter@, films@, studio@)
-- ---------------------------------------------------------------------------
-- Nothing is sent from an identity until it is marked verified for the
-- provider that sends it (casting@ and crew@ already send live through Brevo;
-- the others wait for the owner). "kind" records what the address really is in Zoho
-- (alias, group, forwarding or separate mailbox), so no one has to assume.
create table public.email_identities (
  key            text primary key check (key ~ '^[a-z]+$'),
  address        text not null unique check (address = lower(address) and address ~ '^[^\s@]+@[^\s@]+$'),
  display_name   text not null check (length(display_name) between 1 and 100),
  reply_to       text check (reply_to = lower(reply_to)),
  purpose        text not null check (length(purpose) <= 500),
  zoho_kind      text not null default 'unverified'
                 check (zoho_kind in ('unverified', 'alias', 'group', 'forwarding', 'mailbox')),
  brevo_verified boolean not null default false,   -- verified sender in Brevo
  zoho_send_as   boolean not null default false,   -- can be used as From in Zoho
  verified_by    uuid references public.profiles (id) on delete set null,
  verified_at    timestamptz,
  notes          text check (length(notes) <= 2000),
  updated_at     timestamptz not null default now()
);
create trigger email_identities_touch before update on public.email_identities
  for each row execute function private.touch_updated_at();
create trigger audit_email_identities after insert or update or delete on public.email_identities
  for each row execute function private.write_audit();
alter table public.email_identities enable row level security;
revoke all on public.email_identities from anon, authenticated;
grant select, update on public.email_identities to authenticated;
create policy identities_select on public.email_identities for select to authenticated using (true);
create policy identities_update on public.email_identities for update to authenticated
  using (private.is_owner()) with check (private.is_owner());

insert into public.email_identities (key, address, display_name, purpose, brevo_verified, notes) values
  ('casting',    'casting@bleuskm.com',    'BLEUSKM Studios Casting', 'Casting confirmations, actor messages, self-tape and callback invitations, decisions, audition details.',
   true, 'Already a verified Brevo sender: the live casting emails have gone out from it since November 23.'),
  ('crew',       'crew@bleuskm.com',       'BLEUSKM Studios Crew',    'Crew confirmations, invitations, decisions, onboarding, department and production updates.',
   true, 'Already a verified Brevo sender: the live crew-call emails have gone out from it since November 23.'),
  ('newsletter', 'newsletter@bleuskm.com', 'BLEUSKM Studios',         'Newsletters, announcements and subscriber campaigns.', false, null),
  ('films',      'films@bleuskm.com',      'BLEUSKM Studios Films',   'Film notifications, casting-open announcements and film campaigns.', false, null),
  ('studio',     'studio@bleuskm.com',     'BLEUSKM Studios',         'General business and client correspondence.', false, null);

alter table public.audiences add constraint audiences_identity_fk
  foreign key (identity_key) references public.email_identities (key);

-- ---------------------------------------------------------------------------
-- Email templates (editable in Studio OS)
-- ---------------------------------------------------------------------------
-- Studio-level templates (production_id null) are the defaults; a production
-- can override one by creating a template with the same key.
create table public.email_templates (
  id            uuid primary key default gen_random_uuid(),
  production_id uuid references public.productions (id) on delete cascade,
  key           text not null check (key ~ '^[a-z][a-z0-9_]{1,60}$'),
  name          text not null check (length(btrim(name)) between 1 and 200),
  identity_key  text not null references public.email_identities (key),
  subject       text not null check (length(btrim(subject)) between 1 and 300),
  preview_text  text check (length(preview_text) <= 300),
  body          text not null check (length(btrim(body)) between 1 and 50000),
  -- Automatic confirmations only go out when enabled.
  auto_send     boolean not null default false,
  source        text check (length(source) <= 100),
  source_id     text check (length(source_id) <= 100),
  created_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index email_templates_key on public.email_templates (coalesce(production_id, '00000000-0000-0000-0000-000000000000'::uuid), key);
select private.setup_module_table('public.email_templates', 'communications');

insert into public.email_templates (key, name, identity_key, subject, body, auto_send) values
  ('confirm_casting', 'Casting application received', 'casting',
   'We received your audition submission for {{film}}',
   E'Hi {{first_name}},\n\nThank you for submitting for {{role}} in {{film}}. Your application is in, and our casting team reviews every submission.\n\nIf you are selected for the next step, we will email you from casting@bleuskm.com with details.\n\nBLEUSKM Studios Casting', false),
  ('confirm_crew', 'Crew application received', 'crew',
   'We received your crew application',
   E'Hi {{first_name}},\n\nThank you for applying{{#role}} for {{role}}{{/role}} with BLEUSKM Studios. We review every application and will reach out from crew@bleuskm.com if there is a fit.\n\nBLEUSKM Studios Crew', false),
  ('confirm_newsletter', 'Newsletter welcome', 'newsletter',
   'Welcome to BLEUSKM Studios',
   E'Hi {{first_name}},\n\nThank you for joining the BLEUSKM Studios newsletter. You will hear about new films, casting calls and releases.\n\nYou can unsubscribe at any time from the link in any of our emails.\n\nBLEUSKM Studios', false),
  ('confirm_film_notify', 'Film updates sign-up', 'films',
   'You will hear about {{film}} first',
   E'Hi {{first_name}},\n\nThank you for signing up for updates on {{film}}. We will email you when there is news, including when casting opens.\n\nBLEUSKM Studios Films', false),
  ('confirm_inquiry', 'Inquiry received', 'studio',
   'We received your message',
   E'Hi {{first_name}},\n\nThank you for reaching out to BLEUSKM Studios. We read every inquiry and will reply from studio@bleuskm.com.\n\nBLEUSKM Studios', false);

-- ---------------------------------------------------------------------------
-- Outgoing email: comm_messages becomes the one log for every send
-- ---------------------------------------------------------------------------
alter table public.comm_messages drop constraint comm_messages_status_check;
alter table public.comm_messages add constraint comm_messages_status_check
  check (status in ('logged', 'queued', 'sending', 'sent', 'delivered', 'opened', 'failed', 'bounced',
                    'blocked', 'skipped', 'received', 'draft'));

alter table public.comm_messages
  add column contact_id      uuid references public.contacts (id) on delete set null,
  add column identity_key    text references public.email_identities (key),
  add column template_key    text check (length(template_key) <= 60),
  -- The same key never sends twice (double clicks, retries, re-runs).
  add column idempotency_key text check (length(idempotency_key) between 8 and 200),
  add column related_table   text check (length(related_table) <= 60),
  add column related_id      uuid,
  add column html            text check (length(html) <= 200000),
  add column error           text check (length(error) <= 500),
  add column attempts        smallint not null default 0,
  add column thread_key      text check (length(thread_key) <= 300),
  add column folder          text check (length(folder) <= 100),
  add column archived        boolean not null default false,
  add column read_at         timestamptz,
  add column delivered_at    timestamptz,
  add column opened_at       timestamptz;
create unique index comm_messages_idempotency_key on public.comm_messages (idempotency_key)
  where idempotency_key is not null;
create index comm_messages_contact_idx on public.comm_messages (contact_id, sent_at desc);
create index comm_messages_related_idx on public.comm_messages (related_table, related_id);

-- ---------------------------------------------------------------------------
-- Website intake (called by the website's server only, with a server key)
-- ---------------------------------------------------------------------------
-- p: { kind, submission_key, email, name, phone, city, website, film,
--      role, production_slug, payload, consent: { newsletter, film_updates,
--      text, source }, confirmation, subject_table, subject_id }
-- Returns { submission_id, contact_id, duplicate }.
create function public.studio_intake(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kind     text := p ->> 'kind';
  v_key      text := p ->> 'submission_key';
  v_email    text := lower(btrim(coalesce(p ->> 'email', '')));
  v_film     text := left(nullif(btrim(p ->> 'film'), ''), 200);
  v_prod     uuid;
  v_section  text;
  v_category text;
  v_tag      text;
  v_contact  uuid;
  v_sub      uuid;
  v_aud      uuid;
  v_consent  jsonb := coalesce(p -> 'consent', '{}');
  v_ctext    text := left(coalesce(v_consent ->> 'text', ''), 2000);
  v_csource  text := left(coalesce(v_consent ->> 'source', 'bleuskm.com'), 200);
  v_existing uuid;
  v_summary  text;
  -- Imports of older records keep their original time.
  v_origin   text := case when p ->> 'origin' = 'import' then 'import' else 'website' end;
  v_at       timestamptz := case when p ->> 'origin' = 'import' then coalesce((p ->> 'received_at')::timestamptz, now()) else now() end;
begin
  if v_kind is null or v_key is null or length(v_key) < 8 then
    raise exception 'kind and submission_key are required' using errcode = 'check_violation';
  end if;

  select id, contact_id into v_existing, v_contact from public.intake_submissions where submission_key = v_key;
  if v_existing is not null then
    return jsonb_build_object('submission_id', v_existing, 'contact_id', v_contact, 'duplicate', true);
  end if;

  if p ? 'production_slug' then
    select id into v_prod from public.productions where slug = p ->> 'production_slug';
  end if;
  if v_prod is null and v_film is not null then
    select id into v_prod from public.productions where lower(title) = lower(v_film) limit 1;
  end if;

  v_section := case v_kind
    when 'casting' then 'casting' when 'self_tape' then 'casting'
    when 'crew' then 'crew' when 'contract' then 'documents'
    else 'contacts' end;
  -- Studio-level sections only make sense without a production.
  if v_section = 'contacts' then v_prod := null; end if;

  v_category := case v_kind
    when 'casting' then 'cast' when 'self_tape' then 'cast' when 'crew' then 'crew'
    when 'client_inquiry' then 'client' when 'inquiry' then 'inquiry'
    when 'newsletter' then 'subscriber' when 'film_notify' then 'subscriber' else 'other' end;
  v_tag := case v_kind
    when 'casting' then 'casting-applicant' when 'self_tape' then 'casting-applicant'
    when 'crew' then 'crew-applicant' when 'newsletter' then 'newsletter'
    when 'film_notify' then 'film-updates' when 'inquiry' then 'inquiry'
    when 'client_inquiry' then 'client' else null end;

  v_contact := private.upsert_contact(v_email, p ->> 'name', v_category, v_tag,
                                      p ->> 'phone', p ->> 'city', p ->> 'website');

  insert into public.intake_submissions (production_id, section, kind, submission_key, contact_id, email,
    full_name, film_title, payload, consent, subject_table, subject_id, confirmation, status, origin, received_at, processed_at)
  values (v_prod, v_section, v_kind, v_key, v_contact, nullif(v_email, ''), left(p ->> 'name', 200), v_film,
    coalesce(p -> 'payload', '{}'), v_consent, p ->> 'subject_table', (p ->> 'subject_id')::uuid,
    case when v_origin = 'import' then 'none' else coalesce(p ->> 'confirmation', 'none') end,
    case when v_contact is null then 'failed' else 'processed' end, v_origin, v_at, now())
  returning id into v_sub;

  if v_contact is null then
    update public.intake_submissions set error = 'No valid email address' where id = v_sub;
    return jsonb_build_object('submission_id', v_sub, 'contact_id', null, 'duplicate', false);
  end if;

  -- Consent: only explicit opt-ins create marketing subscriptions.
  if v_kind = 'newsletter' or coalesce((v_consent ->> 'newsletter')::boolean, false) then
    select id into v_aud from public.audiences where key = 'newsletter';
    perform private.subscribe(v_contact, v_aud, v_csource,
      coalesce(nullif(v_ctext, ''), 'Signed up for the BLEUSKM Studios newsletter on bleuskm.com.'), v_at, v_origin = 'import');
  end if;
  if v_film is not null and (v_kind = 'film_notify' or coalesce((v_consent ->> 'film_updates')::boolean, false)) then
    v_aud := private.film_audience(v_film, v_prod);
    perform private.subscribe(v_contact, v_aud, v_csource,
      coalesce(nullif(v_ctext, ''), 'Signed up for updates on ' || v_film || ' on bleuskm.com.'), v_at, v_origin = 'import');
  end if;
  -- Operational audiences (no marketing consent implied).
  if v_kind in ('casting', 'crew', 'inquiry', 'client_inquiry') then
    select id into v_aud from public.audiences
    where key = case v_kind when 'casting' then 'casting-applicants' when 'crew' then 'crew-applicants' else 'inquiries' end;
    insert into public.contact_subscriptions (contact_id, audience_id, status, consent_source, consented_at)
    values (v_contact, v_aud, 'subscribed', v_csource, now())
    on conflict (contact_id, audience_id) do nothing;
  end if;

  v_summary := case v_kind
    when 'casting' then 'Applied for ' || coalesce(nullif(p ->> 'role', ''), 'a role') || coalesce(' in ' || v_film, '')
    when 'crew' then 'Applied for crew' || coalesce(': ' || nullif(p ->> 'role', ''), '')
    when 'newsletter' then 'Signed up for the newsletter'
    when 'film_notify' then 'Signed up for updates on ' || coalesce(v_film, 'a film')
    when 'inquiry' then 'Sent a project inquiry'
    when 'client_inquiry' then 'Sent a client inquiry'
    when 'self_tape' then 'Sent a self-tape' || coalesce(' for ' || v_film, '')
    when 'contract' then 'Signed a contract on the website'
    else 'Sent a website form' end;
  perform private.log_activity(v_section, v_prod, v_contact, 'intake.' || v_kind, v_summary,
                               'intake_submissions', v_sub, jsonb_build_object('film', v_film, 'origin', v_origin), v_at);

  return jsonb_build_object('submission_id', v_sub, 'contact_id', v_contact, 'duplicate', false);
end;
$$;

create function private.subscribe(p_contact uuid, p_audience uuid, p_source text, p_text text, p_at timestamptz default null,
                                  p_import boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_at timestamptz := coalesce(p_at, now());
begin
  -- A fresh opt-in re-subscribes someone who left earlier, recorded with its
  -- own time and wording. An import never undoes an unsubscribe.
  insert into public.contact_subscriptions (contact_id, audience_id, status, consent_source, consent_text, consented_at)
  values (p_contact, p_audience, 'subscribed', p_source, p_text, v_at)
  on conflict (contact_id, audience_id) do update
    set status = 'subscribed', consent_source = excluded.consent_source,
        consent_text = excluded.consent_text, consented_at = excluded.consented_at, unsubscribed_at = null
    where public.contact_subscriptions.status <> 'unsubscribed'
       or (not p_import and public.contact_subscriptions.unsubscribed_at < excluded.consented_at);
end;
$$;

create function private.film_audience(p_film text, p_production uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text := 'film:' || trim(both '-' from regexp_replace(lower(p_film), '[^a-z0-9]+', '-', 'g'));
  v_id  uuid;
begin
  v_key := left(v_key, 80);
  select id into v_id from public.audiences where key = v_key;
  if v_id is null then
    insert into public.audiences (key, name, kind, marketing, film_production_id, film_title, brevo_list_id, identity_key, description)
    values (v_key, p_film || ' updates', 'film', true, p_production, p_film, 2, 'films',
            'People who asked for news about ' || p_film || '.')
    on conflict (key) do nothing
    returning id into v_id;
    if v_id is null then select id into v_id from public.audiences where key = v_key; end if;
  end if;
  return v_id;
end;
$$;

revoke all on function public.studio_intake(jsonb) from public, anon, authenticated;
grant execute on function public.studio_intake(jsonb) to service_role;
revoke all on function public.log_activity(text, uuid, uuid, text, text, text, uuid, jsonb) from public, anon;
grant execute on function public.log_activity(text, uuid, uuid, text, text, text, uuid, jsonb) to authenticated, service_role;
revoke all on function private.log_activity(text, uuid, uuid, text, text, text, uuid, jsonb, timestamptz) from public;
revoke all on function private.upsert_contact(text, text, text, text, text, text, text) from public;
revoke all on function private.subscribe(uuid, uuid, text, text, timestamptz, boolean) from public;
revoke all on function private.film_audience(text, uuid) from public;

-- ---------------------------------------------------------------------------
-- Casting and crew applications join the contact and the timeline
-- ---------------------------------------------------------------------------
alter table public.casting_applications
  add column contact_id uuid references public.contacts (id) on delete set null;
create index casting_applications_contact_idx on public.casting_applications (contact_id);
-- Hub users read applications column by column (the upload token stays hidden).
grant select (contact_id) on public.casting_applications to authenticated;

-- Runs after the live website's insert. Any problem here is swallowed and
-- recorded, so an application is never lost because of the contact layer.
create function private.casting_application_to_contact()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_crew    boolean;
  v_contact uuid;
  v_role    text;
  v_film    text;
begin
  begin
    select c.public_slug like '%-crew', r.name, p.title into v_crew, v_role, v_film
    from public.casting_calls c
    join public.casting_roles r on r.id = new.role_id
    join public.productions p on p.id = new.production_id
    where c.id = new.call_id;

    v_contact := private.upsert_contact(new.email, new.full_name,
      case when v_crew then 'crew' else 'cast' end,
      case when v_crew then 'crew-applicant' else 'casting-applicant' end,
      new.phone, new.location, null);
    update public.casting_applications set contact_id = v_contact where id = new.id;

    insert into public.intake_submissions (production_id, section, kind, submission_key, contact_id, email,
      full_name, film_title, payload, subject_table, subject_id,
      confirmation, status, origin, processed_at)
    values (new.production_id, 'casting', case when v_crew then 'crew' else 'casting' end,
      'casting_application:' || new.id, v_contact, new.email, new.full_name, v_film,
      jsonb_build_object('role', v_role, 'access_code', new.access_code), 'casting_applications', new.id,
      case when new.source = 'website' then 'website' else 'none' end,
      'processed', case when new.source = 'website' then 'website' when new.source = 'airtable' then 'import' else 'studio' end,
      now())
    on conflict (submission_key) do nothing;

    perform private.log_activity('casting', new.production_id, v_contact, 'application.submitted',
      'Applied for ' || coalesce(v_role, 'a role') || ' in ' || coalesce(v_film, 'a production'),
      'casting_applications', new.id, jsonb_build_object('source', new.source));
  exception when others then
    raise warning 'casting_application_to_contact skipped for %: %', new.id, sqlstate;
  end;
  return null;
end;
$$;
create trigger casting_applications_contact after insert on public.casting_applications
  for each row execute function private.casting_application_to_contact();

-- Status changes go on the timeline.
create function private.casting_application_status_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    perform private.log_activity('casting', new.production_id, new.contact_id, 'application.status',
      'Status changed from ' || replace(old.status::text, '_', ' ') || ' to ' || replace(new.status::text, '_', ' '),
      'casting_applications', new.id, jsonb_build_object('from', old.status, 'to', new.status));
  end if;
  return null;
end;
$$;
create trigger casting_applications_status_activity after update of status on public.casting_applications
  for each row execute function private.casting_application_status_activity();

-- Link applications that came in before this migration.
do $$
declare r record;
begin
  for r in select a.id, a.email, a.full_name, a.phone, a.location, c.public_slug like '%-crew' as crew
           from public.casting_applications a join public.casting_calls c on c.id = a.call_id
           where a.contact_id is null loop
    update public.casting_applications
       set contact_id = private.upsert_contact(r.email, r.full_name,
             case when r.crew then 'crew' else 'cast' end,
             case when r.crew then 'crew-applicant' else 'casting-applicant' end, r.phone, r.location, null)
     where id = r.id;
  end loop;
end;
$$;

-- Crew and cast rosters point at the same contact as well.
create function private.production_team_contact()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.contact_id is null and new.email is not null then
    new.contact_id := private.upsert_contact(new.email, new.full_name,
      case when new.team = 'cast' then 'cast' else 'crew' end, null, new.phone, null, null);
  end if;
  return new;
end;
$$;
create trigger production_team_contact before insert or update of email on public.production_team
  for each row execute function private.production_team_contact();

-- ---------------------------------------------------------------------------
-- Merging duplicate contacts (owner only)
-- ---------------------------------------------------------------------------
-- Everything linked to the duplicate moves to the kept contact; the duplicate
-- row stays (marked merged) so its history and audit trail are not lost.
create function public.merge_contacts(p_from uuid, p_into uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  f public.contacts;
  t public.contacts;
begin
  if not private.is_owner() then
    raise exception 'Only the owner can merge contacts' using errcode = 'insufficient_privilege';
  end if;
  select * into f from public.contacts where id = p_from and merged_into is null for update;
  select * into t from public.contacts where id = p_into and merged_into is null for update;
  if f.id is null or t.id is null or f.id = t.id then
    raise exception 'Choose two different, unmerged contacts' using errcode = 'check_violation';
  end if;

  update public.casting_applications set contact_id = t.id where contact_id = f.id;
  update public.production_team set contact_id = t.id where contact_id = f.id;
  update public.documents set contact_id = t.id where contact_id = f.id;
  update public.comm_messages set contact_id = t.id where contact_id = f.id;
  update public.intake_submissions set contact_id = t.id where contact_id = f.id;
  update public.activity set contact_id = t.id where contact_id = f.id;
  -- Subscriptions: keep the kept contact's own, add the others. An
  -- unsubscribe on either side wins.
  update public.contact_subscriptions s set status = 'unsubscribed', unsubscribed_at = coalesce(o.unsubscribed_at, now())
  from public.contact_subscriptions o
  where s.contact_id = t.id and o.contact_id = f.id and o.audience_id = s.audience_id and o.status = 'unsubscribed';
  update public.contact_subscriptions set contact_id = t.id
  where contact_id = f.id and audience_id not in (select audience_id from public.contact_subscriptions where contact_id = t.id);

  update public.contacts set
    phone = coalesce(t.phone, f.phone), city = coalesce(t.city, f.city), website = coalesce(t.website, f.website),
    company = coalesce(t.company, f.company), roles = coalesce(t.roles, f.roles),
    notes = case when f.notes is null then t.notes when t.notes is null then f.notes else left(t.notes || E'\n\n' || f.notes, 10000) end,
    tags = (select coalesce(array_agg(distinct x), '{}') from unnest(t.tags || f.tags) x)
  where id = t.id;
  -- The duplicate keeps its row for history, marked as merged (the email
  -- index ignores merged rows, so only the kept contact is matched by email).
  update public.contacts set merged_into = t.id, notes = left(coalesce(notes || E'\n\n', '') || 'Merged into ' || t.full_name || coalesce(' <' || f.email || '>', ''), 10000)
  where id = f.id;
  perform private.log_activity('contacts', null, t.id, 'contact.merged',
    'Merged with a duplicate record (' || f.full_name || coalesce(', ' || f.email, '') || ')', 'contacts', f.id);
end;
$$;
revoke all on function public.merge_contacts(uuid, uuid) from public, anon;
grant execute on function public.merge_contacts(uuid, uuid) to authenticated;
