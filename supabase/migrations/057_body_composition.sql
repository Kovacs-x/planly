-- Fitness › Body: room for everything a Withings Body Smart reports with each weigh-in (30 Oct 2026).
--
-- Adds optional (nullable) columns to planly_body_weights for the body-composition readings a smart scale sends with a
-- weigh-in. A typed-in weight leaves them empty. Nothing existing changes: no column is removed or altered, no data is
-- touched, and RLS, policies, grants and triggers on the table stay exactly as migration 056 made them (owner only).
--
--   fat_ratio_pct      body fat %                       (Withings measure type 6)
--   fat_mass_kg        fat mass                          (type 8)
--   fat_free_mass_kg   fat-free (lean) mass              (type 5)
--   muscle_mass_kg     muscle mass                       (type 76)
--   hydration_kg       total body water                  (type 77; shown as a % of weight)
--   bone_mass_kg       bone mass                         (type 88)
--   heart_rate_bpm     standing heart rate               (type 11)
--   visceral_fat       visceral fat index
--   bmr_kcal           basal metabolic rate (kcal/day)
--   metabolic_age      metabolic age (years)
--   extra              any other reading the scale sends, kept as {"<measure type>": value} so nothing is lost while
--                      its meaning is confirmed; a small JSON object only.
-- Every value is bounded by a CHECK constraint so a bad reading cannot be stored.

alter table public.planly_body_weights
  add column if not exists fat_ratio_pct numeric(4,1) check (fat_ratio_pct between 1 and 75),
  add column if not exists fat_mass_kg numeric(5,2) check (fat_mass_kg between 0 and 300),
  add column if not exists fat_free_mass_kg numeric(5,2) check (fat_free_mass_kg between 0 and 400),
  add column if not exists muscle_mass_kg numeric(5,2) check (muscle_mass_kg between 0 and 300),
  add column if not exists hydration_kg numeric(5,2) check (hydration_kg between 0 and 300),
  add column if not exists bone_mass_kg numeric(4,2) check (bone_mass_kg between 0 and 30),
  add column if not exists heart_rate_bpm integer check (heart_rate_bpm between 25 and 250),
  add column if not exists visceral_fat numeric(4,1) check (visceral_fat between 0 and 60),
  add column if not exists bmr_kcal integer check (bmr_kcal between 500 and 6000),
  add column if not exists metabolic_age integer check (metabolic_age between 10 and 120),
  add column if not exists extra jsonb not null default '{}'::jsonb check (jsonb_typeof(extra) = 'object' and pg_column_size(extra) <= 2000);
