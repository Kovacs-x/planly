-- Fitness › Body: weigh-ins from Apple Health (30 Oct 2026).
--
-- A smart scale's app (e.g. RENPHO Health) writes each weigh-in to Apple Health; an iPhone Shortcut on the person's own
-- phone sends new readings to Planly's body-import Edge Function with a private import key. The key identifies the
-- person: readings are saved only as their own rows in planly_body_weights.
--
-- Design
-- 1) Only a SHA-256 hash of the import key is stored (planly_private, not exposed to the browser API), one key per
--    Planly user; making a new key replaces the old one, and the person can remove it.
-- 2) Only service_role (the Edge Function) can call the RPCs below. The browser cannot read, write or list keys. The
--    Edge Function takes the user from the caller's verified Supabase session when making or removing a key, and from
--    the key's hash when importing; never from anything else the caller sends.
-- 3) planly_body_weights.source also allows 'apple_health' (was manual | withings); nothing else about the table,
--    its policies or its data changes.
-- 4) Deleting the auth user deletes their key (on delete cascade).

create table if not exists planly_private.body_import_keys (
  user_id uuid primary key references auth.users(id) on delete cascade,
  key_hash text not null unique check (key_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

alter table planly_private.body_import_keys enable row level security;
revoke all on planly_private.body_import_keys from public, anon, authenticated;

alter table public.planly_body_weights drop constraint if exists planly_body_weights_source_check;
alter table public.planly_body_weights add constraint planly_body_weights_source_check check (source in ('manual','withings','apple_health'));

-- ---------- Edge Function RPCs (service_role only) ----------

create or replace function public.planly_body_import_key_set(p_user uuid, p_key_hash text)
returns void
language sql
security definer
set search_path = pg_catalog, public
as $$
  insert into planly_private.body_import_keys as k (user_id, key_hash) values (p_user, p_key_hash)
  on conflict (user_id) do update set key_hash = excluded.key_hash, created_at = now(), last_used_at = null
$$;

-- who a key belongs to (and marks it used); null when the key is unknown
create or replace function public.planly_body_import_key_use(p_key_hash text)
returns uuid
language sql
security definer
set search_path = pg_catalog, public
as $$
  update planly_private.body_import_keys set last_used_at = now() where key_hash = p_key_hash returning user_id
$$;

create or replace function public.planly_body_import_key_status(p_user uuid)
returns table (created_at timestamptz, last_used_at timestamptz)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select k.created_at, k.last_used_at from planly_private.body_import_keys k where k.user_id = p_user
$$;

create or replace function public.planly_body_import_key_delete(p_user uuid)
returns void
language sql
security definer
set search_path = pg_catalog, public
as $$
  delete from planly_private.body_import_keys where user_id = p_user
$$;

revoke all on function public.planly_body_import_key_set(uuid,text) from public, anon, authenticated;
revoke all on function public.planly_body_import_key_use(text) from public, anon, authenticated;
revoke all on function public.planly_body_import_key_status(uuid) from public, anon, authenticated;
revoke all on function public.planly_body_import_key_delete(uuid) from public, anon, authenticated;
grant execute on function public.planly_body_import_key_set(uuid,text) to service_role;
grant execute on function public.planly_body_import_key_use(text) to service_role;
grant execute on function public.planly_body_import_key_status(uuid) to service_role;
grant execute on function public.planly_body_import_key_delete(uuid) to service_role;
