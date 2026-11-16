-- Security Audit 1.0 hardening
-- Trigger-only helper functions must not be callable through PostgREST.
revoke execute on function public.handle_new_planly_user() from public, anon, authenticated;
-- rls_auto_enable() was a legacy helper that existed only in the original production database and is created by no
-- migration. Guard its revoke so a clean replay onto a fresh database (e.g. a staging project) does not fail with
-- "function does not exist"; where the function is present (production) the revoke still runs.
do $$ begin
  revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
exception when undefined_function then null; end $$;
revoke execute on function public.bump_planly_cloud_version() from public, anon, authenticated;
revoke execute on function public.touch_planly_updated_at() from public, anon, authenticated;

-- Vault credential storage remains inaccessible as a table from browser roles.
revoke all on table public.calendar_source_credentials from anon, authenticated;

-- Server-only credential/event RPCs remain service-role only.
revoke execute on function public.get_calendar_source_feed_url(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.replace_external_calendar_events(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.get_calendar_source_feed_url(uuid, uuid) to service_role;
grant execute on function public.replace_external_calendar_events(uuid, uuid, jsonb) to service_role;

-- These two credential-management RPCs are intentionally browser-callable, but
-- they derive the owner from auth.uid() and never return decrypted credentials.
-- Keep their EXECUTE grants explicit rather than inherited from PUBLIC.
revoke execute on function public.set_calendar_source_credential(uuid, text) from public, anon;
revoke execute on function public.delete_calendar_source_credential(uuid) from public, anon;
grant execute on function public.set_calendar_source_credential(uuid, text) to authenticated;
grant execute on function public.delete_calendar_source_credential(uuid) to authenticated;
