-- Security review (15 Nov 2026): revoke needless EXECUTE on two trigger-guard functions.
--
-- public.planly_budget_entry_immutable_guard() (041, BEFORE UPDATE on planly_budget_entries) and
-- public.planly_protect_list_identity() (037, BEFORE UPDATE on planly_lists and planly_list_items) still carry
-- Postgres's default EXECUTE for PUBLIC, so anon and authenticated could call them directly. Calling a trigger function
-- outside a trigger only raises an error, but there is no reason to grant it: Postgres does not check EXECUTE when a
-- trigger fires, which is why every other Planly trigger function already has these grants revoked and still works.
-- Nothing else changes: same functions, same triggers, same owner. No data is changed.

revoke execute on function public.planly_budget_entry_immutable_guard() from public, anon, authenticated;
revoke execute on function public.planly_protect_list_identity() from public, anon, authenticated;
