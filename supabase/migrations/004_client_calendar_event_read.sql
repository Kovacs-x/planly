-- Planly 3.1: allow authenticated users to read only their own imported calendar events.
-- RLS remains authoritative; this grant only permits SELECT to reach the policy layer.

grant select
on table public.external_calendar_events
to authenticated;

notify pgrst, 'reload schema';
