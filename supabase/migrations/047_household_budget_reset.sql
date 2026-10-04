-- Household Budget reset (owner only). The user's requirement: the household owner can clear the ENTIRE shared
-- Household Budget, including entries a partner created, without weakening general RLS.
-- Authority is established server-side from auth.uid() and planly_household_members.role = 'owner' of the scope's
-- household; the client only says WHICH scope. Nothing the browser supplies about ownership is trusted.
-- Clearing is a soft delete (deleted_at), the same way every Budget delete already works, so both phones converge
-- through their normal loads (which filter deleted_at is null). The scope row and the household stay.
-- Personal Budgets, other households and every non-Budget table are untouched.

create or replace function public.planly_reset_household_budget(
  p_scope_id uuid,
  p_include_categories boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user uuid := auth.uid();
  v_household uuid;
  v_now timestamptz := clock_timestamp();
  v_ms bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  v_entries integer := 0;
  v_targets integer := 0;
  v_categories integer := 0;
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  -- The scope must be a live Household Budget; lock it so concurrent resets serialise.
  select s.household_id into v_household
    from public.planly_budget_scopes s
   where s.id = p_scope_id
     and s.scope_type = 'household'
     and s.household_id is not null
     and s.deleted_at is null
   for update;

  -- Same answer for "no such scope" and "not your household", so callers learn nothing about other households.
  if v_household is null
     or not exists (select 1 from public.planly_household_members m
                     where m.household_id = v_household and m.user_id = v_user and m.role = 'owner') then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  update public.planly_budget_entries
     set deleted_at = v_now, client_updated_at = v_ms
   where scope_id = p_scope_id and deleted_at is null;
  get diagnostics v_entries = row_count;

  update public.planly_budget_targets
     set deleted_at = v_now, client_updated_at = v_ms
   where scope_id = p_scope_id and deleted_at is null;
  get diagnostics v_targets = row_count;

  if coalesce(p_include_categories, false) then
    update public.planly_budget_categories
       set deleted_at = v_now, client_updated_at = v_ms
     where scope_id = p_scope_id and deleted_at is null;
    get diagnostics v_categories = row_count;
  end if;

  -- Bump the scope's cloud_version (bump trigger) so other devices see the change on their next load.
  update public.planly_budget_scopes set client_updated_at = v_ms where id = p_scope_id;

  return jsonb_build_object('entries', v_entries, 'targets', v_targets, 'categories', v_categories,
                            'reset_at', v_now);
end
$$;

revoke all on function public.planly_reset_household_budget(uuid, boolean) from public, anon;
grant execute on function public.planly_reset_household_budget(uuid, boolean) to authenticated;

comment on function public.planly_reset_household_budget(uuid, boolean) is
  'Household owner only: soft-deletes every entry and target (and optionally category) of one Household Budget scope.';
