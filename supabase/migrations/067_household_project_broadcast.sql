-- Production drift reconciliation (20 Nov 2026), 3 of 4: live updates for Household projects.
--
-- Production has planly_broadcast_household_project_change() and the trigger planly_household_project_broadcast on
-- planly_projects (its migration shared_projects_broadcast, 25 Sep 2026), which no repo migration created. It is the
-- project twin of planly_broadcast_household_task_change() (migration 015). The broadcast carries only an invalidation
-- event on the private household:<id> channel; clients always re-read through project RLS, and only household members
-- can receive it (realtime.messages policy, migration 040).
--
-- Idempotent and a no-op on production: the function body is production's, and the trigger is only created when
-- missing (production's original migration dropped and re-created it; this does not).

create or replace function public.planly_broadcast_household_project_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_household uuid;
begin
  v_household := case
    when tg_op = 'DELETE' then old.household_id
    else coalesce(new.household_id, old.household_id)
  end;

  if v_household is not null then
    perform realtime.broadcast_changes(
      'household:' || v_household::text,
      tg_op,
      tg_op,
      tg_table_name,
      tg_table_schema,
      case when tg_op = 'DELETE' then null else new end,
      case when tg_op = 'INSERT' then null else old end
    );
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end
$function$;

revoke all on function public.planly_broadcast_household_project_change() from public, anon, authenticated;

do $$
begin
  if not exists (
    select 1 from pg_trigger
     where tgname = 'planly_household_project_broadcast'
       and tgrelid = 'public.planly_projects'::regclass
  ) then
    create trigger planly_household_project_broadcast
    after insert or update or delete on public.planly_projects
    for each row execute function public.planly_broadcast_household_project_change();
  end if;
end
$$;
