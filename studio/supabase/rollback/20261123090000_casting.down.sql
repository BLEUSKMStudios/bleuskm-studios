-- Reverses migration 20261123090000_casting.
-- Run by hand in the Supabase SQL editor, only with the owner's approval.
-- WARNING: this deletes every casting call, role, application, note, session,
-- template and email log. Export them first. Uploaded files stay in the
-- casting-materials bucket until removed in the Storage dashboard.

begin;
drop policy if exists casting_intake_upload on storage.objects;
drop policy if exists casting_staff_read on storage.objects;
drop policy if exists casting_staff_delete on storage.objects;
drop function if exists public.casting_attach_files(uuid, uuid, jsonb);
drop function if exists public.casting_apply(jsonb);
drop function if exists public.casting_public_call(text, text);
drop function if exists private.casting_call_is_open(public.casting_calls, text);
drop schema if exists intake_guard cascade;
drop table if exists public.casting_messages, public.casting_templates, public.casting_sessions,
  public.casting_notes, public.casting_materials, public.casting_applications,
  public.casting_roles, public.casting_calls cascade;
drop function if exists private.casting_inherit_production();
drop function if exists private.casting_stamp_author();
drop function if exists private.casting_protect_notes();
drop function if exists private.casting_protect_messages();
drop function if exists private.casting_status_changed();
drop function if exists private.casting_seed_templates();
drop type if exists public.casting_message_status, public.casting_session_status, public.casting_session_kind,
  public.casting_material_kind, public.casting_application_status, public.casting_role_status,
  public.casting_call_status;
do $$
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations where version = '20261123090000';
  end if;
end $$;
commit;
