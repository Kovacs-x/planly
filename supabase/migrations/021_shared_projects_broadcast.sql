-- Planly 3.3C — secure live invalidation for Household project changes.
-- Broadcast contains only an invalidation event. Clients always re-read through project RLS.

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

drop trigger if exists planly_household_project_broadcast on public.planly_projects;
create trigger planly_household_project_broadcast
after insert or update or delete on public.planly_projects
for each row execute function public.planly_broadcast_household_project_change();
