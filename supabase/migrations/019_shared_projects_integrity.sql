-- Planly 3.3C — integrity hardening for shared projects.
alter table public.planly_projects drop constraint if exists planly_projects_visibility_data_chk;
alter table public.planly_projects add constraint planly_projects_visibility_data_chk check (coalesce(data->>'visibility','private')=visibility and ((visibility='private' and nullif(data->>'householdId','') is null) or (visibility='household' and data->>'householdId'=household_id::text)));

alter table public.planly_tasks drop constraint if exists planly_tasks_project_reference_consistency_chk;
alter table public.planly_tasks add constraint planly_tasks_project_reference_consistency_chk check (nullif(btrim(project_client_id),'') is not distinct from nullif(btrim(data->>'projectId'),''));

create or replace function public.planly_detach_tasks_before_project_restrict()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $function$
declare v_now bigint := (extract(epoch from clock_timestamp())*1000)::bigint;
begin
  if old.deleted_at is null and new.deleted_at is not null then
    update public.planly_tasks set project_client_id=null,data=data-'projectId',client_updated_at=greatest(client_updated_at,v_now)
    where owner_id=old.owner_id and project_client_id=old.client_id and deleted_at is null;
  elsif old.visibility='household' and (new.visibility<>'household' or new.household_id is distinct from old.household_id) then
    update public.planly_tasks set project_client_id=null,data=data-'projectId',client_updated_at=greatest(client_updated_at,v_now)
    where owner_id=old.owner_id and project_client_id=old.client_id and visibility='household' and household_id is not distinct from old.household_id and deleted_at is null;
  end if;
  return new;
end $function$;
revoke all on function public.planly_detach_tasks_before_project_restrict() from public,anon,authenticated;
drop trigger if exists planly_detach_tasks_before_project_restrict on public.planly_projects;
create trigger planly_detach_tasks_before_project_restrict before update of visibility,household_id,deleted_at on public.planly_projects for each row execute function public.planly_detach_tasks_before_project_restrict();

create or replace function public.planly_private_departing_member_projects()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $function$
declare v_now bigint := (extract(epoch from clock_timestamp())*1000)::bigint;
begin
  update public.planly_projects set visibility='private',household_id=null,data=(data-'householdId')||jsonb_build_object('visibility','private'),client_updated_at=greatest(client_updated_at,v_now)
  where owner_id=old.user_id and household_id=old.household_id and visibility='household' and deleted_at is null;
  return old;
end $function$;
revoke all on function public.planly_private_departing_member_projects() from public,anon,authenticated;
drop trigger if exists planly_private_departing_member_projects_before_delete on public.planly_household_members;
create trigger planly_private_departing_member_projects_before_delete before delete on public.planly_household_members for each row execute function public.planly_private_departing_member_projects();

notify pgrst,'reload schema';
