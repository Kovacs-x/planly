-- Planly 3.3A Household foundation
-- Household membership is authoritative. Existing Planly owner-only data remains private.

create table if not exists public.planly_households (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.planly_household_members (
  household_id uuid not null references public.planly_households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','member')),
  joined_at timestamptz not null default now(),
  primary key (household_id,user_id)
);

create unique index if not exists planly_household_one_owner_idx
  on public.planly_household_members(household_id) where role='owner';
create index if not exists planly_household_members_user_idx
  on public.planly_household_members(user_id);

create table if not exists public.planly_household_invites (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.planly_households(id) on delete cascade,
  invited_email text not null check (char_length(btrim(invited_email)) between 3 and 320),
  invited_by uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique,
  status text not null default 'pending' check (status in ('pending','accepted','revoked','expired')),
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_by uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at > created_at)
);

create unique index if not exists planly_household_pending_email_idx
  on public.planly_household_invites(household_id,lower(invited_email)) where status='pending';
create index if not exists planly_household_invites_email_idx
  on public.planly_household_invites(lower(invited_email),status,expires_at);

alter table public.planly_households enable row level security;
alter table public.planly_household_members enable row level security;
alter table public.planly_household_invites enable row level security;

-- SECURITY DEFINER helpers avoid recursive membership-policy evaluation.
create or replace function public.planly_is_household_member(p_household_id uuid, p_user_id uuid default auth.uid())
returns boolean language sql stable security definer
set search_path = pg_catalog, public
as $$ select exists(select 1 from public.planly_household_members m where m.household_id=p_household_id and m.user_id=p_user_id) $$;

create or replace function public.planly_is_household_owner(p_household_id uuid, p_user_id uuid default auth.uid())
returns boolean language sql stable security definer
set search_path = pg_catalog, public
as $$ select exists(select 1 from public.planly_household_members m where m.household_id=p_household_id and m.user_id=p_user_id and m.role='owner') $$;

revoke all on function public.planly_is_household_member(uuid,uuid) from public, anon;
revoke all on function public.planly_is_household_owner(uuid,uuid) from public, anon;
grant execute on function public.planly_is_household_member(uuid,uuid) to authenticated;
grant execute on function public.planly_is_household_owner(uuid,uuid) to authenticated;

drop policy if exists planly_households_select_member on public.planly_households;
create policy planly_households_select_member on public.planly_households
for select to authenticated using (public.planly_is_household_member(id));

drop policy if exists planly_household_members_select_member on public.planly_household_members;
create policy planly_household_members_select_member on public.planly_household_members
for select to authenticated using (public.planly_is_household_member(household_id));

drop policy if exists planly_household_invites_select_owner on public.planly_household_invites;
create policy planly_household_invites_select_owner on public.planly_household_invites
for select to authenticated using (public.planly_is_household_owner(household_id));

revoke all on public.planly_households, public.planly_household_members, public.planly_household_invites from anon, authenticated;
grant select on public.planly_households, public.planly_household_members, public.planly_household_invites to authenticated;

-- Mutations are deliberately RPC-only. Clients never insert membership rows directly.
create or replace function public.planly_create_household(p_name text)
returns uuid language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare v_user uuid:=auth.uid(); v_id uuid;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if nullif(btrim(p_name),'') is null or char_length(btrim(p_name))>80 then raise exception 'Invalid household name'; end if;
  if exists(select 1 from public.planly_household_members where user_id=v_user) then raise exception 'Already in a household'; end if;
  insert into public.planly_households(name,created_by) values(btrim(p_name),v_user) returning id into v_id;
  insert into public.planly_household_members(household_id,user_id,role) values(v_id,v_user,'owner');
  return v_id;
end $$;

create or replace function public.planly_create_household_invite(p_household_id uuid,p_email text)
returns text language plpgsql security definer
set search_path = pg_catalog, public, extensions
as $$
declare v_user uuid:=auth.uid(); v_email text:=lower(btrim(p_email)); v_token text; v_hash text;
begin
  if v_user is null or not public.planly_is_household_owner(p_household_id,v_user) then raise exception 'Not authorized'; end if;
  if v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' or char_length(v_email)>320 then raise exception 'Invalid email'; end if;
  update public.planly_household_invites set status='expired' where household_id=p_household_id and status='pending' and expires_at<=now();
  if exists(select 1 from auth.users u join public.planly_household_members m on m.user_id=u.id where m.household_id=p_household_id and lower(u.email)=v_email) then raise exception 'Already a member'; end if;
  if exists(select 1 from public.planly_household_invites where household_id=p_household_id and lower(invited_email)=v_email and status='pending' and expires_at>now()) then raise exception 'Invite already pending'; end if;
  v_token:=encode(gen_random_bytes(32),'hex');
  v_hash:=encode(digest(v_token,'sha256'),'hex');
  insert into public.planly_household_invites(household_id,invited_email,invited_by,token_hash) values(p_household_id,v_email,v_user,v_hash);
  return v_token;
end $$;

create or replace function public.planly_accept_household_invite(p_token text)
returns uuid language plpgsql security definer
set search_path = pg_catalog, public, extensions
as $$
declare v_user uuid:=auth.uid(); v_email text; v_inv public.planly_household_invites%rowtype; v_hash text;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  select lower(email) into v_email from auth.users where id=v_user;
  if v_email is null then raise exception 'Verified account email required'; end if;
  v_hash:=encode(digest(p_token,'sha256'),'hex');
  select * into v_inv from public.planly_household_invites where token_hash=v_hash for update;
  if not found or v_inv.status<>'pending' or v_inv.expires_at<=now() then raise exception 'Invite is invalid or expired'; end if;
  if lower(v_inv.invited_email)<>v_email then raise exception 'Invite belongs to another account'; end if;
  if exists(select 1 from public.planly_household_members where user_id=v_user) then raise exception 'Already in a household'; end if;
  insert into public.planly_household_members(household_id,user_id,role) values(v_inv.household_id,v_user,'member');
  update public.planly_household_invites set status='accepted',accepted_by=v_user,accepted_at=now() where id=v_inv.id;
  return v_inv.household_id;
end $$;

create or replace function public.planly_revoke_household_invite(p_invite_id uuid)
returns void language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare v_h uuid;
begin
  select household_id into v_h from public.planly_household_invites where id=p_invite_id;
  if v_h is null or not public.planly_is_household_owner(v_h,auth.uid()) then raise exception 'Not authorized'; end if;
  update public.planly_household_invites set status='revoked' where id=p_invite_id and status='pending';
end $$;

create or replace function public.planly_leave_household(p_household_id uuid)
returns void language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare v_user uuid:=auth.uid(); v_role text;
begin
  select role into v_role from public.planly_household_members where household_id=p_household_id and user_id=v_user;
  if v_role is null then raise exception 'Not a member'; end if;
  if v_role='owner' then raise exception 'Owner cannot leave without transferring or deleting the household'; end if;
  delete from public.planly_household_members where household_id=p_household_id and user_id=v_user;
end $$;

revoke all on function public.planly_create_household(text) from public, anon;
revoke all on function public.planly_create_household_invite(uuid,text) from public, anon;
revoke all on function public.planly_accept_household_invite(text) from public, anon;
revoke all on function public.planly_revoke_household_invite(uuid) from public, anon;
revoke all on function public.planly_leave_household(uuid) from public, anon;
grant execute on function public.planly_create_household(text), public.planly_create_household_invite(uuid,text), public.planly_accept_household_invite(text), public.planly_revoke_household_invite(uuid), public.planly_leave_household(uuid) to authenticated;

notify pgrst, 'reload schema';
