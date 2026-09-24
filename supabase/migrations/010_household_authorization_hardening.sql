-- Planly 3.3A authorization hardening.
-- Bind helper authorization to auth.uid() even if a caller supplies the legacy optional p_user_id.

create or replace function public.planly_is_household_member(p_household_id uuid, p_user_id uuid default auth.uid())
returns boolean language sql stable security definer
set search_path = pg_catalog, public
as $$ select exists(select 1 from public.planly_household_members m where m.household_id=p_household_id and m.user_id=auth.uid()) $$;

create or replace function public.planly_is_household_owner(p_household_id uuid, p_user_id uuid default auth.uid())
returns boolean language sql stable security definer
set search_path = pg_catalog, public
as $$ select exists(select 1 from public.planly_household_members m where m.household_id=p_household_id and m.user_id=auth.uid() and m.role='owner') $$;

create or replace function public.planly_create_household_invite(p_household_id uuid,p_email text)
returns text language plpgsql security definer
set search_path = pg_catalog, public, extensions
as $$
declare v_user uuid:=auth.uid(); v_email text:=lower(btrim(p_email)); v_token text; v_hash text;
begin
  if v_user is null or not public.planly_is_household_owner(p_household_id) then raise exception 'Not authorized'; end if;
  if v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' or char_length(v_email)>320 then raise exception 'Invalid email'; end if;
  update public.planly_household_invites set status='expired' where household_id=p_household_id and status='pending' and expires_at<=now();
  if exists(select 1 from auth.users u join public.planly_household_members m on m.user_id=u.id where m.household_id=p_household_id and lower(u.email)=v_email) then raise exception 'Already a member'; end if;
  if exists(select 1 from public.planly_household_invites where household_id=p_household_id and lower(invited_email)=v_email and status='pending' and expires_at>now()) then raise exception 'Invite already pending'; end if;
  v_token:=encode(gen_random_bytes(32),'hex');
  v_hash:=encode(digest(v_token,'sha256'),'hex');
  insert into public.planly_household_invites(household_id,invited_email,invited_by,token_hash) values(p_household_id,v_email,v_user,v_hash);
  return v_token;
end $$;

create or replace function public.planly_revoke_household_invite(p_invite_id uuid)
returns void language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare v_h uuid;
begin
  select household_id into v_h from public.planly_household_invites where id=p_invite_id;
  if v_h is null or not public.planly_is_household_owner(v_h) then raise exception 'Not authorized'; end if;
  update public.planly_household_invites set status='revoked' where id=p_invite_id and status='pending';
end $$;
