-- Casting and crew pipeline: statuses, self-tape invitations, roster.
begin;
\ir 00_helpers.sql

select plan(14);

\set O  '''00000000-0000-0000-0000-0000000000a0'''
\set A  '''00000000-0000-0000-0000-0000000000a1'''
\set B  '''00000000-0000-0000-0000-0000000000b1'''
\set P1 '''00000000-0000-0000-0000-00000000f001'''
\set P2 '''00000000-0000-0000-0000-00000000f002'''

insert into public.casting_calls (id, production_id, public_slug, title, status) values
  ('00000000-0000-0000-0000-0000000c0201', :P1, 'pipe-cast', 'Cast', 'open'),
  ('00000000-0000-0000-0000-0000000c0202', :P1, 'pipe-crew', 'Crew', 'open');
insert into public.casting_roles (id, call_id, name) values
  ('00000000-0000-0000-0000-0000000d0201', '00000000-0000-0000-0000-0000000c0201', 'Sosa'),
  ('00000000-0000-0000-0000-0000000d0202', '00000000-0000-0000-0000-0000000c0202', 'Gaffer');
insert into public.casting_applications (id, production_id, call_id, role_id, full_name, email) values
  ('00000000-0000-0000-0000-0000000e0201', :P1, '00000000-0000-0000-0000-0000000c0201', '00000000-0000-0000-0000-0000000d0201', 'Actor One', 'actor@example.com'),
  ('00000000-0000-0000-0000-0000000e0202', :P1, '00000000-0000-0000-0000-0000000c0202', '00000000-0000-0000-0000-0000000d0202', 'Crew One', 'crew@example.com');

select is((select count(*) from public.casting_templates where production_id = :P1 and key in ('selftape_invite', 'selftape_reminder', 'selftape_received', 'selected')),
  4::bigint, 'Productions get the self-tape and acceptance templates');
select lives_ok($$update public.casting_applications set status = 'selftape_invited' where id = '00000000-0000-0000-0000-0000000e0201'$$,
  'The new pipeline statuses can be used');

-- Self-tape invitations take their application's production and contact.
insert into public.selftape_invitations (id, application_id, production_id, token_hash)
values ('00000000-0000-0000-0000-0000000f0201', '00000000-0000-0000-0000-0000000e0201', :P2, repeat('a', 64));
select is((select production_id from public.selftape_invitations where id = '00000000-0000-0000-0000-0000000f0201'), :P1::uuid,
  'An invitation always belongs to its application''s production');
select isnt((select contact_id from public.selftape_invitations where id = '00000000-0000-0000-0000-0000000f0201'), null,
  'An invitation is linked to the applicant''s contact');
select throws_ok($$insert into public.selftape_invitations (application_id, token_hash) values ('00000000-0000-0000-0000-0000000e0201', 'plain-token')$$,
  '23514', null, 'Only a token hash can be stored, never the token');

-- Who sees invitations: Casting view on P1 (A) yes; B (casting on P2 only) no.
select tests.sign_in(:A);
set local role authenticated;
select is(tests.visible('select id from public.selftape_invitations'), 1::bigint, 'A sees P1 invitations');
select is(tests.changed($$update public.selftape_invitations set status = 'cancelled'$$), 0::bigint, 'View access cannot change an invitation');
select tests.sign_in(:B);
select is(tests.visible('select id from public.selftape_invitations'), 0::bigint, 'B does not see P1 invitations');
select is(tests.visible('select id from public.casting_custom_statuses'), 0::bigint, 'B does not see P1 custom statuses');
reset role;

-- Selected people join the roster.
update public.casting_applications set status = 'selected' where id = '00000000-0000-0000-0000-0000000e0202';
select is((select team || '/' || status || '/' || position from public.production_team where application_id = '00000000-0000-0000-0000-0000000e0202'),
  'crew/offered/Gaffer', 'A selected crew applicant is added to the roster as offered');
update public.casting_applications set status = 'cast' where id = '00000000-0000-0000-0000-0000000e0202';
select is((select status from public.production_team where application_id = '00000000-0000-0000-0000-0000000e0202'), 'confirmed',
  'Confirmed once they accept');
select is((select count(*) from public.production_team where application_id = '00000000-0000-0000-0000-0000000e0202'), 1::bigint,
  'Status changes never add a second roster row');
update public.casting_applications set status = 'selected' where id = '00000000-0000-0000-0000-0000000e0201';
select is((select team from public.production_team where application_id = '00000000-0000-0000-0000-0000000e0201'), 'cast',
  'A selected actor joins the cast roster');
update public.casting_applications set status = 'not_selected' where id = '00000000-0000-0000-0000-0000000e0201';
select is((select status from public.production_team where application_id = '00000000-0000-0000-0000-0000000e0201'), 'released',
  'Declining after selection releases the roster place');

select * from finish();
rollback;
