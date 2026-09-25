-- Planly 3.3B — execution privilege for the narrowly scoped assignee completion RPC.
-- planly_set_assigned_task_completed is SECURITY DEFINER and independently validates auth.uid(),
-- current Household membership and current assignee_id before changing only completion fields.

grant update on table public.planly_tasks to postgres;
