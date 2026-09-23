-- Planly 3.1: atomically replace one external calendar cache.
-- The delete + insert + source status update execute in one database transaction.
-- If any insert fails, PostgreSQL rolls the whole function back and preserves
-- the previously imported calendar events.

create or replace function public.replace_external_calendar_events(
  p_source_id uuid,
  p_owner_id uuid,
  p_events jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer := 0;
begin
  if p_source_id is null or p_owner_id is null then
    raise exception 'Source and owner are required';
  end if;

  if p_events is null or jsonb_typeof(p_events) <> 'array' then
    raise exception 'Events must be a JSON array';
  end if;

  if not exists (
    select 1
    from public.calendar_sources
    where id = p_source_id
      and owner_id = p_owner_id
  ) then
    raise exception 'Calendar source not found';
  end if;

  delete from public.external_calendar_events
  where source_id = p_source_id
    and owner_id = p_owner_id;

  insert into public.external_calendar_events (
    source_id,
    owner_id,
    external_uid,
    title,
    description,
    location,
    starts_at,
    ends_at,
    is_all_day,
    start_date,
    end_date,
    source_updated_at
  )
  select
    p_source_id,
    p_owner_id,
    e.external_uid,
    coalesce(nullif(e.title, ''), 'Busy'),
    e.description,
    e.location,
    e.starts_at,
    e.ends_at,
    coalesce(e.is_all_day, false),
    e.start_date,
    e.end_date,
    coalesce(e.source_updated_at, now())
  from jsonb_to_recordset(p_events) as e(
    external_uid text,
    title text,
    description text,
    location text,
    starts_at timestamptz,
    ends_at timestamptz,
    is_all_day boolean,
    start_date date,
    end_date date,
    source_updated_at timestamptz
  );

  get diagnostics v_count = row_count;

  update public.calendar_sources
  set
    status = 'connected',
    error = null,
    last_synced_at = now(),
    updated_at = now()
  where id = p_source_id
    and owner_id = p_owner_id;

  return v_count;
end;
$$;

revoke all
on function public.replace_external_calendar_events(uuid, uuid, jsonb)
from public, anon, authenticated;

grant execute
on function public.replace_external_calendar_events(uuid, uuid, jsonb)
to service_role;

notify pgrst, 'reload schema';
