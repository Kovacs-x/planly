-- Planly 4.0N — collaborative Household Budget entry mutation.
-- Personal Budget entries remain owner-only. Current Household members may update
-- shared Household Budget entries regardless of who originally logged them.
-- Immutable identity/ownership columns are enforced server-side so browser payloads
-- cannot reassign ownership or move an entry between scopes.

create or replace function public.planly_budget_entry_immutable_guard()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  if new.id is distinct from old.id
     or new.scope_id is distinct from old.scope_id
     or new.owner_id is distinct from old.owner_id
     or new.client_id is distinct from old.client_id
     or new.client_created_at is distinct from old.client_created_at then
    raise exception 'budget entry identity and ownership are immutable' using errcode = '42501';
  end if;
  return new;
end
$$;

drop trigger if exists planly_budget_entry_immutable_guard on public.planly_budget_entries;
create trigger planly_budget_entry_immutable_guard
before update on public.planly_budget_entries
for each row execute function public.planly_budget_entry_immutable_guard();

drop policy if exists planly_budget_entries_update_own on public.planly_budget_entries;
drop policy if exists planly_budget_entries_update_authorized on public.planly_budget_entries;
create policy planly_budget_entries_update_authorized
on public.planly_budget_entries
for update to authenticated
using (
  exists (
    select 1
    from public.planly_budget_scopes s
    where s.id = planly_budget_entries.scope_id
      and s.deleted_at is null
      and (
        (s.scope_type = 'personal' and s.owner_id = (select auth.uid()) and planly_budget_entries.owner_id = (select auth.uid()))
        or
        (s.scope_type = 'household' and s.household_id is not null and planly_private.is_household_member(s.household_id))
      )
  )
)
with check (
  exists (
    select 1
    from public.planly_budget_scopes s
    where s.id = planly_budget_entries.scope_id
      and s.deleted_at is null
      and (
        (s.scope_type = 'personal' and s.owner_id = (select auth.uid()) and planly_budget_entries.owner_id = (select auth.uid()))
        or
        (s.scope_type = 'household' and s.household_id is not null and planly_private.is_household_member(s.household_id))
      )
  )
);

notify pgrst, 'reload schema';
