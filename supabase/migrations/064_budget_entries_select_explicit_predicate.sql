-- Make the planly_budget_entries SELECT policy an explicit owner-or-household-member predicate (16 Nov 2026).
--
-- Migration 035 simplified this policy to `exists (select 1 from planly_budget_scopes s where s.id=scope_id)`, which
-- grants read on an entry whenever its scope row is *visible* to the caller. That leans entirely on the scopes table's
-- own RLS filtering the sub-select, and drops the explicit owner fast-path. It is correct only as long as
-- planly_budget_scopes' SELECT policy stays exactly as strict as it is today; any future permissive policy or
-- security-definer read path on scopes would silently widen entry visibility.
--
-- Restore an explicit, self-contained predicate that mirrors planly_budget_scopes_select_authorized (031) and the
-- entries INSERT policy (049): the caller may read an entry they own, or any entry in a household scope they belong to.
-- is_household_member(null) is already false, so the `s.household_id is not null` guard is defence-in-depth matching the
-- scopes and insert predicates. This is behaviourally equivalent to 035 for every real row today; it just no longer
-- depends on the scopes sub-select being RLS-filtered. No table, column, grant or other policy changes.

drop policy if exists planly_budget_entries_select_authorized
  on public.planly_budget_entries;

create policy planly_budget_entries_select_authorized
on public.planly_budget_entries
for select to authenticated
using (
  (select auth.uid()) = owner_id
  or exists (
    select 1
      from public.planly_budget_scopes s
     where s.id=scope_id
       and s.scope_type = 'household'
       and s.household_id is not null
       and planly_private.is_household_member(s.household_id)
  )
);

notify pgrst, 'reload schema';
