-- Production drift reconciliation (20 Nov 2026), 2 of 4: one task→project guard, production's.
--
-- The rule: a household task may reference only a household-shared project in the same household, owned by the same
-- creator, so a private project's identifier never travels on a shared task.
--
-- Production (since 25 Sep 2026, its migration shared_projects_foundation) enforces it with
-- planly_validate_task_project_visibility() and the trigger planly_tasks_validate_project_visibility. Repo migration
-- 018 is a different version of that same migration that never reached production: it creates
-- planly_validate_task_project_scope() with its own trigger, the helper planly_project_share_target_valid(), and the
-- policies planly_projects_select_visible / planly_projects_update_owner. Later migrations re-created production's
-- project policies (planly_projects_select_authorized / _insert_own / _update_own) but never dropped 018's, so a fresh
-- rebuild ended up with both sets. This was not a rename that failed to apply.
--
-- Canonical: production's set, because it is what the app has run on. A fresh rebuild converges to it here.
-- Catalog-state preserving on production: the 018 objects do not exist there (drop if exists skips them), create or
-- replace re-states production's function body character for character, and the trigger is only created when missing.

drop trigger if exists planly_validate_task_project_scope on public.planly_tasks;
drop function if exists public.planly_validate_task_project_scope();
drop policy if exists planly_projects_select_visible on public.planly_projects;
drop policy if exists planly_projects_update_owner on public.planly_projects;
drop function if exists public.planly_project_share_target_valid(text, uuid);

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

-- Internal trigger function only; callers never execute it directly.
revoke all on function public.planly_validate_task_project_visibility() from public, anon, authenticated;

do $$
begin
  if not exists (
    select 1 from pg_trigger
     where tgname = 'planly_tasks_validate_project_visibility'
       and tgrelid = 'public.planly_tasks'::regclass
  ) then
    create trigger planly_tasks_validate_project_visibility
    before insert or update of owner_id, project_client_id, visibility, household_id
    on public.planly_tasks
    for each row
    execute function public.planly_validate_task_project_visibility();
  end if;
end
$$;
