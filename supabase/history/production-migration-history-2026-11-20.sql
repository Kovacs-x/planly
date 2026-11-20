-- ARCHIVE. DO NOT RUN.
-- Production's migration history (supabase_migrations.schema_migrations, project dtniwcwjucepsjzoojuc), exported
-- read-only on 20 Nov 2026 before the history repair that replaces these timestamp versions with the repo's
-- 001-068 file versions (see docs/production-drift-2026-11.md). It is the only record of exactly what production ran,
-- including three migrations with no repo file (credential_rpc_explicit_grants, household_caller_bound_helpers,
-- shared_projects_broadcast) and production's own version of shared_projects_foundation. Checked before export: no
-- secrets, keys, user or household ids, UUID literals or email addresses. 001-007 and 056-062 were run in the SQL
-- Editor and were never recorded here.
-- 51 migrations.

-- ====================================================================================================
-- version 20260924135632  name security_hardening
-- ====================================================================================================
revoke execute on function public.handle_new_planly_user() from public, anon, authenticated;
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
revoke execute on function public.bump_planly_cloud_version() from public, anon, authenticated;
revoke execute on function public.touch_planly_updated_at() from public, anon, authenticated;
revoke all on table public.calendar_source_credentials from anon, authenticated;
revoke execute on function public.get_calendar_source_feed_url(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.replace_external_calendar_events(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.get_calendar_source_feed_url(uuid, uuid) to service_role;
grant execute on function public.replace_external_calendar_events(uuid, uuid, jsonb) to service_role;

-- ====================================================================================================
-- version 20260924135713  name credential_rpc_explicit_grants
-- ====================================================================================================
revoke execute on function public.set_calendar_source_credential(uuid, text) from public, anon;
revoke execute on function public.delete_calendar_source_credential(uuid) from public, anon;
grant execute on function public.set_calendar_source_credential(uuid, text) to authenticated;
grant execute on function public.delete_calendar_source_credential(uuid) to authenticated;

-- ====================================================================================================
-- version 20260924143832  name household_foundation
-- ====================================================================================================
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

-- ====================================================================================================
-- version 20260924150958  name household_caller_bound_helpers
-- ====================================================================================================
create or replace function public.planly_is_household_member(p_household_id uuid, p_user_id uuid default auth.uid())
returns boolean language sql stable security definer
set search_path = pg_catalog, public
as $$ select exists(select 1 from public.planly_household_members m where m.household_id=p_household_id and m.user_id=auth.uid()) $$;
create or replace function public.planly_is_household_owner(p_household_id uuid, p_user_id uuid default auth.uid())
returns boolean language sql stable security definer
set search_path = pg_catalog, public
as $$ select exists(select 1 from public.planly_household_members m where m.household_id=p_household_id and m.user_id=auth.uid() and m.role='owner') $$;
create or replace function public.planly_create_household_invite(p_household_id uuid,p_email text)
returns text language plpgsql security definer set search_path = pg_catalog, public, extensions as $$
declare v_user uuid:=auth.uid(); v_email text:=lower(btrim(p_email)); v_token text; v_hash text;
begin
 if v_user is null or not public.planly_is_household_owner(p_household_id) then raise exception 'Not authorized'; end if;
 if v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' or char_length(v_email)>320 then raise exception 'Invalid email'; end if;
 update public.planly_household_invites set status='expired' where household_id=p_household_id and status='pending' and expires_at<=now();
 if exists(select 1 from auth.users u join public.planly_household_members m on m.user_id=u.id where m.household_id=p_household_id and lower(u.email)=v_email) then raise exception 'Already a member'; end if;
 if exists(select 1 from public.planly_household_invites where household_id=p_household_id and lower(invited_email)=v_email and status='pending' and expires_at>now()) then raise exception 'Invite already pending'; end if;
 v_token:=encode(gen_random_bytes(32),'hex'); v_hash:=encode(digest(v_token,'sha256'),'hex');
 insert into public.planly_household_invites(household_id,invited_email,invited_by,token_hash) values(p_household_id,v_email,v_user,v_hash);
 return v_token;
end $$;
create or replace function public.planly_revoke_household_invite(p_invite_id uuid)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_h uuid;
begin
 select household_id into v_h from public.planly_household_invites where id=p_invite_id;
 if v_h is null or not public.planly_is_household_owner(v_h) then raise exception 'Not authorized'; end if;
 update public.planly_household_invites set status='revoked' where id=p_invite_id and status='pending';
end $$;

-- ====================================================================================================
-- version 20260924152249  name household_authorization_hardening
-- ====================================================================================================
-- Planly 3.3A Household authorization hardening
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

-- ====================================================================================================
-- version 20260924160121  name household_lifecycle_controls
-- ====================================================================================================
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

-- ====================================================================================================
-- version 20260924202357  name shared_tasks_foundation
-- ====================================================================================================
alter table public.planly_tasks
  add column visibility text not null default 'private',
  add column household_id uuid null references public.planly_households(id) on delete set null;
alter table public.planly_tasks add constraint planly_tasks_visibility_chk check (visibility in ('private','household'));
create index planly_tasks_household_updated_idx on public.planly_tasks (household_id, updated_at) where visibility='household' and deleted_at is null;
create or replace function public.planly_task_share_target_valid(p_visibility text,p_household_id uuid) returns boolean language sql stable security definer set search_path=pg_catalog,public as $function$
select case when p_visibility='private' then p_household_id is null when p_visibility='household' then p_household_id is not null and exists(select 1 from public.planly_household_members m where m.household_id=p_household_id and m.user_id=auth.uid()) else false end
$function$;
revoke all on function public.planly_task_share_target_valid(text,uuid) from public,anon;
grant execute on function public.planly_task_share_target_valid(text,uuid) to authenticated;
drop policy if exists planly_tasks_select_own on public.planly_tasks;
drop policy if exists planly_tasks_insert_own on public.planly_tasks;
drop policy if exists planly_tasks_update_own on public.planly_tasks;
create policy planly_tasks_select_visible on public.planly_tasks for select to authenticated using ((select auth.uid())=owner_id or (visibility='household' and household_id is not null and public.planly_is_household_member(household_id)));
create policy planly_tasks_insert_own on public.planly_tasks for insert to authenticated with check ((select auth.uid())=owner_id and public.planly_task_share_target_valid(visibility,household_id));
create policy planly_tasks_update_owner on public.planly_tasks for update to authenticated using ((select auth.uid())=owner_id) with check ((select auth.uid())=owner_id and public.planly_task_share_target_valid(visibility,household_id));
create or replace function public.planly_private_tasks_on_household_delete() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $function$
begin
 update public.planly_tasks set visibility='private',household_id=null,data=(data-'visibility'-'householdId')||jsonb_build_object('visibility','private'),client_updated_at=greatest(client_updated_at,(extract(epoch from clock_timestamp())*1000)::bigint) where household_id=old.id;
 return old;
end $function$;
revoke all on function public.planly_private_tasks_on_household_delete() from public,anon,authenticated;
drop trigger if exists planly_private_tasks_before_household_delete on public.planly_households;
create trigger planly_private_tasks_before_household_delete before delete on public.planly_households for each row execute function public.planly_private_tasks_on_household_delete();

-- ====================================================================================================
-- version 20260924224827  name shared_tasks_realtime
-- ====================================================================================================
alter publication supabase_realtime add table public.planly_tasks;

-- ====================================================================================================
-- version 20260924225009  name household_task_broadcast
-- ====================================================================================================
alter publication supabase_realtime drop table public.planly_tasks;

drop policy if exists planly_household_task_broadcast_receive on realtime.messages;
create policy planly_household_task_broadcast_receive
on realtime.messages
for select
to authenticated
using (
  realtime.messages.extension = 'broadcast'
  and (select realtime.topic()) ~ '^household:[0-9a-fA-F-]{36}$'
  and public.planly_is_household_member(split_part((select realtime.topic()), ':', 2)::uuid)
);

create or replace function public.planly_broadcast_household_task_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare v_household uuid;
begin
  v_household := case when tg_op='DELETE' then old.household_id else coalesce(new.household_id,old.household_id) end;
  if v_household is not null then
    perform realtime.broadcast_changes(
      'household:'||v_household::text,
      tg_op,
      tg_op,
      tg_table_name,
      tg_table_schema,
      case when tg_op='DELETE' then null else new end,
      case when tg_op='INSERT' then null else old end
    );
  end if;
  return case when tg_op='DELETE' then old else new end;
end
$function$;
revoke all on function public.planly_broadcast_household_task_change() from public,anon,authenticated;
drop trigger if exists planly_household_task_broadcast on public.planly_tasks;
create trigger planly_household_task_broadcast after insert or update or delete on public.planly_tasks for each row execute function public.planly_broadcast_household_task_change();

-- ====================================================================================================
-- version 20260924233815  name household_task_assignment
-- ====================================================================================================
alter table public.planly_tasks add column assignee_id uuid null references auth.users(id) on delete set null;

create index planly_tasks_household_assignee_idx on public.planly_tasks(household_id,assignee_id,updated_at) where visibility='household' and deleted_at is null;

create or replace function public.planly_task_share_target_valid(p_visibility text,p_household_id uuid,p_assignee_id uuid) returns boolean language sql stable security definer set search_path=pg_catalog,public as $function$
select case
 when p_visibility='private' then p_household_id is null and p_assignee_id is null
 when p_visibility='household' then p_household_id is not null
   and exists(select 1 from public.planly_household_members m where m.household_id=p_household_id and m.user_id=auth.uid())
   and (p_assignee_id is null or exists(select 1 from public.planly_household_members a where a.household_id=p_household_id and a.user_id=p_assignee_id))
 else false end
$function$;
revoke all on function public.planly_task_share_target_valid(text,uuid,uuid) from public,anon;
grant execute on function public.planly_task_share_target_valid(text,uuid,uuid) to authenticated;

alter table public.planly_tasks add constraint planly_tasks_assignment_scope_chk check ((visibility='household' and household_id is not null) or assignee_id is null);

drop policy if exists planly_tasks_insert_own on public.planly_tasks;
drop policy if exists planly_tasks_update_owner on public.planly_tasks;
create policy planly_tasks_insert_own on public.planly_tasks for insert to authenticated with check ((select auth.uid())=owner_id and public.planly_task_share_target_valid(visibility,household_id,assignee_id));
create policy planly_tasks_update_owner on public.planly_tasks for update to authenticated using ((select auth.uid())=owner_id) with check ((select auth.uid())=owner_id and public.planly_task_share_target_valid(visibility,household_id,assignee_id));

create or replace function public.planly_clear_household_task_assignee() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $function$
begin
 update public.planly_tasks set assignee_id=null,data=data-'assigneeId',client_updated_at=greatest(client_updated_at,(extract(epoch from clock_timestamp())*1000)::bigint) where household_id=old.household_id and assignee_id=old.user_id;
 return old;
end $function$;
revoke all on function public.planly_clear_household_task_assignee() from public,anon,authenticated;
drop trigger if exists planly_clear_task_assignee_before_member_delete on public.planly_household_members;
create trigger planly_clear_task_assignee_before_member_delete before delete on public.planly_household_members for each row execute function public.planly_clear_household_task_assignee();

create or replace function public.planly_private_tasks_on_household_delete() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $function$
begin
 update public.planly_tasks set visibility='private',household_id=null,assignee_id=null,data=(data-'visibility'-'householdId'-'assigneeId')||jsonb_build_object('visibility','private'),client_updated_at=greatest(client_updated_at,(extract(epoch from clock_timestamp())*1000)::bigint) where household_id=old.id;
 return old;
end $function$;
revoke all on function public.planly_private_tasks_on_household_delete() from public,anon,authenticated;

-- ====================================================================================================
-- version 20260925021101  name assignee_task_completion
-- ====================================================================================================
create or replace function public.planly_set_assigned_task_completed(
  p_owner_id uuid,
  p_client_id text,
  p_completed boolean
)
returns public.planly_tasks
language plpgsql
security definer
set search_path=pg_catalog,public
as $function$
declare
  v_task public.planly_tasks;
  v_now bigint := (extract(epoch from clock_timestamp())*1000)::bigint;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;

  select * into v_task from public.planly_tasks t
   where t.owner_id=p_owner_id and t.client_id=p_client_id and t.deleted_at is null
   for update;
  if not found then raise exception 'Task not found' using errcode='P0002'; end if;

  if v_task.visibility <> 'household'
     or v_task.household_id is null
     or v_task.assignee_id <> auth.uid()
     or not exists (select 1 from public.planly_household_members m where m.household_id=v_task.household_id and m.user_id=auth.uid()) then
    raise exception 'Only the current assignee may complete this task' using errcode='42501';
  end if;

  if v_task.completed is not distinct from p_completed then return v_task; end if;

  update public.planly_tasks t
     set completed=p_completed,
         data=jsonb_set(coalesce(t.data,'{}'::jsonb),'{completed}',to_jsonb(p_completed),true),
         client_updated_at=greatest(t.client_updated_at,v_now)
   where t.owner_id=p_owner_id and t.client_id=p_client_id
   returning * into v_task;

  return v_task;
end
$function$;

alter function public.planly_set_assigned_task_completed(uuid,text,boolean) owner to postgres;
revoke all on function public.planly_set_assigned_task_completed(uuid,text,boolean) from public,anon;
grant execute on function public.planly_set_assigned_task_completed(uuid,text,boolean) to authenticated;

-- ====================================================================================================
-- version 20260925043432  name shared_projects_foundation
-- ====================================================================================================
alter table public.planly_projects
  add column if not exists visibility text not null default 'private',
  add column if not exists household_id uuid references public.planly_households(id) on delete set null;

alter table public.planly_projects
  drop constraint if exists planly_projects_visibility_check;
alter table public.planly_projects
  add constraint planly_projects_visibility_check
  check (visibility in ('private','household'));

alter table public.planly_projects
  drop constraint if exists planly_projects_household_visibility_check;
alter table public.planly_projects
  add constraint planly_projects_household_visibility_check
  check ((visibility = 'private' and household_id is null) or (visibility = 'household' and household_id is not null));

create index if not exists planly_projects_household_active_idx
  on public.planly_projects (household_id, deleted_at)
  where visibility = 'household';

-- Existing projects remain private. Keep embedded JSON aligned with authoritative columns.
update public.planly_projects
set data = jsonb_set(jsonb_set(data, '{visibility}', '"private"'::jsonb, true), '{householdId}', 'null'::jsonb, true),
    visibility = 'private',
    household_id = null
where visibility = 'private'
  and ((data->>'visibility') is distinct from 'private' or data ? 'householdId');

-- Household sharing is an additional read path only. Creator ownership remains the mutation boundary.
drop policy if exists planly_projects_select_own on public.planly_projects;
create policy planly_projects_select_authorized
on public.planly_projects
for select
to authenticated
using (
  (select auth.uid()) = owner_id
  or (
    visibility = 'household'
    and household_id is not null
    and public.planly_is_household_member(household_id)
  )
);

-- Do not weaken creator-only writes. A creator may only mark a project household-visible
-- when they are actually a member of that household.
drop policy if exists planly_projects_insert_own on public.planly_projects;
create policy planly_projects_insert_own
on public.planly_projects
for insert
to authenticated
with check (
  (select auth.uid()) = owner_id
  and (
    (visibility = 'private' and household_id is null)
    or (
      visibility = 'household'
      and household_id is not null
      and public.planly_is_household_member(household_id)
    )
  )
);

drop policy if exists planly_projects_update_own on public.planly_projects;
create policy planly_projects_update_own
on public.planly_projects
for update
to authenticated
using ((select auth.uid()) = owner_id)
with check (
  (select auth.uid()) = owner_id
  and (
    (visibility = 'private' and household_id is null)
    or (
      visibility = 'household'
      and household_id is not null
      and public.planly_is_household_member(household_id)
    )
  )
);

-- Cross-entity invariant: a household-shared task may reference only a household-shared
-- project in the same household, owned by the same creator. This prevents private-project
-- identifiers/metadata from leaking through shared tasks.
create or replace function public.planly_validate_task_project_visibility()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  p_visibility text;
  p_household_id uuid;
  p_owner_id uuid;
begin
  if new.project_client_id is null or btrim(new.project_client_id) = '' then
    return new;
  end if;

  select p.visibility, p.household_id, p.owner_id
    into p_visibility, p_household_id, p_owner_id
  from public.planly_projects p
  where p.owner_id = new.owner_id
    and p.client_id = new.project_client_id
    and p.deleted_at is null;

  if not found then
    raise exception 'Referenced Planly project is unavailable';
  end if;

  if new.visibility = 'household'
     and not (p_visibility = 'household'
              and p_household_id = new.household_id
              and p_owner_id = new.owner_id) then
    raise exception 'Household tasks may reference only household projects in the same household';
  end if;

  return new;
end;
$$;

revoke all on function public.planly_validate_task_project_visibility() from public, anon, authenticated;

-- Internal trigger function only; callers never execute it directly.
drop trigger if exists planly_tasks_validate_project_visibility on public.planly_tasks;
create trigger planly_tasks_validate_project_visibility
before insert or update of owner_id, project_client_id, visibility, household_id
on public.planly_tasks
for each row
execute function public.planly_validate_task_project_visibility();

-- ====================================================================================================
-- version 20260925043929  name shared_projects_integrity
-- ====================================================================================================
alter table public.planly_projects drop constraint if exists planly_projects_visibility_data_chk;
alter table public.planly_projects add constraint planly_projects_visibility_data_chk check (coalesce(data->>'visibility','private')=visibility and ((visibility='private' and nullif(data->>'householdId','') is null) or (visibility='household' and data->>'householdId'=household_id::text)));

alter table public.planly_tasks drop constraint if exists planly_tasks_project_reference_consistency_chk;
alter table public.planly_tasks add constraint planly_tasks_project_reference_consistency_chk check (nullif(btrim(project_client_id),'') is not distinct from nullif(btrim(data->>'projectId'),''));

create or replace function public.planly_detach_tasks_before_project_restrict()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $function$
declare v_now bigint := (extract(epoch from clock_timestamp())*1000)::bigint;
begin
  if old.deleted_at is null and new.deleted_at is not null then
    update public.planly_tasks set project_client_id=null,data=data-'projectId',client_updated_at=greatest(client_updated_at,v_now)
    where owner_id=old.owner_id and project_client_id=old.client_id and deleted_at is null;
  elsif old.visibility='household' and (new.visibility<>'household' or new.household_id is distinct from old.household_id) then
    update public.planly_tasks set project_client_id=null,data=data-'projectId',client_updated_at=greatest(client_updated_at,v_now)
    where owner_id=old.owner_id and project_client_id=old.client_id and visibility='household' and household_id is not distinct from old.household_id and deleted_at is null;
  end if;
  return new;
end $function$;
revoke all on function public.planly_detach_tasks_before_project_restrict() from public,anon,authenticated;
drop trigger if exists planly_detach_tasks_before_project_restrict on public.planly_projects;
create trigger planly_detach_tasks_before_project_restrict before update of visibility,household_id,deleted_at on public.planly_projects for each row execute function public.planly_detach_tasks_before_project_restrict();

create or replace function public.planly_private_departing_member_projects()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $function$
declare v_now bigint := (extract(epoch from clock_timestamp())*1000)::bigint;
begin
  update public.planly_projects set visibility='private',household_id=null,data=(data-'householdId')||jsonb_build_object('visibility','private'),client_updated_at=greatest(client_updated_at,v_now)
  where owner_id=old.user_id and household_id=old.household_id and visibility='household' and deleted_at is null;
  return old;
end $function$;
revoke all on function public.planly_private_departing_member_projects() from public,anon,authenticated;
drop trigger if exists planly_private_departing_member_projects_before_delete on public.planly_household_members;
create trigger planly_private_departing_member_projects_before_delete before delete on public.planly_household_members for each row execute function public.planly_private_departing_member_projects();

notify pgrst,'reload schema';

-- ====================================================================================================
-- version 20260925044112  name shared_projects_household_delete
-- ====================================================================================================
create or replace function public.planly_private_tasks_on_household_delete()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $function$
declare v_now bigint := (extract(epoch from clock_timestamp())*1000)::bigint;
begin
  update public.planly_tasks set visibility='private',household_id=null,assignee_id=null,data=(data-'visibility'-'householdId'-'assigneeId')||jsonb_build_object('visibility','private'),client_updated_at=greatest(client_updated_at,v_now) where household_id=old.id;
  update public.planly_projects set visibility='private',household_id=null,data=(data-'householdId')||jsonb_build_object('visibility','private'),client_updated_at=greatest(client_updated_at,v_now) where household_id=old.id;
  return old;
end $function$;
revoke all on function public.planly_private_tasks_on_household_delete() from public,anon,authenticated;

-- ====================================================================================================
-- version 20260925044301  name shared_projects_broadcast
-- ====================================================================================================
-- Planly 3.3C — secure live invalidation for Household project changes.
-- Broadcast contains only an invalidation event. Clients always re-read through project RLS.

create or replace function public.planly_broadcast_household_project_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_household uuid;
begin
  v_household := case
    when tg_op = 'DELETE' then old.household_id
    else coalesce(new.household_id, old.household_id)
  end;

  if v_household is not null then
    perform realtime.broadcast_changes(
      'household:' || v_household::text,
      tg_op,
      tg_op,
      tg_table_name,
      tg_table_schema,
      case when tg_op = 'DELETE' then null else new end,
      case when tg_op = 'INSERT' then null else old end
    );
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end
$function$;

revoke all on function public.planly_broadcast_household_project_change() from public, anon, authenticated;

drop trigger if exists planly_household_project_broadcast on public.planly_projects;
create trigger planly_household_project_broadcast
after insert or update or delete on public.planly_projects
for each row execute function public.planly_broadcast_household_project_change();

-- ====================================================================================================
-- version 20260925064152  name household_release_gate_hardening
-- ====================================================================================================
-- Planly 3.3D — release-gate hardening without broadening authorization.
create index if not exists planly_tasks_assignee_id_idx on public.planly_tasks (assignee_id) where assignee_id is not null;
drop policy if exists planly_preferences_select_own on public.planly_preferences;
create policy planly_preferences_select_own on public.planly_preferences for select to authenticated using ((select auth.uid()) = owner_id);
drop policy if exists planly_preferences_insert_own on public.planly_preferences;
create policy planly_preferences_insert_own on public.planly_preferences for insert to authenticated with check ((select auth.uid()) = owner_id);
drop policy if exists planly_preferences_update_own on public.planly_preferences;
create policy planly_preferences_update_own on public.planly_preferences for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
drop policy if exists planly_sync_state_select_own on public.planly_sync_state;
create policy planly_sync_state_select_own on public.planly_sync_state for select to authenticated using ((select auth.uid()) = owner_id);
drop policy if exists planly_sync_state_insert_own on public.planly_sync_state;
create policy planly_sync_state_insert_own on public.planly_sync_state for insert to authenticated with check ((select auth.uid()) = owner_id);
drop policy if exists planly_sync_state_update_own on public.planly_sync_state;
create policy planly_sync_state_update_own on public.planly_sync_state for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);

-- ====================================================================================================
-- version 20260925064233  name assignee_completion_null_guard
-- ====================================================================================================
create or replace function public.planly_set_assigned_task_completed(p_owner_id uuid,p_client_id text,p_completed boolean) returns public.planly_tasks language plpgsql security definer set search_path = pg_catalog, public as $$ declare v_task public.planly_tasks; v_now bigint := (extract(epoch from clock_timestamp())*1000)::bigint; begin if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if; select * into v_task from public.planly_tasks t where t.owner_id=p_owner_id and t.client_id=p_client_id and t.deleted_at is null for update; if not found then raise exception 'Task not found' using errcode='P0002'; end if; if v_task.visibility <> 'household' or v_task.household_id is null or v_task.assignee_id is distinct from auth.uid() or not exists (select 1 from public.planly_household_members m where m.household_id=v_task.household_id and m.user_id=auth.uid()) then raise exception 'Only the current assignee may complete this task' using errcode='42501'; end if; if v_task.completed is not distinct from p_completed then return v_task; end if; update public.planly_tasks t set completed=p_completed,data=jsonb_set(coalesce(t.data,'{}'::jsonb),'{completed}',to_jsonb(p_completed),true),client_updated_at=greatest(t.client_updated_at,v_now) where t.owner_id=p_owner_id and t.client_id=p_client_id returning * into v_task; return v_task; end $$; revoke all on function public.planly_set_assigned_task_completed(uuid,text,boolean) from public, anon; grant execute on function public.planly_set_assigned_task_completed(uuid,text,boolean) to authenticated;

-- ====================================================================================================
-- version 20260925092503  name cloud_native_account_sync_readiness
-- ====================================================================================================
create or replace function public.handle_new_planly_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'display_name',
      new.raw_user_meta_data ->> 'full_name',
      split_part(coalesce(new.email, ''), '@', 1)
    )
  );

  -- Accounts created after cloud sync is part of normal Planly onboarding have
  -- no legacy local dataset to migrate. Mark their empty migration boundary as
  -- complete at account creation so authenticated bootstrap is writable by
  -- default. Existing legacy accounts retain their explicit migration gate.
  insert into public.planly_sync_state (
    owner_id,
    initial_migration_completed_at,
    migration_project_count,
    migration_task_count,
    migration_digest,
    last_successful_sync_at
  ) values (
    new.id,
    now(),
    0,
    0,
    'cloud-native-account',
    now()
  )
  on conflict (owner_id) do nothing;

  return new;
end;
$function$;

-- Accounts created during the 3.3 household release-gate were created after
-- cloud sync was already mandatory and therefore never had a legacy dataset to
-- migrate. Initialize only those cloud-native accounts that still lack a sync
-- state row; older accounts keep the migration safeguard unchanged.
insert into public.planly_sync_state (
  owner_id,
  initial_migration_completed_at,
  migration_project_count,
  migration_task_count,
  migration_digest,
  last_successful_sync_at
)
select u.id, now(), 0, 0, 'cloud-native-account', now()
from auth.users u
where u.created_at >= timestamptz '2026-09-24 00:00:00+00'
  and not exists (
    select 1 from public.planly_sync_state s where s.owner_id = u.id
  );

revoke all on function public.handle_new_planly_user() from public, anon, authenticated;

-- ====================================================================================================
-- version 20260925192350  name planly_post_33_fk_index_hardening
-- ====================================================================================================
create index if not exists calendar_source_credentials_owner_id_idx on public.calendar_source_credentials(owner_id);
create index if not exists planly_household_invites_accepted_by_idx on public.planly_household_invites(accepted_by) where accepted_by is not null;
create index if not exists planly_household_invites_invited_by_idx on public.planly_household_invites(invited_by);
create index if not exists planly_households_created_by_idx on public.planly_households(created_by);

-- ====================================================================================================
-- version 20260925192608  name planly_post_33_internal_helper_permissions
-- ====================================================================================================
revoke execute on function public.planly_is_household_member(uuid,uuid) from public, anon, authenticated;
revoke execute on function public.planly_is_household_owner(uuid,uuid) from public, anon, authenticated;
revoke execute on function public.planly_task_share_target_valid(text,uuid) from public, anon, authenticated;
revoke execute on function public.planly_task_share_target_valid(text,uuid,uuid) from public, anon, authenticated;

-- ====================================================================================================
-- version 20260925203318  name household_two_member_invariant
-- ====================================================================================================
create or replace function public.planly_create_household_invite(p_household_id uuid, p_email text)
returns text language plpgsql security definer
set search_path = pg_catalog, public, extensions
as $$
declare v_user uuid:=auth.uid(); v_email text:=lower(btrim(p_email)); v_token text; v_hash text;
begin
  if v_user is null or not public.planly_is_household_owner(p_household_id) then raise exception 'Not authorized'; end if;
  if v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' or char_length(v_email)>320 then raise exception 'Invalid email'; end if;
  perform 1 from public.planly_households where id=p_household_id for update;
  if not found then raise exception 'Household not found'; end if;
  update public.planly_household_invites set status='expired' where household_id=p_household_id and status='pending' and expires_at<=now();
  if (select count(*) from public.planly_household_members where household_id=p_household_id) >= 2 then raise exception 'Household already has two members'; end if;
  if exists(select 1 from auth.users u join public.planly_household_members m on m.user_id=u.id where m.household_id=p_household_id and lower(u.email)=v_email) then raise exception 'Already a member'; end if;
  if exists(select 1 from public.planly_household_invites where household_id=p_household_id and lower(invited_email)=v_email and status='pending' and expires_at>now()) then raise exception 'Invite already pending'; end if;
  v_token:=encode(gen_random_bytes(32),'hex'); v_hash:=encode(digest(v_token,'sha256'),'hex');
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
  select lower(email) into v_email from auth.users where id=v_user and email is not null and email_confirmed_at is not null;
  if v_email is null then raise exception 'Verified account email required'; end if;
  v_hash:=encode(digest(p_token,'sha256'),'hex');
  select * into v_inv from public.planly_household_invites where token_hash=v_hash for update;
  if not found or v_inv.status<>'pending' or v_inv.expires_at<=now() then raise exception 'Invite is invalid or expired'; end if;
  if lower(v_inv.invited_email)<>v_email then raise exception 'Invite belongs to another account'; end if;
  if exists(select 1 from public.planly_household_members where user_id=v_user) then raise exception 'Already in a household'; end if;
  perform 1 from public.planly_households where id=v_inv.household_id for update;
  if not found then raise exception 'Household not found'; end if;
  if (select count(*) from public.planly_household_members where household_id=v_inv.household_id) >= 2 then raise exception 'Household already has two members'; end if;
  begin insert into public.planly_household_members(household_id,user_id,role) values(v_inv.household_id,v_user,'member');
  exception when unique_violation then raise exception 'Already in a household'; end;
  update public.planly_household_invites set status='accepted',accepted_by=v_user,accepted_at=now() where id=v_inv.id;
  return v_inv.household_id;
end $$;
revoke all on function public.planly_create_household_invite(uuid,text) from public, anon;
revoke all on function public.planly_accept_household_invite(text) from public, anon;
grant execute on function public.planly_create_household_invite(uuid,text), public.planly_accept_household_invite(text) to authenticated;
notify pgrst, 'reload schema';

-- ====================================================================================================
-- version 20260925203335  name budget_foundation
-- ====================================================================================================
create table public.planly_budget_scopes (id uuid primary key default gen_random_uuid(),owner_id uuid not null references auth.users(id) on delete restrict,household_id uuid references public.planly_households(id) on delete restrict,scope_type text not null check (scope_type in ('personal','household')),name text not null default 'Budget' check (char_length(btrim(name)) between 1 and 80),currency text not null default 'GBP' check (currency ~ '^[A-Z]{3}$'),client_id text not null,client_created_at bigint,client_updated_at bigint not null,cloud_version bigint not null default 1 check (cloud_version >= 1),deleted_at timestamptz,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),constraint planly_budget_scope_target_check check ((scope_type='personal' and household_id is null) or (scope_type='household' and household_id is not null)),unique(owner_id,client_id));
create unique index planly_budget_one_personal_scope_idx on public.planly_budget_scopes(owner_id) where scope_type='personal' and deleted_at is null;
create unique index planly_budget_one_household_scope_idx on public.planly_budget_scopes(household_id) where scope_type='household' and deleted_at is null;
create index planly_budget_scopes_household_idx on public.planly_budget_scopes(household_id) where household_id is not null;
create table public.planly_budget_categories (id uuid primary key default gen_random_uuid(),scope_id uuid not null references public.planly_budget_scopes(id) on delete restrict,owner_id uuid not null references auth.users(id) on delete restrict,client_id text not null,name text not null check (char_length(btrim(name)) between 1 and 80),kind text not null check (kind in ('income','expense')),sort_order integer not null default 0,archived boolean not null default false,client_created_at bigint,client_updated_at bigint not null,cloud_version bigint not null default 1 check (cloud_version >= 1),deleted_at timestamptz,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(scope_id,client_id),unique(scope_id,id));
create index planly_budget_categories_scope_idx on public.planly_budget_categories(scope_id) where deleted_at is null;
create table public.planly_budget_targets (id uuid primary key default gen_random_uuid(),scope_id uuid not null references public.planly_budget_scopes(id) on delete restrict,category_id uuid not null,owner_id uuid not null references auth.users(id) on delete restrict,client_id text not null,budget_month date not null check (budget_month=date_trunc('month',budget_month)::date),amount_minor bigint not null check (amount_minor >= 0),client_created_at bigint,client_updated_at bigint not null,cloud_version bigint not null default 1 check (cloud_version >= 1),deleted_at timestamptz,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(scope_id,client_id),foreign key (scope_id,category_id) references public.planly_budget_categories(scope_id,id) on delete restrict);
create unique index planly_budget_targets_active_month_category_idx on public.planly_budget_targets(scope_id,category_id,budget_month) where deleted_at is null;
create index planly_budget_targets_scope_month_idx on public.planly_budget_targets(scope_id,budget_month) where deleted_at is null;
create table public.planly_budget_entries (id uuid primary key default gen_random_uuid(),scope_id uuid not null references public.planly_budget_scopes(id) on delete restrict,category_id uuid not null,owner_id uuid not null references auth.users(id) on delete restrict,client_id text not null,kind text not null check (kind in ('income','expense')),amount_minor bigint not null check (amount_minor > 0),entry_date date not null,description text not null default '' check (char_length(description) <= 200),notes text not null default '' check (char_length(notes) <= 2000),client_created_at bigint,client_updated_at bigint not null,cloud_version bigint not null default 1 check (cloud_version >= 1),deleted_at timestamptz,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(owner_id,client_id),foreign key (scope_id,category_id) references public.planly_budget_categories(scope_id,id) on delete restrict);
create index planly_budget_entries_scope_date_idx on public.planly_budget_entries(scope_id,entry_date) where deleted_at is null;
create index planly_budget_entries_owner_updated_idx on public.planly_budget_entries(owner_id,updated_at);
create trigger planly_budget_scopes_bump_version before update on public.planly_budget_scopes for each row execute function public.bump_planly_cloud_version();
create trigger planly_budget_categories_bump_version before update on public.planly_budget_categories for each row execute function public.bump_planly_cloud_version();
create trigger planly_budget_targets_bump_version before update on public.planly_budget_targets for each row execute function public.bump_planly_cloud_version();
create trigger planly_budget_entries_bump_version before update on public.planly_budget_entries for each row execute function public.bump_planly_cloud_version();
alter table public.planly_budget_scopes enable row level security; alter table public.planly_budget_categories enable row level security; alter table public.planly_budget_targets enable row level security; alter table public.planly_budget_entries enable row level security;
create policy planly_budget_scopes_select_authorized on public.planly_budget_scopes for select to authenticated using ((select auth.uid())=owner_id or (scope_type='household' and household_id is not null and public.planly_is_household_member(household_id)));
create policy planly_budget_scopes_insert_authorized on public.planly_budget_scopes for insert to authenticated with check ((select auth.uid())=owner_id and ((scope_type='personal' and household_id is null) or (scope_type='household' and household_id is not null and public.planly_is_household_owner(household_id))));
create policy planly_budget_scopes_update_authorized on public.planly_budget_scopes for update to authenticated using ((select auth.uid())=owner_id and (scope_type='personal' or (scope_type='household' and public.planly_is_household_owner(household_id)))) with check ((select auth.uid())=owner_id and ((scope_type='personal' and household_id is null) or (scope_type='household' and household_id is not null and public.planly_is_household_owner(household_id))));
create policy planly_budget_categories_select_authorized on public.planly_budget_categories for select to authenticated using (exists(select 1 from public.planly_budget_scopes s where s.id=scope_id));
create policy planly_budget_categories_insert_admin on public.planly_budget_categories for insert to authenticated with check ((select auth.uid())=owner_id and exists(select 1 from public.planly_budget_scopes s where s.id=scope_id and s.owner_id=(select auth.uid()) and (s.scope_type='personal' or public.planly_is_household_owner(s.household_id))));
create policy planly_budget_categories_update_admin on public.planly_budget_categories for update to authenticated using ((select auth.uid())=owner_id and exists(select 1 from public.planly_budget_scopes s where s.id=scope_id and s.owner_id=(select auth.uid()) and (s.scope_type='personal' or public.planly_is_household_owner(s.household_id)))) with check ((select auth.uid())=owner_id and exists(select 1 from public.planly_budget_scopes s where s.id=scope_id and s.owner_id=(select auth.uid()) and (s.scope_type='personal' or public.planly_is_household_owner(s.household_id))));
create policy planly_budget_targets_select_authorized on public.planly_budget_targets for select to authenticated using (exists(select 1 from public.planly_budget_scopes s where s.id=scope_id));
create policy planly_budget_targets_insert_admin on public.planly_budget_targets for insert to authenticated with check ((select auth.uid())=owner_id and exists(select 1 from public.planly_budget_scopes s where s.id=scope_id and s.owner_id=(select auth.uid()) and (s.scope_type='personal' or public.planly_is_household_owner(s.household_id))));
create policy planly_budget_targets_update_admin on public.planly_budget_targets for update to authenticated using ((select auth.uid())=owner_id and exists(select 1 from public.planly_budget_scopes s where s.id=scope_id and s.owner_id=(select auth.uid()) and (s.scope_type='personal' or public.planly_is_household_owner(s.household_id)))) with check ((select auth.uid())=owner_id and exists(select 1 from public.planly_budget_scopes s where s.id=scope_id and s.owner_id=(select auth.uid()) and (s.scope_type='personal' or public.planly_is_household_owner(s.household_id))));
create policy planly_budget_entries_select_authorized on public.planly_budget_entries for select to authenticated using ((select auth.uid())=owner_id or exists(select 1 from public.planly_budget_scopes s where s.id=scope_id and s.scope_type='household' and public.planly_is_household_member(s.household_id)));
create policy planly_budget_entries_insert_own on public.planly_budget_entries for insert to authenticated with check ((select auth.uid())=owner_id and exists(select 1 from public.planly_budget_scopes s where s.id=scope_id and (s.owner_id=(select auth.uid()) or (s.scope_type='household' and public.planly_is_household_member(s.household_id)))));
create policy planly_budget_entries_update_own on public.planly_budget_entries for update to authenticated using ((select auth.uid())=owner_id) with check ((select auth.uid())=owner_id and exists(select 1 from public.planly_budget_scopes s where s.id=scope_id and (s.owner_id=(select auth.uid()) or (s.scope_type='household' and public.planly_is_household_member(s.household_id)))));
revoke all on public.planly_budget_scopes,public.planly_budget_categories,public.planly_budget_targets,public.planly_budget_entries from anon; revoke all on public.planly_budget_scopes,public.planly_budget_categories,public.planly_budget_targets,public.planly_budget_entries from authenticated; grant select,insert,update on public.planly_budget_scopes,public.planly_budget_categories,public.planly_budget_targets,public.planly_budget_entries to authenticated; notify pgrst, 'reload schema';

-- ====================================================================================================
-- version 20260925203437  name restore_rls_helper_execution
-- ====================================================================================================
revoke all on function public.planly_is_household_member(uuid,uuid) from public, anon; revoke all on function public.planly_is_household_owner(uuid,uuid) from public, anon; grant execute on function public.planly_is_household_member(uuid,uuid) to authenticated; grant execute on function public.planly_is_household_owner(uuid,uuid) to authenticated; revoke all on function public.planly_task_share_target_valid(text,uuid) from public, anon; revoke all on function public.planly_task_share_target_valid(text,uuid,uuid) from public, anon; grant execute on function public.planly_task_share_target_valid(text,uuid) to authenticated; grant execute on function public.planly_task_share_target_valid(text,uuid,uuid) to authenticated;

-- ====================================================================================================
-- version 20260925203524  name budget_integrity_hardening
-- ====================================================================================================
alter table public.planly_budget_categories add constraint planly_budget_categories_scope_id_kind_key unique(scope_id,id,kind); alter table public.planly_budget_entries add constraint planly_budget_entries_category_kind_fkey foreign key (scope_id,category_id,kind) references public.planly_budget_categories(scope_id,id,kind) on delete restrict; create or replace function public.planly_budget_protect_identity() returns trigger language plpgsql set search_path=pg_catalog,public as $$ begin if tg_table_name='planly_budget_scopes' then if new.owner_id is distinct from old.owner_id or new.client_id is distinct from old.client_id or new.scope_type is distinct from old.scope_type or new.household_id is distinct from old.household_id then raise exception 'Budget scope identity is immutable'; end if; elsif tg_table_name='planly_budget_categories' then if new.owner_id is distinct from old.owner_id or new.client_id is distinct from old.client_id or new.scope_id is distinct from old.scope_id then raise exception 'Budget category identity is immutable'; end if; elsif tg_table_name='planly_budget_targets' then if new.owner_id is distinct from old.owner_id or new.client_id is distinct from old.client_id or new.scope_id is distinct from old.scope_id then raise exception 'Budget target identity is immutable'; end if; elsif tg_table_name='planly_budget_entries' then if new.owner_id is distinct from old.owner_id or new.client_id is distinct from old.client_id or new.scope_id is distinct from old.scope_id then raise exception 'Budget entry identity is immutable'; end if; end if; return new; end $$; revoke all on function public.planly_budget_protect_identity() from public,anon,authenticated; create trigger planly_budget_scopes_protect_identity before update on public.planly_budget_scopes for each row execute function public.planly_budget_protect_identity(); create trigger planly_budget_categories_protect_identity before update on public.planly_budget_categories for each row execute function public.planly_budget_protect_identity(); create trigger planly_budget_targets_protect_identity before update on public.planly_budget_targets for each row execute function public.planly_budget_protect_identity(); create trigger planly_budget_entries_protect_identity before update on public.planly_budget_entries for each row execute function public.planly_budget_protect_identity();

-- ====================================================================================================
-- version 20260925203649  name private_rls_authorization_helpers
-- ====================================================================================================
create schema if not exists planly_private; revoke all on schema planly_private from public,anon; grant usage on schema planly_private to authenticated; create or replace function planly_private.is_household_member(p_household_id uuid) returns boolean language sql stable security definer set search_path=pg_catalog,public as $$ select exists(select 1 from public.planly_household_members m where m.household_id=p_household_id and m.user_id=auth.uid()) $$; create or replace function planly_private.is_household_owner(p_household_id uuid) returns boolean language sql stable security definer set search_path=pg_catalog,public as $$ select exists(select 1 from public.planly_household_members m where m.household_id=p_household_id and m.user_id=auth.uid() and m.role='owner') $$; create or replace function planly_private.task_share_target_valid(p_visibility text,p_household_id uuid,p_assignee_id uuid) returns boolean language sql stable security definer set search_path=pg_catalog,public as $$ select case when p_visibility='private' then p_household_id is null and p_assignee_id is null when p_visibility='household' then p_household_id is not null and exists(select 1 from public.planly_household_members m where m.household_id=p_household_id and m.user_id=auth.uid()) and (p_assignee_id is null or exists(select 1 from public.planly_household_members a where a.household_id=p_household_id and a.user_id=p_assignee_id)) else false end $$; revoke all on function planly_private.is_household_member(uuid) from public,anon; revoke all on function planly_private.is_household_owner(uuid) from public,anon; revoke all on function planly_private.task_share_target_valid(text,uuid,uuid) from public,anon; grant execute on function planly_private.is_household_member(uuid),planly_private.is_household_owner(uuid),planly_private.task_share_target_valid(text,uuid,uuid) to authenticated;
drop policy if exists planly_household_members_select_member on public.planly_household_members; create policy planly_household_members_select_member on public.planly_household_members for select to authenticated using(planly_private.is_household_member(household_id)); drop policy if exists planly_households_select_member on public.planly_households; create policy planly_households_select_member on public.planly_households for select to authenticated using(planly_private.is_household_member(id)); drop policy if exists planly_household_invites_select_owner on public.planly_household_invites; create policy planly_household_invites_select_owner on public.planly_household_invites for select to authenticated using(planly_private.is_household_owner(household_id));
drop policy if exists planly_projects_select_authorized on public.planly_projects; create policy planly_projects_select_authorized on public.planly_projects for select to authenticated using((select auth.uid())=owner_id or (visibility='household' and household_id is not null and planly_private.is_household_member(household_id))); drop policy if exists planly_projects_insert_own on public.planly_projects; create policy planly_projects_insert_own on public.planly_projects for insert to authenticated with check((select auth.uid())=owner_id and ((visibility='private' and household_id is null) or (visibility='household' and household_id is not null and planly_private.is_household_member(household_id)))); drop policy if exists planly_projects_update_own on public.planly_projects; create policy planly_projects_update_own on public.planly_projects for update to authenticated using((select auth.uid())=owner_id) with check((select auth.uid())=owner_id and ((visibility='private' and household_id is null) or (visibility='household' and household_id is not null and planly_private.is_household_member(household_id))));
drop policy if exists planly_tasks_select_visible on public.planly_tasks; create policy planly_tasks_select_visible on public.planly_tasks for select to authenticated using((select auth.uid())=owner_id or (visibility='household' and household_id is not null and planly_private.is_household_member(household_id))); drop policy if exists planly_tasks_insert_own on public.planly_tasks; create policy planly_tasks_insert_own on public.planly_tasks for insert to authenticated with check((select auth.uid())=owner_id and planly_private.task_share_target_valid(visibility,household_id,assignee_id)); drop policy if exists planly_tasks_update_owner on public.planly_tasks; create policy planly_tasks_update_owner on public.planly_tasks for update to authenticated using((select auth.uid())=owner_id) with check((select auth.uid())=owner_id and planly_private.task_share_target_valid(visibility,household_id,assignee_id));
drop policy if exists planly_budget_scopes_select_authorized on public.planly_budget_scopes; create policy planly_budget_scopes_select_authorized on public.planly_budget_scopes for select to authenticated using((select auth.uid())=owner_id or (scope_type='household' and household_id is not null and planly_private.is_household_member(household_id))); drop policy if exists planly_budget_scopes_insert_authorized on public.planly_budget_scopes; create policy planly_budget_scopes_insert_authorized on public.planly_budget_scopes for insert to authenticated with check((select auth.uid())=owner_id and ((scope_type='personal' and household_id is null) or (scope_type='household' and household_id is not null and planly_private.is_household_owner(household_id)))); drop policy if exists planly_budget_scopes_update_authorized on public.planly_budget_scopes; create policy planly_budget_scopes_update_authorized on public.planly_budget_scopes for update to authenticated using((select auth.uid())=owner_id and (scope_type='personal' or (scope_type='household' and planly_private.is_household_owner(household_id)))) with check((select auth.uid())=owner_id and ((scope_type='personal' and household_id is null) or (scope_type='household' and household_id is not null and planly_private.is_household_owner(household_id))));
drop policy if exists planly_budget_categories_insert_admin on public.planly_budget_categories; create policy planly_budget_categories_insert_admin on public.planly_budget_categories for insert to authenticated with check((select auth.uid())=owner_id and exists(select 1 from public.planly_budget_scopes s where s.id=scope_id and s.owner_id=(select auth.uid()) and (s.scope_type='personal' or planly_private.is_household_owner(s.household_id)))); drop policy if exists planly_budget_categories_update_admin on public.planly_budget_categories; create policy planly_budget_categories_update_admin on public.planly_budget_categories for update to authenticated using((select auth.uid())=owner_id and exists(select 1 from public.planly_budget_scopes s where s.id=scope_id and s.owner_id=(select auth.uid()) and (s.scope_type='personal' or planly_private.is_household_owner(s.household_id)))) with check((select auth.uid())=owner_id and exists(select 1 from public.planly_budget_scopes s where s.id=scope_id and s.owner_id=(select auth.uid()) and (s.scope_type='personal' or planly_private.is_household_owner(s.household_id)))); drop policy if exists planly_budget_targets_insert_admin on public.planly_budget_targets; create policy planly_budget_targets_insert_admin on public.planly_budget_targets for insert to authenticated with check((select auth.uid())=owner_id and exists(select 1 from public.planly_budget_scopes s where s.id=scope_id and s.owner_id=(select auth.uid()) and (s.scope_type='personal' or planly_private.is_household_owner(s.household_id)))); drop policy if exists planly_budget_targets_update_admin on public.planly_budget_targets; create policy planly_budget_targets_update_admin on public.planly_budget_targets for update to authenticated using((select auth.uid())=owner_id and exists(select 1 from public.planly_budget_scopes s where s.id=scope_id and s.owner_id=(select auth.uid()) and (s.scope_type='personal' or planly_private.is_household_owner(s.household_id)))) with check((select auth.uid())=owner_id and exists(select 1 from public.planly_budget_scopes s where s.id=scope_id and s.owner_id=(select auth.uid()) and (s.scope_type='personal' or planly_private.is_household_owner(s.household_id))));
drop policy if exists planly_budget_entries_select_authorized on public.planly_budget_entries; create policy planly_budget_entries_select_authorized on public.planly_budget_entries for select to authenticated using((select auth.uid())=owner_id or exists(select 1 from public.planly_budget_scopes s where s.id=scope_id and s.scope_type='household' and planly_private.is_household_member(s.household_id))); drop policy if exists planly_budget_entries_insert_own on public.planly_budget_entries; create policy planly_budget_entries_insert_own on public.planly_budget_entries for insert to authenticated with check((select auth.uid())=owner_id and exists(select 1 from public.planly_budget_scopes s where s.id=scope_id and (s.owner_id=(select auth.uid()) or (s.scope_type='household' and planly_private.is_household_member(s.household_id))))); drop policy if exists planly_budget_entries_update_own on public.planly_budget_entries; create policy planly_budget_entries_update_own on public.planly_budget_entries for update to authenticated using((select auth.uid())=owner_id) with check((select auth.uid())=owner_id and exists(select 1 from public.planly_budget_scopes s where s.id=scope_id and (s.owner_id=(select auth.uid()) or (s.scope_type='household' and planly_private.is_household_member(s.household_id)))));
revoke execute on function public.planly_is_household_member(uuid,uuid) from public,anon,authenticated; revoke execute on function public.planly_is_household_owner(uuid,uuid) from public,anon,authenticated; revoke execute on function public.planly_task_share_target_valid(text,uuid) from public,anon,authenticated; revoke execute on function public.planly_task_share_target_valid(text,uuid,uuid) from public,anon,authenticated;

-- ====================================================================================================
-- version 20260925203713  name budget_fk_indexes
-- ====================================================================================================
create index if not exists planly_budget_categories_owner_id_idx on public.planly_budget_categories(owner_id); create index if not exists planly_budget_targets_owner_id_idx on public.planly_budget_targets(owner_id); create index if not exists planly_budget_entries_scope_category_kind_idx on public.planly_budget_entries(scope_id,category_id,kind);

-- ====================================================================================================
-- version 20260926051433  name planly_budget_allocation_model
-- ====================================================================================================
alter table public.planly_budget_categories add column if not exists icon_key text not null default 'wallet', add column if not exists color_key text not null default 'violet';
alter table public.planly_budget_entries add column if not exists allocation_status text not null default 'planned', add column if not exists due_day smallint, add column if not exists recurring_monthly boolean not null default true;
alter table public.planly_budget_entries drop constraint if exists planly_budget_entries_allocation_status_check;
alter table public.planly_budget_entries add constraint planly_budget_entries_allocation_status_check check (allocation_status in ('planned','paid'));
alter table public.planly_budget_entries drop constraint if exists planly_budget_entries_due_day_check;
alter table public.planly_budget_entries add constraint planly_budget_entries_due_day_check check (due_day is null or due_day between 1 and 31);
comment on column public.planly_budget_entries.description is 'Allocation/commitment name for manual budgeting, not an imported bank transaction merchant.';
comment on column public.planly_budget_entries.allocation_status is 'Manual allocation state: planned or paid.';

-- ====================================================================================================
-- version 20260927041812  name household_budget_lifecycle_closeout
-- ====================================================================================================
-- Planly 4.0 release closeout — keep Household lifecycle compatible with Household Budget.
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
           select 1 from public.planly_household_members m
           where m.household_id=old.household_id and m.user_id=new.owner_id and m.role='owner'
         ) then
        raise exception 'Budget scope owner can change only with Household ownership';
      end if;
    end if;
  elsif tg_table_name='planly_budget_categories' then
    if new.client_id is distinct from old.client_id or new.scope_id is distinct from old.scope_id then
      raise exception 'Budget category identity is immutable';
    end if;
    if new.owner_id is distinct from old.owner_id then
      select s.household_id into v_household_id
      from public.planly_budget_scopes s
      where s.id=new.scope_id and s.scope_type='household' and s.owner_id=new.owner_id;
      if v_household_id is null
         or not exists(
           select 1 from public.planly_household_members m
           where m.household_id=v_household_id and m.user_id=new.owner_id and m.role='owner'
         ) then
        raise exception 'Budget category owner can change only with Household ownership';
      end if;
    end if;
  elsif tg_table_name='planly_budget_targets' then
    if new.client_id is distinct from old.client_id or new.scope_id is distinct from old.scope_id then
      raise exception 'Budget target identity is immutable';
    end if;
    if new.owner_id is distinct from old.owner_id then
      select s.household_id into v_household_id
      from public.planly_budget_scopes s
      where s.id=new.scope_id and s.scope_type='household' and s.owner_id=new.owner_id;
      if v_household_id is null
         or not exists(
           select 1 from public.planly_household_members m
           where m.household_id=v_household_id and m.user_id=new.owner_id and m.role='owner'
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
  if v_user is null then raise exception 'Authentication required'; end if;
  if p_new_owner is null or p_new_owner = v_user then raise exception 'Choose another household member'; end if;
  perform 1 from public.planly_households where id = p_household_id for update;
  if not found then raise exception 'Not authorized'; end if;
  select role into v_caller_role from public.planly_household_members
   where household_id = p_household_id and user_id = v_user for update;
  if v_caller_role is distinct from 'owner' then raise exception 'Not authorized'; end if;
  select role into v_target_role from public.planly_household_members
   where household_id = p_household_id and user_id = p_new_owner for update;
  if v_target_role is distinct from 'member' then raise exception 'Target must be a current household member'; end if;
  update public.planly_household_members set role = 'member'
   where household_id = p_household_id and user_id = v_user and role = 'owner';
  if not found then raise exception 'Ownership changed; refresh and try again'; end if;
  update public.planly_household_members set role = 'owner'
   where household_id = p_household_id and user_id = p_new_owner and role = 'member';
  if not found then raise exception 'Target must be a current household member'; end if;
  update public.planly_budget_scopes set owner_id = p_new_owner
   where household_id = p_household_id and scope_type = 'household';
  update public.planly_budget_categories c set owner_id = p_new_owner
   where exists (select 1 from public.planly_budget_scopes s
                 where s.id = c.scope_id and s.household_id = p_household_id and s.scope_type = 'household');
  update public.planly_budget_targets t set owner_id = p_new_owner
   where exists (select 1 from public.planly_budget_scopes s
                 where s.id = t.scope_id and s.household_id = p_household_id and s.scope_type = 'household');
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
  if v_user is null then raise exception 'Authentication required'; end if;
  perform 1
    from public.planly_households h
    join public.planly_household_members m
      on m.household_id = h.id and m.user_id = v_user and m.role = 'owner'
   where h.id = p_household_id
   for update of h;
  if not found then raise exception 'Not authorized'; end if;

  delete from public.planly_budget_entries e
   where exists (select 1 from public.planly_budget_scopes s
                 where s.id=e.scope_id and s.household_id=p_household_id and s.scope_type='household');
  delete from public.planly_budget_targets t
   where exists (select 1 from public.planly_budget_scopes s
                 where s.id=t.scope_id and s.household_id=p_household_id and s.scope_type='household');
  delete from public.planly_budget_categories c
   where exists (select 1 from public.planly_budget_scopes s
                 where s.id=c.scope_id and s.household_id=p_household_id and s.scope_type='household');
  delete from public.planly_budget_scopes
   where household_id=p_household_id and scope_type='household';
  delete from public.planly_households where id = p_household_id;
end
$$;

revoke all on function public.planly_transfer_household_ownership(uuid, uuid) from public, anon;
revoke all on function public.planly_delete_household(uuid) from public, anon;
grant execute on function public.planly_transfer_household_ownership(uuid, uuid) to authenticated;
grant execute on function public.planly_delete_household(uuid) to authenticated;
notify pgrst, 'reload schema';

-- ====================================================================================================
-- version 20260927042518  name departing_member_privacy_closeout
-- ====================================================================================================
create or replace function public.planly_private_departing_member_tasks()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_now bigint := (extract(epoch from clock_timestamp())*1000)::bigint;
begin
  update public.planly_tasks
     set visibility='private',
         household_id=null,
         assignee_id=null,
         data=(data-'visibility'-'householdId'-'assigneeId')||jsonb_build_object('visibility','private'),
         client_updated_at=greatest(client_updated_at,v_now)
   where owner_id=old.user_id
     and household_id=old.household_id
     and visibility='household'
     and deleted_at is null;
  return old;
end
$$;

revoke all on function public.planly_private_departing_member_tasks() from public, anon, authenticated;

drop trigger if exists planly_private_departing_member_tasks_before_delete
  on public.planly_household_members;

create trigger planly_private_departing_member_tasks_before_delete
before delete on public.planly_household_members
for each row execute function public.planly_private_departing_member_tasks();

drop policy if exists planly_budget_entries_select_authorized
  on public.planly_budget_entries;

create policy planly_budget_entries_select_authorized
on public.planly_budget_entries
for select to authenticated
using (
  exists (
    select 1
      from public.planly_budget_scopes s
     where s.id=scope_id
  )
);

notify pgrst, 'reload schema';

-- ====================================================================================================
-- version 20260927044543  name collaborative_household_budget
-- ====================================================================================================
create or replace function public.planly_budget_shared_structure_owner(p_scope_id uuid)
returns uuid language sql stable security definer set search_path = pg_catalog, public as $$ select s.owner_id from public.planly_budget_scopes s where s.id=p_scope_id and s.scope_type='household' and s.household_id is not null and planly_private.is_household_member(s.household_id) limit 1 $$;
revoke all on function public.planly_budget_shared_structure_owner(uuid) from public, anon;
grant execute on function public.planly_budget_shared_structure_owner(uuid) to authenticated;
drop policy if exists planly_budget_categories_insert_admin on public.planly_budget_categories;
create policy planly_budget_categories_insert_admin on public.planly_budget_categories for insert to authenticated with check (((owner_id=(select auth.uid())) and exists(select 1 from public.planly_budget_scopes s where s.id=scope_id and s.scope_type='personal' and s.owner_id=(select auth.uid()))) or (owner_id=public.planly_budget_shared_structure_owner(scope_id) and owner_id is not null));
drop policy if exists planly_budget_categories_update_admin on public.planly_budget_categories;
create policy planly_budget_categories_update_admin on public.planly_budget_categories for update to authenticated using (((owner_id=(select auth.uid())) and exists(select 1 from public.planly_budget_scopes s where s.id=scope_id and s.scope_type='personal' and s.owner_id=(select auth.uid()))) or (owner_id=public.planly_budget_shared_structure_owner(scope_id) and owner_id is not null)) with check (((owner_id=(select auth.uid())) and exists(select 1 from public.planly_budget_scopes s where s.id=scope_id and s.scope_type='personal' and s.owner_id=(select auth.uid()))) or (owner_id=public.planly_budget_shared_structure_owner(scope_id) and owner_id is not null));
drop policy if exists planly_budget_targets_insert_admin on public.planly_budget_targets;
create policy planly_budget_targets_insert_admin on public.planly_budget_targets for insert to authenticated with check (((owner_id=(select auth.uid())) and exists(select 1 from public.planly_budget_scopes s where s.id=scope_id and s.scope_type='personal' and s.owner_id=(select auth.uid()))) or (owner_id=public.planly_budget_shared_structure_owner(scope_id) and owner_id is not null));
drop policy if exists planly_budget_targets_update_admin on public.planly_budget_targets;
create policy planly_budget_targets_update_admin on public.planly_budget_targets for update to authenticated using (((owner_id=(select auth.uid())) and exists(select 1 from public.planly_budget_scopes s where s.id=scope_id and s.scope_type='personal' and s.owner_id=(select auth.uid()))) or (owner_id=public.planly_budget_shared_structure_owner(scope_id) and owner_id is not null)) with check (((owner_id=(select auth.uid())) and exists(select 1 from public.planly_budget_scopes s where s.id=scope_id and s.scope_type='personal' and s.owner_id=(select auth.uid()))) or (owner_id=public.planly_budget_shared_structure_owner(scope_id) and owner_id is not null));
notify pgrst, 'reload schema';

-- ====================================================================================================
-- version 20260927045839  name shared_lists_4_1
-- ====================================================================================================
create table if not exists public.planly_lists (id uuid primary key,owner_id uuid not null references auth.users(id) on delete cascade,household_id uuid references public.planly_households(id) on delete cascade,client_id text not null,title text not null check (char_length(btrim(title)) between 1 and 120),visibility text not null default 'private' check (visibility in ('private','household')),sort_order integer not null default 0,client_created_at bigint not null,client_updated_at bigint not null,cloud_version bigint not null default 1,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),deleted_at timestamptz,unique(owner_id,client_id),constraint planly_lists_scope_ck check ((visibility='private' and household_id is null) or (visibility='household' and household_id is not null)));
create table if not exists public.planly_list_items (id uuid primary key,list_id uuid not null references public.planly_lists(id) on delete cascade,owner_id uuid not null references auth.users(id) on delete cascade,client_id text not null,title text not null check (char_length(btrim(title)) between 1 and 240),notes text not null default '' check (char_length(notes)<=1000),completed boolean not null default false,sort_order integer not null default 0,client_created_at bigint not null,client_updated_at bigint not null,cloud_version bigint not null default 1,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),deleted_at timestamptz,unique(owner_id,client_id));
create index if not exists planly_lists_owner_idx on public.planly_lists(owner_id) where deleted_at is null; create index if not exists planly_lists_household_idx on public.planly_lists(household_id) where visibility='household' and deleted_at is null; create index if not exists planly_list_items_list_idx on public.planly_list_items(list_id) where deleted_at is null;
alter table public.planly_lists enable row level security; alter table public.planly_list_items enable row level security; revoke all on public.planly_lists, public.planly_list_items from anon; grant select,insert,update,delete on public.planly_lists, public.planly_list_items to authenticated;
create or replace function public.planly_protect_list_identity() returns trigger language plpgsql set search_path=pg_catalog,public as $$ begin if tg_table_name='planly_lists' then if new.id is distinct from old.id or new.owner_id is distinct from old.owner_id or new.client_id is distinct from old.client_id or new.household_id is distinct from old.household_id or new.visibility is distinct from old.visibility then raise exception 'List identity and sharing scope are immutable'; end if; else if new.id is distinct from old.id or new.owner_id is distinct from old.owner_id or new.client_id is distinct from old.client_id or new.list_id is distinct from old.list_id then raise exception 'List item identity is immutable'; end if; end if; return new; end $$;
create trigger planly_lists_bump_version before update on public.planly_lists for each row execute function public.bump_planly_cloud_version(); create trigger planly_list_items_bump_version before update on public.planly_list_items for each row execute function public.bump_planly_cloud_version(); create trigger planly_lists_protect_identity before update on public.planly_lists for each row execute function public.planly_protect_list_identity(); create trigger planly_list_items_protect_identity before update on public.planly_list_items for each row execute function public.planly_protect_list_identity();
create policy planly_lists_select_authorized on public.planly_lists for select to authenticated using (owner_id=(select auth.uid()) or (visibility='household' and household_id is not null and public.planly_is_household_member(household_id))); create policy planly_lists_insert_owner on public.planly_lists for insert to authenticated with check (owner_id=(select auth.uid()) and ((visibility='private' and household_id is null) or (visibility='household' and household_id is not null and public.planly_is_household_member(household_id)))); create policy planly_lists_update_authorized on public.planly_lists for update to authenticated using (owner_id=(select auth.uid()) or (visibility='household' and household_id is not null and public.planly_is_household_member(household_id))) with check (owner_id=(select auth.uid()) or (visibility='household' and household_id is not null and public.planly_is_household_member(household_id))); create policy planly_lists_delete_owner on public.planly_lists for delete to authenticated using (owner_id=(select auth.uid()));
create policy planly_list_items_select_authorized on public.planly_list_items for select to authenticated using (exists(select 1 from public.planly_lists l where l.id=list_id and l.deleted_at is null and (l.owner_id=(select auth.uid()) or (l.visibility='household' and public.planly_is_household_member(l.household_id))))); create policy planly_list_items_insert_authorized on public.planly_list_items for insert to authenticated with check (owner_id=(select auth.uid()) and exists(select 1 from public.planly_lists l where l.id=list_id and l.deleted_at is null and (l.owner_id=(select auth.uid()) or (l.visibility='household' and public.planly_is_household_member(l.household_id))))); create policy planly_list_items_update_authorized on public.planly_list_items for update to authenticated using (exists(select 1 from public.planly_lists l where l.id=list_id and l.deleted_at is null and (l.owner_id=(select auth.uid()) or (l.visibility='household' and public.planly_is_household_member(l.household_id))))) with check (exists(select 1 from public.planly_lists l where l.id=list_id and l.deleted_at is null and (l.owner_id=(select auth.uid()) or (l.visibility='household' and public.planly_is_household_member(l.household_id))))); create policy planly_list_items_delete_authorized on public.planly_list_items for delete to authenticated using (exists(select 1 from public.planly_lists l where l.id=list_id and l.deleted_at is null and (l.owner_id=(select auth.uid()) or (l.visibility='household' and public.planly_is_household_member(l.household_id))))); notify pgrst,'reload schema';

-- ====================================================================================================
-- version 20260927045922  name shared_lists_private_helper
-- ====================================================================================================
drop policy if exists planly_lists_select_authorized on public.planly_lists; drop policy if exists planly_lists_insert_owner on public.planly_lists; drop policy if exists planly_lists_update_authorized on public.planly_lists; drop policy if exists planly_list_items_select_authorized on public.planly_list_items; drop policy if exists planly_list_items_insert_authorized on public.planly_list_items; drop policy if exists planly_list_items_update_authorized on public.planly_list_items; drop policy if exists planly_list_items_delete_authorized on public.planly_list_items; create policy planly_lists_select_authorized on public.planly_lists for select to authenticated using (owner_id=(select auth.uid()) or (visibility='household' and household_id is not null and planly_private.is_household_member(household_id))); create policy planly_lists_insert_owner on public.planly_lists for insert to authenticated with check (owner_id=(select auth.uid()) and ((visibility='private' and household_id is null) or (visibility='household' and household_id is not null and planly_private.is_household_member(household_id)))); create policy planly_lists_update_authorized on public.planly_lists for update to authenticated using (owner_id=(select auth.uid()) or (visibility='household' and household_id is not null and planly_private.is_household_member(household_id))) with check (owner_id=(select auth.uid()) or (visibility='household' and household_id is not null and planly_private.is_household_member(household_id))); create policy planly_list_items_select_authorized on public.planly_list_items for select to authenticated using (exists(select 1 from public.planly_lists l where l.id=list_id and l.deleted_at is null and (l.owner_id=(select auth.uid()) or (l.visibility='household' and planly_private.is_household_member(l.household_id))))); create policy planly_list_items_insert_authorized on public.planly_list_items for insert to authenticated with check (owner_id=(select auth.uid()) and exists(select 1 from public.planly_lists l where l.id=list_id and l.deleted_at is null and (l.owner_id=(select auth.uid()) or (l.visibility='household' and planly_private.is_household_member(l.household_id))))); create policy planly_list_items_update_authorized on public.planly_list_items for update to authenticated using (exists(select 1 from public.planly_lists l where l.id=list_id and l.deleted_at is null and (l.owner_id=(select auth.uid()) or (l.visibility='household' and planly_private.is_household_member(l.household_id))))) with check (exists(select 1 from public.planly_lists l where l.id=list_id and l.deleted_at is null and (l.owner_id=(select auth.uid()) or (l.visibility='household' and planly_private.is_household_member(l.household_id))))); create policy planly_list_items_delete_authorized on public.planly_list_items for delete to authenticated using (exists(select 1 from public.planly_lists l where l.id=list_id and l.deleted_at is null and (l.owner_id=(select auth.uid()) or (l.visibility='household' and planly_private.is_household_member(l.household_id))))); notify pgrst,'reload schema';

-- ====================================================================================================
-- version 20260927073429  name restore_authenticated_household_rpc_and_data_grants
-- ====================================================================================================
revoke all on function public.planly_accept_household_invite(text) from public, anon;
grant execute on function public.planly_accept_household_invite(text) to authenticated;
revoke all on function public.planly_create_household_invite(uuid,text) from public, anon;
grant execute on function public.planly_create_household_invite(uuid,text) to authenticated;
revoke all on public.planly_lists, public.planly_list_items from anon;
grant select,insert,update,delete on public.planly_lists, public.planly_list_items to authenticated;
revoke all on public.planly_budget_scopes, public.planly_budget_categories, public.planly_budget_targets, public.planly_budget_entries from anon;
grant select,insert,update on public.planly_budget_scopes, public.planly_budget_categories, public.planly_budget_targets, public.planly_budget_entries to authenticated;
notify pgrst,'reload schema';

-- ====================================================================================================
-- version 20260927075708  name realtime_household_helper_closeout
-- ====================================================================================================
drop policy if exists planly_household_task_broadcast_receive on realtime.messages;
create policy planly_household_task_broadcast_receive
on realtime.messages
for select
to authenticated
using (
  extension = 'broadcast'
  and (select realtime.topic()) ~ '^household:[0-9a-fA-F-]{36}$'
  and planly_private.is_household_member(split_part((select realtime.topic()), ':', 2)::uuid)
);

-- ====================================================================================================
-- version 20260928044835  name collaborative_household_budget_entries
-- ====================================================================================================
create or replace function public.planly_budget_entry_immutable_guard()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  if new.id is distinct from old.id
     or new.scope_id is distinct from old.scope_id
     or new.owner_id is distinct from old.owner_id
     or new.client_id is distinct from old.client_id
     or new.client_created_at is distinct from old.client_created_at then
    raise exception 'budget entry identity and ownership are immutable' using errcode = '42501';
  end if;
  return new;
end
$$;
drop trigger if exists planly_budget_entry_immutable_guard on public.planly_budget_entries;
create trigger planly_budget_entry_immutable_guard before update on public.planly_budget_entries for each row execute function public.planly_budget_entry_immutable_guard();
drop policy if exists planly_budget_entries_update_own on public.planly_budget_entries;
drop policy if exists planly_budget_entries_update_authorized on public.planly_budget_entries;
create policy planly_budget_entries_update_authorized on public.planly_budget_entries for update to authenticated
using (exists (select 1 from public.planly_budget_scopes s where s.id=planly_budget_entries.scope_id and s.deleted_at is null and ((s.scope_type='personal' and s.owner_id=(select auth.uid()) and planly_budget_entries.owner_id=(select auth.uid())) or (s.scope_type='household' and s.household_id is not null and planly_private.is_household_member(s.household_id)))))
with check (exists (select 1 from public.planly_budget_scopes s where s.id=planly_budget_entries.scope_id and s.deleted_at is null and ((s.scope_type='personal' and s.owner_id=(select auth.uid()) and planly_budget_entries.owner_id=(select auth.uid())) or (s.scope_type='household' and s.household_id is not null and planly_private.is_household_member(s.household_id)))));
notify pgrst, 'reload schema';

-- ====================================================================================================
-- version 20260929110317  name household_task_completion
-- ====================================================================================================
-- Planly Phase 2 / B2 — collaborative household task completion.
-- Review candidate only until independently approved and applied.

alter table public.planly_tasks
  add column if not exists completed_by uuid null references auth.users(id) on delete set null,
  add column if not exists completed_at timestamptz null;

create or replace function public.planly_stamp_task_completion_actor()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'INSERT' then
    if new.completed then
      new.completed_by := auth.uid();
      new.completed_at := clock_timestamp();
    else
      new.completed_by := null;
      new.completed_at := null;
    end if;
    return new;
  end if;
  if new.completed is distinct from old.completed then
    if new.completed then
      new.completed_by := auth.uid();
      new.completed_at := clock_timestamp();
    else
      new.completed_by := null;
      new.completed_at := null;
    end if;
  else
    new.completed_by := old.completed_by;
    new.completed_at := old.completed_at;
  end if;
  return new;
end
$$;

revoke all on function public.planly_stamp_task_completion_actor() from public, anon, authenticated;

drop trigger if exists planly_tasks_stamp_completion_actor on public.planly_tasks;
create trigger planly_tasks_stamp_completion_actor
before insert or update on public.planly_tasks
for each row execute function public.planly_stamp_task_completion_actor();

create unique index if not exists planly_tasks_live_series_occurrence_key
on public.planly_tasks(owner_id, series_client_id, task_date)
where deleted_at is null and series_client_id is not null;

create or replace function planly_private.set_household_task_completed(
  p_owner_id uuid, p_client_id text, p_completed boolean,
  p_expected_cloud_version bigint, p_next_date date default null
)
returns public.planly_tasks
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user uuid := auth.uid();
  v_task public.planly_tasks;
  v_now_ms bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  v_series_id text;
  v_next_client_id text;
  v_next_occurrence integer;
  v_cfg jsonb;
  v_end_mode text;
  v_end_date date;
  v_max_occurrences integer;
  v_next_subtasks jsonb := '[]'::jsonb;
  v_next_data jsonb;
  v_create_next boolean := false;
begin
  if v_user is null then raise exception 'Authentication required' using errcode = '42501'; end if;

  select * into v_task
  from public.planly_tasks t
  where t.owner_id = p_owner_id and t.client_id = p_client_id
    and t.deleted_at is null and t.visibility = 'household' and t.household_id is not null
  for update;
  if not found then raise exception 'Task not found' using errcode = 'P0002'; end if;

  if not exists (
    select 1 from public.planly_household_members m
    where m.household_id = v_task.household_id and m.user_id = v_user
  ) then raise exception 'Not authorized' using errcode = '42501'; end if;

  if v_user <> v_task.owner_id and v_task.assignee_id is not null and v_task.assignee_id <> v_user then
    raise exception 'Task is assigned to another household member' using errcode = '42501';
  end if;

  if v_task.completed is not distinct from p_completed then return v_task; end if;
  if v_task.cloud_version is distinct from p_expected_cloud_version then
    raise exception 'Task changed elsewhere' using errcode = 'P0409';
  end if;

  v_cfg := coalesce(v_task.recurrence_config, '{}'::jsonb);
  v_series_id := coalesce(v_task.series_client_id, v_task.client_id);

  if p_completed and v_task.recurrence <> 'none' and v_task.task_date is not null and p_next_date is not null then
    if p_next_date <= v_task.task_date then raise exception 'Invalid next occurrence date' using errcode = '22023'; end if;
    v_create_next := true;
    v_end_mode := coalesce(v_cfg->>'endMode', 'never');
    v_next_occurrence := coalesce(v_task.occurrence_number, 1) + 1;
    if v_end_mode = 'count' then
      begin
        v_max_occurrences := nullif(v_cfg->>'maxOccurrences', '')::integer;
      exception when invalid_text_representation or numeric_value_out_of_range then
        v_max_occurrences := null;
      end;
      if v_max_occurrences is not null and v_next_occurrence > v_max_occurrences then
        v_create_next := false;
      end if;
    elsif v_end_mode = 'date' then
      begin
        v_end_date := nullif(v_cfg->>'endDate', '')::date;
      exception when invalid_datetime_format or datetime_field_overflow then
        v_end_date := null;
      end;
      if v_end_date is not null and p_next_date > v_end_date then
        v_create_next := false;
      end if;
    end if;
  elsif p_next_date is not null then
    raise exception 'Next occurrence is not valid for this task' using errcode = '22023';
  end if;

  update public.planly_tasks t
  set completed = p_completed,
      series_client_id = case when p_completed and t.recurrence <> 'none' and t.series_client_id is null then v_series_id else t.series_client_id end,
      recurrence_config = case when p_completed and t.recurrence <> 'none'
        then jsonb_set(coalesce(t.recurrence_config, '{}'::jsonb), '{anchorDate}', to_jsonb(coalesce(t.recurrence_config->>'anchorDate', t.task_date::text)), true)
        else t.recurrence_config end,
      data = jsonb_set(jsonb_set(coalesce(t.data, '{}'::jsonb), '{completed}', to_jsonb(p_completed), true), '{updatedAt}', to_jsonb(v_now_ms), true)
        || case when p_completed and t.recurrence <> 'none' then jsonb_build_object(
          'seriesId', v_series_id,
          'recurrenceConfig', jsonb_set(coalesce(t.recurrence_config, '{}'::jsonb), '{anchorDate}', to_jsonb(coalesce(t.recurrence_config->>'anchorDate', t.task_date::text)), true)
        ) else '{}'::jsonb end,
      client_updated_at = greatest(t.client_updated_at, v_now_ms)
  where t.owner_id = p_owner_id and t.client_id = p_client_id
  returning * into v_task;

  if v_create_next then
    v_next_client_id := v_now_ms::text || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 16);
    v_next_occurrence := coalesce(v_task.occurrence_number, 1) + 1;
    select coalesce(jsonb_agg(
      (s.value - 'id' - 'done') || jsonb_build_object(
        'id', v_now_ms::text || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 16), 'done', false
      ) order by s.ordinality
    ), '[]'::jsonb)
    into v_next_subtasks
    from jsonb_array_elements(coalesce(v_task.subtasks, '[]'::jsonb)) with ordinality as s(value, ordinality);

    v_next_data := coalesce(v_task.data, '{}'::jsonb) - 'top3Order' || jsonb_build_object(
      'id', v_next_client_id, 'seriesId', v_series_id, 'occurrenceNumber', v_next_occurrence,
      'date', p_next_date::text, 'completed', false, 'pinned', false, 'subtasks', v_next_subtasks,
      'createdAt', v_now_ms, 'updatedAt', v_now_ms,
      'recurrenceConfig', jsonb_set(coalesce(v_task.recurrence_config, '{}'::jsonb), '{anchorDate}', to_jsonb(coalesce(v_task.recurrence_config->>'anchorDate', v_task.task_date::text)), true),
      'googleEventId', case when v_task.add_to_calendar and v_task.google_event_id is not null then to_jsonb(v_task.google_event_id) else '""'::jsonb end,
      'calendarSync', to_jsonb(case when v_task.add_to_calendar then case when coalesce(v_task.google_event_id, '') <> '' then 'synced' else 'pending' end else '' end)
    );

    insert into public.planly_tasks(
      owner_id, client_id, data, series_client_id, title, task_date, task_time, duration_minutes,
      priority, category, project_client_id, recurrence, recurrence_config, occurrence_number,
      reminder, notes, subtasks, completed, pinned, top3_order, add_to_calendar, google_event_id,
      google_recurrence_start_date, google_recurrence_version, calendar_sync, calendar_synced_at,
      client_created_at, client_updated_at, visibility, household_id, assignee_id, completed_by, completed_at
    ) values (
      v_task.owner_id, v_next_client_id, v_next_data, v_series_id, v_task.title, p_next_date,
      v_task.task_time, v_task.duration_minutes, v_task.priority, v_task.category, v_task.project_client_id,
      v_task.recurrence,
      jsonb_set(coalesce(v_task.recurrence_config, '{}'::jsonb), '{anchorDate}', to_jsonb(coalesce(v_task.recurrence_config->>'anchorDate', v_task.task_date::text)), true),
      v_next_occurrence, v_task.reminder, v_task.notes, v_next_subtasks, false, false, null,
      v_task.add_to_calendar, case when v_task.add_to_calendar then v_task.google_event_id else null end,
      v_task.google_recurrence_start_date, v_task.google_recurrence_version,
      case when v_task.add_to_calendar then case when coalesce(v_task.google_event_id, '') <> '' then 'synced' else 'pending' end else '' end,
      v_task.calendar_synced_at, v_now_ms, v_now_ms, v_task.visibility, v_task.household_id,
      v_task.assignee_id, null, null
    )
    on conflict (owner_id, series_client_id, task_date)
      where deleted_at is null and series_client_id is not null
    do nothing;
  end if;

  return v_task;
end
$$;

alter function planly_private.set_household_task_completed(uuid,text,boolean,bigint,date) owner to postgres;
revoke all on function planly_private.set_household_task_completed(uuid,text,boolean,bigint,date) from public, anon, authenticated;
grant execute on function planly_private.set_household_task_completed(uuid,text,boolean,bigint,date) to authenticated;

create or replace function public.planly_set_household_task_completed(
  p_owner_id uuid, p_client_id text, p_completed boolean,
  p_expected_cloud_version bigint, p_next_date date default null
)
returns public.planly_tasks
language sql
security invoker
set search_path = pg_catalog, public
as $$
  select planly_private.set_household_task_completed(
    p_owner_id, p_client_id, p_completed, p_expected_cloud_version, p_next_date
  )
$$;

alter function public.planly_set_household_task_completed(uuid,text,boolean,bigint,date) owner to postgres;
revoke all on function public.planly_set_household_task_completed(uuid,text,boolean,bigint,date) from public, anon;
grant execute on function public.planly_set_household_task_completed(uuid,text,boolean,bigint,date) to authenticated;

-- ====================================================================================================
-- version 20260930053755  name r4_household_display_names
-- ====================================================================================================
-- R4: household member display names.
-- SQL-review candidate only. Do not apply before independent approval.

alter table public.planly_household_members
  add column if not exists display_name text;

alter table public.planly_household_members
  drop constraint if exists planly_household_members_display_name_check;

alter table public.planly_household_members
  add constraint planly_household_members_display_name_check
  check (
    display_name is null
    or (
      display_name = btrim(display_name)
      and char_length(display_name) between 1 and 20
      and display_name !~ '[[:cntrl:]]'
      and display_name !~ '[​-‏‪-‮⁠-⁩﻿]'
    )
  );

create or replace function public.planly_set_household_display_name(p_display_name text)
returns public.planly_household_members
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_name text := nullif(
    btrim(regexp_replace(coalesce(p_display_name, ''), '\s+', ' ', 'g')),
    ''
  );
  v_row public.planly_household_members%rowtype;
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if v_name is not null
     and (
       v_name ~ '[[:cntrl:]]'
       or v_name ~ '[​-‏‪-‮⁠-⁩﻿]'
     ) then
    raise exception 'Display name contains unsupported characters' using errcode = '22023';
  end if;

  if v_name is not null and char_length(v_name) > 20 then
    raise exception 'Display name must be 20 characters or fewer' using errcode = '22001';
  end if;

  update public.planly_household_members
     set display_name = v_name
   where user_id = v_user
   returning * into v_row;

  if not found then
    raise exception 'Household membership required' using errcode = '42501';
  end if;

  return v_row;
end
$function$;

revoke all on function public.planly_set_household_display_name(text) from public;
revoke all on function public.planly_set_household_display_name(text) from anon;
grant execute on function public.planly_set_household_display_name(text) to authenticated;

-- ====================================================================================================
-- version 20260930053756  name r4_budget_today_bills
-- ====================================================================================================
-- R4: optional Budget bills surfaced on Today.
-- SQL-review candidate only. Do not apply before independent approval.

alter table public.planly_budget_entries
  add column if not exists show_on_today boolean not null default false,
  add column if not exists today_lead_days smallint not null default 2;

alter table public.planly_budget_entries
  drop constraint if exists planly_budget_entries_today_lead_days_check;

alter table public.planly_budget_entries
  add constraint planly_budget_entries_today_lead_days_check
  check (today_lead_days between 0 and 31);

-- ====================================================================================================
-- version 20261001204454  name 045_calendar_source_represents
-- ====================================================================================================
-- Stage 4a: say whose schedule a calendar source is, so a partner's rota never counts as the owner's busy time (D10).
alter table public.calendar_sources
  add column if not exists represents text not null default 'self';

alter table public.calendar_sources
  drop constraint if exists calendar_sources_represents_check;

alter table public.calendar_sources
  add constraint calendar_sources_represents_check
  check (represents in ('self', 'partner'));

comment on column public.calendar_sources.represents is
  'Whose schedule this source is: self (the owner) or partner. Only self sources count as the owner''s busy time.';

notify pgrst, 'reload schema';

-- ====================================================================================================
-- version 20261002005243  name 046_household_chore_rotation
-- ====================================================================================================
-- Stage 5: weekly chore rotation (the user's choice: weekly swap, only chores with Rotate on, Anyone chores unchanged).
-- The rotation lives in the task's own data: data.rotation = {"enabled":true,"a":<uuid>,"b":<uuid>,"anchorWeek":"YYYY-MM-DD"}.
-- Week 0 (the anchor week) belongs to "a", the next week to "b", and so on. Weeks start on Monday (date_trunc 'week').
-- Safety: only two *current* members of the task's household can ever be chosen; anything missing or invalid
-- keeps the current assignee (p_fallback). The data is written only by the task owner (owner-only RLS on planly_tasks).

create or replace function planly_private.household_rotation_assignee(
  p_household_id uuid, p_rotation jsonb, p_date date, p_fallback uuid
)
returns uuid
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_a uuid;
  v_b uuid;
  v_anchor date;
  v_weeks integer;
begin
  if p_household_id is null or p_date is null or p_rotation is null or jsonb_typeof(p_rotation) <> 'object'
     or coalesce(p_rotation->>'enabled', 'false') <> 'true' then
    return p_fallback;
  end if;
  begin
    v_a := nullif(p_rotation->>'a', '')::uuid;
    v_b := nullif(p_rotation->>'b', '')::uuid;
    v_anchor := nullif(p_rotation->>'anchorWeek', '')::date;
  exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
    return p_fallback;
  end;
  if v_a is null or v_b is null or v_anchor is null or v_a = v_b then return p_fallback; end if;
  if (select count(distinct m.user_id) from public.planly_household_members m
      where m.household_id = p_household_id and m.user_id in (v_a, v_b)) <> 2 then
    return p_fallback;
  end if;
  v_weeks := (date_trunc('week', p_date::timestamp)::date - date_trunc('week', v_anchor::timestamp)::date) / 7;
  return case when mod(v_weeks, 2) = 0 then v_a else v_b end;
end
$$;
alter function planly_private.household_rotation_assignee(uuid,jsonb,date,uuid) owner to postgres;
revoke all on function planly_private.household_rotation_assignee(uuid,jsonb,date,uuid) from public, anon, authenticated;

create or replace function planly_private.set_household_task_completed(
  p_owner_id uuid, p_client_id text, p_completed boolean,
  p_expected_cloud_version bigint, p_next_date date default null
)
returns public.planly_tasks
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user uuid := auth.uid();
  v_task public.planly_tasks;
  v_now_ms bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  v_series_id text;
  v_next_client_id text;
  v_next_occurrence integer;
  v_cfg jsonb;
  v_end_mode text;
  v_end_date date;
  v_max_occurrences integer;
  v_next_subtasks jsonb := '[]'::jsonb;
  v_next_data jsonb;
  v_create_next boolean := false;
  v_next_assignee uuid;
begin
  if v_user is null then raise exception 'Authentication required' using errcode = '42501'; end if;

  select * into v_task
  from public.planly_tasks t
  where t.owner_id = p_owner_id and t.client_id = p_client_id
    and t.deleted_at is null and t.visibility = 'household' and t.household_id is not null
  for update;
  if not found then raise exception 'Task not found' using errcode = 'P0002'; end if;

  if not exists (
    select 1 from public.planly_household_members m
    where m.household_id = v_task.household_id and m.user_id = v_user
  ) then raise exception 'Not authorized' using errcode = '42501'; end if;

  if v_user <> v_task.owner_id and v_task.assignee_id is not null and v_task.assignee_id <> v_user then
    raise exception 'Task is assigned to another household member' using errcode = '42501';
  end if;

  if v_task.completed is not distinct from p_completed then return v_task; end if;
  if v_task.cloud_version is distinct from p_expected_cloud_version then
    raise exception 'Task changed elsewhere' using errcode = 'P0409';
  end if;

  v_cfg := coalesce(v_task.recurrence_config, '{}'::jsonb);
  v_series_id := coalesce(v_task.series_client_id, v_task.client_id);

  if p_completed and v_task.recurrence <> 'none' and v_task.task_date is not null and p_next_date is not null then
    if p_next_date <= v_task.task_date then raise exception 'Invalid next occurrence date' using errcode = '22023'; end if;
    v_create_next := true;
    v_end_mode := coalesce(v_cfg->>'endMode', 'never');
    v_next_occurrence := coalesce(v_task.occurrence_number, 1) + 1;
    if v_end_mode = 'count' then
      begin
        v_max_occurrences := nullif(v_cfg->>'maxOccurrences', '')::integer;
      exception when invalid_text_representation or numeric_value_out_of_range then
        v_max_occurrences := null;
      end;
      if v_max_occurrences is not null and v_next_occurrence > v_max_occurrences then
        v_create_next := false;
      end if;
    elsif v_end_mode = 'date' then
      begin
        v_end_date := nullif(v_cfg->>'endDate', '')::date;
      exception when invalid_datetime_format or datetime_field_overflow then
        v_end_date := null;
      end;
      if v_end_date is not null and p_next_date > v_end_date then
        v_create_next := false;
      end if;
    end if;
  elsif p_next_date is not null then
    raise exception 'Next occurrence is not valid for this task' using errcode = '22023';
  end if;

  update public.planly_tasks t
  set completed = p_completed,
      series_client_id = case when p_completed and t.recurrence <> 'none' and t.series_client_id is null then v_series_id else t.series_client_id end,
      recurrence_config = case when p_completed and t.recurrence <> 'none'
        then jsonb_set(coalesce(t.recurrence_config, '{}'::jsonb), '{anchorDate}', to_jsonb(coalesce(t.recurrence_config->>'anchorDate', t.task_date::text)), true)
        else t.recurrence_config end,
      data = jsonb_set(jsonb_set(coalesce(t.data, '{}'::jsonb), '{completed}', to_jsonb(p_completed), true), '{updatedAt}', to_jsonb(v_now_ms), true)
        || case when p_completed and t.recurrence <> 'none' then jsonb_build_object(
          'seriesId', v_series_id,
          'recurrenceConfig', jsonb_set(coalesce(t.recurrence_config, '{}'::jsonb), '{anchorDate}', to_jsonb(coalesce(t.recurrence_config->>'anchorDate', t.task_date::text)), true)
        ) else '{}'::jsonb end,
      client_updated_at = greatest(t.client_updated_at, v_now_ms)
  where t.owner_id = p_owner_id and t.client_id = p_client_id
  returning * into v_task;

  if v_create_next then
    v_next_client_id := v_now_ms::text || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 16);
    v_next_occurrence := coalesce(v_task.occurrence_number, 1) + 1;
    select coalesce(jsonb_agg(
      (s.value - 'id' - 'done') || jsonb_build_object(
        'id', v_now_ms::text || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 16), 'done', false
      ) order by s.ordinality
    ), '[]'::jsonb)
    into v_next_subtasks
    from jsonb_array_elements(coalesce(v_task.subtasks, '[]'::jsonb)) with ordinality as s(value, ordinality);

    -- Stage 5: a chore set to rotate weekly gets the person whose week the next date falls in.
    v_next_assignee := planly_private.household_rotation_assignee(v_task.household_id, v_task.data->'rotation', p_next_date, v_task.assignee_id);

    v_next_data := coalesce(v_task.data, '{}'::jsonb) - 'top3Order' || jsonb_build_object(
      'id', v_next_client_id, 'seriesId', v_series_id, 'occurrenceNumber', v_next_occurrence,
      'date', p_next_date::text, 'completed', false, 'pinned', false, 'subtasks', v_next_subtasks,
      'createdAt', v_now_ms, 'updatedAt', v_now_ms,
      'recurrenceConfig', jsonb_set(coalesce(v_task.recurrence_config, '{}'::jsonb), '{anchorDate}', to_jsonb(coalesce(v_task.recurrence_config->>'anchorDate', v_task.task_date::text)), true),
      'googleEventId', case when v_task.add_to_calendar and v_task.google_event_id is not null then to_jsonb(v_task.google_event_id) else '""'::jsonb end,
      'calendarSync', to_jsonb(case when v_task.add_to_calendar then case when coalesce(v_task.google_event_id, '') <> '' then 'synced' else 'pending' end else '' end)
    ) || case when v_next_assignee is distinct from v_task.assignee_id
      then jsonb_build_object('assigneeId', v_next_assignee) else '{}'::jsonb end;

    insert into public.planly_tasks(
      owner_id, client_id, data, series_client_id, title, task_date, task_time, duration_minutes,
      priority, category, project_client_id, recurrence, recurrence_config, occurrence_number,
      reminder, notes, subtasks, completed, pinned, top3_order, add_to_calendar, google_event_id,
      google_recurrence_start_date, google_recurrence_version, calendar_sync, calendar_synced_at,
      client_created_at, client_updated_at, visibility, household_id, assignee_id, completed_by, completed_at
    ) values (
      v_task.owner_id, v_next_client_id, v_next_data, v_series_id, v_task.title, p_next_date,
      v_task.task_time, v_task.duration_minutes, v_task.priority, v_task.category, v_task.project_client_id,
      v_task.recurrence,
      jsonb_set(coalesce(v_task.recurrence_config, '{}'::jsonb), '{anchorDate}', to_jsonb(coalesce(v_task.recurrence_config->>'anchorDate', v_task.task_date::text)), true),
      v_next_occurrence, v_task.reminder, v_task.notes, v_next_subtasks, false, false, null,
      v_task.add_to_calendar, case when v_task.add_to_calendar then v_task.google_event_id else null end,
      v_task.google_recurrence_start_date, v_task.google_recurrence_version,
      case when v_task.add_to_calendar then case when coalesce(v_task.google_event_id, '') <> '' then 'synced' else 'pending' end else '' end,
      v_task.calendar_synced_at, v_now_ms, v_now_ms, v_task.visibility, v_task.household_id,
      v_next_assignee, null, null
    )
    on conflict (owner_id, series_client_id, task_date)
      where deleted_at is null and series_client_id is not null
    do nothing;
  end if;

  return v_task;
end
$$;

alter function planly_private.set_household_task_completed(uuid,text,boolean,bigint,date) owner to postgres;
revoke all on function planly_private.set_household_task_completed(uuid,text,boolean,bigint,date) from public, anon, authenticated;
grant execute on function planly_private.set_household_task_completed(uuid,text,boolean,bigint,date) to authenticated;

notify pgrst, 'reload schema';

-- ====================================================================================================
-- version 20261004002348  name 047_household_budget_reset
-- ====================================================================================================
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

-- ====================================================================================================
-- version 20261004193144  name 048_household_checklist_collaboration
-- ====================================================================================================
-- Household checklist collaboration (the user's choice: either household member can tick checklist items
-- and complete any shared chore, including one assigned to the other member; "Done by" still records who did it).
--
-- 1) planly_private.set_household_task_completed: unchanged except the assignee restriction is removed.
--    Membership of the task's household, household visibility, not-deleted and cloud_version checks all remain.
-- 2) planly_private.set_household_subtask_done + public wrapper: set ONE checklist item's done flag on a shared task.
--    Authority comes only from auth.uid() being a member of the task's household; the task must be a live
--    household task and the item must exist. Only that item's "done" changes (title/order/other fields untouched),
--    applied under a row lock, so two people ticking different items never overwrite each other. Idempotent.
--    The owner's normal edits keep their cloud_version optimistic concurrency (this bumps the version).

create or replace function planly_private.set_household_task_completed(
  p_owner_id uuid, p_client_id text, p_completed boolean,
  p_expected_cloud_version bigint, p_next_date date default null
)
returns public.planly_tasks
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user uuid := auth.uid();
  v_task public.planly_tasks;
  v_now_ms bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  v_series_id text;
  v_next_client_id text;
  v_next_occurrence integer;
  v_cfg jsonb;
  v_end_mode text;
  v_end_date date;
  v_max_occurrences integer;
  v_next_subtasks jsonb := '[]'::jsonb;
  v_next_data jsonb;
  v_create_next boolean := false;
  v_next_assignee uuid;
begin
  if v_user is null then raise exception 'Authentication required' using errcode = '42501'; end if;

  select * into v_task
  from public.planly_tasks t
  where t.owner_id = p_owner_id and t.client_id = p_client_id
    and t.deleted_at is null and t.visibility = 'household' and t.household_id is not null
  for update;
  if not found then raise exception 'Task not found' using errcode = 'P0002'; end if;

  if not exists (
    select 1 from public.planly_household_members m
    where m.household_id = v_task.household_id and m.user_id = v_user
  ) then raise exception 'Not authorized' using errcode = '42501'; end if;

  if v_task.completed is not distinct from p_completed then return v_task; end if;
  if v_task.cloud_version is distinct from p_expected_cloud_version then
    raise exception 'Task changed elsewhere' using errcode = 'P0409';
  end if;

  v_cfg := coalesce(v_task.recurrence_config, '{}'::jsonb);
  v_series_id := coalesce(v_task.series_client_id, v_task.client_id);

  if p_completed and v_task.recurrence <> 'none' and v_task.task_date is not null and p_next_date is not null then
    if p_next_date <= v_task.task_date then raise exception 'Invalid next occurrence date' using errcode = '22023'; end if;
    v_create_next := true;
    v_end_mode := coalesce(v_cfg->>'endMode', 'never');
    v_next_occurrence := coalesce(v_task.occurrence_number, 1) + 1;
    if v_end_mode = 'count' then
      begin
        v_max_occurrences := nullif(v_cfg->>'maxOccurrences', '')::integer;
      exception when invalid_text_representation or numeric_value_out_of_range then
        v_max_occurrences := null;
      end;
      if v_max_occurrences is not null and v_next_occurrence > v_max_occurrences then
        v_create_next := false;
      end if;
    elsif v_end_mode = 'date' then
      begin
        v_end_date := nullif(v_cfg->>'endDate', '')::date;
      exception when invalid_datetime_format or datetime_field_overflow then
        v_end_date := null;
      end;
      if v_end_date is not null and p_next_date > v_end_date then
        v_create_next := false;
      end if;
    end if;
  elsif p_next_date is not null then
    raise exception 'Next occurrence is not valid for this task' using errcode = '22023';
  end if;

  update public.planly_tasks t
  set completed = p_completed,
      series_client_id = case when p_completed and t.recurrence <> 'none' and t.series_client_id is null then v_series_id else t.series_client_id end,
      recurrence_config = case when p_completed and t.recurrence <> 'none'
        then jsonb_set(coalesce(t.recurrence_config, '{}'::jsonb), '{anchorDate}', to_jsonb(coalesce(t.recurrence_config->>'anchorDate', t.task_date::text)), true)
        else t.recurrence_config end,
      data = jsonb_set(jsonb_set(coalesce(t.data, '{}'::jsonb), '{completed}', to_jsonb(p_completed), true), '{updatedAt}', to_jsonb(v_now_ms), true)
        || case when p_completed and t.recurrence <> 'none' then jsonb_build_object(
          'seriesId', v_series_id,
          'recurrenceConfig', jsonb_set(coalesce(t.recurrence_config, '{}'::jsonb), '{anchorDate}', to_jsonb(coalesce(t.recurrence_config->>'anchorDate', t.task_date::text)), true)
        ) else '{}'::jsonb end,
      client_updated_at = greatest(t.client_updated_at, v_now_ms)
  where t.owner_id = p_owner_id and t.client_id = p_client_id
  returning * into v_task;

  if v_create_next then
    v_next_client_id := v_now_ms::text || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 16);
    v_next_occurrence := coalesce(v_task.occurrence_number, 1) + 1;
    select coalesce(jsonb_agg(
      (s.value - 'id' - 'done') || jsonb_build_object(
        'id', v_now_ms::text || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 16), 'done', false
      ) order by s.ordinality
    ), '[]'::jsonb)
    into v_next_subtasks
    from jsonb_array_elements(coalesce(v_task.subtasks, '[]'::jsonb)) with ordinality as s(value, ordinality);

    -- Stage 5: a chore set to rotate weekly gets the person whose week the next date falls in.
    v_next_assignee := planly_private.household_rotation_assignee(v_task.household_id, v_task.data->'rotation', p_next_date, v_task.assignee_id);

    v_next_data := coalesce(v_task.data, '{}'::jsonb) - 'top3Order' || jsonb_build_object(
      'id', v_next_client_id, 'seriesId', v_series_id, 'occurrenceNumber', v_next_occurrence,
      'date', p_next_date::text, 'completed', false, 'pinned', false, 'subtasks', v_next_subtasks,
      'createdAt', v_now_ms, 'updatedAt', v_now_ms,
      'recurrenceConfig', jsonb_set(coalesce(v_task.recurrence_config, '{}'::jsonb), '{anchorDate}', to_jsonb(coalesce(v_task.recurrence_config->>'anchorDate', v_task.task_date::text)), true),
      'googleEventId', case when v_task.add_to_calendar and v_task.google_event_id is not null then to_jsonb(v_task.google_event_id) else '""'::jsonb end,
      'calendarSync', to_jsonb(case when v_task.add_to_calendar then case when coalesce(v_task.google_event_id, '') <> '' then 'synced' else 'pending' end else '' end)
    ) || case when v_next_assignee is distinct from v_task.assignee_id
      then jsonb_build_object('assigneeId', v_next_assignee) else '{}'::jsonb end;

    insert into public.planly_tasks(
      owner_id, client_id, data, series_client_id, title, task_date, task_time, duration_minutes,
      priority, category, project_client_id, recurrence, recurrence_config, occurrence_number,
      reminder, notes, subtasks, completed, pinned, top3_order, add_to_calendar, google_event_id,
      google_recurrence_start_date, google_recurrence_version, calendar_sync, calendar_synced_at,
      client_created_at, client_updated_at, visibility, household_id, assignee_id, completed_by, completed_at
    ) values (
      v_task.owner_id, v_next_client_id, v_next_data, v_series_id, v_task.title, p_next_date,
      v_task.task_time, v_task.duration_minutes, v_task.priority, v_task.category, v_task.project_client_id,
      v_task.recurrence,
      jsonb_set(coalesce(v_task.recurrence_config, '{}'::jsonb), '{anchorDate}', to_jsonb(coalesce(v_task.recurrence_config->>'anchorDate', v_task.task_date::text)), true),
      v_next_occurrence, v_task.reminder, v_task.notes, v_next_subtasks, false, false, null,
      v_task.add_to_calendar, case when v_task.add_to_calendar then v_task.google_event_id else null end,
      v_task.google_recurrence_start_date, v_task.google_recurrence_version,
      case when v_task.add_to_calendar then case when coalesce(v_task.google_event_id, '') <> '' then 'synced' else 'pending' end else '' end,
      v_task.calendar_synced_at, v_now_ms, v_now_ms, v_task.visibility, v_task.household_id,
      v_next_assignee, null, null
    )
    on conflict (owner_id, series_client_id, task_date)
      where deleted_at is null and series_client_id is not null
    do nothing;
  end if;

  return v_task;
end
$$;
alter function planly_private.set_household_task_completed(uuid,text,boolean,bigint,date) owner to postgres;
revoke all on function planly_private.set_household_task_completed(uuid,text,boolean,bigint,date) from public, anon, authenticated;
grant execute on function planly_private.set_household_task_completed(uuid,text,boolean,bigint,date) to authenticated;

create or replace function planly_private.set_household_subtask_done(
  p_owner_id uuid, p_client_id text, p_subtask_id text, p_done boolean
)
returns public.planly_tasks
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user uuid := auth.uid();
  v_task public.planly_tasks;
  v_now_ms bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  v_subtasks jsonb;
  v_found boolean := false;
begin
  if v_user is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_subtask_id is null or p_done is null then raise exception 'Invalid checklist item' using errcode = '22023'; end if;

  select * into v_task
  from public.planly_tasks t
  where t.owner_id = p_owner_id and t.client_id = p_client_id
    and t.deleted_at is null and t.visibility = 'household' and t.household_id is not null
  for update;
  if not found then raise exception 'Task not found' using errcode = 'P0002'; end if;

  if not exists (
    select 1 from public.planly_household_members m
    where m.household_id = v_task.household_id and m.user_id = v_user
  ) then raise exception 'Not authorized' using errcode = '42501'; end if;

  v_subtasks := case when jsonb_typeof(v_task.subtasks) = 'array' then v_task.subtasks else '[]'::jsonb end;
  select exists(select 1 from jsonb_array_elements(v_subtasks) e where e->>'id' = p_subtask_id) into v_found;
  if not v_found then raise exception 'Checklist item not found' using errcode = 'P0002'; end if;
  -- Already in the requested state: nothing to write (no version bump, so no needless conflicts for the owner).
  if exists(select 1 from jsonb_array_elements(v_subtasks) e
            where e->>'id' = p_subtask_id and coalesce((e->>'done')::boolean, false) = p_done) then
    return v_task;
  end if;

  -- Rebuild the array in its original order, changing only the matching item's "done".
  select coalesce(jsonb_agg(case when e.value->>'id' = p_subtask_id
                                 then jsonb_set(e.value, '{done}', to_jsonb(p_done), true)
                                 else e.value end order by e.ordinality), '[]'::jsonb)
    into v_subtasks
    from jsonb_array_elements(v_subtasks) with ordinality as e(value, ordinality);

  update public.planly_tasks t
     set subtasks = v_subtasks,
         data = jsonb_set(jsonb_set(coalesce(t.data, '{}'::jsonb), '{subtasks}', v_subtasks, true), '{updatedAt}', to_jsonb(v_now_ms), true),
         client_updated_at = greatest(t.client_updated_at, v_now_ms)
   where t.owner_id = p_owner_id and t.client_id = p_client_id
  returning * into v_task;

  return v_task;
end
$$;
alter function planly_private.set_household_subtask_done(uuid,text,text,boolean) owner to postgres;
revoke all on function planly_private.set_household_subtask_done(uuid,text,text,boolean) from public, anon, authenticated;
grant execute on function planly_private.set_household_subtask_done(uuid,text,text,boolean) to authenticated;

create or replace function public.planly_set_household_subtask_done(
  p_owner_id uuid, p_client_id text, p_subtask_id text, p_done boolean
)
returns public.planly_tasks
language sql
set search_path = pg_catalog, public
as $$
  select planly_private.set_household_subtask_done(p_owner_id, p_client_id, p_subtask_id, p_done)
$$;
revoke all on function public.planly_set_household_subtask_done(uuid,text,text,boolean) from public, anon;
grant execute on function public.planly_set_household_subtask_done(uuid,text,text,boolean) to authenticated;
comment on function public.planly_set_household_subtask_done(uuid,text,text,boolean) is
  'Household members: set one checklist item done/undone on a shared (household) task. Membership-checked server-side.';

-- ====================================================================================================
-- version 20261004213932  name 049_budget_entry_insert_hardening
-- ====================================================================================================
-- Planly 4.0R — Budget entry insert hardening.
-- The insert rule was wider than the update rule (041): anyone who created a scope could add
-- entries to it, including a Household scope after leaving that Household, and to a deleted scope.
-- Inserts now follow the update rule exactly: personal entries go only into your own live personal
-- scope; Household entries only into a live Household scope you are currently a member of.
-- The entry is always logged as yourself (owner_id = auth.uid()); the browser cannot choose it.

drop policy if exists planly_budget_entries_insert_own on public.planly_budget_entries;
drop policy if exists planly_budget_entries_insert_authorized on public.planly_budget_entries;
create policy planly_budget_entries_insert_authorized
on public.planly_budget_entries
for insert to authenticated
with check (
  planly_budget_entries.owner_id = (select auth.uid())
  and exists (
    select 1
    from public.planly_budget_scopes s
    where s.id = planly_budget_entries.scope_id
      and s.deleted_at is null
      and (
        (s.scope_type = 'personal' and s.owner_id = (select auth.uid()))
        or
        (s.scope_type = 'household' and s.household_id is not null and planly_private.is_household_member(s.household_id))
      )
  )
);

notify pgrst, 'reload schema';

-- ====================================================================================================
-- version 20261005111710  name 050_push_notifications
-- ====================================================================================================
-- Push notifications (Musti's choice, 5 Oct 2026):
--   * a reminder for each of your own timed tasks today (at its Reminder setting, or at its start time);
--   * a short morning summary of today's own tasks (not chores), at a time each person picks;
--   * an alert when the other household member assigns you a chore;
--   * nothing between 22:00 and 07:00 local time (chore alerts wait until 07:00);
--   * each person/phone has its own on/off switches.
--
-- Design
-- 1) Everything lives in planly_private (not exposed to the browser API). The browser only calls the
--    SECURITY DEFINER wrappers below, which always use auth.uid() as the owner; ownership is never taken
--    from the browser. Endpoints are limited to the real Web Push services (no arbitrary URLs).
-- 2) A trigger on planly_tasks queues a 'chore_assigned' message when someone assigns a live household
--    task to the OTHER member (new chore, or assignee changed). Later occurrences of a repeating chore
--    (series rows) are not "assignments" and are skipped.
-- 3) planly_push_worklist() (service_role only) works out what is due for each phone and claims it in
--    planly_private.push_sent in the same statement, so overlapping runs never send twice.
--    planly_push_report() records the result; a 404/410 from the push service revokes that phone.
-- 4) pg_cron calls the planly-push Edge Function every 5 minutes. Its shared secret, and the VAPID
--    keys, are stored in Supabase Vault (never in the repo or in browser code).
-- 5) Only planly_tasks data is used. External calendars (including private ICS feeds) are never read.

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

create table if not exists planly_private.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth_secret text not null,
  time_zone text not null default 'Europe/London',
  notify_tasks boolean not null default true,
  notify_chores boolean not null default true,
  notify_summary boolean not null default true,
  summary_time time not null default '07:30',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_sent_at timestamptz,
  failures integer not null default 0,
  revoked_at timestamptz,
  constraint push_endpoint_service check (
    length(endpoint) <= 1024 and endpoint ~ '^https://(web\.push\.apple\.com|fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9-]+\.notify\.windows\.com)/'
  ),
  constraint push_keys_shape check (
    p256dh ~ '^[A-Za-z0-9_-]{80,100}$' and auth_secret ~ '^[A-Za-z0-9_-]{16,30}$'
  ),
  constraint push_time_zone_shape check (time_zone ~ '^[A-Za-z_]+(/[A-Za-z0-9_+-]+){0,2}$' and length(time_zone) <= 64)
);
create index if not exists push_subscriptions_user_idx on planly_private.push_subscriptions(user_id);

create table if not exists planly_private.push_sent (
  subscription_id uuid not null references planly_private.push_subscriptions(id) on delete cascade,
  kind text not null,
  ref text not null,
  sent_at timestamptz not null default now(),
  primary key (subscription_id, kind, ref)
);

create table if not exists planly_private.push_outbox (
  id bigint generated always as identity primary key,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('chore_assigned', 'test')),
  title text not null check (length(title) <= 120),
  body text not null check (length(body) <= 240),
  created_at timestamptz not null default now()
);
create index if not exists push_outbox_recipient_idx on planly_private.push_outbox(recipient_id, created_at);

alter table planly_private.push_subscriptions enable row level security;
alter table planly_private.push_sent enable row level security;
alter table planly_private.push_outbox enable row level security;
revoke all on planly_private.push_subscriptions, planly_private.push_sent, planly_private.push_outbox from public, anon, authenticated;

-- ---------- Browser RPCs (owner = auth.uid(), always) ----------

create or replace function planly_private.save_push_subscription(
  p_endpoint text, p_p256dh text, p_auth text, p_time_zone text,
  p_notify_tasks boolean, p_notify_chores boolean, p_notify_summary boolean, p_summary_time time
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user uuid := auth.uid();
  v_row planly_private.push_subscriptions;
begin
  if v_user is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  begin
    perform now() at time zone p_time_zone;
  exception when others then
    raise exception 'Unknown time zone' using errcode = '22023';
  end;
  insert into planly_private.push_subscriptions as s
    (user_id, endpoint, p256dh, auth_secret, time_zone, notify_tasks, notify_chores, notify_summary, summary_time)
  values (v_user, p_endpoint, p_p256dh, p_auth, p_time_zone,
    coalesce(p_notify_tasks, true), coalesce(p_notify_chores, true), coalesce(p_notify_summary, true), coalesce(p_summary_time, '07:30'))
  on conflict (endpoint) do update set
    -- The endpoint is held by this phone's browser, so whoever is signed in on it now owns it.
    user_id = v_user, p256dh = excluded.p256dh, auth_secret = excluded.auth_secret, time_zone = excluded.time_zone,
    notify_tasks = excluded.notify_tasks, notify_chores = excluded.notify_chores,
    notify_summary = excluded.notify_summary, summary_time = excluded.summary_time,
    updated_at = now(), revoked_at = null, failures = 0
  returning * into v_row;
  return jsonb_build_object('notify_tasks', v_row.notify_tasks, 'notify_chores', v_row.notify_chores,
    'notify_summary', v_row.notify_summary, 'summary_time', to_char(v_row.summary_time, 'HH24:MI'));
end;
$$;

create or replace function planly_private.get_push_subscription(p_endpoint text)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select jsonb_build_object('notify_tasks', s.notify_tasks, 'notify_chores', s.notify_chores,
    'notify_summary', s.notify_summary, 'summary_time', to_char(s.summary_time, 'HH24:MI'))
  from planly_private.push_subscriptions s
  where s.endpoint = p_endpoint and s.user_id = auth.uid() and s.revoked_at is null
$$;

create or replace function planly_private.revoke_push_subscription(p_endpoint text)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  update planly_private.push_subscriptions set revoked_at = now(), updated_at = now()
  where endpoint = p_endpoint and user_id = auth.uid() and revoked_at is null;
  return found;
end;
$$;

create or replace function planly_private.queue_test_push()
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if exists (select 1 from planly_private.push_outbox o
             where o.recipient_id = v_user and o.kind = 'test' and o.created_at > now() - interval '1 minute') then
    return false;
  end if;
  insert into planly_private.push_outbox(recipient_id, kind, title, body)
  values (v_user, 'test', 'Planly', 'Notifications are working on this phone.');
  return true;
end;
$$;

revoke all on function planly_private.save_push_subscription(text,text,text,text,boolean,boolean,boolean,time) from public, anon, authenticated;
revoke all on function planly_private.get_push_subscription(text) from public, anon, authenticated;
revoke all on function planly_private.revoke_push_subscription(text) from public, anon, authenticated;
revoke all on function planly_private.queue_test_push() from public, anon, authenticated;
grant execute on function planly_private.save_push_subscription(text,text,text,text,boolean,boolean,boolean,time) to authenticated;
grant execute on function planly_private.get_push_subscription(text) to authenticated;
grant execute on function planly_private.revoke_push_subscription(text) to authenticated;
grant execute on function planly_private.queue_test_push() to authenticated;

create or replace function public.planly_save_push_subscription(
  p_endpoint text, p_p256dh text, p_auth text, p_time_zone text,
  p_notify_tasks boolean, p_notify_chores boolean, p_notify_summary boolean, p_summary_time time
)
returns jsonb language sql set search_path = pg_catalog, public
as $$ select planly_private.save_push_subscription(p_endpoint, p_p256dh, p_auth, p_time_zone, p_notify_tasks, p_notify_chores, p_notify_summary, p_summary_time) $$;
create or replace function public.planly_get_push_subscription(p_endpoint text)
returns jsonb language sql stable set search_path = pg_catalog, public
as $$ select planly_private.get_push_subscription(p_endpoint) $$;
create or replace function public.planly_revoke_push_subscription(p_endpoint text)
returns boolean language sql set search_path = pg_catalog, public
as $$ select planly_private.revoke_push_subscription(p_endpoint) $$;
create or replace function public.planly_queue_test_push()
returns boolean language sql set search_path = pg_catalog, public
as $$ select planly_private.queue_test_push() $$;

revoke all on function public.planly_save_push_subscription(text,text,text,text,boolean,boolean,boolean,time) from public, anon;
revoke all on function public.planly_get_push_subscription(text) from public, anon;
revoke all on function public.planly_revoke_push_subscription(text) from public, anon;
revoke all on function public.planly_queue_test_push() from public, anon;
grant execute on function public.planly_save_push_subscription(text,text,text,text,boolean,boolean,boolean,time) to authenticated;
grant execute on function public.planly_get_push_subscription(text) to authenticated;
grant execute on function public.planly_revoke_push_subscription(text) to authenticated;
grant execute on function public.planly_queue_test_push() to authenticated;

-- ---------- Chore assignment → outbox ----------

create or replace function planly_private.queue_chore_assigned_push()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
  v_name text;
begin
  if v_actor is null or new.assignee_id is null or new.assignee_id = v_actor then return new; end if;
  if new.visibility is distinct from 'household' or new.household_id is null
     or new.deleted_at is not null or coalesce(new.completed, false) then return new; end if;
  if tg_op = 'INSERT' and coalesce(new.series_client_id, new.client_id) <> new.client_id then return new; end if;
  if tg_op = 'UPDATE' and old.assignee_id is not distinct from new.assignee_id then return new; end if;
  -- Both people must be members of the task's household.
  if not exists (select 1 from public.planly_household_members m where m.household_id = new.household_id and m.user_id = v_actor)
     or not exists (select 1 from public.planly_household_members m where m.household_id = new.household_id and m.user_id = new.assignee_id)
  then return new; end if;
  select nullif(btrim(m.display_name), '') into v_name
  from public.planly_household_members m where m.household_id = new.household_id and m.user_id = v_actor;
  insert into planly_private.push_outbox(recipient_id, kind, title, body)
  values (new.assignee_id, 'chore_assigned', 'New chore for you',
    left(coalesce(v_name, 'Your partner') || ' assigned you: ' || coalesce(nullif(btrim(new.title), ''), 'a chore'), 240));
  return new;
exception when others then
  -- A notification problem must never block saving a task.
  return new;
end;
$$;
revoke all on function planly_private.queue_chore_assigned_push() from public, anon, authenticated;

create or replace trigger planly_tasks_chore_assigned_push
after insert or update of assignee_id on public.planly_tasks
for each row execute function planly_private.queue_chore_assigned_push();

-- ---------- Worker RPCs (service_role only; called by the planly-push Edge Function) ----------

create or replace function planly_private.push_reminder_offset(p_reminder text)
returns interval
language sql
immutable
set search_path = pg_catalog
as $$
  select case p_reminder
    when '5-min' then interval '5 minutes'
    when '15-min' then interval '15 minutes'
    when '30-min' then interval '30 minutes'
    when '60-min' then interval '1 hour'
    when '1440-min' then interval '1 day'
    else interval '0' end
$$;

create or replace function public.planly_push_config()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'vapid_public', (select decrypted_secret from vault.decrypted_secrets where name = 'planly_push_vapid_public'),
    'vapid_private', (select decrypted_secret from vault.decrypted_secrets where name = 'planly_push_vapid_private'),
    'cron_secret', (select decrypted_secret from vault.decrypted_secrets where name = 'planly_push_cron_secret'))
$$;

create or replace function public.planly_push_worklist(p_now timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_out jsonb := '[]'::jsonb;
  s record;
  v_local timestamp;
  v_date date;
  v_quiet boolean;
  v_msgs jsonb;
  v_part jsonb;
  v_count integer;
  v_lines text;
begin
  for s in select * from planly_private.push_subscriptions where revoked_at is null loop
    v_local := p_now at time zone s.time_zone;
    v_date := v_local::date;
    v_quiet := v_local::time >= time '22:00' or v_local::time < time '07:00';
    v_msgs := '[]'::jsonb;

    -- Task reminders: own (non-household) timed tasks, due in the last 15 minutes.
    if s.notify_tasks and not v_quiet then
      with due as (
        select t.cloud_id, t.title, t.task_date, t.task_time, coalesce(t.reminder, 'none') as reminder,
               (t.task_date + t.task_time) - planly_private.push_reminder_offset(t.reminder) as fire_at,
               t.cloud_id::text || ':' || t.task_date || ':' || t.task_time || ':' || coalesce(t.reminder, 'none') as ref
        from public.planly_tasks t
        where t.owner_id = s.user_id and t.deleted_at is null and coalesce(t.completed, false) = false
          and t.visibility is distinct from 'household'
          and t.task_time is not null and t.task_date between v_date and v_date + 1
      ), claimed as (
        insert into planly_private.push_sent(subscription_id, kind, ref)
        select s.id, 'task', d.ref from due d
        where d.fire_at <= v_local and d.fire_at > v_local - interval '15 minutes'
        on conflict do nothing
        returning ref
      )
      select coalesce(jsonb_agg(jsonb_build_object('kind', 'task', 'tag', 'task-' || d.cloud_id,
          'title', left(coalesce(nullif(btrim(d.title), ''), 'Task'), 120),
          'body', case when d.reminder in ('none', 'at-time') then 'Starting now · ' || to_char(d.task_time, 'HH24:MI')
                       when d.task_date > v_date then 'Tomorrow at ' || to_char(d.task_time, 'HH24:MI')
                       else 'Today at ' || to_char(d.task_time, 'HH24:MI') end) order by d.fire_at), '[]'::jsonb)
        into v_part
      from due d join claimed c on c.ref = d.ref;
      v_msgs := v_msgs || v_part;
    end if;

    -- Morning summary: own (non-household) tasks today, within 2 hours after the chosen time.
    if s.notify_summary and not v_quiet and v_local::time >= s.summary_time and v_local::time < s.summary_time + interval '2 hours' then
      select count(*), string_agg(line, ', ' order by ord) into v_count, v_lines
      from (
        select row_number() over (order by t.task_time nulls last, t.title) as ord,
               case when t.task_time is null then t.title else to_char(t.task_time, 'HH24:MI') || ' ' || t.title end as line
        from public.planly_tasks t
        where t.owner_id = s.user_id and t.deleted_at is null and coalesce(t.completed, false) = false
          and t.visibility is distinct from 'household' and t.task_date = v_date
      ) x where ord <= 3;
      if v_count > 0 then
        select count(*) into v_count from public.planly_tasks t
        where t.owner_id = s.user_id and t.deleted_at is null and coalesce(t.completed, false) = false
          and t.visibility is distinct from 'household' and t.task_date = v_date;
        insert into planly_private.push_sent(subscription_id, kind, ref) values (s.id, 'summary', v_date::text)
        on conflict do nothing;
        if found then
          v_msgs := v_msgs || jsonb_build_object('kind', 'summary', 'tag', 'summary-' || v_date,
            'title', case when v_count = 1 then '1 task today' else v_count || ' tasks today' end,
            'body', left(v_lines || case when v_count > 3 then ' +' || (v_count - 3) || ' more' else '' end, 240));
        end if;
      end if;
    end if;

    -- Outbox: chore assignments (held during quiet hours) and test messages (always), last 24 hours.
    with c as (
      insert into planly_private.push_sent(subscription_id, kind, ref)
      select s.id, 'outbox', o.id::text
      from planly_private.push_outbox o
      where o.recipient_id = s.user_id and o.created_at > p_now - interval '24 hours'
        and o.created_at >= s.created_at - interval '1 minute'
        and (o.kind = 'test' or (o.kind = 'chore_assigned' and s.notify_chores and not v_quiet))
      on conflict do nothing
      returning ref
    )
    select coalesce(jsonb_agg(jsonb_build_object('kind', o.kind, 'tag', o.kind || '-' || o.id,
        'title', o.title, 'body', o.body) order by o.id), '[]'::jsonb)
      into v_part
    from planly_private.push_outbox o join c on c.ref = o.id::text;
    v_msgs := v_msgs || v_part;

    if jsonb_array_length(v_msgs) > 0 then
      v_out := v_out || jsonb_build_object('id', s.id, 'endpoint', s.endpoint, 'p256dh', s.p256dh,
        'auth', s.auth_secret, 'messages', v_msgs);
    end if;
  end loop;
  return v_out;
end;
$$;

create or replace function public.planly_push_report(p_subscription_id uuid, p_ok boolean, p_gone boolean)
returns void
language sql
security definer
set search_path = pg_catalog, public
as $$
  update planly_private.push_subscriptions set
    last_sent_at = case when p_ok then now() else last_sent_at end,
    failures = case when p_ok then 0 else failures + 1 end,
    revoked_at = case when p_gone or (not p_ok and failures >= 20) then coalesce(revoked_at, now()) else revoked_at end
  where id = p_subscription_id
$$;

revoke all on function planly_private.push_reminder_offset(text) from public, anon, authenticated;
revoke all on function public.planly_push_config() from public, anon, authenticated;
revoke all on function public.planly_push_worklist(timestamptz) from public, anon, authenticated;
revoke all on function public.planly_push_report(uuid,boolean,boolean) from public, anon, authenticated;
grant execute on function public.planly_push_config() to service_role;
grant execute on function public.planly_push_worklist(timestamptz) to service_role;
grant execute on function public.planly_push_report(uuid,boolean,boolean) to service_role;

-- ---------- Schedule: every 5 minutes, call the planly-push Edge Function ----------
select cron.schedule('planly-push', '*/5 * * * *', $cron$
  select net.http_post(
    url := 'https://dtniwcwjucepsjzoojuc.supabase.co/functions/v1/planly-push',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-planly-cron', (select decrypted_secret from vault.decrypted_secrets where name = 'planly_push_cron_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000)
$cron$);

-- ====================================================================================================
-- version 20261006215701  name 051_google_calendar_tokens
-- ====================================================================================================
-- Google Calendar stays connected (6 Oct 2026).
--
-- Before: the browser held a one-hour Google access token and nothing could renew it, so calendar sync
-- stopped an hour after connecting.
-- Now: connecting once gives a Google refresh token, which is kept only here, server-side. The
-- google-calendar-token Edge Function uses it to hand the signed-in person a fresh one-hour token.
--
-- Design
-- 1) The refresh token lives in planly_private (not exposed to the browser API), one row per Planly user.
-- 2) Only service_role (the Edge Function) can call the three RPCs below. The browser cannot read, write
--    or list tokens. The Edge Function takes the user id from the caller's verified Supabase session,
--    never from the request body.
-- 3) Deleting the auth user deletes their token (on delete cascade).
-- 4) Nothing here reads calendars or external calendar feeds (Laki's private ICS calendar is untouched).

create table if not exists planly_private.google_calendar_tokens (
  user_id uuid primary key references auth.users(id) on delete cascade,
  refresh_token text not null check (length(refresh_token) between 20 and 2048),
  scope text not null check (length(scope) <= 1024),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table planly_private.google_calendar_tokens enable row level security;
revoke all on planly_private.google_calendar_tokens from public, anon, authenticated;

-- ---------- Edge Function RPCs (service_role only) ----------

create or replace function public.planly_google_token_save(p_user uuid, p_refresh_token text, p_scope text)
returns void
language sql
security definer
set search_path = pg_catalog, public
as $$
  insert into planly_private.google_calendar_tokens as t (user_id, refresh_token, scope)
  values (p_user, p_refresh_token, coalesce(p_scope, ''))
  on conflict (user_id) do update
    set refresh_token = excluded.refresh_token, scope = excluded.scope, updated_at = now()
$$;

create or replace function public.planly_google_token_get(p_user uuid)
returns text
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select refresh_token from planly_private.google_calendar_tokens where user_id = p_user
$$;

create or replace function public.planly_google_token_delete(p_user uuid)
returns void
language sql
security definer
set search_path = pg_catalog, public
as $$
  delete from planly_private.google_calendar_tokens where user_id = p_user
$$;

revoke all on function public.planly_google_token_save(uuid,text,text) from public, anon, authenticated;
revoke all on function public.planly_google_token_get(uuid) from public, anon, authenticated;
revoke all on function public.planly_google_token_delete(uuid) from public, anon, authenticated;
grant execute on function public.planly_google_token_save(uuid,text,text) to service_role;
grant execute on function public.planly_google_token_get(uuid) to service_role;
grant execute on function public.planly_google_token_delete(uuid) to service_role;

-- ====================================================================================================
-- version 20261011161716  name 052_undated_repeats
-- ====================================================================================================
-- Repeating tasks with no date come back (11 Oct 2026).
--
-- Bug: a repeating household task with no date (Laki's weekly chores, e.g. Kitchen "Every week · Sat") never got a
-- next copy once completed, because both the app and this function only created the next occurrence for dated tasks.
-- After one tick the chore disappeared from the active list.
--
-- planly_private.set_household_task_completed: unchanged except
--   1) a next occurrence is also created for an undated repeating task; the app sends the next repeat day counted
--      from the completion day. For an undated task the date must be later than current_date - 2 (allows the
--      phone's local date to be up to a day behind/ahead of the database's UTC date); dated tasks keep the rule
--      p_next_date > task_date;
--   2) the recurrence anchorDate falls back to p_next_date (then '') when the task has no date, so
--      jsonb_set never receives NULL.
-- Membership, household visibility, not-deleted, cloud_version and end-rule checks are unchanged.
-- Existing completed chores are NOT changed by this migration (Musti chose to restore them with Undo in the app).

create or replace function planly_private.set_household_task_completed(
  p_owner_id uuid, p_client_id text, p_completed boolean,
  p_expected_cloud_version bigint, p_next_date date default null
)
returns public.planly_tasks
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user uuid := auth.uid();
  v_task public.planly_tasks;
  v_now_ms bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  v_series_id text;
  v_next_client_id text;
  v_next_occurrence integer;
  v_cfg jsonb;
  v_end_mode text;
  v_end_date date;
  v_max_occurrences integer;
  v_next_subtasks jsonb := '[]'::jsonb;
  v_next_data jsonb;
  v_create_next boolean := false;
  v_next_assignee uuid;
begin
  if v_user is null then raise exception 'Authentication required' using errcode = '42501'; end if;

  select * into v_task
  from public.planly_tasks t
  where t.owner_id = p_owner_id and t.client_id = p_client_id
    and t.deleted_at is null and t.visibility = 'household' and t.household_id is not null
  for update;
  if not found then raise exception 'Task not found' using errcode = 'P0002'; end if;

  if not exists (
    select 1 from public.planly_household_members m
    where m.household_id = v_task.household_id and m.user_id = v_user
  ) then raise exception 'Not authorized' using errcode = '42501'; end if;

  if v_task.completed is not distinct from p_completed then return v_task; end if;
  if v_task.cloud_version is distinct from p_expected_cloud_version then
    raise exception 'Task changed elsewhere' using errcode = 'P0409';
  end if;

  v_cfg := coalesce(v_task.recurrence_config, '{}'::jsonb);
  v_series_id := coalesce(v_task.series_client_id, v_task.client_id);

  if p_completed and v_task.recurrence <> 'none' and p_next_date is not null then
    -- A repeat with no date (e.g. a weekly chore) counts its next copy from the day it is completed.
    if p_next_date <= coalesce(v_task.task_date, current_date - 2) then raise exception 'Invalid next occurrence date' using errcode = '22023'; end if;
    v_create_next := true;
    v_end_mode := coalesce(v_cfg->>'endMode', 'never');
    v_next_occurrence := coalesce(v_task.occurrence_number, 1) + 1;
    if v_end_mode = 'count' then
      begin
        v_max_occurrences := nullif(v_cfg->>'maxOccurrences', '')::integer;
      exception when invalid_text_representation or numeric_value_out_of_range then
        v_max_occurrences := null;
      end;
      if v_max_occurrences is not null and v_next_occurrence > v_max_occurrences then
        v_create_next := false;
      end if;
    elsif v_end_mode = 'date' then
      begin
        v_end_date := nullif(v_cfg->>'endDate', '')::date;
      exception when invalid_datetime_format or datetime_field_overflow then
        v_end_date := null;
      end;
      if v_end_date is not null and p_next_date > v_end_date then
        v_create_next := false;
      end if;
    end if;
  elsif p_next_date is not null then
    raise exception 'Next occurrence is not valid for this task' using errcode = '22023';
  end if;

  update public.planly_tasks t
  set completed = p_completed,
      series_client_id = case when p_completed and t.recurrence <> 'none' and t.series_client_id is null then v_series_id else t.series_client_id end,
      recurrence_config = case when p_completed and t.recurrence <> 'none'
        then jsonb_set(coalesce(t.recurrence_config, '{}'::jsonb), '{anchorDate}', to_jsonb(coalesce(t.recurrence_config->>'anchorDate', t.task_date::text, p_next_date::text, '')), true)
        else t.recurrence_config end,
      data = jsonb_set(jsonb_set(coalesce(t.data, '{}'::jsonb), '{completed}', to_jsonb(p_completed), true), '{updatedAt}', to_jsonb(v_now_ms), true)
        || case when p_completed and t.recurrence <> 'none' then jsonb_build_object(
          'seriesId', v_series_id,
          'recurrenceConfig', jsonb_set(coalesce(t.recurrence_config, '{}'::jsonb), '{anchorDate}', to_jsonb(coalesce(t.recurrence_config->>'anchorDate', t.task_date::text, p_next_date::text, '')), true)
        ) else '{}'::jsonb end,
      client_updated_at = greatest(t.client_updated_at, v_now_ms)
  where t.owner_id = p_owner_id and t.client_id = p_client_id
  returning * into v_task;

  if v_create_next then
    v_next_client_id := v_now_ms::text || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 16);
    v_next_occurrence := coalesce(v_task.occurrence_number, 1) + 1;
    select coalesce(jsonb_agg(
      (s.value - 'id' - 'done') || jsonb_build_object(
        'id', v_now_ms::text || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 16), 'done', false
      ) order by s.ordinality
    ), '[]'::jsonb)
    into v_next_subtasks
    from jsonb_array_elements(coalesce(v_task.subtasks, '[]'::jsonb)) with ordinality as s(value, ordinality);

    -- Stage 5: a chore set to rotate weekly gets the person whose week the next date falls in.
    v_next_assignee := planly_private.household_rotation_assignee(v_task.household_id, v_task.data->'rotation', p_next_date, v_task.assignee_id);

    v_next_data := coalesce(v_task.data, '{}'::jsonb) - 'top3Order' || jsonb_build_object(
      'id', v_next_client_id, 'seriesId', v_series_id, 'occurrenceNumber', v_next_occurrence,
      'date', p_next_date::text, 'completed', false, 'pinned', false, 'subtasks', v_next_subtasks,
      'createdAt', v_now_ms, 'updatedAt', v_now_ms,
      'recurrenceConfig', jsonb_set(coalesce(v_task.recurrence_config, '{}'::jsonb), '{anchorDate}', to_jsonb(coalesce(v_task.recurrence_config->>'anchorDate', v_task.task_date::text, p_next_date::text, '')), true),
      'googleEventId', case when v_task.add_to_calendar and v_task.google_event_id is not null then to_jsonb(v_task.google_event_id) else '""'::jsonb end,
      'calendarSync', to_jsonb(case when v_task.add_to_calendar then case when coalesce(v_task.google_event_id, '') <> '' then 'synced' else 'pending' end else '' end)
    ) || case when v_next_assignee is distinct from v_task.assignee_id
      then jsonb_build_object('assigneeId', v_next_assignee) else '{}'::jsonb end;

    insert into public.planly_tasks(
      owner_id, client_id, data, series_client_id, title, task_date, task_time, duration_minutes,
      priority, category, project_client_id, recurrence, recurrence_config, occurrence_number,
      reminder, notes, subtasks, completed, pinned, top3_order, add_to_calendar, google_event_id,
      google_recurrence_start_date, google_recurrence_version, calendar_sync, calendar_synced_at,
      client_created_at, client_updated_at, visibility, household_id, assignee_id, completed_by, completed_at
    ) values (
      v_task.owner_id, v_next_client_id, v_next_data, v_series_id, v_task.title, p_next_date,
      v_task.task_time, v_task.duration_minutes, v_task.priority, v_task.category, v_task.project_client_id,
      v_task.recurrence,
      jsonb_set(coalesce(v_task.recurrence_config, '{}'::jsonb), '{anchorDate}', to_jsonb(coalesce(v_task.recurrence_config->>'anchorDate', v_task.task_date::text, p_next_date::text, '')), true),
      v_next_occurrence, v_task.reminder, v_task.notes, v_next_subtasks, false, false, null,
      v_task.add_to_calendar, case when v_task.add_to_calendar then v_task.google_event_id else null end,
      v_task.google_recurrence_start_date, v_task.google_recurrence_version,
      case when v_task.add_to_calendar then case when coalesce(v_task.google_event_id, '') <> '' then 'synced' else 'pending' end else '' end,
      v_task.calendar_synced_at, v_now_ms, v_now_ms, v_task.visibility, v_task.household_id,
      v_next_assignee, null, null
    )
    on conflict (owner_id, series_client_id, task_date)
      where deleted_at is null and series_client_id is not null
    do nothing;
  end if;

  return v_task;
end
$$;

alter function planly_private.set_household_task_completed(uuid,text,boolean,bigint,date) owner to postgres;
revoke all on function planly_private.set_household_task_completed(uuid,text,boolean,bigint,date) from public, anon, authenticated;
grant execute on function planly_private.set_household_task_completed(uuid,text,boolean,bigint,date) to authenticated;

-- ====================================================================================================
-- version 20261011173125  name 053_morning_summary_shared
-- ====================================================================================================
-- Morning summary covers shared tasks and overdue tasks (11 Oct 2026).
--
-- Before: the morning summary counted only the person's own private tasks dated today, and was silent when there were
-- none. Almost all of Musti's tasks are shared household tasks, so he never got one.
-- Now (Musti's choice), public.planly_push_worklist's summary also counts shared household tasks dated today that are
-- assigned to the person or to Anyone (not to the other member), in a household the person belongs to, and adds
-- "N overdue" for such tasks dated before today and not done. It is sent when there is at least one task today or
-- overdue; with none today the title is "Nothing planned today". Still once per day, within 2 hours after the chosen
-- time, and never in quiet hours (22:00-07:00).
-- Unchanged: task reminders, the outbox (chore assignments, test messages), quiet hours, owner, search_path and
-- grants (service_role only). No data is changed.

create or replace function public.planly_push_worklist(p_now timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_out jsonb := '[]'::jsonb;
  s record;
  v_local timestamp;
  v_date date;
  v_quiet boolean;
  v_msgs jsonb;
  v_part jsonb;
  v_count integer;
  v_lines text;
  v_overdue integer;
begin
  for s in select * from planly_private.push_subscriptions where revoked_at is null loop
    v_local := p_now at time zone s.time_zone;
    v_date := v_local::date;
    v_quiet := v_local::time >= time '22:00' or v_local::time < time '07:00';
    v_msgs := '[]'::jsonb;

    -- Task reminders: own (non-household) timed tasks, due in the last 15 minutes.
    if s.notify_tasks and not v_quiet then
      with due as (
        select t.cloud_id, t.title, t.task_date, t.task_time, coalesce(t.reminder, 'none') as reminder,
               (t.task_date + t.task_time) - planly_private.push_reminder_offset(t.reminder) as fire_at,
               t.cloud_id::text || ':' || t.task_date || ':' || t.task_time || ':' || coalesce(t.reminder, 'none') as ref
        from public.planly_tasks t
        where t.owner_id = s.user_id and t.deleted_at is null and coalesce(t.completed, false) = false
          and t.visibility is distinct from 'household'
          and t.task_time is not null and t.task_date between v_date and v_date + 1
      ), claimed as (
        insert into planly_private.push_sent(subscription_id, kind, ref)
        select s.id, 'task', d.ref from due d
        where d.fire_at <= v_local and d.fire_at > v_local - interval '15 minutes'
        on conflict do nothing
        returning ref
      )
      select coalesce(jsonb_agg(jsonb_build_object('kind', 'task', 'tag', 'task-' || d.cloud_id,
          'title', left(coalesce(nullif(btrim(d.title), ''), 'Task'), 120),
          'body', case when d.reminder in ('none', 'at-time') then 'Starting now · ' || to_char(d.task_time, 'HH24:MI')
                       when d.task_date > v_date then 'Tomorrow at ' || to_char(d.task_time, 'HH24:MI')
                       else 'Today at ' || to_char(d.task_time, 'HH24:MI') end) order by d.fire_at), '[]'::jsonb)
        into v_part
      from due d join claimed c on c.ref = d.ref;
      v_msgs := v_msgs || v_part;
    end if;

    -- Morning summary, within 2 hours after the chosen time. Counts the person's tasks for today: their own private
    -- tasks, plus shared household tasks (in a household they belong to) assigned to them or to Anyone, but not
    -- tasks assigned to the other member. Also mentions how many such tasks are overdue (dated before today, not done).
    if s.notify_summary and not v_quiet and v_local::time >= s.summary_time and v_local::time < s.summary_time + interval '2 hours' then
      with mine as (
        select t.title, t.task_time, t.task_date
        from public.planly_tasks t
        where t.deleted_at is null and coalesce(t.completed, false) = false and t.task_date <= v_date
          and (
            (t.owner_id = s.user_id and t.visibility is distinct from 'household')
            or (t.visibility = 'household' and (t.assignee_id is null or t.assignee_id = s.user_id)
                and t.household_id in (select m.household_id from public.planly_household_members m where m.user_id = s.user_id))
          )
      )
      select count(*) filter (where task_date = v_date), count(*) filter (where task_date < v_date),
             string_agg(line, ', ' order by ord) filter (where ord <= 3 and task_date = v_date)
        into v_count, v_overdue, v_lines
      from (
        select m.task_date,
               row_number() over (partition by m.task_date = v_date order by m.task_time nulls last, m.title) as ord,
               case when m.task_time is null then m.title else to_char(m.task_time, 'HH24:MI') || ' ' || m.title end as line
        from mine m
      ) x;
      if v_count > 0 or v_overdue > 0 then
        insert into planly_private.push_sent(subscription_id, kind, ref) values (s.id, 'summary', v_date::text)
        on conflict do nothing;
        if found then
          v_msgs := v_msgs || jsonb_build_object('kind', 'summary', 'tag', 'summary-' || v_date,
            'title', case when v_count = 0 then 'Nothing planned today'
                          when v_count = 1 then '1 task today' else v_count || ' tasks today' end,
            'body', left(concat_ws(' · ',
                nullif(coalesce(v_lines, '') || case when v_count > 3 then ' +' || (v_count - 3) || ' more' else '' end, ''),
                case when v_overdue = 1 then '1 overdue' when v_overdue > 1 then v_overdue || ' overdue' end), 240));
        end if;
      end if;
    end if;

    -- Outbox: chore assignments (held during quiet hours) and test messages (always), last 24 hours.
    with c as (
      insert into planly_private.push_sent(subscription_id, kind, ref)
      select s.id, 'outbox', o.id::text
      from planly_private.push_outbox o
      where o.recipient_id = s.user_id and o.created_at > p_now - interval '24 hours'
        and o.created_at >= s.created_at - interval '1 minute'
        and (o.kind = 'test' or (o.kind = 'chore_assigned' and s.notify_chores and not v_quiet))
      on conflict do nothing
      returning ref
    )
    select coalesce(jsonb_agg(jsonb_build_object('kind', o.kind, 'tag', o.kind || '-' || o.id,
        'title', o.title, 'body', o.body) order by o.id), '[]'::jsonb)
      into v_part
    from planly_private.push_outbox o join c on c.ref = o.id::text;
    v_msgs := v_msgs || v_part;

    if jsonb_array_length(v_msgs) > 0 then
      v_out := v_out || jsonb_build_object('id', s.id, 'endpoint', s.endpoint, 'p256dh', s.p256dh,
        'auth', s.auth_secret, 'messages', v_msgs);
    end if;
  end loop;
  return v_out;
end;
$$;

revoke all on function public.planly_push_worklist(timestamptz) from public, anon, authenticated;
grant execute on function public.planly_push_worklist(timestamptz) to service_role;

-- ====================================================================================================
-- version 20261011225943  name 054_fitness_food_foundation
-- ====================================================================================================
-- Fitness › Food foundation (11 Oct 2026).
--
-- A private calorie and macro tracker. Every row belongs to one person and is visible and editable only by that person.
-- Nothing is shared with the household (Musti's choice), there are no household columns, and nothing reads calendars.
--
-- Tables
--   planly_food_profile     one row per person: body details used to suggest targets, and the daily targets themselves
--   planly_food_entries     the food log: one row per food eaten (date, meal, amount and the nutrients for that amount)
--   planly_food_favourites  saved foods with per-100 g values, for one-tap adding and for products found by barcode
-- Rules
--   * RLS on every table; select/insert/update/delete only where owner_id = auth.uid(). No anon access.
--   * cloud_version is bumped on every update (optimistic concurrency, as the rest of Planly).
--   * id, owner_id and client_id cannot change after insert.
--   * Values are bounded by CHECK constraints so a bad client cannot store nonsense.
-- Deleting the auth user deletes their rows (on delete cascade). No existing table or data is changed.

create table if not exists public.planly_food_profile (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  sex text check (sex in ('male','female')),
  birth_year integer check (birth_year between 1900 and 2100),
  height_cm numeric(5,1) check (height_cm between 80 and 250),
  weight_kg numeric(5,1) check (weight_kg between 25 and 400),
  activity text not null default 'light' check (activity in ('sedentary','light','moderate','active','very_active')),
  goal text not null default 'maintain' check (goal in ('lose','maintain','gain')),
  pace_kg_week numeric(3,2) not null default 0 check (pace_kg_week between 0 and 1),
  kcal_target integer not null default 2000 check (kcal_target between 800 and 6000),
  protein_g integer not null default 120 check (protein_g between 0 and 500),
  carbs_g integer not null default 220 check (carbs_g between 0 and 1000),
  fat_g integer not null default 70 check (fat_g between 0 and 400),
  targets_custom boolean not null default false,
  client_updated_at bigint not null,
  cloud_version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.planly_food_entries (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  client_id text not null check (char_length(client_id) between 1 and 80),
  entry_date date not null,
  meal text not null check (meal in ('breakfast','lunch','dinner','snack')),
  name text not null check (char_length(btrim(name)) between 1 and 160),
  brand text not null default '' check (char_length(brand) <= 120),
  barcode text check (barcode ~ '^[0-9]{6,14}$'),
  source text not null default 'manual' check (source in ('manual','search','barcode','favourite','quick')),
  amount numeric(8,2) not null default 1 check (amount > 0 and amount <= 10000),
  unit text not null default 'serving' check (unit in ('g','ml','serving')),
  kcal numeric(7,1) not null check (kcal between 0 and 10000),
  protein_g numeric(6,1) not null default 0 check (protein_g between 0 and 1000),
  carbs_g numeric(6,1) not null default 0 check (carbs_g between 0 and 1000),
  fat_g numeric(6,1) not null default 0 check (fat_g between 0 and 1000),
  client_created_at bigint not null,
  client_updated_at bigint not null,
  cloud_version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique(owner_id, client_id)
);

create table if not exists public.planly_food_favourites (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  client_id text not null check (char_length(client_id) between 1 and 80),
  name text not null check (char_length(btrim(name)) between 1 and 160),
  brand text not null default '' check (char_length(brand) <= 120),
  barcode text check (barcode ~ '^[0-9]{6,14}$'),
  kcal_100 numeric(7,1) not null check (kcal_100 between 0 and 2000),
  protein_100 numeric(6,1) not null default 0 check (protein_100 between 0 and 100),
  carbs_100 numeric(6,1) not null default 0 check (carbs_100 between 0 and 100),
  fat_100 numeric(6,1) not null default 0 check (fat_100 between 0 and 100),
  serving_g numeric(7,1) check (serving_g > 0 and serving_g <= 5000),
  serving_label text not null default '' check (char_length(serving_label) <= 60),
  use_count integer not null default 0 check (use_count >= 0),
  last_used_at timestamptz,
  client_created_at bigint not null,
  client_updated_at bigint not null,
  cloud_version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique(owner_id, client_id)
);

create index if not exists planly_food_entries_owner_date_idx on public.planly_food_entries(owner_id, entry_date) where deleted_at is null;
create index if not exists planly_food_favourites_owner_idx on public.planly_food_favourites(owner_id) where deleted_at is null;
create index if not exists planly_food_favourites_barcode_idx on public.planly_food_favourites(owner_id, barcode) where deleted_at is null and barcode is not null;

alter table public.planly_food_profile enable row level security;
alter table public.planly_food_entries enable row level security;
alter table public.planly_food_favourites enable row level security;
revoke all on public.planly_food_profile, public.planly_food_entries, public.planly_food_favourites from public, anon;
grant select, insert, update, delete on public.planly_food_profile, public.planly_food_entries, public.planly_food_favourites to authenticated;

create or replace function public.planly_protect_food_identity()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  if new.owner_id is distinct from old.owner_id then
    raise exception 'Food row owner is immutable';
  end if;
  if tg_table_name <> 'planly_food_profile' and (new.id is distinct from old.id or new.client_id is distinct from old.client_id) then
    raise exception 'Food row identity is immutable';
  end if;
  return new;
end $$;
revoke all on function public.planly_protect_food_identity() from public, anon, authenticated;

create trigger planly_food_profile_bump_version before update on public.planly_food_profile for each row execute function public.bump_planly_cloud_version();
create trigger planly_food_entries_bump_version before update on public.planly_food_entries for each row execute function public.bump_planly_cloud_version();
create trigger planly_food_favourites_bump_version before update on public.planly_food_favourites for each row execute function public.bump_planly_cloud_version();
create trigger planly_food_profile_protect_identity before update on public.planly_food_profile for each row execute function public.planly_protect_food_identity();
create trigger planly_food_entries_protect_identity before update on public.planly_food_entries for each row execute function public.planly_protect_food_identity();
create trigger planly_food_favourites_protect_identity before update on public.planly_food_favourites for each row execute function public.planly_protect_food_identity();

create policy planly_food_profile_select_owner on public.planly_food_profile for select to authenticated using (owner_id = (select auth.uid()));
create policy planly_food_profile_insert_owner on public.planly_food_profile for insert to authenticated with check (owner_id = (select auth.uid()));
create policy planly_food_profile_update_owner on public.planly_food_profile for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy planly_food_profile_delete_owner on public.planly_food_profile for delete to authenticated using (owner_id = (select auth.uid()));

create policy planly_food_entries_select_owner on public.planly_food_entries for select to authenticated using (owner_id = (select auth.uid()));
create policy planly_food_entries_insert_owner on public.planly_food_entries for insert to authenticated with check (owner_id = (select auth.uid()));
create policy planly_food_entries_update_owner on public.planly_food_entries for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy planly_food_entries_delete_owner on public.planly_food_entries for delete to authenticated using (owner_id = (select auth.uid()));

create policy planly_food_favourites_select_owner on public.planly_food_favourites for select to authenticated using (owner_id = (select auth.uid()));
create policy planly_food_favourites_insert_owner on public.planly_food_favourites for insert to authenticated with check (owner_id = (select auth.uid()));
create policy planly_food_favourites_update_owner on public.planly_food_favourites for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy planly_food_favourites_delete_owner on public.planly_food_favourites for delete to authenticated using (owner_id = (select auth.uid()));

-- ====================================================================================================
-- version 20261012001347  name 055_revoke_extra_table_rights
-- ====================================================================================================
-- Remove table rights the app never uses from signed-in users (12 Oct 2026).
--
-- Supabase's default privileges give the authenticated role TRUNCATE, TRIGGER, REFERENCES and MAINTAIN on new tables.
-- Migrations 037 (lists) and 054 (food) granted only select/insert/update/delete but did not take these away.
-- TRUNCATE in particular is not subject to RLS. The app cannot send it (PostgREST has no TRUNCATE), but signed-in
-- users should not hold it. Every other public table already lacks these rights.
-- This only revokes rights from authenticated (anon already has none on these tables). select/insert/update/delete,
-- RLS, policies, service_role and all data are unchanged.

revoke truncate, trigger, references, maintain
  on public.planly_food_profile, public.planly_food_entries, public.planly_food_favourites,
     public.planly_lists, public.planly_list_items
  from authenticated;

-- ====================================================================================================
-- version 20261116164642  name 063_revoke_guard_execute
-- ====================================================================================================
revoke execute on function public.planly_budget_entry_immutable_guard() from public, anon, authenticated;
revoke execute on function public.planly_protect_list_identity() from public, anon, authenticated;

-- ====================================================================================================
-- version 20261116164704  name 064_budget_entries_select_explicit_predicate
-- ====================================================================================================
drop policy if exists planly_budget_entries_select_authorized on public.planly_budget_entries;

create policy planly_budget_entries_select_authorized
on public.planly_budget_entries
for select to authenticated
using (
  (select auth.uid()) = owner_id
  or exists (
    select 1
      from public.planly_budget_scopes s
     where s.id=scope_id
       and s.scope_type = 'household'
       and s.household_id is not null
       and planly_private.is_household_member(s.household_id)
  )
);

notify pgrst, 'reload schema';
