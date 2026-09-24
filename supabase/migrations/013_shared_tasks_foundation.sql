-- Planly 3.3B — explicit task sharing metadata and household read access.
-- Existing rows remain private by default. Task ownership never changes when a task is shared.

alter table public.planly_tasks
  add column visibility text not null default 'private',
  add column household_id uuid null references public.planly_households(id) on delete set null;

alter table public.planly_tasks
  add constraint planly_tasks_visibility_chk
  check (visibility in ('private','household'));

create index planly_tasks_household_updated_idx
  on public.planly_tasks (household_id, updated_at)
  where visibility='household' and deleted_at is null;

create or replace function public.planly_task_share_target_valid(
  p_visibility text,
  p_household_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
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

revoke all on function public.planly_task_share_target_valid(text,uuid) from public, anon;
grant execute on function public.planly_task_share_target_valid(text,uuid) to authenticated;

drop policy if exists planly_tasks_select_own on public.planly_tasks;
drop policy if exists planly_tasks_insert_own on public.planly_tasks;
drop policy if exists planly_tasks_update_own on public.planly_tasks;

create policy planly_tasks_select_visible
on public.planly_tasks
for select
to authenticated
using (
  (select auth.uid()) = owner_id
  or (
    visibility='household'
    and household_id is not null
    and public.planly_is_household_member(household_id)
  )
);

create policy planly_tasks_insert_own
on public.planly_tasks
for insert
to authenticated
with check (
  (select auth.uid()) = owner_id
  and public.planly_task_share_target_valid(visibility, household_id)
);

create policy planly_tasks_update_owner
on public.planly_tasks
for update
to authenticated
using ((select auth.uid()) = owner_id)
with check (
  (select auth.uid()) = owner_id
  and public.planly_task_share_target_valid(visibility, household_id)
);

-- Shared tasks are deliberately creator-owned in the first 3.3B slice.
-- Household members can read them, but cannot edit, delete, reassign, or re-share them.

create or replace function public.planly_private_tasks_on_household_delete()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
begin
  update public.planly_tasks
     set visibility='private',
         household_id=null,
         data=(data - 'visibility' - 'householdId') || jsonb_build_object('visibility','private'),
         client_updated_at=greatest(client_updated_at, (extract(epoch from clock_timestamp())*1000)::bigint)
   where household_id=old.id;
  return old;
end
$function$;

revoke all on function public.planly_private_tasks_on_household_delete() from public, anon, authenticated;

drop trigger if exists planly_private_tasks_before_household_delete on public.planly_households;
create trigger planly_private_tasks_before_household_delete
before delete on public.planly_households
for each row execute function public.planly_private_tasks_on_household_delete();
