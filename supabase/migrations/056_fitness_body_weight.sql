-- Fitness › Body: a private weight log (28 Oct 2026).
--
-- One row per weigh-in, in kg. Like Food, every row belongs to one person and is visible and editable only by that
-- person: nothing is shared with the household, and there are no household columns. BMI uses the height already in
-- planly_food_profile, which also gains an optional goal weight.
--
-- Tables
--   planly_body_weights   the weight log: one row per weigh-in (when, kg, typed in or from a smart scale)
--   planly_food_profile   + goal_weight_kg (nullable; no existing value changes)
-- Rules (as 054/055)
--   * RLS; select/insert/update/delete only where owner_id = auth.uid(). No anon access.
--   * Signed-in users get select/insert/update/delete only (no truncate/trigger/references/maintain).
--   * cloud_version is bumped on every update; id, owner_id and client_id cannot change after insert.
--   * Values are bounded by CHECK constraints.
--   * source/external_id are for a later smart-scale link (Withings); external_id is unique per person so the same
--     weigh-in can never be stored twice.
-- Deleting the auth user deletes their rows (on delete cascade). No other table or data is changed.

create table if not exists public.planly_body_weights (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  client_id text not null check (char_length(client_id) between 1 and 80),
  measured_at timestamptz not null,
  weight_kg numeric(5,2) not null check (weight_kg between 25 and 400),
  source text not null default 'manual' check (source in ('manual','withings')),
  external_id text check (char_length(external_id) between 1 and 80),
  client_created_at bigint not null,
  client_updated_at bigint not null,
  cloud_version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique(owner_id, client_id),
  unique(owner_id, external_id)
);

create index if not exists planly_body_weights_owner_time_idx on public.planly_body_weights(owner_id, measured_at desc) where deleted_at is null;

alter table public.planly_food_profile add column if not exists goal_weight_kg numeric(5,1) check (goal_weight_kg between 25 and 400);

alter table public.planly_body_weights enable row level security;
revoke all on public.planly_body_weights from public, anon, authenticated;
grant select, insert, update, delete on public.planly_body_weights to authenticated;

create or replace function public.planly_protect_body_identity()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  if new.owner_id is distinct from old.owner_id or new.id is distinct from old.id or new.client_id is distinct from old.client_id then
    raise exception 'Body row identity is immutable';
  end if;
  return new;
end $$;
revoke all on function public.planly_protect_body_identity() from public, anon, authenticated;

create trigger planly_body_weights_bump_version before update on public.planly_body_weights for each row execute function public.bump_planly_cloud_version();
create trigger planly_body_weights_protect_identity before update on public.planly_body_weights for each row execute function public.planly_protect_body_identity();

create policy planly_body_weights_select_owner on public.planly_body_weights for select to authenticated using (owner_id = (select auth.uid()));
create policy planly_body_weights_insert_owner on public.planly_body_weights for insert to authenticated with check (owner_id = (select auth.uid()));
create policy planly_body_weights_update_owner on public.planly_body_weights for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy planly_body_weights_delete_owner on public.planly_body_weights for delete to authenticated using (owner_id = (select auth.uid()));
