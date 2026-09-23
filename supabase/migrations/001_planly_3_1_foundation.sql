-- Planly 3.1 foundation schema.
-- This migration represents the current base schema needed by migrations 002+.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.calendar_sources (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  source_type text not null check (source_type in ('ical','google','planly','shared')),
  colour text not null default '#E78AA7',
  is_read_only boolean not null default true,
  show_today boolean not null default true,
  show_month boolean not null default true,
  show_timeline boolean not null default true,
  enabled boolean not null default true,
  last_synced_at timestamptz,
  status text not null default 'connected',
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists calendar_sources_owner_id_idx
  on public.calendar_sources(owner_id);

create table if not exists public.external_calendar_events (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.calendar_sources(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  external_uid text not null,
  title text not null default 'Busy',
  description text,
  location text,
  starts_at timestamptz,
  ends_at timestamptz,
  is_all_day boolean not null default false,
  start_date date,
  end_date date,
  source_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_id, external_uid)
);

create index if not exists external_calendar_events_source_id_idx
  on public.external_calendar_events(source_id);

create index if not exists external_calendar_events_owner_date_idx
  on public.external_calendar_events(owner_id, start_date, end_date);

alter table public.profiles enable row level security;
alter table public.calendar_sources enable row level security;
alter table public.external_calendar_events enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles
  for select
  to authenticated
  using (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "calendar_sources_select_own" on public.calendar_sources;
create policy "calendar_sources_select_own"
  on public.calendar_sources
  for select
  to authenticated
  using (auth.uid() = owner_id);

drop policy if exists "calendar_sources_insert_own" on public.calendar_sources;
create policy "calendar_sources_insert_own"
  on public.calendar_sources
  for insert
  to authenticated
  with check (auth.uid() = owner_id);

drop policy if exists "calendar_sources_update_own" on public.calendar_sources;
create policy "calendar_sources_update_own"
  on public.calendar_sources
  for update
  to authenticated
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

drop policy if exists "calendar_sources_delete_own" on public.calendar_sources;
create policy "calendar_sources_delete_own"
  on public.calendar_sources
  for delete
  to authenticated
  using (auth.uid() = owner_id);

drop policy if exists "external_calendar_events_select_own" on public.external_calendar_events;
create policy "external_calendar_events_select_own"
  on public.external_calendar_events
  for select
  to authenticated
  using (auth.uid() = owner_id);

grant select, update
on table public.profiles
to authenticated;

grant select, insert, update, delete
on table public.calendar_sources
to authenticated;

revoke all
on table public.external_calendar_events
from anon, authenticated;

create or replace function public.handle_new_planly_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'display_name', ''),
      nullif(new.raw_user_meta_data ->> 'name', ''),
      new.email
    )
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_planly_user_created on auth.users;
create trigger on_planly_user_created
  after insert on auth.users
  for each row execute function public.handle_new_planly_user();

notify pgrst, 'reload schema';
