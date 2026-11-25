-- Zoho inbox: owner-confirmed senders, filed messages sent once.
begin;
\ir 00_helpers.sql

select plan(11);

\set O  '''00000000-0000-0000-0000-0000000000a0'''
\set A  '''00000000-0000-0000-0000-0000000000a1'''

select is((select zoho_kind || ',' || brevo_verified || ',' || zoho_send_as from public.email_identities where key = 'clients'),
  'unverified,false,false', 'clients@ exists and is not assumed to be confirmed anywhere');

insert into public.access_grants (user_id, production_id, section_key, level) values (:A, null, 'communications', 'edit');

-- Staff can't confirm a sender.
select tests.sign_in(:A);
set local role authenticated;
select is(tests.changed($$update public.email_identities set zoho_send_as = true where key = 'studio'$$), 0::bigint,
  'Staff cannot mark an address as a Zoho send-as address');
reset role;

-- The owner can, and who/when is recorded.
select tests.sign_in(:O);
set local role authenticated;
select is(tests.changed($$update public.email_identities set zoho_kind = 'mailbox', zoho_send_as = true where key = 'studio'$$), 1::bigint,
  'The owner records what studio@ is in Zoho');
select is((select verified_by from public.email_identities where key = 'studio'), :O::uuid, 'Who confirmed it is recorded');
select ok((select verified_at is not null from public.email_identities where key = 'studio'), 'When it was confirmed is recorded');
select lives_ok($$update public.email_identities set verified_by = null, verified_at = null where key = 'studio'$$, 'A direct change to the stamp is ignored');
select is((select verified_by from public.email_identities where key = 'studio'), :O::uuid, 'The stamp is kept');
select throws_ok($$update public.email_identities set address = 'other@example.com' where key = 'studio'$$, '23514', null,
  'A sender''s address cannot be changed');
reset role;

-- Filed messages and sends are kept once per key.
insert into public.comm_messages (direction, channel, status, idempotency_key, subject) values ('inbound', 'zoho', 'received', 'zoho-in:abc12345', 'Hello');
select throws_ok($$insert into public.comm_messages (direction, channel, status, idempotency_key, subject) values ('inbound', 'zoho', 'received', 'zoho-in:abc12345', 'Hello')$$,
  '23505', null, 'The same inbox message is filed only once');
select throws_ok($$insert into public.comm_messages (direction, channel, status, idempotency_key) values ('outbound', 'zoho', 'queued', 'zoho-out:n1'), ('outbound', 'zoho', 'queued', 'zoho-out:n1')$$,
  '23505', null, 'The same reply form cannot send twice');

-- Without Communications access, the filed inbox is hidden.
select tests.sign_in('00000000-0000-0000-0000-0000000000b1');
set local role authenticated;
select is((select count(*)::int from public.comm_messages), 0, 'Without Communications access, filed email is hidden');
reset role;

select * from finish();
rollback;
