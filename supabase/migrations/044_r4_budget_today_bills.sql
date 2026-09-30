-- R4: optional Budget bills surfaced on Today.
-- Authoritative repository migration. No backfill and no RLS change.

alter table public.planly_budget_entries
  add column if not exists show_on_today boolean not null default false,
  add column if not exists today_lead_days smallint not null default 3;

alter table public.planly_budget_entries
  drop constraint if exists planly_budget_entries_today_lead_days_check;
alter table public.planly_budget_entries
  add constraint planly_budget_entries_today_lead_days_check
  check (today_lead_days between 0 and 14);
