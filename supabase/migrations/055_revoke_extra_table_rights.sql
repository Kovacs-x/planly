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
