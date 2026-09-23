-- Planly 3.1 security hardening: reset browser-facing table grants to least privilege.
-- RLS remains enabled and continues to restrict rows to the authenticated owner.

revoke all privileges
on table public.profiles
from anon, authenticated;

revoke all privileges
on table public.calendar_sources
from anon, authenticated;

revoke all privileges
on table public.external_calendar_events
from anon, authenticated;

revoke all privileges
on table public.calendar_source_credentials
from anon, authenticated;

grant select, update
on table public.profiles
to authenticated;

grant select, insert, update, delete
on table public.calendar_sources
to authenticated;

grant select
on table public.external_calendar_events
to authenticated;

-- calendar_source_credentials intentionally receives no browser table grants.
-- Its set/delete operations remain available only through the audited
-- SECURITY DEFINER RPCs, while feed-url reads remain service-role only.

notify pgrst, 'reload schema';
