-- Planly 4.0A prerequisite: enforce the product's two-person household invariant
-- at the server boundary. UI limits are not authorization/integrity boundaries.

create or replace function public.planly_create_household_invite(p_household_id uuid, p_email text)
returns text language plpgsql security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_user uuid:=auth.uid();
  v_email text:=lower(btrim(p_email));
  v_token text;
  v_hash text;
begin
  if v_user is null or not public.planly_is_household_owner(p_household_id) then raise exception 'Not authorized'; end if;
  if v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' or char_length(v_email)>320 then raise exception 'Invalid email'; end if;

  -- Serialize membership/invite admission for this household so concurrent calls
  -- cannot create a path to a third member.
  perform 1 from public.planly_households where id=p_household_id for update;
  if not found then raise exception 'Household not found'; end if;

  update public.planly_household_invites
     set status='expired'
   where household_id=p_household_id and status='pending' and expires_at<=now();

  if (select count(*) from public.planly_household_members where household_id=p_household_id) >= 2 then
    raise exception 'Household already has two members';
  end if;

  if exists(select 1 from auth.users u join public.planly_household_members m on m.user_id=u.id where m.household_id=p_household_id and lower(u.email)=v_email) then raise exception 'Already a member'; end if;
  if exists(select 1 from public.planly_household_invites where household_id=p_household_id and lower(invited_email)=v_email and status='pending' and expires_at>now()) then raise exception 'Invite already pending'; end if;

  v_token:=encode(gen_random_bytes(32),'hex');
  v_hash:=encode(digest(v_token,'sha256'),'hex');
  insert into public.planly_household_invites(household_id,invited_email,invited_by,token_hash)
  values(p_household_id,v_email,v_user,v_hash);
  return v_token;
end $$;

create or replace function public.planly_accept_household_invite(p_token text)
returns uuid language plpgsql security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_user uuid:=auth.uid();
  v_email text;
  v_inv public.planly_household_invites%rowtype;
  v_hash text;
begin
  if v_user is null then raise exception 'Authentication required'; end if;

  select lower(email) into v_email
    from auth.users
   where id=v_user and email is not null and email_confirmed_at is not null;
  if v_email is null then raise exception 'Verified account email required'; end if;

  v_hash:=encode(digest(p_token,'sha256'),'hex');
  select * into v_inv
    from public.planly_household_invites
   where token_hash=v_hash
   for update;

  if not found or v_inv.status<>'pending' or v_inv.expires_at<=now() then raise exception 'Invite is invalid or expired'; end if;
  if lower(v_inv.invited_email)<>v_email then raise exception 'Invite belongs to another account'; end if;
  if exists(select 1 from public.planly_household_members where user_id=v_user) then raise exception 'Already in a household'; end if;

  -- Serialize admission against invite creation/other acceptance for this household.
  perform 1 from public.planly_households where id=v_inv.household_id for update;
  if not found then raise exception 'Household not found'; end if;
  if (select count(*) from public.planly_household_members where household_id=v_inv.household_id) >= 2 then
    raise exception 'Household already has two members';
  end if;

  begin
    insert into public.planly_household_members(household_id,user_id,role)
    values(v_inv.household_id,v_user,'member');
  exception when unique_violation then
    raise exception 'Already in a household';
  end;

  update public.planly_household_invites
     set status='accepted', accepted_by=v_user, accepted_at=now()
   where id=v_inv.id;
  return v_inv.household_id;
end $$;

revoke all on function public.planly_create_household_invite(uuid,text) from public, anon;
revoke all on function public.planly_accept_household_invite(text) from public, anon;
grant execute on function public.planly_create_household_invite(uuid,text), public.planly_accept_household_invite(text) to authenticated;

notify pgrst, 'reload schema';
