-- Call sheets: roster lines, sends, opening and confirmation.
begin;
\ir 00_helpers.sql

select plan(12);

\set A  '''00000000-0000-0000-0000-0000000000a1'''
\set B  '''00000000-0000-0000-0000-0000000000b1'''
\set P1 '''00000000-0000-0000-0000-00000000f001'''
\set P2 '''00000000-0000-0000-0000-00000000f002'''
\set CS '''00000000-0000-0000-0000-00000000c501'''
\set TM '''00000000-0000-0000-0000-00000000c5f1'''
\set TX '''00000000-0000-0000-0000-00000000c5f2'''
\set EN '''00000000-0000-0000-0000-00000000c5e1'''
\set SD '''00000000-0000-0000-0000-00000000c5d1'''

insert into public.access_grants (user_id, production_id, section_key, level) values (:A, :P1, 'scheduling', 'edit');
insert into public.production_team (id, production_id, full_name, email, position, team) values
  (:TM, :P1, 'Crew Person', 'crew@example.com', 'Gaffer', 'crew'),
  (:TX, :P2, 'Other Person', 'other@example.com', 'Grip', 'crew');
insert into public.call_sheets (id, production_id, shoot_date, title) values (:CS, :P1, '2026-12-05', 'Day 1');

select tests.sign_in(:A);
set local role authenticated;
select lives_ok(format($$insert into public.call_sheet_entries (id, call_sheet_id, production_id, team_id, full_name, email, team) values (%L, %L, %L, %L, 'Crew Person', 'crew@example.com', 'crew')$$, :EN, :CS, :P1, :TM),
  'A roster member is added to the sheet');
select throws_ok(format($$insert into public.call_sheet_entries (call_sheet_id, production_id, team_id, full_name) values (%L, %L, %L, 'Again')$$, :CS, :P1, :TM),
  '23505', null, 'A roster member appears on a sheet once');
select throws_ok(format($$insert into public.call_sheet_entries (call_sheet_id, production_id, team_id, full_name) values (%L, %L, %L, 'Other')$$, :CS, :P1, :TX),
  '23514', null, 'Another production''s roster member cannot be added');
select lives_ok(format($$insert into public.call_sheet_sends (id, call_sheet_id, production_id, entry_id, team_id, version, recipient_name, recipient_email, identity_key, token_hash, status, confirmed_at)
  values (%L, %L, %L, %L, %L, 1, 'Crew Person', 'crew@example.com', 'crew', %L, 'confirmed', now())$$, :SD, :CS, :P2, :EN, :TM, repeat('b', 64)),
  'Scheduling edit access records a send');
select is((select production_id || '/' || status || '/' || (confirmed_at is null) from public.call_sheet_sends where id = :SD), :P1 || '/sent/true',
  'A send takes its sheet''s production and always starts as sent');
select throws_ok(format($$insert into public.call_sheet_sends (call_sheet_id, version, recipient_name, recipient_email, identity_key) values (%L, 1, 'Crew Person', 'crew@example.com', 'crew')$$, :CS),
  '23505', null, 'The same version goes to an address once');
select throws_ok(format($$update public.call_sheet_sends set status = 'confirmed' where id = %L$$, :SD),
  '42501', null, 'Staff cannot record a confirmation');
select throws_ok(format($$update public.call_sheet_sends set confirmed_at = now() where id = %L$$, :SD),
  '42501', null, 'Staff cannot write confirmation times');
reset role;
select is((select count(*)::int from public.activity where kind = 'call_sheet.sent' and subject_id = :SD), 1, 'The timeline records the send');
update public.call_sheet_sends set status = 'confirmed', confirmed_at = now() where id = :SD;
select is((select count(*)::int from public.activity where kind = 'call_sheet.confirmed' and subject_id = :SD), 1, 'The timeline records the confirmation');

select tests.sign_in(:B);
set local role authenticated;
select is((select count(*)::int from public.call_sheet_sends), 0, 'Without Scheduling access to the production, sends are hidden');
select throws_ok(format($$insert into public.call_sheet_sends (call_sheet_id, version, recipient_name, recipient_email, identity_key) values (%L, 2, 'X', 'x@example.com', 'crew')$$, :CS),
  '42501', null, '…and cannot be created');
reset role;

select * from finish();
rollback;
