-- Production drift reconciliation (20 Nov 2026), 1 of 4: the automatic-RLS helper.
--
-- Production has public.rls_auto_enable() and the event trigger ensure_rls, which turn row-level security on for every
-- new table in the public schema. They were created by Supabase's dashboard setting, not by a migration: migration 008
-- only revokes EXECUTE on the function (guarded, so a fresh replay without it does not fail). This creates both exactly
-- as production has them, so a rebuild from migrations matches production.
--
-- 008's revoke is the only earlier reference to the function, and it is guarded, so creating it here (rather than
-- before 008) leaves nothing referencing it before it exists. Every Planly table also enables RLS explicitly in its
-- own migration, so tables created before this point are unaffected.
--
-- Idempotent and a no-op on production: the function body below is production's, character for character, and the
-- event trigger is only created when it is missing.

create or replace function public.rls_auto_enable()
returns event_trigger
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$;

revoke execute on function public.rls_auto_enable() from public, anon, authenticated;

do $$
begin
  if not exists (select 1 from pg_event_trigger where evtname = 'ensure_rls') then
    create event trigger ensure_rls
      on ddl_command_end
      when tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      execute function public.rls_auto_enable();
  end if;
end
$$;
