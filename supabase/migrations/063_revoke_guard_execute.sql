-- Revoke EXECUTE on the two trigger-guard functions from the browser roles (16 Nov 2026).
--
-- planly_budget_entry_immutable_guard (041) and planly_protect_list_identity (037) exist only to back BEFORE UPDATE
-- triggers on planly_budget_entries, planly_lists and planly_list_items. PostgreSQL runs a trigger function as part of
-- the triggering statement without checking EXECUTE on the invoking role, so these revokes do not affect the triggers.
-- But Postgres grants EXECUTE to PUBLIC by default when a function is created, which leaves anon and authenticated able
-- to call these guards directly (e.g. through a PostgREST RPC). They have no business being callable from the browser.
-- Remove that default grant. No trigger, policy, table, column or data changes; service_role is unaffected.

revoke execute on function public.planly_budget_entry_immutable_guard() from public, anon, authenticated;
revoke execute on function public.planly_protect_list_identity() from public, anon, authenticated;
