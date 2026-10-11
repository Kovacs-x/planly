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
