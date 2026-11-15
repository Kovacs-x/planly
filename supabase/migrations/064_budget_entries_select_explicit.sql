-- Security review (15 Nov 2026): defence in depth for reading Budget entries.
--
-- planly_budget_entries_select_authorized only checked that the entry's scope row exists:
--   exists (select 1 from planly_budget_scopes s where s.id = planly_budget_entries.scope_id)
-- That is safe today only because planly_budget_scopes has its own RLS, which hides other people's scopes from the
-- subquery. If that policy were ever loosened, every entry would become readable. The entries policy now states the
-- rule itself, mirroring planly_budget_scopes_select_authorized exactly: you may read an entry when you own its scope,
-- or its scope is a Household scope and you are a member of that Household.
-- Who can read what does not change today. INSERT and UPDATE policies are untouched; there is no DELETE right.
-- Replaced in one transaction, so there is no moment without a SELECT policy. No data is changed.

begin;

drop policy if exists planly_budget_entries_select_authorized on public.planly_budget_entries;
create policy planly_budget_entries_select_authorized on public.planly_budget_entries
for select to authenticated
using (exists (
  select 1 from public.planly_budget_scopes s
  where s.id = planly_budget_entries.scope_id
    and (s.owner_id = (select auth.uid())
      or (s.scope_type = 'household' and s.household_id is not null and planly_private.is_household_member(s.household_id)))
));

commit;
