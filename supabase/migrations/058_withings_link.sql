-- Fitness › Body: link a Withings scale (30 Oct 2026).
--
-- Connecting once gives Withings tokens that are kept only here, server-side, like Google Calendar (migration 051).
-- The withings Edge Function uses them to read the person's own weigh-ins and save them to planly_body_weights.
--
-- Design
-- 1) Tokens live in planly_private (not exposed to the browser API), one row per Planly user; a Withings account can
--    be linked to only one Planly user.
-- 2) Only service_role (the Edge Function) can call the RPCs below. The browser cannot read, write or list tokens.
--    The Edge Function takes the Planly user from the caller's verified Supabase session, or from a signed,
--    short-lived sign-in state it issued to that session; never from anything the browser chooses.
-- 3) Weigh-ins are saved only as the linked person's own rows (owner_id = that user), never shared with the
--    household, and a reading is stored once (unique owner_id + external_id from 056).
-- 4) Deleting the auth user deletes their link (on delete cascade). No existing table or data is changed.

create table if not exists planly_private.withings_links (
  user_id uuid primary key references auth.users(id) on delete cascade,
  withings_user text not null unique check (length(withings_user) between 1 and 40),
  access_token text not null check (length(access_token) between 10 and 2048),
  refresh_token text not null check (length(refresh_token) between 10 and 2048),
  expires_at timestamptz not null,
  scope text not null default '' check (length(scope) <= 512),
  last_sync_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table planly_private.withings_links enable row level security;
revoke all on planly_private.withings_links from public, anon, authenticated;

-- ---------- Edge Function RPCs (service_role only) ----------

create or replace function public.planly_withings_link_save(p_user uuid, p_withings_user text, p_access text, p_refresh text, p_expires_at timestamptz, p_scope text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  -- a Withings account belongs to one Planly person: linking it here unlinks it from anyone else first
  delete from planly_private.withings_links where withings_user = p_withings_user and user_id <> p_user;
  insert into planly_private.withings_links as l (user_id, withings_user, access_token, refresh_token, expires_at, scope)
  values (p_user, p_withings_user, p_access, p_refresh, p_expires_at, coalesce(p_scope, ''))
  on conflict (user_id) do update
    set withings_user = excluded.withings_user, access_token = excluded.access_token, refresh_token = excluded.refresh_token,
        expires_at = excluded.expires_at, scope = excluded.scope, updated_at = now();
end $$;

create or replace function public.planly_withings_link_get(p_user uuid default null, p_withings_user text default null)
returns table (user_id uuid, withings_user text, access_token text, refresh_token text, expires_at timestamptz, last_sync_at timestamptz)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select l.user_id, l.withings_user, l.access_token, l.refresh_token, l.expires_at, l.last_sync_at
  from planly_private.withings_links l
  where (p_user is not null and l.user_id = p_user) or (p_user is null and p_withings_user is not null and l.withings_user = p_withings_user)
  limit 1
$$;

create or replace function public.planly_withings_link_touch(p_user uuid)
returns void
language sql
security definer
set search_path = pg_catalog, public
as $$
  update planly_private.withings_links set last_sync_at = now(), updated_at = now() where user_id = p_user
$$;

create or replace function public.planly_withings_link_delete(p_user uuid)
returns void
language sql
security definer
set search_path = pg_catalog, public
as $$
  delete from planly_private.withings_links where user_id = p_user
$$;

revoke all on function public.planly_withings_link_save(uuid,text,text,text,timestamptz,text) from public, anon, authenticated;
revoke all on function public.planly_withings_link_get(uuid,text) from public, anon, authenticated;
revoke all on function public.planly_withings_link_touch(uuid) from public, anon, authenticated;
revoke all on function public.planly_withings_link_delete(uuid) from public, anon, authenticated;
grant execute on function public.planly_withings_link_save(uuid,text,text,text,timestamptz,text) to service_role;
grant execute on function public.planly_withings_link_get(uuid,text) to service_role;
grant execute on function public.planly_withings_link_touch(uuid) to service_role;
grant execute on function public.planly_withings_link_delete(uuid) to service_role;
