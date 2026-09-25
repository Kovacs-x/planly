-- Internal authorization helpers are used by RLS/policy evaluation, not as browser RPC endpoints.
-- Keep intentional lifecycle RPCs callable, but deny direct client execution of helper functions.

revoke execute on function public.planly_is_household_member(uuid,uuid) from public, anon, authenticated;
revoke execute on function public.planly_is_household_owner(uuid,uuid) from public, anon, authenticated;
revoke execute on function public.planly_task_share_target_valid(text,uuid) from public, anon, authenticated;
revoke execute on function public.planly_task_share_target_valid(text,uuid,uuid) from public, anon, authenticated;
