-- Planly 4.0B.2 — allocation-first personal budget model.
alter table public.planly_budget_categories
  add column if not exists icon_key text not null default 'wallet',
  add column if not exists color_key text not null default 'violet';

alter table public.planly_budget_entries
  add column if not exists allocation_status text not null default 'planned',
  add column if not exists due_day smallint,
  add column if not exists recurring_monthly boolean not null default true;

alter table public.planly_budget_entries
  drop constraint if exists planly_budget_entries_allocation_status_check;
alter table public.planly_budget_entries
  add constraint planly_budget_entries_allocation_status_check
  check (allocation_status in ('planned','paid'));

alter table public.planly_budget_entries
  drop constraint if exists planly_budget_entries_due_day_check;
alter table public.planly_budget_entries
  add constraint planly_budget_entries_due_day_check
  check (due_day is null or due_day between 1 and 31);

comment on column public.planly_budget_entries.description is
  'Allocation/commitment name for manual budgeting, not an imported bank transaction merchant.';
comment on column public.planly_budget_entries.allocation_status is
  'Manual allocation state: planned or paid.';
