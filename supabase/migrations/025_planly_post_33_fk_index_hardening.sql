-- Planly post-3.3 database hardening.
-- These indexes cover foreign-key columns identified by the Supabase performance advisor.

create index if not exists calendar_source_credentials_owner_id_idx
  on public.calendar_source_credentials(owner_id);

create index if not exists planly_household_invites_accepted_by_idx
  on public.planly_household_invites(accepted_by)
  where accepted_by is not null;

create index if not exists planly_household_invites_invited_by_idx
  on public.planly_household_invites(invited_by);

create index if not exists planly_households_created_by_idx
  on public.planly_households(created_by);
