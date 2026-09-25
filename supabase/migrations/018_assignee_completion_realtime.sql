-- Planly 3.3B — notify the Household after an assignee completion toggle.
-- The client still reconciles through the existing RLS-protected task read path.

create or replace function public.planly_set_assigned_task_completed(
  p_owner_id uuid,
  p_client_id text,
  p_completed boolean
)
returns public.planly_tasks
language plpgsql
security definer
set search_path=pg_catalog,public
as $function$
declare
  v_task public.planly_tasks;
  v_now bigint := (extract(epoch from clock_timestamp())*1000)::bigint;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode='42501';
  end if;

  select * into v_task
  from public.planly_tasks t
  where t.owner_id=p_owner_id
    and t.client_id=p_client_id
    and t.deleted_at is null
  for update;

  if not found then
    raise exception 'Task not found' using errcode='P0002';
  end if;

  if v_task.visibility <> 'household'
     or v_task.household_id is null
     or v_task.assignee_id <> auth.uid()
     or not exists (
       select 1 from public.planly_household_members m
       where m.household_id=v_task.household_id and m.user_id=auth.uid()
     ) then
    raise exception 'Only the current assignee may complete this task' using errcode='42501';
  end if;

  update public.planly_tasks t
     set completed=p_completed,
         data=jsonb_set(coalesce(t.data,'{}'::jsonb),'{completed}',to_jsonb(p_completed),true),
         client_updated_at=greatest(t.client_updated_at,v_now),
         updated_at=clock_timestamp()
   where t.owner_id=p_owner_id and t.client_id=p_client_id
   returning * into v_task;

  perform realtime.send(
    jsonb_build_object('client_id',v_task.client_id,'owner_id',v_task.owner_id,'completed',v_task.completed),
    'task_completion',
    'household:'||v_task.household_id::text,
    true
  );

  return v_task;
end
$function$;

revoke all on function public.planly_set_assigned_task_completed(uuid,text,boolean) from public,anon;
grant execute on function public.planly_set_assigned_task_completed(uuid,text,boolean) to authenticated;
