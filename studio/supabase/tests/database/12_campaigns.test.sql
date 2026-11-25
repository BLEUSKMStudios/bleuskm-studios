-- Campaigns: owner approval on exact wording, subscribed-only recipients.
begin;
\ir 00_helpers.sql

select plan(16);

\set O  '''00000000-0000-0000-0000-0000000000a0'''
\set A  '''00000000-0000-0000-0000-0000000000a1'''
\set B  '''00000000-0000-0000-0000-0000000000b1'''
\set K  '''00000000-0000-0000-0000-00000000ca01'''
\set C1 '''00000000-0000-0000-0000-00000000cc01'''
\set C2 '''00000000-0000-0000-0000-00000000cc02'''
\set C3 '''00000000-0000-0000-0000-00000000cc03'''

insert into public.access_grants (user_id, production_id, section_key, level) values (:A, null, 'communications', 'edit'), (:A, null, 'contacts', 'view');
insert into public.contacts (id, full_name, email) values (:C1, 'Sub One', 'sub1@example.com'), (:C2, 'Unsub Two', 'unsub2@example.com'), (:C3, 'Bounced Three', 'b3@example.com');
update public.contacts set email_status = 'bounced' where id = :C3;
insert into public.contact_subscriptions (contact_id, audience_id, status, consent_source)
  select c, (select id from public.audiences where key = 'newsletter'), st, 'test form'
  from (values (:C1::uuid, 'subscribed'), (:C2::uuid, 'unsubscribed'), (:C3::uuid, 'subscribed')) v(c, st);

select tests.sign_in(:A);
set local role authenticated;
select throws_ok($$insert into public.campaigns (name, audience_id, identity_key, subject, body) values ('X', (select id from public.audiences where key = 'casting-applicants'), 'newsletter', 'S', 'B')$$,
  '23514', null, 'Campaigns cannot go to an operational audience (applicants)');
select lives_ok(format($$insert into public.campaigns (id, name, audience_id, identity_key, subject, body, status) values (%L, 'December news', (select id from public.audiences where key = 'newsletter'), 'newsletter', 'News', 'Hello', 'approved')$$, :K),
  'Communications edit access drafts a campaign');
select is((select status from public.campaigns where id = :K), 'draft', 'A new campaign is always a draft');
select throws_ok(format($$update public.campaigns set status = 'approved' where id = %L$$, :K), '23514', null, 'A draft must be submitted before approval');
select lives_ok(format($$update public.campaigns set status = 'submitted' where id = %L$$, :K), 'Staff submit it for approval');
select throws_ok(format($$update public.campaigns set status = 'approved' where id = %L$$, :K), '42501', null, 'Only the owner can approve');
select throws_ok(format($$update public.campaigns set status = 'sending' where id = %L$$, :K), '23514', null, 'An unapproved campaign cannot be sent');
reset role;
select tests.sign_in(:O);
set local role authenticated;
select lives_ok(format($$update public.campaigns set status = 'approved' where id = %L$$, :K), 'The owner approves it');
select is((select approved_by from public.campaigns where id = :K), :O::uuid, 'Approval records the owner');
reset role;
select tests.sign_in(:A);
set local role authenticated;
update public.campaigns set body = 'Hello, changed' where id = :K;
select is((select status || '/' || (approved_at is null) from public.campaigns where id = :K), 'draft/true', 'Changing the wording withdraws the approval');
update public.campaigns set status = 'submitted' where id = :K;
reset role;
select tests.sign_in(:O);
set local role authenticated;
update public.campaigns set status = 'approved' where id = :K;
reset role;
select tests.sign_in(:A);
set local role authenticated;
select lives_ok(format($$update public.campaigns set status = 'sending' where id = %L$$, :K), 'The approved wording can be sent');
select lives_ok(format($$insert into public.campaign_recipients (campaign_id, contact_id, email) values (%L, %L, 'sub1@example.com')$$, :K, :C1), 'A subscriber is a recipient');
select throws_ok(format($$insert into public.campaign_recipients (campaign_id, contact_id, email) values (%L, %L, 'unsub2@example.com')$$, :K, :C2), '23514', null, 'Someone who unsubscribed is refused');
select throws_ok(format($$insert into public.campaign_recipients (campaign_id, contact_id, email) values (%L, %L, 'b3@example.com')$$, :K, :C3), '23514', null, 'A bounced address is refused');
select throws_ok(format($$insert into public.campaign_recipients (campaign_id, contact_id, email) values (%L, %L, 'sub1@example.com')$$, :K, :C1), '23505', null, 'Nobody gets the same campaign twice');
reset role;
select tests.sign_in(:B);
set local role authenticated;
select is((select count(*)::int from public.campaigns), 0, 'Without Communications access, campaigns are hidden');
reset role;

select * from finish();
rollback;
