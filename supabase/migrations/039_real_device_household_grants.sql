-- Real-device Household acceptance closeout.
-- Keep browser-facing collaboration authenticated-only; RLS remains the row authorization layer.
revoke all on function public.planly_accept_household_invite(text) from public, anon;
grant execute on function public.planly_accept_household_invite(text) to authenticated;
revoke all on function public.planly_create_household_invite(uuid,text) from public, anon;
grant execute on function public.planly_create_household_invite(uuid,text) to authenticated;

revoke all on public.planly_lists, public.planly_list_items from anon;
grant select,insert,update,delete on public.planly_lists, public.planly_list_items to authenticated;

revoke all on public.planly_budget_scopes, public.planly_budget_categories, public.planly_budget_targets, public.planly_budget_entries from anon;
grant select,insert,update on public.planly_budget_scopes, public.planly_budget_categories, public.planly_budget_targets, public.planly_budget_entries to authenticated;

notify pgrst,'reload schema';
