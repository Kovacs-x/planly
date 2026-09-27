-- Planly 4.0K — collaborative Household Budget structure.
-- Personal Budget remains owner-only. Current Household members may create/update
-- shared categories and monthly targets. Structural rows remain owned by the
-- Household owner so ownership transfer and lifecycle administration stay coherent.

create or replace function public.planly_budget_shared_structure_owner(p_scope_id uuid)
returns uuid
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select s.owner_id
  from public.planly_budget_scopes s
  where s.id = p_scope_id
    and s.scope_type = 'household'
    and s.household_id is not null
    and public.planly_private.is_household_member(s.household_id)
  limit 1
$$;

revoke all on function public.planly_budget_shared_structure_owner(uuid) from public, anon;
grant execute on function public.planly_budget_shared_structure_owner(uuid) to authenticated;

drop policy if exists planly_budget_categories_insert_admin on public.planly_budget_categories;
create policy planly_budget_categories_insert_admin
on public.planly_budget_categories
for insert to authenticated
with check (
  (
    owner_id = (select auth.uid())
    and exists (
      select 1 from public.planly_budget_scopes s
      where s.id = scope_id
        and s.scope_type = 'personal'
        and s.owner_id = (select auth.uid())
    )
  )
  or
  (
    owner_id = public.planly_budget_shared_structure_owner(scope_id)
    and owner_id is not null
  )
);

drop policy if exists planly_budget_categories_update_admin on public.planly_budget_categories;
create policy planly_budget_categories_update_admin
on public.planly_budget_categories
for update to authenticated
using (
  (
    owner_id = (select auth.uid())
    and exists (
      select 1 from public.planly_budget_scopes s
      where s.id = scope_id
        and s.scope_type = 'personal'
        and s.owner_id = (select auth.uid())
    )
  )
  or
  (
    owner_id = public.planly_budget_shared_structure_owner(scope_id)
    and owner_id is not null
  )
)
with check (
  (
    owner_id = (select auth.uid())
    and exists (
      select 1 from public.planly_budget_scopes s
      where s.id = scope_id
        and s.scope_type = 'personal'
        and s.owner_id = (select auth.uid())
    )
  )
  or
  (
    owner_id = public.planly_budget_shared_structure_owner(scope_id)
    and owner_id is not null
  )
);

drop policy if exists planly_budget_targets_insert_admin on public.planly_budget_targets;
create policy planly_budget_targets_insert_admin
on public.planly_budget_targets
for insert to authenticated
with check (
  (
    owner_id = (select auth.uid())
    and exists (
      select 1 from public.planly_budget_scopes s
      where s.id = scope_id
        and s.scope_type = 'personal'
        and s.owner_id = (select auth.uid())
    )
  )
  or
  (
    owner_id = public.planly_budget_shared_structure_owner(scope_id)
    and owner_id is not null
  )
);

drop policy if exists planly_budget_targets_update_admin on public.planly_budget_targets;
create policy planly_budget_targets_update_admin
on public.planly_budget_targets
for update to authenticated
using (
  (
    owner_id = (select auth.uid())
    and exists (
      select 1 from public.planly_budget_scopes s
      where s.id = scope_id
        and s.scope_type = 'personal'
        and s.owner_id = (select auth.uid())
    )
  )
  or
  (
    owner_id = public.planly_budget_shared_structure_owner(scope_id)
    and owner_id is not null
  )
)
with check (
  (
    owner_id = (select auth.uid())
    and exists (
      select 1 from public.planly_budget_scopes s
      where s.id = scope_id
        and s.scope_type = 'personal'
        and s.owner_id = (select auth.uid())
    )
  )
  or
  (
    owner_id = public.planly_budget_shared_structure_owner(scope_id)
    and owner_id is not null
  )
);

notify pgrst, 'reload schema';
