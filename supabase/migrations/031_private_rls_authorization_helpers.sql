-- RLS predicates need executable authorization helpers, but those helpers do not
-- need to be exposed as public RPC endpoints. Put policy-only helpers in a private
-- schema and point policies at them. Existing public helpers remain available to
-- SECURITY DEFINER lifecycle RPC internals but are not client-executable.

create schema if not exists planly_private;
revoke all on schema planly_private from public, anon;
grant usage on schema planly_private to authenticated;

create or replace function planly_private.is_household_member(p_household_id uuid)
returns boolean language sql stable security definer
set search_path=pg_catalog,public
as $$ select exists(select 1 from public.planly_household_members m where m.household_id=p_household_id and m.user_id=auth.uid()) $$;

create or replace function planly_private.is_household_owner(p_household_id uuid)
returns boolean language sql stable security definer
set search_path=pg_catalog,public
as $$ select exists(select 1 from public.planly_household_members m where m.household_id=p_household_id and m.user_id=auth.uid() and m.role='owner') $$;

create or replace function planly_private.task_share_target_valid(p_visibility text,p_household_id uuid,p_assignee_id uuid)
returns boolean language sql stable security definer
set search_path=pg_catalog,public
as $$
select case
 when p_visibility='private' then p_household_id is null and p_assignee_id is null
 when p_visibility='household' then p_household_id is not null
   and exists(select 1 from public.planly_household_members m where m.household_id=p_household_id and m.user_id=auth.uid())
   and (p_assignee_id is null or exists(select 1 from public.planly_household_members a where a.household_id=p_household_id and a.user_id=p_assignee_id))
 else false end
$$;

revoke all on function planly_private.is_household_member(uuid) from public,anon;
revoke all on function planly_private.is_household_owner(uuid) from public,anon;
revoke all on function planly_private.task_share_target_valid(text,uuid,uuid) from public,anon;
grant execute on function planly_private.is_household_member(uuid),planly_private.is_household_owner(uuid),planly_private.task_share_target_valid(text,uuid,uuid) to authenticated;

-- Household core.
drop policy if exists planly_household_members_select_member on public.planly_household_members;
create policy planly_household_members_select_member on public.planly_household_members for select to authenticated using (planly_private.is_household_member(household_id));
drop policy if exists planly_households_select_member on public.planly_households;
create policy planly_households_select_member on public.planly_households for select to authenticated using (planly_private.is_household_member(id));
drop policy if exists planly_household_invites_select_owner on public.planly_household_invites;
create policy planly_household_invites_select_owner on public.planly_household_invites for select to authenticated using (planly_private.is_household_owner(household_id));

-- Shared projects/tasks.
drop policy if exists planly_projects_select_authorized on public.planly_projects;
create policy planly_projects_select_authorized on public.planly_projects for select to authenticated using ((select auth.uid())=owner_id or (visibility='household' and household_id is not null and planly_private.is_household_member(household_id)));
drop policy if exists planly_projects_insert_own on public.planly_projects;
create policy planly_projects_insert_own on public.planly_projects for insert to authenticated with check ((select auth.uid())=owner_id and ((visibility='private' and household_id is null) or (visibility='household' and household_id is not null and planly_private.is_household_member(household_id))));
drop policy if exists planly_projects_update_own on public.planly_projects;
create policy planly_projects_update_own on public.planly_projects for update to authenticated using ((select auth.uid())=owner_id) with check ((select auth.uid())=owner_id and ((visibility='private' and household_id is null) or (visibility='household' and household_id is not null and planly_private.is_household_member(household_id))));

drop policy if exists planly_tasks_select_visible on public.planly_tasks;
create policy planly_tasks_select_visible on public.planly_tasks for select to authenticated using ((select auth.uid())=owner_id or (visibility='household' and household_id is not null and planly_private.is_household_member(household_id)));
drop policy if exists planly_tasks_insert_own on public.planly_tasks;
create policy planly_tasks_insert_own on public.planly_tasks for insert to authenticated with check ((select auth.uid())=owner_id and planly_private.task_share_target_valid(visibility,household_id,assignee_id));
drop policy if exists planly_tasks_update_owner on public.planly_tasks;
create policy planly_tasks_update_owner on public.planly_tasks for update to authenticated using ((select auth.uid())=owner_id) with check ((select auth.uid())=owner_id and planly_private.task_share_target_valid(visibility,household_id,assignee_id));

-- Budget scopes.
drop policy if exists planly_budget_scopes_select_authorized on public.planly_budget_scopes;
create policy planly_budget_scopes_select_authorized on public.planly_budget_scopes for select to authenticated using ((select auth.uid())=owner_id or (scope_type='household' and household_id is not null and planly_private.is_household_member(household_id)));
drop policy if exists planly_budget_scopes_insert_authorized on public.planly_budget_scopes;
create policy planly_budget_scopes_insert_authorized on public.planly_budget_scopes for insert to authenticated with check ((select auth.uid())=owner_id and ((scope_type='personal' and household_id is null) or (scope_type='household' and household_id is not null and planly_private.is_household_owner(household_id))));
drop policy if exists planly_budget_scopes_update_authorized on public.planly_budget_scopes;
create policy planly_budget_scopes_update_authorized on public.planly_budget_scopes for update to authenticated using ((select auth.uid())=owner_id and (scope_type='personal' or (scope_type='household' and planly_private.is_household_owner(household_id)))) with check ((select auth.uid())=owner_id and ((scope_type='personal' and household_id is null) or (scope_type='household' and household_id is not null and planly_private.is_household_owner(household_id))));

-- Budget plan structure.
drop policy if exists planly_budget_categories_insert_admin on public.planly_budget_categories;
create policy planly_budget_categories_insert_admin on public.planly_budget_categories for insert to authenticated with check ((select auth.uid())=owner_id and exists(select 1 from public.planly_budget_scopes s where s.id=scope_id and s.owner_id=(select auth.uid()) and (s.scope_type='personal' or planly_private.is_household_owner(s.household_id))));
drop policy if exists planly_budget_categories_update_admin on public.planly_budget_categories;
create policy planly_budget_categories_update_admin on public.planly_budget_categories for update to authenticated using ((select auth.uid())=owner_id and exists(select 1 from public.planly_budget_scopes s where s.id=scope_id and s.owner_id=(select auth.uid()) and (s.scope_type='personal' or planly_private.is_household_owner(s.household_id)))) with check ((select auth.uid())=owner_id and exists(select 1 from public.planly_budget_scopes s where s.id=scope_id and s.owner_id=(select auth.uid()) and (s.scope_type='personal' or planly_private.is_household_owner(s.household_id))));
drop policy if exists planly_budget_targets_insert_admin on public.planly_budget_targets;
create policy planly_budget_targets_insert_admin on public.planly_budget_targets for insert to authenticated with check ((select auth.uid())=owner_id and exists(select 1 from public.planly_budget_scopes s where s.id=scope_id and s.owner_id=(select auth.uid()) and (s.scope_type='personal' or planly_private.is_household_owner(s.household_id))));
drop policy if exists planly_budget_targets_update_admin on public.planly_budget_targets;
create policy planly_budget_targets_update_admin on public.planly_budget_targets for update to authenticated using ((select auth.uid())=owner_id and exists(select 1 from public.planly_budget_scopes s where s.id=scope_id and s.owner_id=(select auth.uid()) and (s.scope_type='personal' or planly_private.is_household_owner(s.household_id)))) with check ((select auth.uid())=owner_id and exists(select 1 from public.planly_budget_scopes s where s.id=scope_id and s.owner_id=(select auth.uid()) and (s.scope_type='personal' or planly_private.is_household_owner(s.household_id))));

-- Budget creator-owned entries.
drop policy if exists planly_budget_entries_select_authorized on public.planly_budget_entries;
create policy planly_budget_entries_select_authorized on public.planly_budget_entries for select to authenticated using ((select auth.uid())=owner_id or exists(select 1 from public.planly_budget_scopes s where s.id=scope_id and s.scope_type='household' and planly_private.is_household_member(s.household_id)));
drop policy if exists planly_budget_entries_insert_own on public.planly_budget_entries;
create policy planly_budget_entries_insert_own on public.planly_budget_entries for insert to authenticated with check ((select auth.uid())=owner_id and exists(select 1 from public.planly_budget_scopes s where s.id=scope_id and (s.owner_id=(select auth.uid()) or (s.scope_type='household' and planly_private.is_household_member(s.household_id)))));
drop policy if exists planly_budget_entries_update_own on public.planly_budget_entries;
create policy planly_budget_entries_update_own on public.planly_budget_entries for update to authenticated using ((select auth.uid())=owner_id) with check ((select auth.uid())=owner_id and exists(select 1 from public.planly_budget_scopes s where s.id=scope_id and (s.owner_id=(select auth.uid()) or (s.scope_type='household' and planly_private.is_household_member(s.household_id)))));

-- Public authorization helpers are no longer required by RLS policy evaluation.
revoke execute on function public.planly_is_household_member(uuid,uuid) from public,anon,authenticated;
revoke execute on function public.planly_is_household_owner(uuid,uuid) from public,anon,authenticated;
revoke execute on function public.planly_task_share_target_valid(text,uuid) from public,anon,authenticated;
revoke execute on function public.planly_task_share_target_valid(text,uuid,uuid) from public,anon,authenticated;
