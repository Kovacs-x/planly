-- Planly 3.3D — release-gate hardening without broadening authorization.

-- Assignment is a primary Household access path; cover its FK/lookups.
create index if not exists planly_tasks_assignee_id_idx
  on public.planly_tasks (assignee_id)
  where assignee_id is not null;

-- Preserve owner-only semantics while avoiding per-row auth.uid() re-evaluation.
drop policy if exists planly_preferences_select_own on public.planly_preferences;
create policy planly_preferences_select_own on public.planly_preferences
for select to authenticated using ((select auth.uid()) = owner_id);

drop policy if exists planly_preferences_insert_own on public.planly_preferences;
create policy planly_preferences_insert_own on public.planly_preferences
for insert to authenticated with check ((select auth.uid()) = owner_id);

drop policy if exists planly_preferences_update_own on public.planly_preferences;
create policy planly_preferences_update_own on public.planly_preferences
for update to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

drop policy if exists planly_sync_state_select_own on public.planly_sync_state;
create policy planly_sync_state_select_own on public.planly_sync_state
for select to authenticated using ((select auth.uid()) = owner_id);

drop policy if exists planly_sync_state_insert_own on public.planly_sync_state;
create policy planly_sync_state_insert_own on public.planly_sync_state
for insert to authenticated with check ((select auth.uid()) = owner_id);

drop policy if exists planly_sync_state_update_own on public.planly_sync_state;
create policy planly_sync_state_update_own on public.planly_sync_state
for update to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);
