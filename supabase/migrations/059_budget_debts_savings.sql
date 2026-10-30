-- Budget › Debts and Savings (30 Oct 2026).
--
-- Two new Budget tables that belong to a Budget scope, exactly like Budget entries:
--   planly_budget_debts     one row per debt: balance from the last statement, interest, 0% end date, minimum
--   planly_budget_savings   one row per savings pot: balance, optional goal, paused, kind (savings/investment/circle)
-- and two optional links on planly_budget_entries, so a monthly bill or saving can belong to a debt or a pot:
--   debt_id, saving_id      ticking a linked bill as paid lowers that debt (or raises that pot) in the app, which
--                           works out balance = statement balance -/+ linked paid entries dated after balance_on.
--
-- Rules (the same as Budget entries, 041/049)
--   * Household scope: every current member of that Household can see, add and change its debts and pots.
--     Personal scope: only its owner.
--   * A row is always created as yourself (owner_id = auth.uid()); id, scope_id, owner_id, client_id and
--     client_created_at can never change. Deleting is a soft delete (deleted_at), so no DELETE right is granted.
--   * person_id (whose debt or pot it is) must be a member of the scope's Household (or the owner, for a personal
--     scope); it is checked whenever it is set or changed.
--   * An entry can only link to a live debt or pot in its own scope that the caller can see.
--   * Amounts are bounded by CHECK constraints; anon has no access; cloud_version is bumped on every update.
-- Deleting a Household (planly_delete_household) removes its Budget scope; its debts and pots go with it
-- (on delete cascade). No existing row, policy or function is changed; the only change to an existing table is
-- two new nullable columns on planly_budget_entries.

create table if not exists public.planly_budget_debts (
  id uuid primary key,
  scope_id uuid not null references public.planly_budget_scopes(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete restrict,
  client_id text not null check (char_length(client_id) between 1 and 80),
  name text not null check (char_length(btrim(name)) between 1 and 60),
  person_id uuid references auth.users(id) on delete set null,
  start_minor bigint not null check (start_minor between 0 and 100000000),
  balance_minor bigint not null check (balance_minor between 0 and 100000000),
  balance_on date not null,
  apr_bp integer check (apr_bp between 0 and 10000),
  zero_until date,
  minimum_minor bigint check (minimum_minor between 0 and 10000000),
  priority smallint not null default 50 check (priority between 0 and 1000),
  notes text not null default '' check (char_length(notes) <= 500),
  closed_on date,
  client_created_at bigint not null,
  client_updated_at bigint not null,
  cloud_version bigint not null default 1 check (cloud_version >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique(owner_id, client_id)
);

create table if not exists public.planly_budget_savings (
  id uuid primary key,
  scope_id uuid not null references public.planly_budget_scopes(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete restrict,
  client_id text not null check (char_length(client_id) between 1 and 80),
  name text not null check (char_length(btrim(name)) between 1 and 60),
  person_id uuid references auth.users(id) on delete set null,
  kind text not null default 'savings' check (kind in ('savings','investment','circle')),
  balance_minor bigint not null check (balance_minor between 0 and 100000000),
  balance_on date not null,
  goal_minor bigint check (goal_minor between 1 and 100000000),
  paused boolean not null default false,
  sort_order smallint not null default 50 check (sort_order between 0 and 1000),
  notes text not null default '' check (char_length(notes) <= 500),
  client_created_at bigint not null,
  client_updated_at bigint not null,
  cloud_version bigint not null default 1 check (cloud_version >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique(owner_id, client_id)
);

create index if not exists planly_budget_debts_scope_idx on public.planly_budget_debts(scope_id) where deleted_at is null;
create index if not exists planly_budget_debts_owner_idx on public.planly_budget_debts(owner_id);
create index if not exists planly_budget_debts_person_idx on public.planly_budget_debts(person_id);
create index if not exists planly_budget_savings_scope_idx on public.planly_budget_savings(scope_id) where deleted_at is null;
create index if not exists planly_budget_savings_owner_idx on public.planly_budget_savings(owner_id);
create index if not exists planly_budget_savings_person_idx on public.planly_budget_savings(person_id);

alter table public.planly_budget_entries
  add column if not exists debt_id uuid references public.planly_budget_debts(id) on delete set null,
  add column if not exists saving_id uuid references public.planly_budget_savings(id) on delete set null;
alter table public.planly_budget_entries drop constraint if exists planly_budget_entries_one_link_check;
alter table public.planly_budget_entries add constraint planly_budget_entries_one_link_check check (debt_id is null or saving_id is null);
create index if not exists planly_budget_entries_debt_idx on public.planly_budget_entries(debt_id) where debt_id is not null;
create index if not exists planly_budget_entries_saving_idx on public.planly_budget_entries(saving_id) where saving_id is not null;

-- ---------- identity, version, whose ----------

create or replace function public.planly_budget_money_guard()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_scope public.planly_budget_scopes%rowtype;
begin
  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id
       or new.scope_id is distinct from old.scope_id
       or new.owner_id is distinct from old.owner_id
       or new.client_id is distinct from old.client_id
       or new.client_created_at is distinct from old.client_created_at then
      raise exception 'Budget row identity and ownership are immutable' using errcode = '42501';
    end if;
  end if;
  if new.person_id is not null and (tg_op = 'INSERT' or new.person_id is distinct from old.person_id) then
    select * into v_scope from public.planly_budget_scopes s where s.id = new.scope_id;
    if not found
       or (v_scope.scope_type = 'personal' and new.person_id is distinct from v_scope.owner_id)
       or (v_scope.scope_type = 'household' and not exists (
             select 1 from public.planly_household_members m
              where m.household_id = v_scope.household_id and m.user_id = new.person_id)) then
      raise exception 'That person is not part of this budget' using errcode = '42501';
    end if;
  end if;
  return new;
end
$$;
revoke all on function public.planly_budget_money_guard() from public, anon, authenticated;

create trigger planly_budget_debts_guard before insert or update on public.planly_budget_debts
for each row execute function public.planly_budget_money_guard();
create trigger planly_budget_savings_guard before insert or update on public.planly_budget_savings
for each row execute function public.planly_budget_money_guard();
create trigger planly_budget_debts_bump_version before update on public.planly_budget_debts
for each row execute function public.bump_planly_cloud_version();
create trigger planly_budget_savings_bump_version before update on public.planly_budget_savings
for each row execute function public.bump_planly_cloud_version();

-- an entry links only to a live debt or pot in its own scope that the caller can see (RLS applies here)
create or replace function public.planly_budget_entry_link_guard()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  if new.debt_id is not null and (tg_op = 'INSERT' or new.debt_id is distinct from old.debt_id) then
    if not exists (select 1 from public.planly_budget_debts d
                    where d.id = new.debt_id and d.scope_id = new.scope_id and d.deleted_at is null) then
      raise exception 'Choose a debt from this budget' using errcode = '42501';
    end if;
  end if;
  if new.saving_id is not null and (tg_op = 'INSERT' or new.saving_id is distinct from old.saving_id) then
    if not exists (select 1 from public.planly_budget_savings v
                    where v.id = new.saving_id and v.scope_id = new.scope_id and v.deleted_at is null) then
      raise exception 'Choose a savings pot from this budget' using errcode = '42501';
    end if;
  end if;
  return new;
end
$$;
revoke all on function public.planly_budget_entry_link_guard() from public, anon, authenticated;

create trigger planly_budget_entries_link_guard before insert or update of debt_id, saving_id on public.planly_budget_entries
for each row execute function public.planly_budget_entry_link_guard();

-- ---------- access ----------

alter table public.planly_budget_debts enable row level security;
alter table public.planly_budget_savings enable row level security;
revoke all on public.planly_budget_debts, public.planly_budget_savings from public, anon, authenticated;
grant select, insert, update on public.planly_budget_debts, public.planly_budget_savings to authenticated;

create policy planly_budget_debts_select_authorized on public.planly_budget_debts
for select to authenticated
using (exists (select 1 from public.planly_budget_scopes s
                where s.id = planly_budget_debts.scope_id and s.deleted_at is null
                  and ((s.scope_type = 'personal' and s.owner_id = (select auth.uid()))
                    or (s.scope_type = 'household' and s.household_id is not null and planly_private.is_household_member(s.household_id)))));

create policy planly_budget_debts_insert_authorized on public.planly_budget_debts
for insert to authenticated
with check (planly_budget_debts.owner_id = (select auth.uid())
  and exists (select 1 from public.planly_budget_scopes s
               where s.id = planly_budget_debts.scope_id and s.deleted_at is null
                 and ((s.scope_type = 'personal' and s.owner_id = (select auth.uid()))
                   or (s.scope_type = 'household' and s.household_id is not null and planly_private.is_household_member(s.household_id)))));

create policy planly_budget_debts_update_authorized on public.planly_budget_debts
for update to authenticated
using (exists (select 1 from public.planly_budget_scopes s
                where s.id = planly_budget_debts.scope_id and s.deleted_at is null
                  and ((s.scope_type = 'personal' and s.owner_id = (select auth.uid()) and planly_budget_debts.owner_id = (select auth.uid()))
                    or (s.scope_type = 'household' and s.household_id is not null and planly_private.is_household_member(s.household_id)))))
with check (exists (select 1 from public.planly_budget_scopes s
                     where s.id = planly_budget_debts.scope_id and s.deleted_at is null
                       and ((s.scope_type = 'personal' and s.owner_id = (select auth.uid()) and planly_budget_debts.owner_id = (select auth.uid()))
                         or (s.scope_type = 'household' and s.household_id is not null and planly_private.is_household_member(s.household_id)))));

create policy planly_budget_savings_select_authorized on public.planly_budget_savings
for select to authenticated
using (exists (select 1 from public.planly_budget_scopes s
                where s.id = planly_budget_savings.scope_id and s.deleted_at is null
                  and ((s.scope_type = 'personal' and s.owner_id = (select auth.uid()))
                    or (s.scope_type = 'household' and s.household_id is not null and planly_private.is_household_member(s.household_id)))));

create policy planly_budget_savings_insert_authorized on public.planly_budget_savings
for insert to authenticated
with check (planly_budget_savings.owner_id = (select auth.uid())
  and exists (select 1 from public.planly_budget_scopes s
               where s.id = planly_budget_savings.scope_id and s.deleted_at is null
                 and ((s.scope_type = 'personal' and s.owner_id = (select auth.uid()))
                   or (s.scope_type = 'household' and s.household_id is not null and planly_private.is_household_member(s.household_id)))));

create policy planly_budget_savings_update_authorized on public.planly_budget_savings
for update to authenticated
using (exists (select 1 from public.planly_budget_scopes s
                where s.id = planly_budget_savings.scope_id and s.deleted_at is null
                  and ((s.scope_type = 'personal' and s.owner_id = (select auth.uid()) and planly_budget_savings.owner_id = (select auth.uid()))
                    or (s.scope_type = 'household' and s.household_id is not null and planly_private.is_household_member(s.household_id)))))
with check (exists (select 1 from public.planly_budget_scopes s
                     where s.id = planly_budget_savings.scope_id and s.deleted_at is null
                       and ((s.scope_type = 'personal' and s.owner_id = (select auth.uid()) and planly_budget_savings.owner_id = (select auth.uid()))
                         or (s.scope_type = 'household' and s.household_id is not null and planly_private.is_household_member(s.household_id)))));

notify pgrst, 'reload schema';
