-- Planly 3.3C — explicit Household project sharing and secure task/project scoping.
-- Projects remain creator-owned. Household members receive read-only visibility only
-- when a project is explicitly shared with their current Household.

alter table public.planly_projects
  add column visibility text not null default 'private',
  add column household_id uuid null references public.planly_households(id) on delete set null;

alter table public.planly_projects
  add constraint planly_projects_visibility_chk
  check (visibility in ('private','household')),
  add constraint planly_projects_share_scope_chk
  check (
    (visibility='private' and household_id is null)
    or
    (visibility='household' and household_id is not null)
  ),
  add constraint planly_projects_visibility_data_chk
  check (
    coalesce(data->>'visibility','private')=visibility
    and (
      (visibility='private' and nullif(data->>'householdId','') is null)
      or
      (visibility='household' and data->>'householdId'=household_id::text)
    )
  );

create index planly_projects_household_updated_idx
  on public.planly_projects(household_id,updated_at)
  where visibility='household' and deleted_at is null;

create or replace function public.planly_project_share_target_valid(
  p_visibility text,
  p_household_id uuid
)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public
as $function$
select case
  when p_visibility='private' then p_household_id is null
  when p_visibility='household' then
    p_household_id is not null
    and exists (
      select 1
        from public.planly_household_members m
       where m.household_id=p_household_id
         and m.user_id=auth.uid()
    )
  else false
end
$function$;

alter function public.planly_project_share_target_valid(text,uuid) owner to postgres;
revoke all on function public.planly_project_share_target_valid(text,uuid) from public,anon;
grant execute on function public.planly_project_share_target_valid(text,uuid) to authenticated;

drop policy if exists planly_projects_select_own on public.planly_projects;
drop policy if exists planly_projects_insert_own on public.planly_projects;
drop policy if exists planly_projects_update_own on public.planly_projects;

create policy planly_projects_select_visible
on public.planly_projects
for select
to authenticated
using (
  (select auth.uid())=owner_id
  or (
    visibility='household'
    and household_id is not null
    and public.planly_is_household_member(household_id)
  )
);

create policy planly_projects_insert_own
on public.planly_projects
for insert
to authenticated
with check (
  (select auth.uid())=owner_id
  and public.planly_project_share_target_valid(visibility,household_id)
);

create policy planly_projects_update_owner
on public.planly_projects
for update
to authenticated
using ((select auth.uid())=owner_id)
with check (
  (select auth.uid())=owner_id
  and public.planly_project_share_target_valid(visibility,household_id)
);

-- Keep the duplicated task project column and JSON data in lockstep. This prevents
-- a malicious or stale client from hiding a private project reference in one form.
alter table public.planly_tasks
  add constraint planly_tasks_project_reference_consistency_chk
  check (
    nullif(btrim(project_client_id),'')
    is not distinct from
    nullif(btrim(data->>'projectId'),'')
  );

create or replace function public.planly_validate_task_project_scope()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public
as $function$
declare
  v_project public.planly_projects;
begin
  if new.deleted_at is not null or new.project_client_id is null then
    return new;
  end if;

  select p.*
    into v_project
    from public.planly_projects p
   where p.owner_id=new.owner_id
     and p.client_id=new.project_client_id
     and p.deleted_at is null;

  if not found then
    raise exception 'Task project must be an active project owned by the task creator'
      using errcode='23514';
  end if;

  if new.visibility='household'
     and (
       v_project.visibility<>'household'
       or v_project.household_id is null
       or v_project.household_id is distinct from new.household_id
     ) then
    raise exception 'Household tasks may only reference a household-shared project in the same household'
      using errcode='23514';
  end if;

  return new;
end
$function$;

alter function public.planly_validate_task_project_scope() owner to postgres;
revoke all on function public.planly_validate_task_project_scope() from public,anon,authenticated;

drop trigger if exists planly_validate_task_project_scope on public.planly_tasks;
create trigger planly_validate_task_project_scope
before insert or update of owner_id,project_client_id,data,visibility,household_id,deleted_at
on public.planly_tasks
for each row execute function public.planly_validate_task_project_scope();

-- If a shared project becomes private, moves Household, or is tombstoned, shared
-- tasks must stop carrying its project identifier before the project restriction lands.
-- Tombstoning a project detaches all remaining active task references.
create or replace function public.planly_detach_tasks_before_project_restrict()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public
as $function$
declare
  v_now bigint := (extract(epoch from clock_timestamp())*1000)::bigint;
begin
  if old.deleted_at is null and new.deleted_at is not null then
    update public.planly_tasks
       set project_client_id=null,
           data=data-'projectId',
           client_updated_at=greatest(client_updated_at,v_now)
     where owner_id=old.owner_id
       and project_client_id=old.client_id
       and deleted_at is null;
  elsif old.visibility='household'
        and (
          new.visibility<>'household'
          or new.household_id is distinct from old.household_id
        ) then
    update public.planly_tasks
       set project_client_id=null,
           data=data-'projectId',
           client_updated_at=greatest(client_updated_at,v_now)
     where owner_id=old.owner_id
       and project_client_id=old.client_id
       and visibility='household'
       and household_id is not distinct from old.household_id
       and deleted_at is null;
  end if;
  return new;
end
$function$;

alter function public.planly_detach_tasks_before_project_restrict() owner to postgres;
revoke all on function public.planly_detach_tasks_before_project_restrict() from public,anon,authenticated;

drop trigger if exists planly_detach_tasks_before_project_restrict on public.planly_projects;
create trigger planly_detach_tasks_before_project_restrict
before update of visibility,household_id,deleted_at
on public.planly_projects
for each row execute function public.planly_detach_tasks_before_project_restrict();

-- A member who leaves keeps ownership of their project, but the former Household
-- must immediately lose access to projects that member created and shared.
create or replace function public.planly_private_departing_member_projects()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public
as $function$
declare
  v_now bigint := (extract(epoch from clock_timestamp())*1000)::bigint;
begin
  update public.planly_projects
     set visibility='private',
         household_id=null,
         data=(data-'householdId') || jsonb_build_object('visibility','private'),
         client_updated_at=greatest(client_updated_at,v_now)
   where owner_id=old.user_id
     and household_id=old.household_id
     and visibility='household'
     and deleted_at is null;
  return old;
end
$function$;

alter function public.planly_private_departing_member_projects() owner to postgres;
revoke all on function public.planly_private_departing_member_projects() from public,anon,authenticated;

drop trigger if exists planly_private_departing_member_projects_before_delete on public.planly_household_members;
create trigger planly_private_departing_member_projects_before_delete
before delete on public.planly_household_members
for each row execute function public.planly_private_departing_member_projects();

-- Preserve existing Household-delete task hardening and add project privacy in the
-- same BEFORE DELETE path, before the Household foreign key is removed.
create or replace function public.planly_private_tasks_on_household_delete()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public
as $function$
declare
  v_now bigint := (extract(epoch from clock_timestamp())*1000)::bigint;
begin
  update public.planly_tasks
     set visibility='private',
         household_id=null,
         assignee_id=null,
         data=(data-'visibility'-'householdId'-'assigneeId')||jsonb_build_object('visibility','private'),
         client_updated_at=greatest(client_updated_at,v_now)
   where household_id=old.id;

  update public.planly_projects
     set visibility='private',
         household_id=null,
         data=(data-'householdId')||jsonb_build_object('visibility','private'),
         client_updated_at=greatest(client_updated_at,v_now)
   where household_id=old.id;

  return old;
end
$function$;

alter function public.planly_private_tasks_on_household_delete() owner to postgres;
revoke all on function public.planly_private_tasks_on_household_delete() from public,anon,authenticated;

notify pgrst,'reload schema';
