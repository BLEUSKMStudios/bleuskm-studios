-- Studio OS permission tests: unauthorized access and cross-production isolation.
-- Every check runs as a real database role (anon or authenticated) with the
-- same claims Supabase gives a signed-in user, so Row Level Security applies.
begin;
\ir 00_helpers.sql

select plan(82);

-- Ids used below.
\set O  '''00000000-0000-0000-0000-0000000000a0'''
\set A  '''00000000-0000-0000-0000-0000000000a1'''
\set B  '''00000000-0000-0000-0000-0000000000b1'''
\set D  '''00000000-0000-0000-0000-0000000000d1'''
\set N  '''00000000-0000-0000-0000-0000000000e1'''
\set P1 '''00000000-0000-0000-0000-00000000f001'''
\set P2 '''00000000-0000-0000-0000-00000000f002'''

-- =========================================================================
-- 1. Structure: every table is locked down
-- =========================================================================
select is(
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity),
  0::bigint, 'Row Level Security is on for every table in public');

select is(
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r'
     and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname)),
  0::bigint, 'Every table in public has at least one policy');

select is(
  (select count(*) from information_schema.role_table_grants
   where table_schema = 'public' and grantee = 'anon'),
  0::bigint, 'Signed-out visitors (anon) hold no privileges on any hub table');

select is(
  (select count(*) from pg_namespace where nspname = 'private'
     and has_schema_privilege('anon', oid, 'USAGE')),
  0::bigint, 'Signed-out visitors cannot use the private permission schema');

select is((select count(*) from public.sections), 17::bigint, '17 sections are defined (13 + 4 Studio OS modules)');
select is((select count(*) from public.sections where grantable), 14::bigint, '14 sections are grantable');
select is((select count(*) from public.production_sections where production_id = :P1), 13::bigint,
  'A new production starts with all 13 production sections');
select is((select count(*) from public.production_stages where production_id = :P1), 7::bigint,
  'A new production starts with all 7 lifecycle stages');

-- =========================================================================
-- 2. Signed-out visitors see and change nothing
-- =========================================================================
select tests.sign_out();
set local role anon;

select throws_ok('select * from public.productions', '42501', null, 'anon cannot read productions');
select throws_ok('select * from public.profiles', '42501', null, 'anon cannot read profiles');
select throws_ok('select * from public.access_grants', '42501', null, 'anon cannot read access grants');
select throws_ok('select * from public.test_casting_records', '42501', null, 'anon cannot read section records');
select throws_ok($$insert into public.productions (slug, title, type) values ('x', 'X', 'film')$$, '42501', null,
  'anon cannot create a production');
select throws_ok($$select public.check_access('00000000-0000-0000-0000-00000000f001', 'casting', 'view')$$, '42501', null,
  'anon cannot call the access check');

reset role;

-- =========================================================================
-- 3. The owner has full access
-- =========================================================================
select tests.sign_in(:O);
set local role authenticated;

select is(tests.visible('select * from public.productions'), 2::bigint, 'Owner sees both productions');
select is(tests.visible('select * from public.profiles'), 5::bigint, 'Owner sees every profile');
select is(tests.visible('select * from public.access_grants'), 6::bigint, 'Owner sees every grant');
select is(tests.visible('select * from public.test_casting_records'), 4::bigint, 'Owner sees all casting records, both productions and Studio');
select is(tests.visible('select * from public.test_budget_records'), 2::bigint, 'Owner sees budget even where the section is disabled');
select ok(public.check_access(:P2, 'budget', 'edit'), 'check_access: owner has Edit everywhere');
select ok(public.check_access(null, 'communications', 'edit'), 'check_access: owner has Studio-level Edit');

select lives_ok($$insert into public.productions (id, slug, title, type)
  values ('00000000-0000-0000-0000-00000000f003', 'production-three', 'Production Three', 'photography')$$,
  'Owner can create a production');
select lives_ok($$insert into public.access_grants (user_id, production_id, section_key, level)
  values ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-00000000f003', 'scheduling', 'view')$$,
  'Owner can grant a section');
select is((select granted_by from public.access_grants
  where user_id = :N and section_key = 'scheduling'), :O::uuid, 'The grant records the owner as granted_by');
select ok(tests.visible('select * from public.audit_log') > 0, 'Owner can read the audit log');
select is(tests.visible($$select * from public.audit_log where table_name = 'access_grants' and action = 'INSERT'
  and actor_id = '00000000-0000-0000-0000-0000000000a0'$$), 1::bigint, 'The new grant is in the audit log with the owner as actor');
select is(tests.changed($$update public.production_sections set enabled = false
  where production_id = '00000000-0000-0000-0000-00000000f003' and section_key = 'tasks'$$), 1::bigint,
  'Owner can switch a section off for a production');

select throws_ok($$update public.profiles set status = 'deactivated', deactivated_at = now()
  where id = '00000000-0000-0000-0000-0000000000a0'$$, '42501', null, 'The owner cannot be deactivated');
select throws_ok($$update public.profiles set is_owner = false
  where id = '00000000-0000-0000-0000-0000000000a0'$$, '42501', null, 'The owner cannot be demoted');
select throws_ok($$delete from public.profiles where id = '00000000-0000-0000-0000-0000000000a0'$$, '42501', null,
  'The owner cannot be deleted');
select throws_ok($$update public.profiles set is_owner = true
  where id = '00000000-0000-0000-0000-0000000000a1'$$, '42501', null, 'Ownership cannot be handed to another user');

-- Grants that make no sense are rejected.
select throws_ok($$insert into public.access_grants (user_id, production_id, section_key, level)
  values ('00000000-0000-0000-0000-0000000000a1', null, 'settings', 'view')$$, '23514', null,
  'Settings cannot be granted to anyone');
select throws_ok($$insert into public.access_grants (user_id, production_id, section_key, level)
  values ('00000000-0000-0000-0000-0000000000a1', null, 'budget', 'view')$$, '23514', null,
  'Budget has no Studio level, so it cannot be granted at Studio level');
select throws_ok($$insert into public.access_grants (user_id, production_id, section_key, level)
  values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000f001', 'casting', 'edit')$$, '23505', null,
  'One cell per user, production and section (no duplicate grants)');

reset role;

-- =========================================================================
-- 4. User A: View Casting on P1, Edit Budget on P1
-- =========================================================================
select tests.sign_in(:A);
set local role authenticated;

select is(tests.visible('select * from public.productions'), 1::bigint, 'A sees only Production One');
select is(tests.visible($$select * from public.productions where id = '00000000-0000-0000-0000-00000000f002'$$), 0::bigint,
  'A cannot see Production Two');
select is(tests.visible('select * from public.production_stages'), 7::bigint, 'A sees only Production One''s stages');
select is(tests.visible('select * from public.test_casting_records'), 2::bigint, 'A reads exactly the two P1 casting records');
select is(tests.visible($$select * from public.test_casting_records where production_id = '00000000-0000-0000-0000-00000000f002'$$), 0::bigint,
  'A cannot read P2 casting records (cross-production isolation)');
select is(tests.visible('select * from public.test_casting_records where production_id is null'), 0::bigint,
  'A cannot read Studio-level casting records without a Studio grant');
select is(tests.visible('select * from public.test_budget_records'), 1::bigint, 'A reads only the P1 budget line');

select throws_ok($$insert into public.test_casting_records (production_id, body)
  values ('00000000-0000-0000-0000-00000000f001', 'A tries to add')$$, '42501', null,
  'View is read-only: A cannot add casting records on P1');
select is(tests.changed($$update public.test_casting_records set body = 'changed'
  where production_id = '00000000-0000-0000-0000-00000000f001'$$), 0::bigint, 'View is read-only: A cannot edit P1 casting records');
select is(tests.changed('delete from public.test_casting_records'), 0::bigint, 'A cannot delete any casting records');

select lives_ok($$insert into public.test_budget_records (production_id, body)
  values ('00000000-0000-0000-0000-00000000f001', 'A adds a budget line')$$, 'Edit works: A can add a P1 budget line');
select throws_ok($$insert into public.test_budget_records (production_id, body)
  values ('00000000-0000-0000-0000-00000000f002', 'A writes into P2')$$, '42501', null,
  'A cannot write a budget line into Production Two');
select throws_ok($$update public.test_budget_records set production_id = '00000000-0000-0000-0000-00000000f002'
  where production_id = '00000000-0000-0000-0000-00000000f001'$$, '42501', null,
  'A cannot move a P1 record into Production Two');

select ok(public.check_access(:P1, 'casting', 'view'), 'check_access: A has View on P1 Casting');
select ok(not public.check_access(:P1, 'casting', 'edit'), 'check_access: A does not have Edit on P1 Casting');
select ok(not public.check_access(:P2, 'casting', 'view'), 'check_access: A has nothing on P2');
select ok(not public.check_access(:P1, 'scheduling', 'view'), 'check_access: A has nothing on sections not granted');

-- No self-promotion of any kind.
select throws_ok($$insert into public.access_grants (user_id, production_id, section_key, level)
  values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000f002', 'casting', 'edit')$$, '42501', null,
  'A cannot grant themselves access');
select is(tests.changed($$update public.access_grants set level = 'edit' where user_id = '00000000-0000-0000-0000-0000000000a1'$$), 0::bigint,
  'A cannot upgrade their own grants');
select is(tests.changed($$update public.profiles set full_name = 'Hacked', job_title = 'Owner'
  where id = '00000000-0000-0000-0000-0000000000a1'$$), 0::bigint, 'A cannot edit their own profile record');
select is(tests.visible('select * from public.access_grants'), 2::bigint, 'A sees only their own two grants');
select is(tests.visible('select * from public.profiles'), 1::bigint, 'A sees only their own profile');
select is(tests.visible('select * from public.audit_log'), 0::bigint, 'A cannot read the audit log');
select throws_ok($$insert into public.productions (slug, title, type) values ('a-made-this', 'A made this', 'film')$$, '42501', null,
  'A cannot create a production');
select is(tests.changed($$update public.productions set title = 'Renamed' where id = '00000000-0000-0000-0000-00000000f001'$$), 0::bigint,
  'A cannot rename a production they can see');
select is(tests.changed($$update public.production_sections set enabled = true$$), 0::bigint,
  'A cannot switch sections on or off');
select throws_ok($$select public.check_access_for('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000f002', 'casting', 'edit')$$,
  '42501', null, 'A cannot call the server-only access check');
select throws_ok($$select public.system_status()$$, '42501', null, 'A cannot call the server-only status function');
select throws_ok($$select private.apply_section_rls('public.productions', 'casting')$$, '42501', null,
  'A cannot change table security rules');

reset role;

-- =========================================================================
-- 5. User B: Edit Casting on P2, View Casting at Studio level,
--    Edit Budget on P2 where Budget is switched off
-- =========================================================================
select tests.sign_in(:B);
set local role authenticated;

select is(tests.visible('select * from public.productions'), 1::bigint, 'B sees only Production Two');
select is(tests.visible('select * from public.test_casting_records'), 2::bigint,
  'B reads the P2 casting record and the Studio-level record only');
select is(tests.visible($$select * from public.test_casting_records where production_id = '00000000-0000-0000-0000-00000000f001'$$), 0::bigint,
  'B cannot read P1 casting records (cross-production isolation)');
select lives_ok($$insert into public.test_casting_records (production_id, body)
  values ('00000000-0000-0000-0000-00000000f002', 'B adds to P2')$$, 'B can add casting records on P2');
select is(tests.changed($$update public.test_casting_records set body = 'B edits'
  where production_id = '00000000-0000-0000-0000-00000000f002'$$), 2::bigint, 'B can edit P2 casting records');
select throws_ok($$insert into public.test_casting_records (production_id, body) values (null, 'B adds to Studio')$$, '42501', null,
  'Studio-level View does not allow adding Studio records');
select is(tests.changed($$update public.test_casting_records set body = 'x' where production_id is null$$), 0::bigint,
  'Studio-level View does not allow editing Studio records');
select throws_ok($$insert into public.test_casting_records (production_id, body)
  values ('00000000-0000-0000-0000-00000000f001', 'B writes into P1')$$, '42501', null,
  'B cannot write casting records into Production One');
select throws_ok($$update public.test_casting_records set production_id = '00000000-0000-0000-0000-00000000f001'
  where production_id = '00000000-0000-0000-0000-00000000f002'$$, '42501', null,
  'B cannot move a P2 record into Production One');
select is(tests.visible('select * from public.test_budget_records'), 0::bigint,
  'B sees no budget lines: Budget is switched off on P2, so the grant does nothing');
select ok(not public.check_access(:P2, 'budget', 'view'), 'check_access: a disabled section denies non-owners');

reset role;

-- =========================================================================
-- 6. Deactivated and ungranted users see nothing
-- =========================================================================
select tests.sign_in(:D);
set local role authenticated;
select is(tests.visible('select * from public.productions'), 0::bigint, 'Deactivated D sees no productions despite holding a grant');
select is(tests.visible('select * from public.test_casting_records'), 0::bigint, 'Deactivated D reads no records');
select ok(not public.check_access(:P1, 'casting', 'view'), 'check_access: deactivated user is denied');
reset role;

select tests.sign_in(:N);
set local role authenticated;
select is(tests.visible('select * from public.productions'), 1::bigint, 'N sees only the production the owner granted earlier');
select is(tests.visible('select * from public.test_casting_records'), 0::bigint, 'N reads no casting records');
reset role;

-- =========================================================================
-- 7. Revoking a grant takes effect immediately
-- =========================================================================
delete from public.access_grants where user_id = :A and section_key = 'casting';
select tests.sign_in(:A);
set local role authenticated;
select is(tests.visible('select * from public.test_casting_records'), 0::bigint, 'After revoke, A reads no casting records');
reset role;

-- =========================================================================
-- 8. Server-side check (secret key / service role)
-- =========================================================================
set local role service_role;
select ok(public.check_access_for(:B, :P2, 'casting', 'edit'), 'Server check: B has Edit on P2 Casting');
select ok(not public.check_access_for(:B, :P1, 'casting', 'view'), 'Server check: B has nothing on P1');
reset role;

select * from finish();
rollback;
