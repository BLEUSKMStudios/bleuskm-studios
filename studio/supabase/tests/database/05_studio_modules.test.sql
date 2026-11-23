-- Studio OS modules: the new sections and section tables follow the same
-- No/View/Edit rules as everything else. Runs as the real roles, so RLS applies.
begin;
\ir 00_helpers.sql

select plan(35);

\set O  '''00000000-0000-0000-0000-0000000000a0'''
\set A  '''00000000-0000-0000-0000-0000000000a1'''
\set B  '''00000000-0000-0000-0000-0000000000b1'''
\set D  '''00000000-0000-0000-0000-0000000000d1'''
\set N  '''00000000-0000-0000-0000-0000000000e1'''
\set P1 '''00000000-0000-0000-0000-00000000f001'''
\set P2 '''00000000-0000-0000-0000-00000000f002'''

-- ---------------------------------------------------------------------------
-- Sections
-- ---------------------------------------------------------------------------
select is((select count(*) from public.sections where key in ('development', 'contacts', 'post', 'distribution')), 4::bigint,
  'The four new sections exist');
select is((select label from public.sections where key = 'tasks'), 'Production Tracking', 'Tasks is now Production Tracking');
select is((select count(*) from public.production_sections where production_id = :P1 and section_key in ('development', 'post', 'distribution')),
  3::bigint, 'New productions get the new production sections switched on');
select throws_ok(
  format('insert into public.access_grants (user_id, production_id, section_key, level) values (%L, %L, ''contacts'', ''view'')', :A, :P1),
  '23514', null, 'Contacts cannot be granted per production (Studio level only)');
select throws_ok(
  format('insert into public.access_grants (user_id, production_id, section_key, level) values (%L, null, ''post'', ''view'')', :A),
  '23514', null, 'Post-Production has no Studio level');

-- ---------------------------------------------------------------------------
-- Fixtures (as the database owner)
-- ---------------------------------------------------------------------------
insert into public.production_tasks (id, production_id, title, due_on) values
  ('00000000-0000-0000-0000-0000000a0001', :P1, 'P1 task', current_date + 3),
  ('00000000-0000-0000-0000-0000000a0002', :P2, 'P2 task', current_date + 4);
insert into public.schedule_events (production_id, title, kind, starts_on) values
  (:P1, 'P1 shoot day', 'shoot_day', current_date + 10),
  (null, 'Studio deadline', 'deadline', current_date + 2);
insert into public.contacts (full_name, email) values ('Studio Contact', 'contact@test.local');
insert into public.call_sheets (id, production_id, shoot_date, title) values
  ('00000000-0000-0000-0000-0000000b0001', :P1, current_date + 10, 'Day 1');
insert into public.festival_submissions (production_id, festival, deadline) values (:P1, 'Test Fest', current_date + 30);

select throws_ok($$insert into public.contacts (production_id, full_name) values ('00000000-0000-0000-0000-00000000f001', 'X')$$,
  '23514', null, 'A contact cannot belong to a production');
select throws_ok($$insert into public.production_notes (production_id, title, source) values ('00000000-0000-0000-0000-00000000f001', 'X', 'airtable:tbl')$$,
  '23514', null, 'source and source_id must be set together');

-- Imports are idempotent: the same source record can only exist once.
insert into public.documents (production_id, title, source, source_id) values (:P1, 'Imported', 'airtable:tblTEST', 'recAAA');
select throws_ok($$insert into public.documents (production_id, title, source, source_id) values (null, 'Again', 'airtable:tblTEST', 'recAAA')$$,
  '23505', null, 'An imported record cannot be inserted twice');

-- Call sheet lines always take their sheet's production.
insert into public.call_sheet_entries (id, call_sheet_id, production_id, full_name)
values ('00000000-0000-0000-0000-0000000b0101', '00000000-0000-0000-0000-0000000b0001', :P2, 'Crew Person');
select is((select production_id from public.call_sheet_entries where id = '00000000-0000-0000-0000-0000000b0101'), :P1::uuid,
  'A call sheet line takes the call sheet''s production, whatever was sent');

-- Grants for this file (on top of the shared fixtures):
--   A: View Production Tracking on P1, Edit Scheduling on P1, View Contacts (Studio).
--   B: Edit Production Tracking on P2, Edit Distribution on P2.
insert into public.access_grants (user_id, production_id, section_key, level) values
  (:A, :P1, 'tasks', 'view'),
  (:A, :P1, 'scheduling', 'edit'),
  (:A, null, 'contacts', 'view'),
  (:B, :P2, 'tasks', 'edit'),
  (:B, :P2, 'distribution', 'edit'),
  (:D, :P1, 'tasks', 'edit');

-- ---------------------------------------------------------------------------
-- Signed out: nothing
-- ---------------------------------------------------------------------------
select tests.sign_out();
set local role anon;
select throws_ok('select id from public.production_tasks', '42501', null, 'anon cannot read tasks');
select throws_ok('select id from public.contacts', '42501', null, 'anon cannot read contacts');
select throws_ok('select id from public.comm_messages', '42501', null, 'anon cannot read messages');
select throws_ok('select id from public.migration_runs', '42501', null, 'anon cannot read migration runs');
reset role;

-- ---------------------------------------------------------------------------
-- Owner: everything
-- ---------------------------------------------------------------------------
select tests.sign_in(:O);
set local role authenticated;
select is(tests.visible('select id from public.production_tasks'), 2::bigint, 'The owner sees every task');
select is(tests.visible('select id from public.contacts'), 1::bigint, 'The owner sees contacts');
select is(tests.changed($$insert into public.releases (production_id, title) values ('00000000-0000-0000-0000-00000000f002', 'Premiere')$$),
  1::bigint, 'The owner can add a release');
select is((select created_by from public.releases where title = 'Premiere'), :O::uuid, 'created_by is stamped with the signed-in person');
reset role;

-- ---------------------------------------------------------------------------
-- A: View tracking on P1, Edit scheduling on P1, View contacts
-- ---------------------------------------------------------------------------
select tests.sign_in(:A);
set local role authenticated;
select is(tests.visible('select id from public.production_tasks'), 1::bigint, 'A sees only P1 tasks');
select is(tests.changed($$update public.production_tasks set status = 'done'$$), 0::bigint, 'View access cannot change tasks');
select throws_ok($$insert into public.production_tasks (production_id, title) values ('00000000-0000-0000-0000-00000000f001', 'x')$$,
  '42501', null, 'View access cannot add tasks');
select is(tests.visible('select id from public.schedule_events'), 1::bigint, 'A sees P1 events, not Studio-level ones (no Studio grant)');
select is(tests.changed($$insert into public.call_sheet_entries (call_sheet_id, full_name) values ('00000000-0000-0000-0000-0000000b0001', 'New line')$$),
  1::bigint, 'Edit Scheduling can add call sheet lines');
select is(tests.visible('select id from public.contacts'), 1::bigint, 'A can view contacts');
select is(tests.changed($$update public.contacts set notes = 'x'$$), 0::bigint, 'A cannot edit contacts with View');
select is(tests.visible('select id from public.festival_submissions'), 0::bigint, 'No Distribution grant, no festivals');
select is(tests.visible('select id from public.migration_runs'), 0::bigint, 'Only the owner reads migration runs');
reset role;

-- ---------------------------------------------------------------------------
-- B: Edit on P2 only
-- ---------------------------------------------------------------------------
select tests.sign_in(:B);
set local role authenticated;
select is(tests.visible('select id from public.production_tasks'), 1::bigint, 'B sees only P2 tasks');
select is(tests.changed($$update public.production_tasks set status = 'done' where production_id = '00000000-0000-0000-0000-00000000f001'$$),
  0::bigint, 'B cannot change P1 tasks');
select throws_ok($$update public.production_tasks set production_id = '00000000-0000-0000-0000-00000000f001' where id = '00000000-0000-0000-0000-0000000a0002'$$,
  '42501', null, 'B cannot move a task into a production they cannot edit');
select is(tests.changed($$insert into public.festival_submissions (production_id, festival) values ('00000000-0000-0000-0000-00000000f002', 'B Fest')$$),
  1::bigint, 'Edit Distribution on P2 can add a festival there');
select throws_ok($$insert into public.festival_submissions (production_id, festival) values ('00000000-0000-0000-0000-00000000f001', 'Wrong')$$,
  '42501', null, 'B cannot add a festival to P1');
select is(tests.visible('select id from public.contacts'), 0::bigint, 'B (no Contacts grant) sees no contacts');
reset role;

-- ---------------------------------------------------------------------------
-- D (deactivated) and N (no grants): nothing
-- ---------------------------------------------------------------------------
select tests.sign_in(:D);
set local role authenticated;
select is(tests.visible('select id from public.production_tasks'), 0::bigint, 'A deactivated user sees nothing, whatever their grants');
reset role;
select tests.sign_in(:N);
set local role authenticated;
select is(tests.visible('select id from public.schedule_events') + tests.visible('select id from public.documents'), 0::bigint,
  'A user with no grants sees nothing');
reset role;

-- Every change to module records lands in the audit log.
select ok((select count(*) from public.audit_log where table_name = 'releases') >= 1, 'Module changes are audited');

select * from finish();
rollback;
