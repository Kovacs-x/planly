-- Planly 3.3B — explicit least-privilege grants for assignee completion.
revoke all on function public.planly_set_assigned_task_completed(uuid,text,boolean) from public;
revoke all on function public.planly_set_assigned_task_completed(uuid,text,boolean) from anon;
grant execute on function public.planly_set_assigned_task_completed(uuid,text,boolean) to authenticated;
