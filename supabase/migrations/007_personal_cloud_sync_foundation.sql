-- Planly 3.2: personal cloud-sync foundation.
-- Local storage remains the offline cache. These tables become the account-owned
-- canonical cloud copy after an explicit, verified migration.

create table if not exists public.planly_projects (
  cloud_id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  client_id text not null,
  name text not null,
  due_date date,
  notes text not null default '',
  archived boolean not null default false,
  client_created_at bigint,
  client_updated_at bigint not null,
  cloud_version bigint not null default 1,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, client_id)
);

create table if not exists public.planly_tasks (
  cloud_id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  client_id text not null,
  series_client_id text,
  title text not null,
  task_date date,
  task_time time,
  duration_minutes integer not null default 30
    check (duration_minutes between 5 and 1440),
  priority text not null default 'normal',
  category text not null default 'Personal',
  project_client_id text,
  recurrence text not null default 'none',
  recurrence_config jsonb not null default '{}'::jsonb
    check (jsonb_typeof(recurrence_config) = 'object'),
  reminder text not null default 'none',
  notes text not null default '',
  subtasks jsonb not null default '[]'::jsonb
    check (jsonb_typeof(subtasks) = 'array'),
  occurrence_number integer,
  completed boolean not null default false,
  pinned boolean not null default false,
  top3_order integer,
  add_to_calendar boolean not null default false,
  google_event_id text,
  calendar_sync text not null default '',
  calendar_synced_at bigint,
  google_recurrence_start_date date,
  google_recurrence_version integer,
  client_created_at bigint,
  client_updated_at bigint not null,
  cloud_version bigint not null default 1,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, client_id)
);

create table if not exists public.planly_preferences (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  theme text not null default 'system',
  show_completed boolean not null default true,
  default_category text not null default 'Personal',
  default_duration integer not null default 30
    check (default_duration between 5 and 1440),
  auto_calendar_timed boolean not null default false,
  auto_complete_parent_subtasks boolean not null default false,
  planning_start time not null default '08:00',
  planning_end time not null default '23:00',
  client_updated_at bigint not null,
  cloud_version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.planly_sync_state (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  schema_version integer not null default 1,
  initial_migration_completed_at timestamptz,
  last_successful_sync_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists planly_projects_owner_updated_idx
  on public.planly_projects(owner_id, updated_at);

create index if not exists planly_tasks_owner_updated_idx
  on public.planly_tasks(owner_id, updated_at);

create index if not exists planly_tasks_owner_date_idx
  on public.planly_tasks(owner_id, task_date)
  where deleted_at is null;

create index if not exists planly_tasks_owner_project_idx
  on public.planly_tasks(owner_id, project_client_id)
  where deleted_at is null;

create index if not exists planly_tasks_owner_series_idx
  on public.planly_tasks(owner_id, series_client_id)
  where deleted_at is null;

create or replace function public.bump_planly_cloud_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.cloud_version = old.cloud_version + 1;
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists planly_projects_bump_version on public.planly_projects;
create trigger planly_projects_bump_version
  before update on public.planly_projects
  for each row execute function public.bump_planly_cloud_version();

drop trigger if exists planly_tasks_bump_version on public.planly_tasks;
create trigger planly_tasks_bump_version
  before update on public.planly_tasks
  for each row execute function public.bump_planly_cloud_version();

drop trigger if exists planly_preferences_bump_version on public.planly_preferences;
create trigger planly_preferences_bump_version
  before update on public.planly_preferences
  for each row execute function public.bump_planly_cloud_version();

alter table public.planly_projects enable row level security;
alter table public.planly_tasks enable row level security;
alter table public.planly_preferences enable row level security;
alter table public.planly_sync_state enable row level security;

drop policy if exists "planly_projects_select_own" on public.planly_projects;
create policy "planly_projects_select_own"
  on public.planly_projects for select to authenticated
  using (auth.uid() = owner_id);

drop policy if exists "planly_projects_insert_own" on public.planly_projects;
create policy "planly_projects_insert_own"
  on public.planly_projects for insert to authenticated
  with check (auth.uid() = owner_id);

drop policy if exists "planly_projects_update_own" on public.planly_projects;
create policy "planly_projects_update_own"
  on public.planly_projects for update to authenticated
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

drop policy if exists "planly_projects_delete_own" on public.planly_projects;
create policy "planly_projects_delete_own"
  on public.planly_projects for delete to authenticated
  using (auth.uid() = owner_id);

drop policy if exists "planly_tasks_select_own" on public.planly_tasks;
create policy "planly_tasks_select_own"
  on public.planly_tasks for select to authenticated
  using (auth.uid() = owner_id);

drop policy if exists "planly_tasks_insert_own" on public.planly_tasks;
create policy "planly_tasks_insert_own"
  on public.planly_tasks for insert to authenticated
  with check (auth.uid() = owner_id);

drop policy if exists "planly_tasks_update_own" on public.planly_tasks;
create policy "planly_tasks_update_own"
  on public.planly_tasks for update to authenticated
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

drop policy if exists "planly_tasks_delete_own" on public.planly_tasks;
create policy "planly_tasks_delete_own"
  on public.planly_tasks for delete to authenticated
  using (auth.uid() = owner_id);

drop policy if exists "planly_preferences_select_own" on public.planly_preferences;
create policy "planly_preferences_select_own"
  on public.planly_preferences for select to authenticated
  using (auth.uid() = owner_id);

drop policy if exists "planly_preferences_insert_own" on public.planly_preferences;
create policy "planly_preferences_insert_own"
  on public.planly_preferences for insert to authenticated
  with check (auth.uid() = owner_id);

drop policy if exists "planly_preferences_update_own" on public.planly_preferences;
create policy "planly_preferences_update_own"
  on public.planly_preferences for update to authenticated
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

drop policy if exists "planly_sync_state_select_own" on public.planly_sync_state;
create policy "planly_sync_state_select_own"
  on public.planly_sync_state for select to authenticated
  using (auth.uid() = owner_id);

drop policy if exists "planly_sync_state_insert_own" on public.planly_sync_state;
create policy "planly_sync_state_insert_own"
  on public.planly_sync_state for insert to authenticated
  with check (auth.uid() = owner_id);

drop policy if exists "planly_sync_state_update_own" on public.planly_sync_state;
create policy "planly_sync_state_update_own"
  on public.planly_sync_state for update to authenticated
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

revoke all privileges on table public.planly_projects from anon, authenticated;
revoke all privileges on table public.planly_tasks from anon, authenticated;
revoke all privileges on table public.planly_preferences from anon, authenticated;
revoke all privileges on table public.planly_sync_state from anon, authenticated;

grant select, insert, update, delete
on table public.planly_projects
to authenticated;

grant select, insert, update, delete
on table public.planly_tasks
to authenticated;

grant select, insert, update
on table public.planly_preferences
to authenticated;

grant select, insert, update
on table public.planly_sync_state
to authenticated;

notify pgrst, 'reload schema';
