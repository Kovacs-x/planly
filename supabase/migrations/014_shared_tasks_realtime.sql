-- Applied to production before the Broadcast design was finalized.
-- Kept in migration history so Git matches the deployed Supabase history.
alter publication supabase_realtime add table public.planly_tasks;
