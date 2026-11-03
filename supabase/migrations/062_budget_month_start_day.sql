-- Budget months that start on payday (3 Nov 2026).
--
-- New column public.planly_budget_scopes.month_start_day (1-28, default 1). With 1 a budget month is the calendar month,
-- exactly as before. With, say, 26 the month called "December" runs from 26 November to 25 December: entries are still
-- stored with their real dates, and the app only groups them differently. Days 29-31 are not allowed so every month
-- has a start day.
-- Who can change it: the existing update policy on planly_budget_scopes already limits updates to the scope's owner,
-- and for a Household budget only while they own the Household, so Laki can see the Household payday but only the
-- Household owner can change it; anyone can change their own personal budget's payday. No data is changed.

alter table public.planly_budget_scopes
  add column if not exists month_start_day smallint not null default 1;

alter table public.planly_budget_scopes drop constraint if exists planly_budget_scopes_month_start_day_check;
alter table public.planly_budget_scopes
  add constraint planly_budget_scopes_month_start_day_check check (month_start_day between 1 and 28);
