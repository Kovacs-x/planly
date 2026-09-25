-- Executable Planly database security regression assertions.
-- Read-only: raises an exception if a production authorization invariant is absent.
-- Intended for CI/psql against a migrated test database or controlled audit execution.

do $$
declare
  t text;
  rls boolean;
  direct_credential_grants integer;
  bad_owner_updates integer;
begin
  foreach t in array array[
    'planly_tasks','planly_projects','planly_preferences','planly_sync_state',
    'calendar_sources','external_calendar_events','calendar_source_credentials',
    'planly_households','planly_household_members','planly_household_invites'
  ] loop
    select c.relrowsecurity into rls
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname=t and c.relkind='r';
    if coalesce(rls,false) is not true then
      raise exception 'SECURITY TEST FAILED: RLS disabled/missing on public.%', t;
    end if;
  end loop;

  select count(*) into direct_credential_grants
  from information_schema.role_table_grants
  where table_schema='public'
    and table_name='calendar_source_credentials'
    and grantee in ('anon','authenticated');
  if direct_credential_grants <> 0 then
    raise exception 'SECURITY TEST FAILED: calendar credentials have direct browser-role grants';
  end if;

  select count(*) into bad_owner_updates
  from pg_policies
  where schemaname='public'
    and tablename in ('planly_tasks','planly_projects','planly_preferences','planly_sync_state')
    and cmd='UPDATE'
    and (qual is null or with_check is null);
  if bad_owner_updates <> 0 then
    raise exception 'SECURITY TEST FAILED: owner update policy lacks USING or WITH CHECK';
  end if;
end $$;

-- Private external calendars must not gain a household-membership policy path.
do $$
declare
  leaks integer;
begin
  select count(*) into leaks
  from pg_policies
  where schemaname='public'
    and tablename in ('calendar_sources','external_calendar_events')
    and (coalesce(qual,'') ilike '%household%' or coalesce(with_check,'') ilike '%household%');
  if leaks <> 0 then
    raise exception 'SECURITY TEST FAILED: household authorization detected on private external calendar data';
  end if;
end $$;

select 'Planly database security invariant tests passed' as result;
