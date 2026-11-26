-- Contracts & Agreements: versioned templates, frozen agreements, the
-- append-only audit trail, signing, filing and onboarding.
begin;
\ir 00_helpers.sql

select plan(27);

\set O  '''00000000-0000-0000-0000-0000000000a0'''
\set A  '''00000000-0000-0000-0000-0000000000a1'''
\set B  '''00000000-0000-0000-0000-0000000000b1'''
\set P1 '''00000000-0000-0000-0000-00000000f001'''
\set T1 '''00000000-0000-0000-0000-00000000c701'''
\set T2 '''00000000-0000-0000-0000-00000000c702'''
\set R1 '''00000000-0000-0000-0000-00000000c711'''
\set R2 '''00000000-0000-0000-0000-00000000c712'''
\set APP '''00000000-0000-0000-0000-0000000e0901'''

insert into public.casting_calls (id, production_id, public_slug, title, status) values
  ('00000000-0000-0000-0000-0000000c0901', :P1, 'contract-cast', 'Cast', 'open');
insert into public.casting_roles (id, call_id, name) values
  ('00000000-0000-0000-0000-0000000d0901', '00000000-0000-0000-0000-0000000c0901', 'Sosa');
insert into public.casting_applications (id, production_id, call_id, role_id, full_name, email) values
  (:APP, :P1, '00000000-0000-0000-0000-0000000c0901', '00000000-0000-0000-0000-0000000d0901', 'Signer One', 'signer@example.com');
update public.casting_applications set status = 'selected' where id = :APP;
insert into public.access_grants (user_id, production_id, section_key, level) values
  (:A, :P1, 'documents', 'edit');

-- Templates: only the owner writes them; approved wording is permanent.
select tests.sign_in(:A);
set local role authenticated;
select throws_ok($$insert into public.contract_templates (key, name, audience, identity_key, body) values ('actor_principal', 'Actor', 'cast', 'casting', '{}')$$,
  '42501', null, 'Only the owner can create templates');
select tests.sign_in(:O);
select lives_ok($$insert into public.contract_templates (id, key, name, audience, identity_key, body) values
  ('00000000-0000-0000-0000-00000000c701', 'actor_principal', 'Actor', 'cast', 'casting', '{"title":"Actor Agreement"}')$$,
  'The owner creates a draft template');
select lives_ok($$update public.contract_templates set status = 'approved' where id = '00000000-0000-0000-0000-00000000c701'$$,
  'The owner approves it');
select is((select approved_by from public.contract_templates where id = :T1), :O::uuid, 'Approval records who approved it');
select throws_ok($$update public.contract_templates set body = '{"title":"Changed"}' where id = '00000000-0000-0000-0000-00000000c701'$$,
  '23514', null, 'Approved wording cannot be changed');
insert into public.contract_templates (id, key, version, name, audience, identity_key, body)
  values (:T2, 'actor_principal', 2, 'Actor', 'cast', 'casting', '{"title":"Actor Agreement v2"}');
reset role;

-- Agreements: Documents edit access on the production.
select tests.sign_in(:B);
set local role authenticated;
select throws_ok(format($$insert into public.contract_requests (production_id, template_id, template_key, template_version, signer_name, signer_email, identity_key)
  values (%L, %L, 'x', 0, 'Signer One', 'signer@example.com', 'casting')$$, :P1, :T1), '42501', null,
  'Without Documents access to the production, no agreement can be prepared');
select tests.sign_in(:A);
select lives_ok(format($$insert into public.contract_requests (id, production_id, template_id, template_key, template_version, application_id, signer_name, signer_email, identity_key, fields)
  values (%L, %L, %L, 'x', 0, %L, 'Signer One', 'signer@example.com', 'casting', '{"role":"Sosa"}')$$, :R1, :P1, :T1, :APP),
  'Documents edit access prepares a draft agreement');
select is((select template_key || ' v' || template_version from public.contract_requests where id = :R1), 'actor_principal v1',
  'The template key and version come from the template itself');
select throws_ok(format($$update public.contract_requests set content_text = 'x', content_hash = %L, approved_at = now() where id = %L$$, repeat('0', 64), :R1),
  '23514', null, 'Frozen wording must match its SHA-256 hash');
select throws_ok(format($$update public.contract_requests set template_id = %L, content_text = 'x', content_hash = encode(sha256('x'), 'hex'), approved_at = now() where id = %L$$, :T2, :R1),
  '23514', null, 'A template version the owner has not approved cannot be sent');
select lives_ok(format($$update public.contract_requests set content_text = '{"agreement":1}', content_hash = encode(sha256('{"agreement":1}'), 'hex'),
  approved_at = now(), approved_by = %L, status = 'sent', sent_at = now(), token_hash = %L, expires_at = now() + interval '14 days' where id = %L$$, :A, repeat('b', 64), :R1),
  'Approving freezes the wording and sends it');
select throws_ok(format($$update public.contract_requests set content_text = '{"agreement":2}', content_hash = encode(sha256('{"agreement":2}'), 'hex') where id = %L$$, :R1),
  '23514', null, 'Sent wording cannot be edited');
select throws_ok(format($$update public.contract_requests set status = 'signed' where id = %L$$, :R1),
  '42501', null, 'Staff cannot mark an agreement signed');
select throws_ok(format($$update public.contract_requests set signed_name = 'Someone' where id = %L$$, :R1),
  '42501', null, 'Staff cannot write signature details');
select throws_ok('select * from public.contract_otps', '42501', null, 'Email codes are never readable by hub users');
reset role;

select is((select onboarding from public.production_team where application_id = :APP), 'paperwork_sent',
  'Sending marks the roster''s onboarding as paperwork sent');

-- The signing route (server key) records the signature.
update public.contract_requests set status = 'signed', signed_at = now(), signed_name = 'Signer One', signature_kind = 'typed',
  consent_at = now(), verified_at = now(), signer_ip = '203.0.113.9', signer_agent = 'pgTAP',
  pdf_path = 'contracts/x/signed.pdf', pdf_sha256 = repeat('c', 64)
where id = :R1;
select is((select status || '/' || category || '/' || source from public.documents where source_id = :R1), 'signed/contract/contract',
  'A signed agreement is filed in Documents');
select is((select document_id from public.contract_requests where id = :R1), (select id from public.documents where source_id = :R1),
  'The agreement links to its Documents record');
select is((select onboarding || '/' || status from public.production_team where application_id = :APP), 'paperwork_signed/confirmed',
  'Onboarding moves to paperwork signed and the roster place is confirmed');
select throws_ok(format($$update public.contract_requests set signer_ip = '1.1.1.1' where id = %L$$, :R1),
  '23514', null, 'A signed agreement cannot be changed, even with the server key');
select throws_ok(format($$delete from public.contract_requests where id = %L$$, :R1), '23514', null, 'A signed agreement cannot be deleted');
select throws_ok(format($$delete from public.documents where source_id = %L$$, :R1), '23514', null, 'Its filed copy cannot be deleted');

-- The audit trail.
select is((select string_agg(kind, ',' order by id) from public.contract_events where request_id = :R1), 'created,approved,sent,signed',
  'Every step is in the audit trail');
select ok(public.contract_verify_chain(:R1), 'The hash chain verifies');
select throws_ok(format($$update public.contract_events set kind = 'x' where request_id = %L$$, :R1), '42501', null, 'The trail cannot be edited');
select throws_ok(format($$delete from public.contract_events where request_id = %L$$, :R1), '42501', null, 'The trail cannot be deleted');

-- Voiding stops the link.
insert into public.contract_requests (id, production_id, template_id, template_key, template_version, signer_name, signer_email, identity_key)
  values (:R2, :P1, :T1, 'x', 0, 'Other', 'other@example.com', 'casting');
update public.contract_requests set content_text = 'y', content_hash = encode(sha256('y'), 'hex'), approved_at = now(),
  status = 'sent', token_hash = repeat('d', 64) where id = :R2;
update public.contract_requests set status = 'voided', void_reason = 'Wrong role' where id = :R2;
select is((select coalesce(token_hash, 'none') from public.contract_requests where id = :R2), 'none', 'A voided agreement''s link stops working');

select * from finish();
rollback;
