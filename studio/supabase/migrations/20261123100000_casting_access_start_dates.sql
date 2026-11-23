-- Early-access codes get their own start dates, checked on the server.
--
-- Before this, any listed early-access code let its holder apply at once, up to
-- the public opening time. Now a code may carry a start time in
-- casting_calls.early_access_starts ({ "CODE": "<timestamptz>" }); until that time the
-- code does not open the call, either for reading the form or for submitting.
-- A code with no start time keeps the old behaviour (works straight away), so
-- calls edited in Studio OS before the hub learns about start dates keep working.
--
-- Love Me Like This (cast and crew): TFH-FAMILY starts Wed Nov 25 2026 and
-- LMLT-FIRST starts Fri Nov 27 2026, both at 12:00 AM Central Time. The public
-- opening (Nov 30, 9:00 AM CT) and the deadline (Dec 14, 11:59 PM CT) do not change.

alter table public.casting_calls
  add column early_access_starts jsonb not null default '{}'::jsonb
    check (jsonb_typeof(early_access_starts) = 'object');

comment on column public.casting_calls.early_access_starts is
  'Optional start time per early-access code, e.g. {"TFH-FAMILY": "2026-11-25T06:00:00Z"}. Before it, the code does not open the call.';

-- Every value must be a valid timestamp, so the open check can never fail on bad data.
create function private.casting_calls_check_access_starts()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  k text;
  v jsonb;
begin
  if jsonb_typeof(new.early_access_starts) <> 'object' then
    raise exception 'early_access_starts must be a code-to-time map' using errcode = '22023';
  end if;
  for k, v in select * from jsonb_each(new.early_access_starts) loop
    if k !~ '^[A-Za-z0-9_-]{6,40}$' or jsonb_typeof(v) <> 'string' then
      raise exception 'early_access_starts: invalid entry for %', k using errcode = '22023';
    end if;
    begin
      perform (v #>> '{}')::timestamptz;
    exception when others then
      raise exception 'early_access_starts: % is not a valid time', k using errcode = '22023';
    end;
  end loop;
  return new;
end;
$$;

create trigger casting_calls_access_starts
  before insert or update of early_access_starts on public.casting_calls
  for each row execute function private.casting_calls_check_access_starts();

-- When does this visitor's code start working? Null when there is no valid code
-- or the code has no start time.
create function private.casting_access_starts_at(c public.casting_calls, p_access text)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select case
    when coalesce(p_access, '') <> '' and p_access = any (c.early_access_codes)
      then (c.early_access_starts ->> p_access)::timestamptz
  end;
$$;

-- Is a casting call taking submissions right now, for this visitor?
-- Before the public opening time, only a valid early-access code whose start time
-- has passed (or that has no start time) lets someone in.
create or replace function private.casting_call_is_open(c public.casting_calls, p_access text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select c.status = 'open'
    and (c.deadline is null or c.deadline > now())
    and (c.opens_at is null or c.opens_at <= now()
         or (coalesce(p_access, '') <> '' and p_access = any (c.early_access_codes)
             and coalesce(private.casting_access_starts_at(c, p_access) <= now(), true)));
$$;

-- Same as before, plus access_opens_at: when the visitor's code starts working,
-- if that is still in the future (so the website can say so).
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
  v_starts timestamptz;
begin
  select * into c from public.casting_calls where public_slug = p_slug and status <> 'draft';
  if not found then
    return jsonb_build_object('found', false);
  end if;
  v_open := private.casting_call_is_open(c, p_access);
  v_starts := private.casting_access_starts_at(c, p_access);
  return jsonb_build_object(
    'found', true,
    'open', v_open,
    'early_access', v_open and c.opens_at is not null and c.opens_at > now(),
    'access_opens_at', case when v_starts > now() and (c.opens_at is null or v_starts < c.opens_at)
                            then v_starts end,
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

revoke all on function private.casting_access_starts_at(public.casting_calls, text) from public;
grant execute on function private.casting_access_starts_at(public.casting_calls, text) to service_role;
revoke all on function private.casting_calls_check_access_starts() from public;

-- Love Me Like This start dates (12:00 AM Central Time). Only touches these two calls.
update public.casting_calls
set early_access_starts = jsonb_build_object(
      'TFH-FAMILY', to_jsonb('2026-11-25 00:00:00 America/Chicago'::timestamptz),
      'LMLT-FIRST', to_jsonb('2026-11-27 00:00:00 America/Chicago'::timestamptz))
where public_slug in ('love-me-like-this', 'love-me-like-this-crew');
