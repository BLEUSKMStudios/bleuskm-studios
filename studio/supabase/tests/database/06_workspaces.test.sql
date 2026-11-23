-- Scripts library, crew roster fields and application import ids
-- (migration 20261124100000). Runs as the real roles, so RLS applies.
begin;
\ir 00_helpers.sql

select plan(26);

\set O  '''00000000-0000-0000-0000-0000000000a0'''
\set A  '''00000000-0000-0000-0000-0000000000a1'''
\set B  '''00000000-0000-0000-0000-0000000000b1'''
\set N  '''00000000-0000-0000-0000-0000000000e1'''
\set P1 '''00000000-0000-0000-0000-00000000f001'''
\set P2 '''00000000-0000-0000-0000-00000000f002'''
\set S1 '''00000000-0000-0000-0000-0000005c0001'''

-- Fixtures (as the database owner).
insert into public.scripts (id, production_id, title, kind) values (:S1, :P1, 'P1 pilot', 'beat_sheet');
insert into public.access_grants (user_id, production_id, section_key, level) values
  (:A, :P1, 'script_breakdown', 'edit'),
  (:B, :P2, 'script_breakdown', 'view');

select is((select kind from public.scripts where id = :S1), 'beat_sheet', 'New document types are accepted');
select throws_ok($$update public.scripts set storage_path = 'scripts/00000000-0000-0000-0000-0000005c9999/x.pdf' where id = '00000000-0000-0000-0000-0000005c0001'$$,
  '23514', null, 'A script file must live under its own record');
select lives_ok($$update public.scripts set storage_path = 'scripts/00000000-0000-0000-0000-0000005c0001/1-pilot.pdf', file_name = 'pilot.pdf', mime_type = 'application/pdf', size_bytes = 10 where id = '00000000-0000-0000-0000-0000005c0001'$$,
  'A file under the record''s folder is accepted');
select throws_ok($$update public.scripts set mime_type = 'application/msword' where id = '00000000-0000-0000-0000-0000005c0001'$$,
  '23514', null, 'Only PDF and Fountain (plain text) files');
select throws_ok($$update public.scripts set supersedes_id = id where id = '00000000-0000-0000-0000-0000005c0001'$$,
  '23514', null, 'A draft cannot replace itself');
select throws_ok(format('insert into public.script_productions (script_id, production_id) values (%L, %L)', :S1, :P1),
  '23514', null, 'A script is not linked to its own production');

-- Before any link: B (Scripts on P2) cannot see the P1 script.
select tests.sign_in(:B);
set local role authenticated;
select is(tests.visible('select id from public.scripts'), 0::bigint, 'B sees no P1 script before it is linked to P2');
select is(private.script_file_access('scripts/00000000-0000-0000-0000-0000005c0001/1-pilot.pdf', 'view'), false, 'Nor its file');
reset role;

-- A: Edit Scripts on P1 only.
select tests.sign_in(:A);
set local role authenticated;
select is(tests.visible('select id from public.scripts'), 1::bigint, 'A sees the P1 script');
select throws_ok(format('insert into public.script_productions (script_id, production_id) values (%L, %L)', :S1, :P2),
  '42501', null, 'A cannot link it to P2 without Edit there');
select is(private.script_file_access('scripts/00000000-0000-0000-0000-0000005c0001/1-pilot.pdf', 'edit'), true, 'A can upload to the script''s folder');
select is(private.script_file_access('scripts/00000000-0000-0000-0000-0000005c0001/../x.pdf', 'view'), false, 'Path tricks are refused');
select is(private.script_file_access('contracts/00000000-0000-0000-0000-0000005c0001/x.pdf', 'view'), false, 'Other folders are not script files');
reset role;

-- The owner links the script to P2 too.
select tests.sign_in(:O);
set local role authenticated;
select is(tests.changed(format('insert into public.script_productions (script_id, production_id) values (%L, %L)', :S1, :P2)),
  1::bigint, 'The owner can link a script to another project');
select is((select created_by from public.script_productions where script_id = :S1), :O::uuid, 'The link records who made it');
reset role;

-- B can now read it (and its file), but not change it.
select tests.sign_in(:B);
set local role authenticated;
select is(tests.visible('select id from public.scripts'), 1::bigint, 'B sees the script linked to P2');
select is(tests.visible('select script_id from public.script_productions'), 1::bigint, 'B sees the link');
select is(tests.changed($$update public.scripts set title = 'Changed'$$), 0::bigint, 'B cannot edit a linked script');
select is(tests.changed('delete from public.script_productions'), 0::bigint, 'B cannot remove the link');
select is(private.script_file_access('scripts/00000000-0000-0000-0000-0000005c0001/1-pilot.pdf', 'view'), true, 'B can download the file');
select is(private.script_file_access('scripts/00000000-0000-0000-0000-0000005c0001/1-pilot.pdf', 'edit'), false, 'B cannot upload');
reset role;

-- N: no grants.
select tests.sign_in(:N);
set local role authenticated;
select is(tests.visible('select id from public.scripts') + tests.visible('select script_id from public.script_productions'), 0::bigint,
  'No grants, no scripts or links');
reset role;

-- Crew roster fields.
insert into public.production_team (production_id, full_name, position) values (:P1, 'Crew Person', 'Gaffer');
select is((select onboarding from public.production_team where full_name = 'Crew Person'), 'not_started', 'Onboarding starts at Not started');
select throws_ok($$update public.production_team set onboarding = 'maybe'$$, '23514', null, 'Unknown onboarding steps are refused');

-- Imported applications keep one row per Airtable record.
insert into public.casting_calls (id, production_id, public_slug, title, status) values
  ('00000000-0000-0000-0000-0000005c0c01', :P1, 'p1-archive-crew', 'Archive', 'closed');
insert into public.casting_roles (id, call_id, name, status, sort) values
  ('00000000-0000-0000-0000-0000005c0d01', '00000000-0000-0000-0000-0000005c0c01', 'Gaffer', 'closed', 1);
insert into public.casting_applications (call_id, role_id, full_name, email, source, source_record_id) values
  ('00000000-0000-0000-0000-0000005c0c01', '00000000-0000-0000-0000-0000005c0d01', 'One', 'one@test.local', 'airtable', 'recAAAAAAAAAAAAAA');
select throws_ok($$insert into public.casting_applications (call_id, role_id, full_name, email, source, source_record_id) values
  ('00000000-0000-0000-0000-0000005c0c01', '00000000-0000-0000-0000-0000005c0d01', 'Again', 'again@test.local', 'airtable', 'recAAAAAAAAAAAAAA')$$,
  '23505', null, 'The same Airtable record cannot be imported twice');

select ok((select count(*) from public.audit_log where table_name = 'script_productions') >= 1, 'Script links are audited');

select * from finish();
rollback;
