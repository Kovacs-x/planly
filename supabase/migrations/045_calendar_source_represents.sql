-- Stage 4a: say whose schedule a calendar source is, so a partner's rota never counts as the owner's busy time (D10).
-- Reviewed and approved (SQL proposal 045); applied to production 1 Oct 2026 with the user's approval.
-- 'partner' only describes whose schedule the source is. It is owner-private metadata and never an
-- authorization signal: calendar_sources and external_calendar_events stay owner-only (existing RLS).
alter table public.calendar_sources
  add column if not exists represents text not null default 'self';

alter table public.calendar_sources
  drop constraint if exists calendar_sources_represents_check;

alter table public.calendar_sources
  add constraint calendar_sources_represents_check
  check (represents in ('self', 'partner'));

comment on column public.calendar_sources.represents is
  'Whose schedule this source is: self (the owner) or partner. Only self sources count as the owner''s busy time.';

notify pgrst, 'reload schema';
