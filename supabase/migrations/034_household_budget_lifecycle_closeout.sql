-- Planly 4.0 release closeout — keep Household lifecycle compatible with Household Budget.
-- Household ownership transfer carries Budget plan administration with it.
-- Household deletion permanently removes the shared Household Budget while preserving
-- Personal budgets and converting shared Planly tasks/projects back to private through
-- the existing household-delete trigger.

create or replace function public.planly_budget_protect_identity()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_household_id uuid;
begin
  if tg_table_name='planly_budget_scopes' then
    if new.client_id is distinct from old.client_id
       or new.scope_type is distinct from old.scope_type
       or new.household_id is distinct from old.household_id then
      raise exception 'Budget scope identity is immutable';
    end if;

    if new.owner_id is distinct from old.owner_id then
      if old.scope_type<>'household'
         or old.household_id is null
         or not exists(
           select 1
           from public.planly_household_members m
           where m.household_id=old.household_id
             and m.user_id=new.owner_id
             and m.role='owner'
         ) then
        raise exception 'Budget scope owner can change only with Household ownership';
      end if;
    end if;

  elsif tg_table_name='planly_budget_categories' then
    if new.client_id is distinct from old.client_id
       or new.scope_id is distinct from old.scope_id then
      raise exception 'Budget category identity is immutable';
    end if;

    if new.owner_id is distinct from old.owner_id then
      select s.household_id
        into v_household_id
        from public.planly_budget_scopes s
       where s.id=new.scope_id
         and s.scope_type='household'
         and s.owner_id=new.owner_id;

      if v_household_id is null
         or not exists(
           select 1
           from public.planly_household_members m
           where m.household_id=v_household_id
             and m.user_id=new.owner_id
             and m.role='owner'
         ) then
        raise exception 'Budget category owner can change only with Household ownership';
      end if;
    end if;

  elsif tg_table_name='planly_budget_targets' then
    if new.client_id is distinct from old.client_id
       or new.scope_id is distinct from old.scope_id then
      raise exception 'Budget target identity is immutable';
    end if;

    if new.owner_id is distinct from old.owner_id then
      select s.household_id
        into v_household_id
        from public.planly_budget_scopes s
       where s.id=new.scope_id
         and s.scope_type='household'
         and s.owner_id=new.owner_id;

      if v_household_id is null
         or not exists(
           select 1
           from public.planly_household_members m
           where m.household_id=v_household_id
             and m.user_id=new.owner_id
             and m.role='owner'
         ) then
        raise exception 'Budget target owner can change only with Household ownership';
      end if;
    end if;

  elsif tg_table_name='planly_budget_entries' then
    if new.owner_id is distinct from old.owner_id
       or new.client_id is distinct from old.client_id
       or new.scope_id is distinct from old.scope_id then
      raise exception 'Budget entry identity is immutable';
    end if;
  end if;

  return new;
end
$$;

revoke all on function public.planly_budget_protect_identity() from public, anon, authenticated;

create or replace function public.planly_transfer_household_ownership(
  p_household_id uuid,
  p_new_owner uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user uuid := auth.uid();
  v_caller_role text;
  v_target_role text;
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  if p_new_owner is null or p_new_owner = v_user then
    raise exception 'Choose another household member';
  end if;

  perform 1
    from public.planly_households
   where id = p_household_id
   for update;

  if not found then
    raise exception 'Not authorized';
  end if;

  select role
    into v_caller_role
    from public.planly_household_members
   where household_id = p_household_id
     and user_id = v_user
   for update;

  if v_caller_role is distinct from 'owner' then
    raise exception 'Not authorized';
  end if;

  select role
    into v_target_role
    from public.planly_household_members
   where household_id = p_household_id
     and user_id = p_new_owner
   for update;

  if v_target_role is distinct from 'member' then
    raise exception 'Target must be a current household member';
  end if;

  update public.planly_household_members
     set role = 'member'
   where household_id = p_household_id
     and user_id = v_user
     and role = 'owner';

  if not found then
    raise exception 'Ownership changed; refresh and try again';
  end if;

  update public.planly_household_members
     set role = 'owner'
   where household_id = p_household_id
     and user_id = p_new_owner
     and role = 'member';

  if not found then
    raise exception 'Target must be a current household member';
  end if;

  -- Budget plan structure follows Household administration.
  -- Ledger entries remain creator-owned and are deliberately not reassigned.
  update public.planly_budget_scopes
     set owner_id = p_new_owner
   where household_id = p_household_id
     and scope_type = 'household';

  update public.planly_budget_categories c
     set owner_id = p_new_owner
   where exists (
     select 1
       from public.planly_budget_scopes s
      where s.id = c.scope_id
        and s.household_id = p_household_id
        and s.scope_type = 'household'
   );

  update public.planly_budget_targets t
     set owner_id = p_new_owner
   where exists (
     select 1
       from public.planly_budget_scopes s
      where s.id = t.scope_id
        and s.household_id = p_household_id
        and s.scope_type = 'household'
   );
end
$$;

create or replace function public.planly_delete_household(
  p_household_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  perform 1
    from public.planly_households h
    join public.planly_household_members m
      on m.household_id = h.id
     and m.user_id = v_user
     and m.role = 'owner'
   where h.id = p_household_id
   for update of h;

  if not found then
    raise exception 'Not authorized';
  end if;

  -- A Household Budget is explicitly shared Household data. Remove it before
  -- deleting the Household because Budget foreign keys intentionally use RESTRICT.
  delete from public.planly_budget_entries e
   where exists (
     select 1 from public.planly_budget_scopes s
      where s.id=e.scope_id
        and s.household_id=p_household_id
        and s.scope_type='household'
   );

  delete from public.planly_budget_targets t
   where exists (
     select 1 from public.planly_budget_scopes s
      where s.id=t.scope_id
        and s.household_id=p_household_id
        and s.scope_type='household'
   );

  delete from public.planly_budget_categories c
   where exists (
     select 1 from public.planly_budget_scopes s
      where s.id=c.scope_id
        and s.household_id=p_household_id
        and s.scope_type='household'
   );

  delete from public.planly_budget_scopes
   where household_id=p_household_id
     and scope_type='household';

  delete from public.planly_households
   where id = p_household_id;
end
$$;

revoke all on function public.planly_transfer_household_ownership(uuid, uuid) from public, anon;
revoke all on function public.planly_delete_household(uuid) from public, anon;

grant execute on function public.planly_transfer_household_ownership(uuid, uuid) to authenticated;
grant execute on function public.planly_delete_household(uuid) to authenticated;

notify pgrst, 'reload schema';
