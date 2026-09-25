-- Planly 3.3B — Household task assignment.
-- Ownership remains separate from assignment. Assignment never grants visibility.

alter table public.planly_tasks
  add column assignee_id uuid null references auth.users(id) on delete set null;

create index planly_tasks_household_assignee_idx
  on public.planly_tasks(household_id, assignee_id, updated_at)
  where visibility='household' and deleted_at is null;

create or replace function public.planly_task_share_target_valid(
  p_visibility text,
  p_household_id uuid,
  p_assignee_id uuid
)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public
as $function$
select case
  when p_visibility='private' then p_household_id is null and p_assignee_id is null
  when p_visibility='household' then
    p_household_id is not null
    and exists (
      select 1 from public.planly_household_members m
      where m.household_id=p_household_id and m.user_id=auth.uid()
    )
    and (
      p_assignee_id is null
      or exists (
        select 1 from public.planly_household_members a
        where a.household_id=p_household_id and a.user_id=p_assignee_id
      )
    )
  else false
end
$function$;

revoke all on function public.planly_task_share_target_valid(text,uuid,uuid) from public,anon;
grant execute on function public.planly_task_share_target_valid(text,uuid,uuid) to authenticated;

alter table public.planly_tasks
  add constraint planly_tasks_assignment_scope_chk
  check ((visibility='household' and household_id is not null) or assignee_id is null);

drop policy if exists planly_tasks_insert_own on public.planly_tasks;
drop policy if exists planly_tasks_update_owner on public.planly_tasks;

create policy planly_tasks_insert_own
on public.planly_tasks for insert to authenticated
with check (
  (select auth.uid())=owner_id
  and public.planly_task_share_target_valid(visibility,household_id,assignee_id)
);

create policy planly_tasks_update_owner
on public.planly_tasks for update to authenticated
using ((select auth.uid())=owner_id)
with check (
  (select auth.uid())=owner_id
  and public.planly_task_share_target_valid(visibility,household_id,assignee_id)
);

create or replace function public.planly_clear_household_task_assignee()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public
as $function$
begin
  update public.planly_tasks
     set assignee_id=null,
         data=data-'assigneeId',
         client_updated_at=greatest(client_updated_at,(extract(epoch from clock_timestamp())*1000)::bigint)
   where household_id=old.household_id
     and assignee_id=old.user_id;
  return old;
end
$function$;

revoke all on function public.planly_clear_household_task_assignee() from public,anon,authenticated;

drop trigger if exists planly_clear_task_assignee_before_member_delete on public.planly_household_members;
create trigger planly_clear_task_assignee_before_member_delete
before delete on public.planly_household_members
for each row execute function public.planly_clear_household_task_assignee();

create or replace function public.planly_private_tasks_on_household_delete()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public
as $function$
begin
  update public.planly_tasks
     set visibility='private',
         household_id=null,
         assignee_id=null,
         data=(data-'visibility'-'householdId'-'assigneeId')||jsonb_build_object('visibility','private'),
         client_updated_at=greatest(client_updated_at,(extract(epoch from clock_timestamp())*1000)::bigint)
   where household_id=old.id;
  return old;
end
$function$;

revoke all on function public.planly_private_tasks_on_household_delete() from public,anon,authenticated;
