-- Shared test fixtures, loaded by each test file with \ir.
-- Everything here runs inside the test's transaction and is rolled back.

create extension if not exists pgtap with schema extensions;

create schema if not exists tests;
grant usage on schema tests to authenticated, anon;

-- Run a query as the current role and return how many rows it can see.
create or replace function tests.visible(q text)
returns bigint
language plpgsql
as $$
declare n bigint;
begin
  execute format('select count(*) from (%s) s', q) into n;
  return n;
end;
$$;

-- Run a write as the current role and return how many rows it changed.
create or replace function tests.changed(q text)
returns bigint
language plpgsql
as $$
declare n bigint;
begin
  execute q;
  get diagnostics n = row_count;
  return n;
end;
$$;
grant execute on all functions in schema tests to authenticated, anon;

-- Switch identity. Uses the same JWT claims Supabase sets for a signed-in user.
create or replace function tests.sign_in(p_user uuid)
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_user::text, true);
end;
$$;

create or replace function tests.sign_out()
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  perform set_config('request.jwt.claim.sub', '', true);
end;
$$;
grant execute on all functions in schema tests to authenticated, anon;

-- People. Fixed ids so the tests read clearly.
--   O  owner                         00000000-0000-0000-0000-0000000000a0
--   A  crew member                   …a1
--   B  crew member                   …b1
--   D  deactivated crew member       …d1
--   N  active user with no grants    …e1
-- Accounts are created the way Supabase Auth creates them; the sign-in
-- migration then creates each profile automatically. The test owner email
-- stands in for studio@bleuskm.com (rolled back with the test).
update private.app_settings set value = 'owner@test.local' where key = 'owner_email';

insert into auth.users (id, email, aud, role, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a0', 'owner@test.local', 'authenticated', 'authenticated', '{"full_name": "Test Owner"}'),
  ('00000000-0000-0000-0000-0000000000a1', 'a@test.local',     'authenticated', 'authenticated', '{"full_name": "User A"}'),
  ('00000000-0000-0000-0000-0000000000b1', 'b@test.local',     'authenticated', 'authenticated', '{"full_name": "User B"}'),
  ('00000000-0000-0000-0000-0000000000d1', 'd@test.local',     'authenticated', 'authenticated', '{"full_name": "User D"}'),
  ('00000000-0000-0000-0000-0000000000e1', 'n@test.local',     'authenticated', 'authenticated', '{"full_name": "User N"}');

update public.profiles set status = 'deactivated', deactivated_at = now()
where id = '00000000-0000-0000-0000-0000000000d1';

-- Two productions.
insert into public.productions (id, slug, title, type) values
  ('00000000-0000-0000-0000-00000000f001', 'production-one', 'Production One', 'film'),
  ('00000000-0000-0000-0000-00000000f002', 'production-two', 'Production Two', 'commercial');

-- Budget is switched off on Production Two.
update public.production_sections set enabled = false
where production_id = '00000000-0000-0000-0000-00000000f002' and section_key = 'budget';

-- Two example section tables, protected by the same standard rules every
-- future section table will use. (Real section tables arrive in later steps.)
create table public.test_casting_records (
  id uuid primary key default gen_random_uuid(),
  production_id uuid references public.productions (id),
  body text not null
);
create table public.test_budget_records (
  id uuid primary key default gen_random_uuid(),
  production_id uuid references public.productions (id),
  body text not null
);
grant select, insert, update, delete on public.test_casting_records, public.test_budget_records to authenticated;
select private.apply_section_rls('public.test_casting_records', 'casting');
select private.apply_section_rls('public.test_budget_records', 'budget');

insert into public.test_casting_records (production_id, body) values
  ('00000000-0000-0000-0000-00000000f001', 'P1 casting 1'),
  ('00000000-0000-0000-0000-00000000f001', 'P1 casting 2'),
  ('00000000-0000-0000-0000-00000000f002', 'P2 casting 1'),
  (null,                                   'Studio talent pool record');
insert into public.test_budget_records (production_id, body) values
  ('00000000-0000-0000-0000-00000000f001', 'P1 budget line'),
  ('00000000-0000-0000-0000-00000000f002', 'P2 budget line');

-- Grants.
--   A: View Casting on P1, Edit Budget on P1.
--   B: Edit Casting on P2, View Casting at Studio level, Edit Budget on P2 (section disabled there).
--   D: Edit Casting on P1, but deactivated.
insert into public.access_grants (user_id, production_id, section_key, level) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000f001', 'casting', 'view'),
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000f001', 'budget',  'edit'),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000f002', 'casting', 'edit'),
  ('00000000-0000-0000-0000-0000000000b1', null,                                   'casting', 'view'),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000f002', 'budget',  'edit'),
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-00000000f001', 'casting', 'edit');
