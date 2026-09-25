-- Planly 3.3C — preserve project privacy when a Household is deleted.
-- This file mirrors production migration shared_projects_household_delete.

create or replace function public.planly_private_tasks_on_household_delete()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $function$
declare v_now bigint := (extract(epoch from clock_timestamp())*1000)::bigint;
begin
  update public.planly_tasks set visibility='private',household_id=null,assignee_id=null,data=(data-'visibility'-'householdId'-'assigneeId')||jsonb_build_object('visibility','private'),client_updated_at=greatest(client_updated_at,v_now) where household_id=old.id;
  update public.planly_projects set visibility='private',household_id=null,data=(data-'householdId')||jsonb_build_object('visibility','private'),client_updated_at=greatest(client_updated_at,v_now) where household_id=old.id;
  return old;
end $function$;
revoke all on function public.planly_private_tasks_on_household_delete() from public,anon,authenticated;
