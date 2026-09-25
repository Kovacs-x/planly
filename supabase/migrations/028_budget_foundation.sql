-- Planly 4.0A Household Budget foundation.
-- Financial data is private by default. Household access exists only through an
-- explicit household budget scope. Amounts are integer minor currency units.

create table public.planly_budget_scopes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete restrict,
  household_id uuid references public.planly_households(id) on delete restrict,
  scope_type text not null check (scope_type in ('personal','household')),
  name text not null default 'Budget' check (char_length(btrim(name)) between 1 and 80),
  currency text not null default 'GBP' check (currency ~ '^[A-Z]{3}$'),
  client_id text not null,
  client_created_at bigint,
  client_updated_at bigint not null,
  cloud_version bigint not null default 1 check (cloud_version >= 1),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint planly_budget_scope_target_check check (
    (scope_type='personal' and household_id is null)
    or
    (scope_type='household' and household_id is not null)
  ),
  unique(owner_id, client_id)
);

create unique index planly_budget_one_personal_scope_idx
  on public.planly_budget_scopes(owner_id)
  where scope_type='personal' and deleted_at is null;
create unique index planly_budget_one_household_scope_idx
  on public.planly_budget_scopes(household_id)
  where scope_type='household' and deleted_at is null;
create index planly_budget_scopes_household_idx
  on public.planly_budget_scopes(household_id)
  where household_id is not null;

create table public.planly_budget_categories (
  id uuid primary key default gen_random_uuid(),
  scope_id uuid not null references public.planly_budget_scopes(id) on delete restrict,
  owner_id uuid not null references auth.users(id) on delete restrict,
  client_id text not null,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  kind text not null check (kind in ('income','expense')),
  sort_order integer not null default 0,
  archived boolean not null default false,
  client_created_at bigint,
  client_updated_at bigint not null,
  cloud_version bigint not null default 1 check (cloud_version >= 1),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(scope_id, client_id),
  unique(scope_id, id)
);
create index planly_budget_categories_scope_idx on public.planly_budget_categories(scope_id) where deleted_at is null;

create table public.planly_budget_targets (
  id uuid primary key default gen_random_uuid(),
  scope_id uuid not null references public.planly_budget_scopes(id) on delete restrict,
  category_id uuid not null,
  owner_id uuid not null references auth.users(id) on delete restrict,
  client_id text not null,
  budget_month date not null check (budget_month=date_trunc('month',budget_month)::date),
  amount_minor bigint not null check (amount_minor >= 0),
  client_created_at bigint,
  client_updated_at bigint not null,
  cloud_version bigint not null default 1 check (cloud_version >= 1),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(scope_id, client_id),
  foreign key (scope_id, category_id) references public.planly_budget_categories(scope_id,id) on delete restrict
);
create unique index planly_budget_targets_active_month_category_idx
  on public.planly_budget_targets(scope_id,category_id,budget_month)
  where deleted_at is null;
create index planly_budget_targets_scope_month_idx on public.planly_budget_targets(scope_id,budget_month) where deleted_at is null;

create table public.planly_budget_entries (
  id uuid primary key default gen_random_uuid(),
  scope_id uuid not null references public.planly_budget_scopes(id) on delete restrict,
  category_id uuid not null,
  owner_id uuid not null references auth.users(id) on delete restrict,
  client_id text not null,
  kind text not null check (kind in ('income','expense')),
  amount_minor bigint not null check (amount_minor > 0),
  entry_date date not null,
  description text not null default '' check (char_length(description) <= 200),
  notes text not null default '' check (char_length(notes) <= 2000),
  client_created_at bigint,
  client_updated_at bigint not null,
  cloud_version bigint not null default 1 check (cloud_version >= 1),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_id, client_id),
  foreign key (scope_id, category_id) references public.planly_budget_categories(scope_id,id) on delete restrict
);
create index planly_budget_entries_scope_date_idx on public.planly_budget_entries(scope_id,entry_date) where deleted_at is null;
create index planly_budget_entries_owner_updated_idx on public.planly_budget_entries(owner_id,updated_at);

-- Existing Planly trigger increments cloud_version and server updated_at on every update.
create trigger planly_budget_scopes_bump_version before update on public.planly_budget_scopes
for each row execute function public.bump_planly_cloud_version();
create trigger planly_budget_categories_bump_version before update on public.planly_budget_categories
for each row execute function public.bump_planly_cloud_version();
create trigger planly_budget_targets_bump_version before update on public.planly_budget_targets
for each row execute function public.bump_planly_cloud_version();
create trigger planly_budget_entries_bump_version before update on public.planly_budget_entries
for each row execute function public.bump_planly_cloud_version();

alter table public.planly_budget_scopes enable row level security;
alter table public.planly_budget_categories enable row level security;
alter table public.planly_budget_targets enable row level security;
alter table public.planly_budget_entries enable row level security;

-- Scope visibility: private owner OR explicit membership in the exact household.
create policy planly_budget_scopes_select_authorized on public.planly_budget_scopes
for select to authenticated using (
  (select auth.uid())=owner_id
  or (scope_type='household' and household_id is not null and public.planly_is_household_member(household_id))
);
create policy planly_budget_scopes_insert_authorized on public.planly_budget_scopes
for insert to authenticated with check (
  (select auth.uid())=owner_id
  and (
    (scope_type='personal' and household_id is null)
    or (scope_type='household' and household_id is not null and public.planly_is_household_owner(household_id))
  )
);
create policy planly_budget_scopes_update_authorized on public.planly_budget_scopes
for update to authenticated using (
  (select auth.uid())=owner_id
  and (scope_type='personal' or (scope_type='household' and public.planly_is_household_owner(household_id)))
) with check (
  (select auth.uid())=owner_id
  and (
    (scope_type='personal' and household_id is null)
    or (scope_type='household' and household_id is not null and public.planly_is_household_owner(household_id))
  )
);

-- Categories/targets are plan structure. Personal owner controls private plans;
-- current household owner controls household plan structure.
create policy planly_budget_categories_select_authorized on public.planly_budget_categories
for select to authenticated using (
  exists(select 1 from public.planly_budget_scopes s where s.id=scope_id)
);
create policy planly_budget_categories_insert_admin on public.planly_budget_categories
for insert to authenticated with check (
  (select auth.uid())=owner_id
  and exists(
    select 1 from public.planly_budget_scopes s where s.id=scope_id and s.owner_id=(select auth.uid())
      and (s.scope_type='personal' or public.planly_is_household_owner(s.household_id))
  )
);
create policy planly_budget_categories_update_admin on public.planly_budget_categories
for update to authenticated using (
  (select auth.uid())=owner_id
  and exists(select 1 from public.planly_budget_scopes s where s.id=scope_id and s.owner_id=(select auth.uid()) and (s.scope_type='personal' or public.planly_is_household_owner(s.household_id)))
) with check (
  (select auth.uid())=owner_id
  and exists(select 1 from public.planly_budget_scopes s where s.id=scope_id and s.owner_id=(select auth.uid()) and (s.scope_type='personal' or public.planly_is_household_owner(s.household_id)))
);

create policy planly_budget_targets_select_authorized on public.planly_budget_targets
for select to authenticated using (exists(select 1 from public.planly_budget_scopes s where s.id=scope_id));
create policy planly_budget_targets_insert_admin on public.planly_budget_targets
for insert to authenticated with check (
  (select auth.uid())=owner_id
  and exists(select 1 from public.planly_budget_scopes s where s.id=scope_id and s.owner_id=(select auth.uid()) and (s.scope_type='personal' or public.planly_is_household_owner(s.household_id)))
);
create policy planly_budget_targets_update_admin on public.planly_budget_targets
for update to authenticated using (
  (select auth.uid())=owner_id
  and exists(select 1 from public.planly_budget_scopes s where s.id=scope_id and s.owner_id=(select auth.uid()) and (s.scope_type='personal' or public.planly_is_household_owner(s.household_id)))
) with check (
  (select auth.uid())=owner_id
  and exists(select 1 from public.planly_budget_scopes s where s.id=scope_id and s.owner_id=(select auth.uid()) and (s.scope_type='personal' or public.planly_is_household_owner(s.household_id)))
);

-- Ledger entries remain creator-owned. Household membership adds visibility and
-- permission to create one's own entry, never permission to mutate another member's entry.
create policy planly_budget_entries_select_authorized on public.planly_budget_entries
for select to authenticated using (
  (select auth.uid())=owner_id
  or exists(select 1 from public.planly_budget_scopes s where s.id=scope_id and s.scope_type='household' and public.planly_is_household_member(s.household_id))
);
create policy planly_budget_entries_insert_own on public.planly_budget_entries
for insert to authenticated with check (
  (select auth.uid())=owner_id
  and exists(
    select 1 from public.planly_budget_scopes s where s.id=scope_id
      and (s.owner_id=(select auth.uid()) or (s.scope_type='household' and public.planly_is_household_member(s.household_id)))
  )
);
create policy planly_budget_entries_update_own on public.planly_budget_entries
for update to authenticated using ((select auth.uid())=owner_id)
with check (
  (select auth.uid())=owner_id
  and exists(
    select 1 from public.planly_budget_scopes s where s.id=scope_id
      and (s.owner_id=(select auth.uid()) or (s.scope_type='household' and public.planly_is_household_member(s.household_id)))
  )
);

revoke all on public.planly_budget_scopes, public.planly_budget_categories, public.planly_budget_targets, public.planly_budget_entries from anon;
revoke all on public.planly_budget_scopes, public.planly_budget_categories, public.planly_budget_targets, public.planly_budget_entries from authenticated;
grant select,insert,update on public.planly_budget_scopes, public.planly_budget_categories, public.planly_budget_targets, public.planly_budget_entries to authenticated;

notify pgrst, 'reload schema';
