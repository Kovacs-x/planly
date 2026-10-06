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
