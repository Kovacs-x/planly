-- RLS policies execute with the querying role and therefore require EXECUTE on
-- functions referenced by policy expressions. Migration 026 revoked these grants,
-- which causes permission-denied evaluation instead of enforcing the predicate.
-- These helpers ignore caller-supplied user IDs and always evaluate auth.uid(), so
-- direct authenticated execution cannot inspect another user's membership/ownership.

revoke all on function public.planly_is_household_member(uuid,uuid) from public, anon;
revoke all on function public.planly_is_household_owner(uuid,uuid) from public, anon;
grant execute on function public.planly_is_household_member(uuid,uuid) to authenticated;
grant execute on function public.planly_is_household_owner(uuid,uuid) to authenticated;

-- Task-share validation is also referenced by task INSERT/UPDATE RLS policies.
-- Restore only authenticated execution; the helper derives identity through the
-- membership helper rather than trusting browser-supplied ownership.
revoke all on function public.planly_task_share_target_valid(text,uuid) from public, anon;
revoke all on function public.planly_task_share_target_valid(text,uuid,uuid) from public, anon;
grant execute on function public.planly_task_share_target_valid(text,uuid) to authenticated;
grant execute on function public.planly_task_share_target_valid(text,uuid,uuid) to authenticated;
