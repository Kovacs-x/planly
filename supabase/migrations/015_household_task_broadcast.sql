-- Planly 3.3B: secure live Household task invalidation.
-- Broadcast carries a change notification only; clients re-read through existing task RLS.

alter publication supabase_realtime drop table public.planly_tasks;

drop policy if exists planly_household_task_broadcast_receive on realtime.messages;
create policy planly_household_task_broadcast_receive
on realtime.messages
for select
to authenticated
using (
  realtime.messages.extension = 'broadcast'
  and (select realtime.topic()) ~ '^household:[0-9a-fA-F-]{36}$'
  and public.planly_is_household_member(
    split_part((select realtime.topic()), ':', 2)::uuid
  )
);

create or replace function public.planly_broadcast_household_task_change()
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

revoke all on function public.planly_broadcast_household_task_change() from public, anon, authenticated;

drop trigger if exists planly_household_task_broadcast on public.planly_tasks;
create trigger planly_household_task_broadcast
after insert or update or delete on public.planly_tasks
for each row execute function public.planly_broadcast_household_task_change();
