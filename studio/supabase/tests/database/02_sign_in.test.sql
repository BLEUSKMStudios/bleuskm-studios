-- Step 1C: accounts and profiles.
begin;
\ir 00_helpers.sql
select plan(14);

-- Profiles are created automatically for invited accounts.
select is((select count(*)::int from public.profiles), 5, 'Every account got a profile automatically');
select is((select is_owner from public.profiles where id = '00000000-0000-0000-0000-0000000000a0'), true,
  'The account with the owner email became the owner');
select is((select count(*)::int from public.profiles where is_owner), 1, 'There is exactly one owner');
select is((select full_name from public.profiles where id = '00000000-0000-0000-0000-0000000000a1'), 'User A',
  'The name given in the invitation is used');
select is((select status::text from public.profiles where id = '00000000-0000-0000-0000-0000000000e1'), 'active',
  'A new account starts active');
select is((select count(*)::int from public.access_grants where user_id = '00000000-0000-0000-0000-0000000000e1'), 0,
  'A new account starts with no access at all');

-- No name given: the part of the email before @ is used.
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000000f1', 'New.Person@Test.Local', 'authenticated', 'authenticated');
select is((select email from public.profiles where id = '00000000-0000-0000-0000-0000000000f1'), 'new.person@test.local',
  'Profile email is stored in lower case');
select is((select full_name from public.profiles where id = '00000000-0000-0000-0000-0000000000f1'), 'new.person',
  'Without a name, the email name is used');
select is((select is_owner from public.profiles where id = '00000000-0000-0000-0000-0000000000f1'), false,
  'Any other account is not an owner');

-- Ownership can't be claimed by creating another account with the owner email
-- once an owner exists (here the owner email is changed to a fresh address).
update private.app_settings set value = 'second.owner@test.local' where key = 'owner_email';
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000000f2', 'second.owner@test.local', 'authenticated', 'authenticated');
select is((select is_owner from public.profiles where id = '00000000-0000-0000-0000-0000000000f2'), false,
  'Once an owner exists, no other account can become owner');

-- Email changes follow the account.
update auth.users set email = 'a.new@test.local' where id = '00000000-0000-0000-0000-0000000000a1';
select is((select email from public.profiles where id = '00000000-0000-0000-0000-0000000000a1'), 'a.new@test.local',
  'Changing the account email updates the profile');

-- Signed-in users can't read or change the private settings.
select tests.sign_in('00000000-0000-0000-0000-0000000000a1');
set local role authenticated;
select throws_ok($$ select * from private.app_settings $$, '42501', null, 'A user cannot read the private settings');
select throws_ok($$ update private.app_settings set value = 'x@test.local' $$, '42501', null, 'A user cannot change the owner email');
reset role;

-- New accounts are recorded in the audit log.
select ok(exists (select 1 from public.audit_log where table_name = 'profiles' and action = 'INSERT'
  and record_id = '00000000-0000-0000-0000-0000000000f1'), 'Account creation is recorded in the audit log');

select * from finish();
rollback;
