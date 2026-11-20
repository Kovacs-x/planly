-- Supabase platform baseline for a local rebuild (what a new project has before any Planly migration).
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin noinherit bypassrls; end if;
  if not exists (select 1 from pg_roles where rolname='authenticator') then create role authenticator login noinherit; end if;
  if not exists (select 1 from pg_roles where rolname='supabase_admin') then create role supabase_admin login superuser; end if;
end $$;
grant anon, authenticated, service_role to authenticator;
create schema extensions;
create extension pgcrypto with schema extensions;
create extension "uuid-ossp" with schema extensions;
grant usage on schema extensions to anon, authenticated, service_role;
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text, created_at timestamptz default now(), raw_user_meta_data jsonb default '{}', raw_app_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$ select nullif(coalesce(current_setting('request.jwt.claim.sub', true), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')), '')::uuid $$;
create function auth.role() returns text language sql stable as $$ select nullif(coalesce(current_setting('request.jwt.claim.role', true), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')), '')::text $$;
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claim', true), ''), nullif(current_setting('request.jwt.claims', true), ''))::jsonb $$;
create function auth.email() returns text language sql stable as $$ select auth.jwt() ->> 'email' $$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on all functions in schema auth to anon, authenticated, service_role;
create schema realtime;
create table realtime.messages (id uuid default gen_random_uuid(), topic text not null, extension text not null, payload jsonb, event text, private boolean default false, updated_at timestamptz default now(), inserted_at timestamptz default now(), primary key (id, inserted_at));
alter table realtime.messages enable row level security;
create function realtime.topic() returns text language sql stable as $$ select nullif(current_setting('realtime.topic', true), '')::text $$;
create function realtime.send(payload jsonb, event text, topic text, private boolean default true) returns void language sql as $$ insert into realtime.messages(payload,event,topic,private,extension) values (payload,event,topic,private,'broadcast') $$;
create function realtime.broadcast_changes(topic_name text, event_name text, operation text, table_name text, table_schema text, new record, old record, level text default 'ROW') returns void language plpgsql as $$ begin perform realtime.send(jsonb_build_object('operation',operation,'table',table_name,'schema',table_schema), event_name, topic_name, true); end $$;
grant usage on schema realtime to anon, authenticated, service_role;
grant select, insert on realtime.messages to authenticated;
create publication supabase_realtime;
create schema vault;
create extension supabase_vault with schema vault;
grant usage on schema public to anon, authenticated, service_role, postgres;
-- prod's current default privileges for objects postgres creates in public (pg_default_acl, read 20 Nov 2026)
alter default privileges for role postgres in schema public revoke all on functions from public;
alter default privileges for role postgres in schema public grant execute on functions to postgres;
alter default privileges for role postgres in schema public grant truncate, references, trigger on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant select, update, usage on sequences to postgres;
