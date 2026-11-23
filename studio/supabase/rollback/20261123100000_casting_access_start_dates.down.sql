-- Reverses migration 20261123100000_casting_access_start_dates.
-- Run by hand in the Supabase SQL editor, only with the owner's approval.
-- Afterwards every listed early-access code works immediately again (the
-- behaviour of 20261123090000_casting). No applications are touched.

begin;

create or replace function private.casting_call_is_open(c public.casting_calls, p_access text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select c.status = 'open'
    and (c.deadline is null or c.deadline > now())
    and (c.opens_at is null or c.opens_at <= now()
         or (coalesce(p_access, '') <> '' and p_access = any (c.early_access_codes)));
$$;

-- The public call reader as it was in 20261123090000_casting.
create or replace function public.casting_public_call(p_slug text, p_access text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  c public.casting_calls%rowtype;
  v_open boolean;
begin
  select * into c from public.casting_calls where public_slug = p_slug and status <> 'draft';
  if not found then
    return jsonb_build_object('found', false);
  end if;
  v_open := private.casting_call_is_open(c, p_access);
  return jsonb_build_object(
    'found', true,
    'open', v_open,
    'early_access', v_open and c.opens_at is not null and c.opens_at > now(),
    'slug', c.public_slug,
    'title', c.title,
    'film', (select title from public.productions where id = c.production_id),
    'summary', c.summary,
    'description', c.description,
    'requirements', c.requirements,
    'instructions', c.instructions,
    'location', c.location,
    'compensation', c.compensation,
    'opens_at', c.opens_at,
    'deadline', c.deadline,
    'roles', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'name', r.name, 'role_type', r.role_type, 'summary', r.summary,
        'description', r.description, 'requirements', r.requirements,
        'age_min', r.age_min, 'age_max', r.age_max, 'deadline', r.deadline,
        'open', v_open and r.status = 'open' and (r.deadline is null or r.deadline > now())
      ) order by r.sort, r.name)
      from public.casting_roles r
      where r.call_id = c.id and r.status <> 'closed'
    ), '[]'::jsonb)
  );
end;
$$;

drop function if exists private.casting_access_starts_at(public.casting_calls, text);
drop trigger if exists casting_calls_access_starts on public.casting_calls;
drop function if exists private.casting_calls_check_access_starts();
alter table public.casting_calls drop column if exists early_access_starts;

commit;
