-- Read-only check after the Nov 25 Studio OS migrations (20261125090000 to 20261125160000).
-- Prints names and counts only, never people's details or early-access codes.
\pset footer off
create temporary view expected as
  select 'table' as kind, t.name as item, to_regclass('public.' || t.name) is not null as ok
  from (values ('activity'), ('audiences'), ('contact_subscriptions'), ('intake_submissions'), ('email_identities'), ('email_templates'), ('casting_custom_statuses'), ('selftape_invitations'), ('contract_templates'), ('contract_requests'), ('contract_events'), ('contract_otps'), ('onboarding_packages'), ('onboarding_items'), ('call_sheet_sends'), ('campaigns'), ('campaign_recipients')) as t(name)
  union all
  select 'field', c.tbl || '.' || c.col, exists (
    select 1 from information_schema.columns i
    where i.table_schema = 'public' and i.table_name = c.tbl and i.column_name = c.col)
  from (values
    ('contacts', 'tags'),
    ('contacts', 'email_status'),
    ('contacts', 'brevo_id'),
    ('contacts', 'last_activity_at'),
    ('contacts', 'merged_into'),
    ('comm_messages', 'contact_id'),
    ('comm_messages', 'identity_key'),
    ('comm_messages', 'template_key'),
    ('comm_messages', 'idempotency_key'),
    ('comm_messages', 'related_table'),
    ('comm_messages', 'related_id'),
    ('comm_messages', 'html'),
    ('comm_messages', 'error'),
    ('comm_messages', 'attempts'),
    ('comm_messages', 'thread_key'),
    ('comm_messages', 'folder'),
    ('comm_messages', 'archived'),
    ('comm_messages', 'read_at'),
    ('comm_messages', 'delivered_at'),
    ('comm_messages', 'opened_at'),
    ('casting_applications', 'contact_id'),
    ('casting_applications', 'custom_status_id'),
    ('casting_materials', 'invitation_id'),
    ('production_team', 'application_id'),
    ('casting_materials', 'storage_bucket'),
    ('documents', 'file_name'),
    ('documents', 'mime_type'),
    ('documents', 'size_bytes'),
    ('documents', 'version'),
    ('documents', 'supersedes_id'),
    ('call_sheets', 'crew_call'),
    ('call_sheets', 'sunrise'),
    ('call_sheets', 'sunset'),
    ('call_sheets', 'key_contacts'),
    ('call_sheets', 'safety_notes'),
    ('call_sheets', 'version'),
    ('call_sheets', 'last_sent_at'),
    ('call_sheet_entries', 'team_id'),
    ('call_sheet_entries', 'email'),
    ('call_sheet_entries', 'team')
  ) as c(tbl, col);
\echo 'New tables and fields:'
select '  ' || count(*) filter (where kind = 'table' and ok) || ' of ' || count(*) filter (where kind = 'table') || ' new tables present, '
  || count(*) filter (where kind = 'field' and ok) || ' of ' || count(*) filter (where kind = 'field') || ' new fields present'
from expected;
select '  MISSING ' || kind || ': ' || item from expected where not ok order by 1;
\echo 'Casting data (rows):'
select '  productions: ' || count(*) from public.productions
union all select '  production_stages: ' || count(*) from public.production_stages
union all select '  casting_calls: ' || count(*) from public.casting_calls
union all select '  casting_roles: ' || count(*) from public.casting_roles
union all select '  casting_applications: ' || count(*) || ' (' || count(contact_id) || ' linked to a contact)' from public.casting_applications
union all select '  casting_materials: ' || count(*) from public.casting_materials;
\echo 'Casting call dates (Central time; early-access codes are not printed):'
select '  ' || c.public_slug || ': early access ' || coalesce((
    select string_agg(to_char((e.value #>> '{}')::timestamptz at time zone 'America/Chicago', 'Mon DD HH12:MI AM'), ', '
                      order by (e.value #>> '{}')::timestamptz)
    from jsonb_each(c.early_access_starts) e), 'none')
  || '; opens ' || coalesce(to_char(c.opens_at at time zone 'America/Chicago', 'Mon DD HH12:MI AM'), '-')
  || '; closes ' || coalesce(to_char(c.deadline at time zone 'America/Chicago', 'Mon DD HH12:MI AM'), '-')
from public.casting_calls c order by 1;
\echo 'Live website form functions:'
select '  ' || p.proname || ': present' from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('casting_apply', 'casting_public_call', 'casting_attach_files') order by 1;
select case when exists (select 1 from expected where not ok) then 'RESULT: something is missing' else 'RESULT: all present' end;
