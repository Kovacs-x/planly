-- Planly 4.1 authorization correction: use the authenticated-callable private helper.

drop policy if exists planly_lists_select_authorized on public.planly_lists;
drop policy if exists planly_lists_insert_owner on public.planly_lists;
drop policy if exists planly_lists_update_authorized on public.planly_lists;
drop policy if exists planly_list_items_select_authorized on public.planly_list_items;
drop policy if exists planly_list_items_insert_authorized on public.planly_list_items;
drop policy if exists planly_list_items_update_authorized on public.planly_list_items;
drop policy if exists planly_list_items_delete_authorized on public.planly_list_items;

create policy planly_lists_select_authorized on public.planly_lists for select to authenticated using (owner_id=(select auth.uid()) or (visibility='household' and household_id is not null and planly_private.is_household_member(household_id)));
create policy planly_lists_insert_owner on public.planly_lists for insert to authenticated with check (owner_id=(select auth.uid()) and ((visibility='private' and household_id is null) or (visibility='household' and household_id is not null and planly_private.is_household_member(household_id))));
create policy planly_lists_update_authorized on public.planly_lists for update to authenticated using (owner_id=(select auth.uid()) or (visibility='household' and household_id is not null and planly_private.is_household_member(household_id))) with check (owner_id=(select auth.uid()) or (visibility='household' and household_id is not null and planly_private.is_household_member(household_id)));
create policy planly_list_items_select_authorized on public.planly_list_items for select to authenticated using (exists(select 1 from public.planly_lists l where l.id=list_id and l.deleted_at is null and (l.owner_id=(select auth.uid()) or (l.visibility='household' and planly_private.is_household_member(l.household_id)))));
create policy planly_list_items_insert_authorized on public.planly_list_items for insert to authenticated with check (owner_id=(select auth.uid()) and exists(select 1 from public.planly_lists l where l.id=list_id and l.deleted_at is null and (l.owner_id=(select auth.uid()) or (l.visibility='household' and planly_private.is_household_member(l.household_id)))));
create policy planly_list_items_update_authorized on public.planly_list_items for update to authenticated using (exists(select 1 from public.planly_lists l where l.id=list_id and l.deleted_at is null and (l.owner_id=(select auth.uid()) or (l.visibility='household' and planly_private.is_household_member(l.household_id))))) with check (exists(select 1 from public.planly_lists l where l.id=list_id and l.deleted_at is null and (l.owner_id=(select auth.uid()) or (l.visibility='household' and planly_private.is_household_member(l.household_id)))));
create policy planly_list_items_delete_authorized on public.planly_list_items for delete to authenticated using (exists(select 1 from public.planly_lists l where l.id=list_id and l.deleted_at is null and (l.owner_id=(select auth.uid()) or (l.visibility='household' and planly_private.is_household_member(l.household_id)))));
