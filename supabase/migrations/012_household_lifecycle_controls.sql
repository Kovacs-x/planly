-- Planly 3.3A Household lifecycle controls
-- Owner-only ownership transfer and household deletion.
-- All authorization is derived from auth.uid(); browser-supplied ownership is never trusted.

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

  delete from public.planly_households
   where id = p_household_id;
end
$$;

revoke all on function public.planly_transfer_household_ownership(uuid, uuid) from public, anon;
revoke all on function public.planly_delete_household(uuid) from public, anon;

grant execute on function public.planly_transfer_household_ownership(uuid, uuid) to authenticated;
grant execute on function public.planly_delete_household(uuid) to authenticated;

notify pgrst, 'reload schema';
