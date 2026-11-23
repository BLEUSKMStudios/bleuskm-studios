-- Early-access codes with their own start dates (migration 20261123100000).
-- Runs as the real anon role. Nothing is sent: the intake functions only write rows,
-- and everything here is rolled back.
begin;
\ir 00_helpers.sql

select plan(17);

\set P1 '''00000000-0000-0000-0000-00000000f001'''

-- One call opening to the public in 5 days, with three codes:
--   LATER-CODE starts in 2 days, EARLY-CODE started 1 hour ago, PLAIN-CODE has no start.
insert into public.casting_calls (id, production_id, public_slug, title, status, opens_at, deadline,
                                  early_access_codes, early_access_starts) values
  ('00000000-0000-0000-0000-0000000c0101', :P1, 'dated-call', 'Dated call', 'open',
   now() + interval '5 days', now() + interval '20 days',
   '{LATER-CODE,EARLY-CODE,PLAIN-CODE}',
   jsonb_build_object('LATER-CODE', to_jsonb(now() + interval '2 days'),
                      'EARLY-CODE', to_jsonb(now() - interval '1 hour')));
insert into public.casting_roles (id, call_id, production_id, name, status, sort) values
  ('00000000-0000-0000-0000-0000000d0101', '00000000-0000-0000-0000-0000000c0101', null, 'Dated role', 'open', 1);

-- Bad data is refused, so the open check can never break on it.
select throws_ok($$update public.casting_calls set early_access_starts = '{"LATER-CODE": "not a date"}'
  where id = '00000000-0000-0000-0000-0000000c0101'$$, '22023', null, 'A start time must be a real time');
select throws_ok($$update public.casting_calls set early_access_starts = '[]'
  where id = '00000000-0000-0000-0000-0000000c0101'$$, '22023', null, 'Start times must be a code-to-time map');

select tests.sign_out();
set local role anon;

-- Not yet started
select is((public.casting_public_call('dated-call', 'LATER-CODE') ->> 'open')::boolean, false,
  'A code before its start date does not open the call');
select is((public.casting_public_call('dated-call', 'LATER-CODE') ->> 'access_opens_at')::timestamptz,
  now() + interval '2 days', 'The visitor is told when their code starts');
select is((select count(*) from jsonb_array_elements(public.casting_public_call('dated-call', 'LATER-CODE') -> 'roles') r
  where (r ->> 'open')::boolean), 0::bigint, 'No role accepts submissions before the code starts');
select is(public.casting_apply(jsonb_build_object('call', 'dated-call', 'role_id', '00000000-0000-0000-0000-0000000d0101',
  'full_name', 'Early Bird', 'email', 'bird@example.com', 'access', 'LATER-CODE')) ->> 'error', 'casting_closed',
  'Submitting with a code before its start date is refused');

-- Started
select is((public.casting_public_call('dated-call', 'EARLY-CODE') ->> 'open')::boolean, true,
  'A code after its start date opens the call');
select is((public.casting_public_call('dated-call', 'EARLY-CODE') ->> 'early_access')::boolean, true,
  'and it reads as early access');
select is(public.casting_public_call('dated-call', 'EARLY-CODE') -> 'access_opens_at', 'null'::jsonb,
  'A started code has no future start time');
select is((public.casting_apply(jsonb_build_object('call', 'dated-call', 'role_id', '00000000-0000-0000-0000-0000000d0101',
  'full_name', 'On Time', 'email', 'ontime@example.com', 'access', 'EARLY-CODE')) ->> 'ok')::boolean, true,
  'Submitting with a started code works');

-- No start time: unchanged behaviour
select is((public.casting_public_call('dated-call', 'PLAIN-CODE') ->> 'open')::boolean, true,
  'A code without a start date works as before');

-- Public and wrong codes: unchanged
select is((public.casting_public_call('dated-call') ->> 'open')::boolean, false, 'The public still waits for the opening');
select is((public.casting_public_call('dated-call', 'WRONG-CODE') ->> 'open')::boolean, false, 'A wrong code does nothing');
select is(public.casting_public_call('dated-call', 'WRONG-CODE') -> 'access_opens_at', 'null'::jsonb,
  'A wrong code reveals no start date');
select is(public.casting_public_call('dated-call', 'later-code') -> 'access_opens_at', 'null'::jsonb,
  'Codes are matched exactly');
select is(public.casting_apply(jsonb_build_object('call', 'dated-call', 'role_id', '00000000-0000-0000-0000-0000000d0101',
  'full_name', 'Nobody', 'email', 'nobody@example.com')) ->> 'error', 'casting_closed',
  'Submitting without a code before the public opening is refused');

-- After the public opening every code (and no code) works, whatever its start date.
reset role;
update public.casting_calls set opens_at = now() - interval '1 minute',
  early_access_starts = jsonb_build_object('LATER-CODE', to_jsonb(now() + interval '2 days'))
where id = '00000000-0000-0000-0000-0000000c0101';
set local role anon;
select is((public.casting_public_call('dated-call', 'LATER-CODE') ->> 'open')::boolean, true,
  'Once the call is public, a not-yet-started code does not block anyone');

select * from finish();
rollback;
