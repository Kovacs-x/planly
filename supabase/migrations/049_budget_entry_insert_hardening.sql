-- Planly 4.0R — Budget entry insert hardening.
-- The insert rule was wider than the update rule (041): anyone who created a scope could add
-- entries to it, including a Household scope after leaving that Household, and to a deleted scope.
-- Inserts now follow the update rule exactly: personal entries go only into your own live personal
-- scope; Household entries only into a live Household scope you are currently a member of.
-- The entry is always logged as yourself (owner_id = auth.uid()); the browser cannot choose it.

drop policy if exists planly_budget_entries_insert_own on public.planly_budget_entries;
drop policy if exists planly_budget_entries_insert_authorized on public.planly_budget_entries;
create policy planly_budget_entries_insert_authorized
on public.planly_budget_entries
for insert to authenticated
with check (
  planly_budget_entries.owner_id = (select auth.uid())
  and exists (
    select 1
    from public.planly_budget_scopes s
    where s.id = planly_budget_entries.scope_id
      and s.deleted_at is null
      and (
        (s.scope_type = 'personal' and s.owner_id = (select auth.uid()))
        or
        (s.scope_type = 'household' and s.household_id is not null and planly_private.is_household_member(s.household_id))
      )
  )
);

notify pgrst, 'reload schema';
