-- Planly 3.3C — shared project foundation.
-- This file mirrors production migration shared_projects_foundation.

alter table public.planly_projects
  add column if not exists visibility text not null default 'private',
  add column if not exists household_id uuid references public.planly_households(id) on delete set null;

alter table public.planly_projects
  drop constraint if exists planly_projects_visibility_check;
alter table public.planly_projects
  add constraint planly_projects_visibility_check
  check (visibility in ('private','household'));

alter table public.planly_projects
  drop constraint if exists planly_projects_household_visibility_check;
alter table public.planly_projects
  add constraint planly_projects_household_visibility_check
  check ((visibility = 'private' and household_id is null) or (visibility = 'household' and household_id is not null));

create index if not exists planly_projects_household_active_idx
  on public.planly_projects (household_id, deleted_at)
  where visibility = 'household';

-- Existing projects remain private. Keep embedded JSON aligned with authoritative columns.
update public.planly_projects
set data = jsonb_set(jsonb_set(data, '{visibility}', '"private"'::jsonb, true), '{householdId}', 'null'::jsonb, true),
    visibility = 'private',
    household_id = null
where visibility = 'private'
  and ((data->>'visibility') is distinct from 'private' or data ? 'householdId');

-- Household sharing is an additional read path only. Creator ownership remains the mutation boundary.
drop policy if exists planly_projects_select_own on public.planly_projects;
create policy planly_projects_select_authorized
on public.planly_projects
for select
to authenticated
using (
  (select auth.uid()) = owner_id
  or (
    visibility = 'household'
    and household_id is not null
    and public.planly_is_household_member(household_id)
  )
);

-- Do not weaken creator-only writes. A creator may only mark a project household-visible
-- when they are actually a member of that household.
drop policy if exists planly_projects_insert_own on public.planly_projects;
create policy planly_projects_insert_own
on public.planly_projects
for insert
to authenticated
with check (
  (select auth.uid()) = owner_id
  and (
    (visibility = 'private' and household_id is null)
    or (
      visibility = 'household'
      and household_id is not null
      and public.planly_is_household_member(household_id)
    )
  )
);

drop policy if exists planly_projects_update_own on public.planly_projects;
create policy planly_projects_update_own
on public.planly_projects
for update
to authenticated
using ((select auth.uid()) = owner_id)
with check (
  (select auth.uid()) = owner_id
  and (
    (visibility = 'private' and household_id is null)
    or (
      visibility = 'household'
      and household_id is not null
      and public.planly_is_household_member(household_id)
    )
  )
);

-- Cross-entity invariant: a household-shared task may reference only a household-shared
-- project in the same household, owned by the same creator. This prevents private-project
-- identifiers/metadata from leaking through shared tasks.
create or replace function public.planly_validate_task_project_visibility()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  p_visibility text;
  p_household_id uuid;
  p_owner_id uuid;
begin
  if new.project_client_id is null or btrim(new.project_client_id) = '' then
    return new;
  end if;

  select p.visibility, p.household_id, p.owner_id
    into p_visibility, p_household_id, p_owner_id
  from public.planly_projects p
  where p.owner_id = new.owner_id
    and p.client_id = new.project_client_id
    and p.deleted_at is null;

  if not found then
    raise exception 'Referenced Planly project is unavailable';
  end if;

  if new.visibility = 'household'
     and not (p_visibility = 'household'
              and p_household_id = new.household_id
              and p_owner_id = new.owner_id) then
    raise exception 'Household tasks may reference only household projects in the same household';
  end if;

  return new;
end;
$$;

revoke all on function public.planly_validate_task_project_visibility() from public, anon, authenticated;

-- Internal trigger function only; callers never execute it directly.
drop trigger if exists planly_tasks_validate_project_visibility on public.planly_tasks;
create trigger planly_tasks_validate_project_visibility
before insert or update of owner_id, project_client_id, visibility, household_id
on public.planly_tasks
for each row
execute function public.planly_validate_task_project_visibility();
