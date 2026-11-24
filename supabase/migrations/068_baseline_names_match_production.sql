-- Production drift reconciliation (20 Nov 2026), 4 of 4: the original tables under production's own names.
--
-- Migrations 001 and 007 were written after production's first tables already existed, to describe them, and 018 is
-- a different version of production's shared-projects migration (see 066). The rules match production, but a fresh
-- rebuild gives several objects other names, two production columns are missing, and the old policies spell
-- auth.uid() without the (select ...) wrapper. Production's names and definitions are canonical. This renames, adds
-- and replaces so a fresh rebuild matches production exactly.
--
-- Every step is guarded. On production, which already has every target name and none of the source names, every guard
-- is false and the catalog is left as it is (the closing notify only asks PostgREST to reload its schema cache). No data
-- is touched: renames keep rows, and the indexes swapped below are on small tables.

-- 1. Constraints: same rule, production's name. (Renaming a unique constraint renames its index too.)
do $$
declare r record;
begin
  for r in select * from (values
    ('calendar_sources',         'calendar_sources_source_type_check',                    'calendar_source_type_check'),
    ('external_calendar_events', 'external_calendar_events_source_id_external_uid_key',   'external_event_unique'),
    ('planly_projects',          'planly_projects_data_check',                            'planly_projects_data_object_chk'),
    ('planly_projects',          'planly_projects_share_scope_chk',                       'planly_projects_household_visibility_check'),
    ('planly_projects',          'planly_projects_visibility_chk',                        'planly_projects_visibility_check'),
    ('planly_sync_state',        'planly_sync_state_migration_project_count_check',       'planly_sync_state_project_count_chk'),
    ('planly_sync_state',        'planly_sync_state_migration_task_count_check',          'planly_sync_state_task_count_chk'),
    ('planly_tasks',             'planly_tasks_data_check',                               'planly_tasks_data_object_chk'),
    ('planly_tasks',             'planly_tasks_recurrence_config_check',                  'planly_tasks_recurrence_config_object_chk'),
    ('planly_tasks',             'planly_tasks_subtasks_check',                           'planly_tasks_subtasks_array_chk')
  ) v(tbl, old_name, new_name)
  loop
    if exists (select 1 from pg_constraint where conrelid = format('public.%I', r.tbl)::regclass and conname = r.old_name)
       and not exists (select 1 from pg_constraint where conrelid = format('public.%I', r.tbl)::regclass and conname = r.new_name) then
      execute format('alter table public.%I rename constraint %I to %I', r.tbl, r.old_name, r.new_name);
    end if;
  end loop;
end
$$;

-- 2. Indexes. Two have the same definition under another name; two are production's choice of columns.
do $$
begin
  if to_regclass('public.calendar_sources_owner_id_idx') is not null and to_regclass('public.calendar_sources_owner_idx') is null then
    alter index public.calendar_sources_owner_id_idx rename to calendar_sources_owner_idx;
  end if;
  if to_regclass('public.external_calendar_events_source_id_idx') is not null and to_regclass('public.external_events_source_idx') is null then
    alter index public.external_calendar_events_source_id_idx rename to external_events_source_idx;
  end if;
end
$$;
drop index if exists public.external_calendar_events_owner_date_idx;
create index if not exists external_events_owner_idx on public.external_calendar_events using btree (owner_id);
create index if not exists external_events_start_idx on public.external_calendar_events using btree (starts_at);
drop index if exists public.planly_projects_household_updated_idx;
create index if not exists planly_projects_household_active_idx
  on public.planly_projects using btree (household_id, deleted_at)
  where visibility = 'household';

-- 3. Columns production has: calendar_sources.last_sync_status / last_sync_error (nullable, unused by current code),
--    and external_calendar_events.title without a default (every writer supplies a title).
alter table public.calendar_sources add column if not exists last_sync_status text;
alter table public.calendar_sources add column if not exists last_sync_error text;
alter table public.external_calendar_events alter column title drop default;

-- 4. Policies: production's names and definitions (same rule; (select auth.uid()) is evaluated once per statement).
--    The production policy is created first, then the rebuild's duplicate is dropped, so the table is never without one.
do $$
declare r record;
begin
  for r in select * from (values
    ('calendar_sources',         'calendar_sources_insert_own',          'Users can create own calendar sources',        'insert', null,                                   '((select auth.uid()) = owner_id)'),
    ('calendar_sources',         'calendar_sources_delete_own',          'Users can delete own calendar sources',        'delete', '((select auth.uid()) = owner_id)',     null),
    ('calendar_sources',         'calendar_sources_update_own',          'Users can update own calendar sources',        'update', '((select auth.uid()) = owner_id)',     '((select auth.uid()) = owner_id)'),
    ('calendar_sources',         'calendar_sources_select_own',          'Users can view own calendar sources',          'select', '((select auth.uid()) = owner_id)',     null),
    ('external_calendar_events', 'external_calendar_events_select_own',  'Users can view own external calendar events', 'select', '((select auth.uid()) = owner_id)',     null),
    ('profiles',                 'profiles_update_own',                  'Users can update own profile',                 'update', '((select auth.uid()) = id)',           '((select auth.uid()) = id)'),
    ('profiles',                 'profiles_select_own',                  'Users can view own profile',                   'select', '((select auth.uid()) = id)',           null)
  ) v(tbl, old_name, new_name, cmd, using_expr, check_expr)
  loop
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = r.tbl and policyname = r.new_name) then
      execute format('create policy %I on public.%I for %s to authenticated', r.new_name, r.tbl, r.cmd)
           || coalesce(' using ' || r.using_expr, '')
           || coalesce(' with check ' || r.check_expr, '');
    end if;
    execute format('drop policy if exists %I on public.%I', r.old_name, r.tbl);
  end loop;
end
$$;

notify pgrst, 'reload schema';
