-- Planly 3.3A membership and invite hardening
-- Enforce one household membership per account at the database layer and
-- require a confirmed account email when accepting an invitation.

create unique index if not exists planly_household_members_one_household_per_user_idx
  on public.planly_household_members(user_id);

drop index if exists public.planly_household_members_user_idx;

create or replace function public.planly_create_household(p_name text)
returns uuid language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare v_user uuid:=auth.uid(); v_id uuid;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if nullif(btrim(p_name),'') is null or char_length(btrim(p_name))>80 then raise exception 'Invalid household name'; end if;
  if exists(select 1 from public.planly_household_members where user_id=v_user) then raise exception 'Already in a household'; end if;

  insert into public.planly_households(name,created_by)
  values(btrim(p_name),v_user)
  returning id into v_id;

  begin
    insert into public.planly_household_members(household_id,user_id,role)
    values(v_id,v_user,'owner');
  exception
    when unique_violation then
      raise exception 'Already in a household';
  end;

  return v_id;
end $$;

create or replace function public.planly_accept_household_invite(p_token text)
returns uuid language plpgsql security definer
set search_path = pg_catalog, public, extensions
as $$
declare v_user uuid:=auth.uid(); v_email text; v_inv public.planly_household_invites%rowtype; v_hash text;
begin
  if v_user is null then raise exception 'Authentication required'; end if;

  select lower(email)
    into v_email
    from auth.users
   where id=v_user
     and email is not null
     and email_confirmed_at is not null;

  if v_email is null then raise exception 'Verified account email required'; end if;

  v_hash:=encode(digest(p_token,'sha256'),'hex');

  select *
    into v_inv
    from public.planly_household_invites
   where token_hash=v_hash
   for update;

  if not found or v_inv.status<>'pending' or v_inv.expires_at<=now() then
    raise exception 'Invite is invalid or expired';
  end if;

  if lower(v_inv.invited_email)<>v_email then
    raise exception 'Invite belongs to another account';
  end if;

  if exists(select 1 from public.planly_household_members where user_id=v_user) then
    raise exception 'Already in a household';
  end if;

  begin
    insert into public.planly_household_members(household_id,user_id,role)
    values(v_inv.household_id,v_user,'member');
  exception
    when unique_violation then
      raise exception 'Already in a household';
  end;

  update public.planly_household_invites
     set status='accepted',
         accepted_by=v_user,
         accepted_at=now()
   where id=v_inv.id;

  return v_inv.household_id;
end $$;

revoke all on function public.planly_create_household(text) from public, anon;
revoke all on function public.planly_accept_household_invite(text) from public, anon;
grant execute on function public.planly_create_household(text), public.planly_accept_household_invite(text) to authenticated;

notify pgrst, 'reload schema';
