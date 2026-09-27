-- Planly 4.0 release closeout — revoke shared access cleanly when a member leaves.
-- Departing members keep their own Planly tasks by converting them back to private.
-- Household Budget entries remain in the shared ledger, but visibility follows current
-- scope authorization rather than creator ownership after membership is revoked.

create or replace function public.planly_private_departing_member_tasks()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_now bigint := (extract(epoch from clock_timestamp())*1000)::bigint;
begin
  update public.planly_tasks
     set visibility='private',
         household_id=null,
         assignee_id=null,
         data=(data-'visibility'-'householdId'-'assigneeId')||jsonb_build_object('visibility','private'),
         client_updated_at=greatest(client_updated_at,v_now)
   where owner_id=old.user_id
     and household_id=old.household_id
     and visibility='household'
     and deleted_at is null;

  return old;
end
$$;

revoke all on function public.planly_private_departing_member_tasks() from public, anon, authenticated;

drop trigger if exists planly_private_departing_member_tasks_before_delete
  on public.planly_household_members;

create trigger planly_private_departing_member_tasks_before_delete
before delete on public.planly_household_members
for each row execute function public.planly_private_departing_member_tasks();

drop policy if exists planly_budget_entries_select_authorized
  on public.planly_budget_entries;

create policy planly_budget_entries_select_authorized
on public.planly_budget_entries
for select to authenticated
using (
  exists (
    select 1
      from public.planly_budget_scopes s
     where s.id=scope_id
  )
);

notify pgrst, 'reload schema';
