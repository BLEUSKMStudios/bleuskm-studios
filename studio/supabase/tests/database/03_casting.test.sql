-- Casting: public intake, file uploads and review permissions.
-- Runs as the real anon and authenticated roles, so Row Level Security applies.
begin;
\ir 00_helpers.sql

select plan(60);

\set O  '''00000000-0000-0000-0000-0000000000a0'''
\set A  '''00000000-0000-0000-0000-0000000000a1'''
\set B  '''00000000-0000-0000-0000-0000000000b1'''
\set N  '''00000000-0000-0000-0000-0000000000e1'''
\set P1 '''00000000-0000-0000-0000-00000000f001'''
\set P2 '''00000000-0000-0000-0000-00000000f002'''

-- Fixtures (as the database owner).
--   P1: open call "p1-call" with roles R1 (open), R2 (closed), R3 (cast).
--   P2: draft call "p2-draft" with role R4.
insert into public.casting_calls (id, production_id, public_slug, title, status, deadline) values
  ('00000000-0000-0000-0000-0000000c0001', :P1, 'p1-call', 'P1 casting', 'open', now() + interval '7 days'),
  ('00000000-0000-0000-0000-0000000c0002', :P2, 'p2-draft', 'P2 casting', 'draft', null);
insert into public.casting_calls (id, production_id, public_slug, title, status, opens_at, deadline, early_access_codes) values
  ('00000000-0000-0000-0000-0000000c0003', :P1, 'p1-early', 'P1 early', 'open', now() + interval '3 days', now() + interval '9 days', '{EARLY-TEST1,SECOND-GROUP}');
insert into public.casting_roles (id, call_id, production_id, name, status, sort) values
  ('00000000-0000-0000-0000-0000000d0005', '00000000-0000-0000-0000-0000000c0003', null, 'Early role', 'open', 1),
  ('00000000-0000-0000-0000-0000000d0001', '00000000-0000-0000-0000-0000000c0001', :P2, 'Lead', 'open', 1),
  ('00000000-0000-0000-0000-0000000d0002', '00000000-0000-0000-0000-0000000c0001', null, 'Closed role', 'closed', 2),
  ('00000000-0000-0000-0000-0000000d0003', '00000000-0000-0000-0000-0000000c0001', null, 'Cast role', 'cast', 3),
  ('00000000-0000-0000-0000-0000000d0004', '00000000-0000-0000-0000-0000000c0002', null, 'P2 role', 'open', 1);

select is((select production_id from public.casting_roles where id = '00000000-0000-0000-0000-0000000d0001'), :P1::uuid,
  'A role always takes its casting call''s production, whatever was sent');
select is((select count(*) from public.casting_templates where production_id = :P1), 10::bigint,
  'The first casting call seeds ten email templates for the production');
select is((select count(*) from public.casting_templates where production_id = :P2), 10::bigint,
  'Each production gets its own templates');

-- =========================================================================
-- Signed-out visitors: only the three intake functions
-- =========================================================================
select tests.sign_out();
set local role anon;

select throws_ok('select id from public.casting_applications', '42501', null, 'anon cannot read applications');
select throws_ok('select id from public.casting_calls', '42501', null, 'anon cannot read casting calls directly');
select throws_ok('select id from public.casting_materials', '42501', null, 'anon cannot read materials');
select throws_ok($$insert into public.casting_notes (application_id, body) values (gen_random_uuid(), 'x')$$, '42501', null,
  'anon cannot write notes');

select is((public.casting_public_call('p1-call') ->> 'open')::boolean, true, 'An open call reads as open');
select is(jsonb_array_length(public.casting_public_call('p1-call') -> 'roles'), 2,
  'Closed roles are not listed publicly');
select is((select count(*) from jsonb_array_elements(public.casting_public_call('p1-call') -> 'roles') r where (r ->> 'open')::boolean),
  1::bigint, 'Only the open role accepts submissions');
select is((public.casting_public_call('p1-call') ->> 'film'), 'Production One', 'The public call names the film');
select is((public.casting_public_call('p2-draft') ->> 'found')::boolean, false, 'A draft call is invisible to the public');
select is((public.casting_public_call('nope') ->> 'found')::boolean, false, 'An unknown call reads as not found');
select is((public.casting_public_call('p1-early') ->> 'open')::boolean, false, 'Before opening, the call is closed to the public');
select is((public.casting_public_call('p1-early', 'EARLY-TEST1') ->> 'early_access')::boolean, true, 'An early-access code opens it early');
select is((public.casting_public_call('p1-early', 'WRONG-CODE') ->> 'open')::boolean, false, 'A wrong code does not');
select is(public.casting_apply(jsonb_build_object('call', 'p1-early', 'role_id', '00000000-0000-0000-0000-0000000d0005',
  'full_name', 'Cy', 'email', 'cy@example.com')) ->> 'error', 'casting_closed', 'Applying early without a code is refused');
select is((public.casting_apply(jsonb_build_object('call', 'p1-early', 'role_id', '00000000-0000-0000-0000-0000000d0005',
  'full_name', 'Cy', 'email', 'cy@example.com', 'access', 'SECOND-GROUP')) ->> 'ok')::boolean, true, 'Applying early with a code works');

create temp table t_app on commit drop as
select public.casting_apply(jsonb_build_object(
  'call', 'p1-call', 'role_id', '00000000-0000-0000-0000-0000000d0001',
  'full_name', '  Ada Actor ', 'email', 'Ada@Example.com', 'age', '24', 'location', 'Dallas, TX',
  'about', 'Hello', 'links', jsonb_build_array(
    jsonb_build_object('kind', 'reel', 'url', 'https://vimeo.com/1'),
    jsonb_build_object('kind', 'portfolio', 'url', 'https://example.com/me'),
    jsonb_build_object('kind', 'other', 'url', '')))) as r;
grant select on t_app to anon, authenticated;

select is((select (r ->> 'ok')::boolean from t_app), true, 'A valid application is accepted');
select is((select r ->> 'role' from t_app), 'Lead', 'The answer names the role');

select is(public.casting_apply(jsonb_build_object('call', 'p1-call', 'role_id', '00000000-0000-0000-0000-0000000d0001',
  'full_name', 'Ada', 'email', 'ada@example.com')) ->> 'error', 'already_applied',
  'The same person cannot apply twice for one role');
select is(public.casting_apply(jsonb_build_object('call', 'p1-call', 'role_id', '00000000-0000-0000-0000-0000000d0002',
  'full_name', 'Bo', 'email', 'bo@example.com')) ->> 'error', 'role_closed', 'A closed role refuses submissions');
select is(public.casting_apply(jsonb_build_object('call', 'p1-call', 'role_id', '00000000-0000-0000-0000-0000000d0004',
  'full_name', 'Bo', 'email', 'bo@example.com')) ->> 'error', 'role_closed',
  'A role from another call cannot be used');
select is(public.casting_apply(jsonb_build_object('call', 'p2-draft', 'role_id', '00000000-0000-0000-0000-0000000d0004',
  'full_name', 'Bo', 'email', 'bo@example.com')) ->> 'error', 'casting_closed', 'A draft call refuses submissions');
select is(public.casting_apply(jsonb_build_object('call', 'p1-call', 'role_id', '00000000-0000-0000-0000-0000000d0001',
  'full_name', 'Bo', 'email', 'not-an-email')) ->> 'error', 'invalid_email', 'A bad email is refused');
select is(public.casting_apply(jsonb_build_object('call', 'p1-call', 'role_id', '00000000-0000-0000-0000-0000000d0001',
  'full_name', '', 'email', 'bo@example.com')) ->> 'error', 'name_required', 'A name is required');
select is(public.casting_apply(jsonb_build_object('call', 'p1-call', 'role_id', '00000000-0000-0000-0000-0000000d0001',
  'full_name', 'Bo', 'email', 'bo@example.com', 'links', jsonb_build_array(jsonb_build_object('kind', 'reel', 'url', 'javascript:alert(1)'))))
  ->> 'error', 'invalid_links', 'Links must be web addresses');

-- Uploads: only into the application's own folder, with its live token.
select lives_ok(format($$insert into storage.objects (bucket_id, name, metadata) values ('casting-materials', %L, '{"size": 1234, "mimetype": "image/jpeg"}')$$,
  (select r ->> 'upload_prefix' from t_app) || 'headshot.jpg'), 'The applicant can upload into their own folder');
select throws_ok(format($$insert into storage.objects (bucket_id, name) values ('casting-materials', %L)$$,
  'intake/' || (select r ->> 'id' from t_app) || '/' || gen_random_uuid() || '/x.jpg'), '42501', null,
  'An upload with the wrong token is refused');
select throws_ok(format($$insert into storage.objects (bucket_id, name) values ('casting-materials', %L)$$,
  'other/' || (select r ->> 'id' from t_app) || '/x.jpg'), '42501', null, 'An upload outside the intake folder is refused');
select is(tests.visible('select id from storage.objects where bucket_id = ''casting-materials'''), 0::bigint,
  'anon cannot list the uploaded files');

select is(public.casting_attach_files((select (r ->> 'id')::uuid from t_app), gen_random_uuid(),
  '[]'::jsonb) ->> 'error', 'upload_expired', 'Attaching with the wrong token is refused');
select is((public.casting_attach_files((select (r ->> 'id')::uuid from t_app), (select (r ->> 'upload_token')::uuid from t_app),
  jsonb_build_array(
    jsonb_build_object('kind', 'headshot', 'path', (select r ->> 'upload_prefix' from t_app) || 'headshot.jpg', 'name', 'me.jpg'),
    jsonb_build_object('kind', 'resume', 'path', (select r ->> 'upload_prefix' from t_app) || 'missing.pdf')))
  ->> 'files')::int, 1, 'Only files that were really uploaded are attached');
select throws_ok(format($$insert into storage.objects (bucket_id, name) values ('casting-materials', %L)$$,
  (select r ->> 'upload_prefix' from t_app) || 'late.jpg'), '42501', null, 'Uploads stop once the files are attached');
select is(public.casting_attach_files((select (r ->> 'id')::uuid from t_app), (select (r ->> 'upload_token')::uuid from t_app),
  '[]'::jsonb) ->> 'error', 'upload_expired', 'The upload token works only once');

reset role;
select is((select count(*) from public.casting_materials where application_id = (select (r ->> 'id')::uuid from t_app)), 3::bigint,
  'Two links and one file were saved as materials (the empty link was skipped)');
select is((select access_code from public.casting_applications where email = 'cy@example.com'), 'SECOND-GROUP',
  'The early-access group is recorded on the application');
select is((select email from public.casting_applications where id = (select (r ->> 'id')::uuid from t_app)), 'ada@example.com',
  'Email is stored in lower case');
select is((select full_name from public.casting_applications where id = (select (r ->> 'id')::uuid from t_app)), 'Ada Actor',
  'Name is trimmed');
select is((select production_id from public.casting_applications where id = (select (r ->> 'id')::uuid from t_app)), :P1::uuid,
  'The application is filed under the call''s production');

-- =========================================================================
-- Hub users
-- =========================================================================
-- A: View Casting on P1. B: Edit Casting on P2 + View at Studio level. N: nothing yet.
select tests.sign_in(:A);
set local role authenticated;
select is(tests.visible('select id from public.casting_applications'), 2::bigint, 'A (View on P1) sees the P1 applications');
select is(tests.visible('select id from public.casting_materials'), 3::bigint, 'A sees its materials');
select is(tests.visible('select id from storage.objects where bucket_id = ''casting-materials'''), 1::bigint,
  'A can open the uploaded file');
select throws_ok('select upload_token from public.casting_applications', '42501', null,
  'Hub users cannot read upload tokens');
select is(tests.changed('update public.casting_applications set status = ''shortlisted'''), 0::bigint,
  'View access cannot change an application');
select throws_ok(format($$insert into public.casting_notes (application_id, body) values (%L, 'note')$$,
  (select r ->> 'id' from t_app)), '42501', null, 'View access cannot add notes');

select tests.sign_in(:B);
select is(tests.visible('select id from public.casting_applications'), 0::bigint, 'B (P2 only) sees no P1 applications');
select is(tests.visible('select id from public.casting_materials'), 0::bigint, 'B sees no P1 materials');
select is(tests.visible('select id from storage.objects where bucket_id = ''casting-materials'''), 0::bigint,
  'B cannot open P1 files');
select is(tests.visible('select id from public.casting_calls'), 1::bigint, 'B sees only the P2 casting call');

select tests.sign_in(:N);
select is(tests.visible('select id from public.casting_calls'), 0::bigint, 'N (no grants) sees no casting calls');

reset role;
insert into public.access_grants (user_id, production_id, section_key, level) values (:N, :P1, 'casting', 'edit');

select tests.sign_in(:N);
set local role authenticated;
select is(tests.changed('update public.casting_applications set status = ''callback'', rating = 4'), 2::bigint,
  'Edit access can move an applicant forward');
select is(tests.changed('delete from public.casting_applications'), 0::bigint, 'Edit access cannot delete applications');
select lives_ok(format($$insert into public.casting_notes (application_id, production_id, body) values (%L, %L, 'Strong read')$$,
  (select r ->> 'id' from t_app), '00000000-0000-0000-0000-00000000f002'), 'Edit access can add a note');
select lives_ok(format($$insert into public.casting_messages (application_id, to_email, subject, body, status) values (%L, 'ada@example.com', 'Hi', 'Body', 'sent')$$,
  (select r ->> 'id' from t_app)), 'Edit access can log a sent email');
select throws_ok('update public.casting_messages set subject = ''changed''', '42501', null, 'The email log cannot be rewritten');
select throws_ok('update public.casting_notes set body = ''changed''', '42501', null, 'Notes cannot be rewritten');

reset role;
select is((select author_id from public.casting_notes limit 1), :N::uuid, 'A note records its real author');
select is((select production_id from public.casting_notes limit 1), :P1::uuid, 'A note always stays with its application''s production');
select isnt((select status_changed_at from public.casting_applications limit 1), null, 'Status changes are timestamped');

select * from finish();
rollback;
