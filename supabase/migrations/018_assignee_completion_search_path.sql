-- Planly 3.3B — the planly_tasks UPDATE trigger from migration 015 calls realtime.broadcast_changes.
-- Include realtime in the SECURITY DEFINER search path so that existing trigger can resolve its
-- qualified realtime function while this RPC updates the task row.

alter function public.planly_set_assigned_task_completed(uuid,text,boolean)
  set search_path = pg_catalog, public, realtime;
