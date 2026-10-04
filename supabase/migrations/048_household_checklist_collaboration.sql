-- Household checklist collaboration (the user's choice: either household member can tick checklist items
-- and complete any shared chore, including one assigned to the other member; "Done by" still records who did it).
--
-- 1) planly_private.set_household_task_completed: unchanged except the assignee restriction is removed.
--    Membership of the task's household, household visibility, not-deleted and cloud_version checks all remain.
-- 2) planly_private.set_household_subtask_done + public wrapper: set ONE checklist item's done flag on a shared task.
--    Authority comes only from auth.uid() being a member of the task's household; the task must be a live
--    household task and the item must exist. Only that item's "done" changes (title/order/other fields untouched),
--    applied under a row lock, so two people ticking different items never overwrite each other. Idempotent.
--    The owner's normal edits keep their cloud_version optimistic concurrency (this bumps the version).

create or replace function planly_private.set_household_task_completed(
  p_owner_id uuid, p_client_id text, p_completed boolean,
  p_expected_cloud_version bigint, p_next_date date default null
)
returns public.planly_tasks
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user uuid := auth.uid();
  v_task public.planly_tasks;
  v_now_ms bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  v_series_id text;
  v_next_client_id text;
  v_next_occurrence integer;
  v_cfg jsonb;
  v_end_mode text;
  v_end_date date;
  v_max_occurrences integer;
  v_next_subtasks jsonb := '[]'::jsonb;
  v_next_data jsonb;
  v_create_next boolean := false;
  v_next_assignee uuid;
begin
  if v_user is null then raise exception 'Authentication required' using errcode = '42501'; end if;

  select * into v_task
  from public.planly_tasks t
  where t.owner_id = p_owner_id and t.client_id = p_client_id
    and t.deleted_at is null and t.visibility = 'household' and t.household_id is not null
  for update;
  if not found then raise exception 'Task not found' using errcode = 'P0002'; end if;

  if not exists (
    select 1 from public.planly_household_members m
    where m.household_id = v_task.household_id and m.user_id = v_user
  ) then raise exception 'Not authorized' using errcode = '42501'; end if;

  if v_task.completed is not distinct from p_completed then return v_task; end if;
  if v_task.cloud_version is distinct from p_expected_cloud_version then
    raise exception 'Task changed elsewhere' using errcode = 'P0409';
  end if;

  v_cfg := coalesce(v_task.recurrence_config, '{}'::jsonb);
  v_series_id := coalesce(v_task.series_client_id, v_task.client_id);

  if p_completed and v_task.recurrence <> 'none' and v_task.task_date is not null and p_next_date is not null then
    if p_next_date <= v_task.task_date then raise exception 'Invalid next occurrence date' using errcode = '22023'; end if;
    v_create_next := true;
    v_end_mode := coalesce(v_cfg->>'endMode', 'never');
    v_next_occurrence := coalesce(v_task.occurrence_number, 1) + 1;
    if v_end_mode = 'count' then
      begin
        v_max_occurrences := nullif(v_cfg->>'maxOccurrences', '')::integer;
      exception when invalid_text_representation or numeric_value_out_of_range then
        v_max_occurrences := null;
      end;
      if v_max_occurrences is not null and v_next_occurrence > v_max_occurrences then
        v_create_next := false;
      end if;
    elsif v_end_mode = 'date' then
      begin
        v_end_date := nullif(v_cfg->>'endDate', '')::date;
      exception when invalid_datetime_format or datetime_field_overflow then
        v_end_date := null;
      end;
      if v_end_date is not null and p_next_date > v_end_date then
        v_create_next := false;
      end if;
    end if;
  elsif p_next_date is not null then
    raise exception 'Next occurrence is not valid for this task' using errcode = '22023';
  end if;

  update public.planly_tasks t
  set completed = p_completed,
      series_client_id = case when p_completed and t.recurrence <> 'none' and t.series_client_id is null then v_series_id else t.series_client_id end,
      recurrence_config = case when p_completed and t.recurrence <> 'none'
        then jsonb_set(coalesce(t.recurrence_config, '{}'::jsonb), '{anchorDate}', to_jsonb(coalesce(t.recurrence_config->>'anchorDate', t.task_date::text)), true)
        else t.recurrence_config end,
      data = jsonb_set(jsonb_set(coalesce(t.data, '{}'::jsonb), '{completed}', to_jsonb(p_completed), true), '{updatedAt}', to_jsonb(v_now_ms), true)
        || case when p_completed and t.recurrence <> 'none' then jsonb_build_object(
          'seriesId', v_series_id,
          'recurrenceConfig', jsonb_set(coalesce(t.recurrence_config, '{}'::jsonb), '{anchorDate}', to_jsonb(coalesce(t.recurrence_config->>'anchorDate', t.task_date::text)), true)
        ) else '{}'::jsonb end,
      client_updated_at = greatest(t.client_updated_at, v_now_ms)
  where t.owner_id = p_owner_id and t.client_id = p_client_id
  returning * into v_task;

  if v_create_next then
    v_next_client_id := v_now_ms::text || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 16);
    v_next_occurrence := coalesce(v_task.occurrence_number, 1) + 1;
    select coalesce(jsonb_agg(
      (s.value - 'id' - 'done') || jsonb_build_object(
        'id', v_now_ms::text || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 16), 'done', false
      ) order by s.ordinality
    ), '[]'::jsonb)
    into v_next_subtasks
    from jsonb_array_elements(coalesce(v_task.subtasks, '[]'::jsonb)) with ordinality as s(value, ordinality);

    -- Stage 5: a chore set to rotate weekly gets the person whose week the next date falls in.
    v_next_assignee := planly_private.household_rotation_assignee(v_task.household_id, v_task.data->'rotation', p_next_date, v_task.assignee_id);

    v_next_data := coalesce(v_task.data, '{}'::jsonb) - 'top3Order' || jsonb_build_object(
      'id', v_next_client_id, 'seriesId', v_series_id, 'occurrenceNumber', v_next_occurrence,
      'date', p_next_date::text, 'completed', false, 'pinned', false, 'subtasks', v_next_subtasks,
      'createdAt', v_now_ms, 'updatedAt', v_now_ms,
      'recurrenceConfig', jsonb_set(coalesce(v_task.recurrence_config, '{}'::jsonb), '{anchorDate}', to_jsonb(coalesce(v_task.recurrence_config->>'anchorDate', v_task.task_date::text)), true),
      'googleEventId', case when v_task.add_to_calendar and v_task.google_event_id is not null then to_jsonb(v_task.google_event_id) else '""'::jsonb end,
      'calendarSync', to_jsonb(case when v_task.add_to_calendar then case when coalesce(v_task.google_event_id, '') <> '' then 'synced' else 'pending' end else '' end)
    ) || case when v_next_assignee is distinct from v_task.assignee_id
      then jsonb_build_object('assigneeId', v_next_assignee) else '{}'::jsonb end;

    insert into public.planly_tasks(
      owner_id, client_id, data, series_client_id, title, task_date, task_time, duration_minutes,
      priority, category, project_client_id, recurrence, recurrence_config, occurrence_number,
      reminder, notes, subtasks, completed, pinned, top3_order, add_to_calendar, google_event_id,
      google_recurrence_start_date, google_recurrence_version, calendar_sync, calendar_synced_at,
      client_created_at, client_updated_at, visibility, household_id, assignee_id, completed_by, completed_at
    ) values (
      v_task.owner_id, v_next_client_id, v_next_data, v_series_id, v_task.title, p_next_date,
      v_task.task_time, v_task.duration_minutes, v_task.priority, v_task.category, v_task.project_client_id,
      v_task.recurrence,
      jsonb_set(coalesce(v_task.recurrence_config, '{}'::jsonb), '{anchorDate}', to_jsonb(coalesce(v_task.recurrence_config->>'anchorDate', v_task.task_date::text)), true),
      v_next_occurrence, v_task.reminder, v_task.notes, v_next_subtasks, false, false, null,
      v_task.add_to_calendar, case when v_task.add_to_calendar then v_task.google_event_id else null end,
      v_task.google_recurrence_start_date, v_task.google_recurrence_version,
      case when v_task.add_to_calendar then case when coalesce(v_task.google_event_id, '') <> '' then 'synced' else 'pending' end else '' end,
      v_task.calendar_synced_at, v_now_ms, v_now_ms, v_task.visibility, v_task.household_id,
      v_next_assignee, null, null
    )
    on conflict (owner_id, series_client_id, task_date)
      where deleted_at is null and series_client_id is not null
    do nothing;
  end if;

  return v_task;
end
$$;
alter function planly_private.set_household_task_completed(uuid,text,boolean,bigint,date) owner to postgres;
revoke all on function planly_private.set_household_task_completed(uuid,text,boolean,bigint,date) from public, anon, authenticated;
grant execute on function planly_private.set_household_task_completed(uuid,text,boolean,bigint,date) to authenticated;

create or replace function planly_private.set_household_subtask_done(
  p_owner_id uuid, p_client_id text, p_subtask_id text, p_done boolean
)
returns public.planly_tasks
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user uuid := auth.uid();
  v_task public.planly_tasks;
  v_now_ms bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  v_subtasks jsonb;
  v_found boolean := false;
begin
  if v_user is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_subtask_id is null or p_done is null then raise exception 'Invalid checklist item' using errcode = '22023'; end if;

  select * into v_task
  from public.planly_tasks t
  where t.owner_id = p_owner_id and t.client_id = p_client_id
    and t.deleted_at is null and t.visibility = 'household' and t.household_id is not null
  for update;
  if not found then raise exception 'Task not found' using errcode = 'P0002'; end if;

  if not exists (
    select 1 from public.planly_household_members m
    where m.household_id = v_task.household_id and m.user_id = v_user
  ) then raise exception 'Not authorized' using errcode = '42501'; end if;

  v_subtasks := case when jsonb_typeof(v_task.subtasks) = 'array' then v_task.subtasks else '[]'::jsonb end;
  select exists(select 1 from jsonb_array_elements(v_subtasks) e where e->>'id' = p_subtask_id) into v_found;
  if not v_found then raise exception 'Checklist item not found' using errcode = 'P0002'; end if;
  -- Already in the requested state: nothing to write (no version bump, so no needless conflicts for the owner).
  if exists(select 1 from jsonb_array_elements(v_subtasks) e
            where e->>'id' = p_subtask_id and coalesce((e->>'done')::boolean, false) = p_done) then
    return v_task;
  end if;

  -- Rebuild the array in its original order, changing only the matching item's "done".
  select coalesce(jsonb_agg(case when e.value->>'id' = p_subtask_id
                                 then jsonb_set(e.value, '{done}', to_jsonb(p_done), true)
                                 else e.value end order by e.ordinality), '[]'::jsonb)
    into v_subtasks
    from jsonb_array_elements(v_subtasks) with ordinality as e(value, ordinality);

  update public.planly_tasks t
     set subtasks = v_subtasks,
         data = jsonb_set(jsonb_set(coalesce(t.data, '{}'::jsonb), '{subtasks}', v_subtasks, true), '{updatedAt}', to_jsonb(v_now_ms), true),
         client_updated_at = greatest(t.client_updated_at, v_now_ms)
   where t.owner_id = p_owner_id and t.client_id = p_client_id
  returning * into v_task;

  return v_task;
end
$$;
alter function planly_private.set_household_subtask_done(uuid,text,text,boolean) owner to postgres;
revoke all on function planly_private.set_household_subtask_done(uuid,text,text,boolean) from public, anon, authenticated;
grant execute on function planly_private.set_household_subtask_done(uuid,text,text,boolean) to authenticated;

create or replace function public.planly_set_household_subtask_done(
  p_owner_id uuid, p_client_id text, p_subtask_id text, p_done boolean
)
returns public.planly_tasks
language sql
set search_path = pg_catalog, public
as $$
  select planly_private.set_household_subtask_done(p_owner_id, p_client_id, p_subtask_id, p_done)
$$;
revoke all on function public.planly_set_household_subtask_done(uuid,text,text,boolean) from public, anon;
grant execute on function public.planly_set_household_subtask_done(uuid,text,text,boolean) to authenticated;
comment on function public.planly_set_household_subtask_done(uuid,text,text,boolean) is
  'Household members: set one checklist item done/undone on a shared (household) task. Membership-checked server-side.';
