-- Studio OS shared core: one contact per person, consent, the activity
-- timeline, website intake and the email log. Runs as the real roles.
begin;
\ir 00_helpers.sql

select plan(41);

\set O  '''00000000-0000-0000-0000-0000000000a0'''
\set A  '''00000000-0000-0000-0000-0000000000a1'''
\set B  '''00000000-0000-0000-0000-0000000000b1'''
\set N  '''00000000-0000-0000-0000-0000000000e1'''
\set P1 '''00000000-0000-0000-0000-00000000f001'''
\set P2 '''00000000-0000-0000-0000-00000000f002'''

-- A has View Casting on P1 (helpers). Give A View Contacts at Studio level.
insert into public.access_grants (user_id, production_id, section_key, level) values (:A, null, 'contacts', 'view');

insert into public.casting_calls (id, production_id, public_slug, title, status, deadline) values
  ('00000000-0000-0000-0000-0000000c0101', :P1, 'core-call', 'Core casting', 'open', now() + interval '7 days'),
  ('00000000-0000-0000-0000-0000000c0102', :P2, 'core-crew', 'Core crew', 'open', now() + interval '7 days');
insert into public.casting_roles (id, call_id, name, status) values
  ('00000000-0000-0000-0000-0000000d0101', '00000000-0000-0000-0000-0000000c0101', 'Lead', 'open'),
  ('00000000-0000-0000-0000-0000000d0102', '00000000-0000-0000-0000-0000000c0102', 'Gaffer', 'open');

-- =========================================================================
-- Seeds
-- =========================================================================
select is((select count(*) from public.email_identities), 6::bigint, 'Six sender identities exist (clients@ added with the inbox)');
select is((select string_agg(key, ',' order by key) from public.email_identities where brevo_verified), 'casting,crew',
  'Only casting@ and crew@ (already sending live) start as verified Brevo senders');
select is((select count(*) from public.email_identities where zoho_send_as or zoho_kind <> 'unverified'),
  0::bigint, 'No Zoho identity is assumed: the owner confirms each one');
select is((select count(*) from public.email_templates where production_id is null), 5::bigint, 'Five confirmation templates exist');
select is((select count(*) from public.email_templates where auto_send), 0::bigint, 'No confirmation is switched on by default');
select is((select marketing from public.audiences where key = 'newsletter'), true, 'The newsletter is a marketing audience');
select is((select marketing from public.audiences where key = 'casting-applicants'), false, 'Applicants are not a marketing audience');

-- =========================================================================
-- Intake: a website casting application (the live LMLT path, untouched)
-- =========================================================================
select tests.sign_out();
set local role anon;
create temp table t_app on commit drop as
select public.casting_apply(jsonb_build_object('call', 'core-call', 'role_id', '00000000-0000-0000-0000-0000000d0101',
  'full_name', 'Ada Core', 'email', 'Ada.Core@Example.com', 'phone', '555-0100', 'location', 'Chicago')) as r;
select is((select (r ->> 'ok')::boolean from t_app), true, 'The public casting form still works exactly as before');
select throws_ok($$select public.studio_intake('{"kind":"newsletter","submission_key":"abcdefgh"}')$$, '42501', null,
  'Visitors cannot call the website intake function directly');
reset role;

select is((select count(*) from public.contacts where email = 'ada.core@example.com'), 1::bigint,
  'The application created one contact');
select isnt((select contact_id from public.casting_applications where email = 'ada.core@example.com'), null,
  'The application is linked to the contact');
select is((select category from public.contacts where email = 'ada.core@example.com'), 'cast', 'A cast applicant is a cast contact');
select is((select count(*) from public.intake_submissions where kind = 'casting' and email = 'ada.core@example.com'), 1::bigint,
  'The application is listed with the website submissions');
select is((select confirmation from public.intake_submissions where email = 'ada.core@example.com'), 'website',
  'Its confirmation is recorded as sent by the website (not sent twice)');
select is((select count(*) from public.activity where kind = 'application.submitted'
  and contact_id = (select id from public.contacts where email = 'ada.core@example.com')), 1::bigint,
  'The application is on the contact''s timeline');

-- A crew call on the same contact layer.
insert into public.casting_applications (production_id, call_id, role_id, full_name, email)
values (:P2, '00000000-0000-0000-0000-0000000c0102', '00000000-0000-0000-0000-0000000d0102', 'Ada C.', 'ada.core@example.com');
select is((select count(*) from public.contacts where email = 'ada.core@example.com'), 1::bigint,
  'Applying again (crew) reuses the same contact: no duplicates');
select is((select full_name from public.contacts where email = 'ada.core@example.com'), 'Ada Core',
  'An existing name is never overwritten by a later form');
select ok((select tags @> '{casting-applicant,crew-applicant}' from public.contacts where email = 'ada.core@example.com'),
  'The contact carries both applicant tags');

-- Status changes go on the timeline.
update public.casting_applications set status = 'shortlisted' where email = 'ada.core@example.com' and production_id = :P1;
select is((select count(*) from public.activity where kind = 'application.status'), 1::bigint, 'A status change is logged');

-- =========================================================================
-- Intake: newsletter and film sign-ups (server key only)
-- =========================================================================
set local role service_role;
select is((public.studio_intake('{"kind":"newsletter","submission_key":"nl-0001-test","email":"Sub@Example.com","name":"Sub One",
  "consent":{"source":"bleuskm.com newsletter form","text":"Yes, send me news."}}') ->> 'duplicate')::boolean, false,
  'A newsletter sign-up is recorded');
select is((public.studio_intake('{"kind":"newsletter","submission_key":"nl-0001-test","email":"sub@example.com"}') ->> 'duplicate')::boolean,
  true, 'The same submission sent twice is recorded once');
select is((public.studio_intake('{"kind":"film_notify","submission_key":"fn-0001-test","email":"sub@example.com","film":"Love Me Like This"}')
  ->> 'duplicate')::boolean, false, 'A film-updates sign-up is recorded');
select is((public.studio_intake('{"kind":"inquiry","submission_key":"iq-0001-test","email":"client@example.com","name":"Client"}')
  ->> 'duplicate')::boolean, false, 'An inquiry is recorded');
reset role;

select is((select count(*) from public.contacts where email = 'sub@example.com'), 1::bigint, 'One contact for both sign-ups');
select is((select s.consent_text from public.contact_subscriptions s join public.audiences a on a.id = s.audience_id
  join public.contacts c on c.id = s.contact_id where a.key = 'newsletter' and c.email = 'sub@example.com'), 'Yes, send me news.',
  'The consent wording is kept with the subscription');
select is((select count(*) from public.contact_subscriptions s join public.audiences a on a.id = s.audience_id
  join public.contacts c on c.id = s.contact_id where a.key = 'film:love-me-like-this' and c.email = 'sub@example.com'), 1::bigint,
  'A film audience is created and the person is subscribed to it');
select is((select count(*) from public.contact_subscriptions s join public.audiences a on a.id = s.audience_id
  join public.contacts c on c.id = s.contact_id where a.marketing and c.email = 'client@example.com'), 0::bigint,
  'An inquiry never subscribes anyone to marketing');

-- Unsubscribing sticks.
update public.contact_subscriptions set status = 'unsubscribed'
where contact_id = (select id from public.contacts where email = 'sub@example.com')
  and audience_id = (select id from public.audiences where key = 'newsletter');
select tests.sign_in(:O);
set local role authenticated;
select throws_ok($$update public.contact_subscriptions set status = 'subscribed'
  where audience_id = (select id from public.audiences where key = 'newsletter')
    and contact_id = (select id from public.contacts where email = 'sub@example.com')$$,
  '23514', null, 'Not even the owner can re-subscribe someone who unsubscribed');

-- =========================================================================
-- Who sees what
-- =========================================================================
select tests.sign_in(:A);
select is(tests.visible($$select id from public.activity where kind = 'application.submitted' and production_id = '00000000-0000-0000-0000-00000000f001'$$),
  1::bigint, 'A (View Casting on P1) sees the P1 application on the timeline');
select is(tests.visible($$select id from public.activity where production_id = '00000000-0000-0000-0000-00000000f002'$$),
  0::bigint, 'A does not see P2 activity');
select is(tests.visible($$select id from public.intake_submissions where kind = 'newsletter'$$), 1::bigint,
  'A (View Contacts) sees newsletter sign-ups');
select throws_ok($$select public.log_activity('contacts', null, null, 'note.added', 'x')$$, '42501', null,
  'View access cannot write to the timeline');
select is(tests.changed($$update public.email_identities set brevo_verified = true$$), 0::bigint,
  'Only the owner can mark a sender identity verified');

select tests.sign_in(:N);
select is(tests.visible('select id from public.contacts'), 0::bigint, 'Someone with no grants sees no contacts');

-- =========================================================================
-- The email log never sends the same message twice
-- =========================================================================
reset role;
insert into public.comm_messages (direction, channel, subject, status, idempotency_key) values ('outbound', 'brevo', 'Hi', 'sent', 'confirm:casting:abc');
select throws_ok($$insert into public.comm_messages (direction, channel, subject, status, idempotency_key)
  values ('outbound', 'brevo', 'Hi', 'queued', 'confirm:casting:abc')$$, '23505', null,
  'A second send with the same key is refused by the database');


-- Staff can't subscribe someone to marketing without recording the consent.
select tests.sign_in(:O);
set local role authenticated;
select throws_ok($$insert into public.contact_subscriptions (contact_id, audience_id)
  select (select id from public.contacts where email = 'client@example.com'), id from public.audiences where key = 'newsletter'$$,
  '23514', null, 'A marketing subscription needs a recorded consent');
select lives_ok($$insert into public.contact_subscriptions (contact_id, audience_id, consent_source, consent_text)
  select (select id from public.contacts where email = 'client@example.com'), id, 'Signed paper form', 'Yes to news'
  from public.audiences where key = 'newsletter'$$,
  'With the consent recorded, the owner can subscribe someone');

-- Merging duplicates (owner only).
reset role;
insert into public.contacts (full_name, email) values ('Dupe Person', 'dupe@example.com');
select tests.sign_in(:A);
set local role authenticated;
select throws_ok(format('select public.merge_contacts(%L, %L)', (select id from public.contacts where email = 'dupe@example.com'),
  (select id from public.contacts where email = 'sub@example.com')), '42501', null, 'Only the owner can merge contacts');
select tests.sign_in(:O);
select lives_ok(format('select public.merge_contacts(%L, %L)', (select id from public.contacts where email = 'sub@example.com'),
  (select id from public.contacts where email = 'client@example.com')), 'The owner merges a duplicate');
reset role;
select is((select count(*) from public.intake_submissions s join public.contacts c on c.id = s.contact_id
  where c.email = 'client@example.com'), 3::bigint, 'The duplicate''s submissions move to the kept contact');
select is((select s.status from public.contact_subscriptions s join public.audiences a on a.id = s.audience_id
  join public.contacts c on c.id = s.contact_id where a.key = 'newsletter' and c.email = 'client@example.com'), 'unsubscribed',
  'An unsubscribe on the duplicate wins after the merge');

select * from finish();
rollback;
