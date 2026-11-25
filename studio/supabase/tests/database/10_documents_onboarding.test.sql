-- Documents library (files, versions) and onboarding packages.
begin;
\ir 00_helpers.sql

select plan(16);

\set O  '''00000000-0000-0000-0000-0000000000a0'''
\set A  '''00000000-0000-0000-0000-0000000000a1'''
\set B  '''00000000-0000-0000-0000-0000000000b1'''
\set P1 '''00000000-0000-0000-0000-00000000f001'''
\set P2 '''00000000-0000-0000-0000-00000000f002'''
\set D1 '''00000000-0000-0000-0000-00000000d101'''
\set D2 '''00000000-0000-0000-0000-00000000d102'''
\set DX '''00000000-0000-0000-0000-00000000d109'''
\set K1 '''00000000-0000-0000-0000-00000000e101'''
\set TM '''00000000-0000-0000-0000-00000000e1f1'''

insert into public.access_grants (user_id, production_id, section_key, level) values (:A, :P1, 'documents', 'edit');
insert into public.documents (id, production_id, title, category) values (:DX, :P2, 'Other film script', 'script');
insert into public.production_team (id, production_id, full_name, email, position, team, onboarding)
  values (:TM, :P1, 'Crew Person', 'crew@example.com', 'Gaffer', 'crew', 'paperwork_signed');

select tests.sign_in(:A);
set local role authenticated;
select lives_ok(format($$insert into public.documents (id, production_id, title, category, storage_path, file_name, mime_type, size_bytes)
  values (%L, %L, 'Sides', 'sides', 'documents/%s/1-sides.pdf', 'sides.pdf', 'application/pdf', 1000)$$, :D1, :P1, :D1),
  'Documents edit access stores a script/sides document with a private file');
select throws_ok(format($$insert into public.documents (production_id, title, category, storage_path) values (%L, 'Bad', 'other', '../secrets')$$, :P1),
  '23514', null, 'File paths cannot climb out of their folder');
select lives_ok(format($$insert into public.documents (id, production_id, title, category, supersedes_id) values (%L, %L, 'Sides', 'sides', %L)$$, :D2, :P1, :D1),
  'A new version can be added');
select is((select version from public.documents where id = :D2), 2, 'The new version is numbered after the one it replaces');
select throws_ok(format($$insert into public.documents (production_id, title, category, supersedes_id) values (%L, 'X', 'other', %L)$$, :P1, :DX),
  null, null, 'A version cannot replace another production''s document');

-- Packages
select throws_ok(format($$insert into public.onboarding_packages (production_id, recipient_name, recipient_email, identity_key, subject) values (%L, 'X', 'x@example.com', 'crew', 'S')$$, :P2),
  '42501', null, 'No package without Documents access to the production');
select lives_ok(format($$insert into public.onboarding_packages (id, production_id, team_id, recipient_name, recipient_email, identity_key, subject, token_hash)
  values (%L, %L, %L, 'Crew Person', 'crew@example.com', 'crew', 'Your materials', %L)$$, :K1, :P1, :TM, repeat('a', 64)),
  'Documents edit access prepares a package');
select is((select created_by from public.onboarding_packages where id = :K1), :A::uuid, 'The package records who prepared it');
select lives_ok(format($$insert into public.onboarding_items (package_id, production_id, document_id, title, category) values (%L, %L, %L, 'Sides', 'sides')$$, :K1, :P2, :D2),
  'Items are added to the package');
select is((select production_id from public.onboarding_items where package_id = :K1), :P1::uuid, 'An item takes its package''s production, whatever is sent');
select throws_ok(format($$insert into public.onboarding_items (package_id, document_id, title, category) values (%L, %L, 'Other', 'script')$$, :K1, :DX),
  '23514', null, 'Another production''s document cannot be sent');
select throws_ok(format($$update public.onboarding_packages set acknowledged_at = now() where id = %L$$, :K1),
  '42501', null, 'Staff cannot record an acknowledgment');
select lives_ok(format($$update public.onboarding_packages set status = 'sent', sent_at = now() where id = %L$$, :K1), 'Staff mark it sent');
reset role;
select is((select onboarding from public.production_team where id = :TM), 'guide_sent', 'Sending moves the roster to guide sent');
set local role authenticated;
select throws_ok(format($$update public.onboarding_packages set status = 'acknowledged' where id = %L$$, :K1),
  '42501', null, 'Only the recipient''s link can record acknowledgment');
reset role;
-- The recipient confirms through their link (server key).
update public.onboarding_packages set status = 'acknowledged', acknowledged_at = now(), ack_name = 'Crew Person' where id = :K1;
select is((select onboarding from public.production_team where id = :TM), 'complete', 'Acknowledgment completes onboarding on the roster');

select * from finish();
rollback;
