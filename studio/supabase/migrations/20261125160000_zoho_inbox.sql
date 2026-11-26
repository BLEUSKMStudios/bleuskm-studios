-- Zoho inbox: sender settings the owner confirms, and the clients@ address.
--
--  * email_identities gains clients@ (project inquiries and client work),
--    like the others: not confirmed in Zoho or Brevo until the owner says so.
--  * When the owner changes what an address is in Zoho, or whether it is a
--    verified Brevo sender or a Zoho "send as" address, who and when is
--    recorded (verified_by, verified_at). Only the owner can change them
--    (the existing policy); the server can too, for maintenance.
--  * Inbox messages filed in Studio OS are found by their key (Message-ID),
--    and a person's emails by contact: both already indexed.
-- Additive only. Section: Communications (Studio level).

insert into public.email_identities (key, address, display_name, purpose, brevo_verified, notes) values
  ('clients', 'clients@bleuskm.com', 'BLEUSKM Studios', 'Project inquiries and client work.', false, null)
on conflict (key) do nothing;

create function private.email_identity_stamp()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.key is distinct from old.key or new.address is distinct from old.address then
    raise exception 'A sender''s key and address cannot be changed' using errcode = 'check_violation';
  end if;
  if new.zoho_kind is distinct from old.zoho_kind or new.brevo_verified is distinct from old.brevo_verified
     or new.zoho_send_as is distinct from old.zoho_send_as then
    new.verified_by := coalesce(auth.uid(), new.verified_by);
    new.verified_at := now();
  elsif new.verified_by is distinct from old.verified_by or new.verified_at is distinct from old.verified_at then
    -- Recorded only by a change above.
    new.verified_by := old.verified_by; new.verified_at := old.verified_at;
  end if;
  return new;
end;
$$;
create trigger email_identities_stamp before update on public.email_identities
  for each row execute function private.email_identity_stamp();

create index comm_messages_thread_idx on public.comm_messages (thread_key) where thread_key is not null;
