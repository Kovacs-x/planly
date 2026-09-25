-- Planly 3.3B — pin the SECURITY DEFINER RPC to the database owner role used by migrations.
-- This keeps execution independent of the caller's table UPDATE privilege while the function itself
-- enforces the narrow assignee-only completion contract.

alter function public.planly_set_assigned_task_completed(uuid,text,boolean) owner to postgres;
