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
    'planly_households','planly_household_members','planly_household_invites',
    'planly_budget_scopes','planly_budget_categories','planly_budget_targets','planly_budget_entries'
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
    and tablename in (
      'planly_tasks','planly_projects','planly_preferences','planly_sync_state',
      'planly_budget_scopes','planly_budget_categories','planly_budget_targets','planly_budget_entries'
    )
    and cmd='UPDATE'
    and (qual is null or with_check is null);
  if bad_owner_updates <> 0 then
    raise exception 'SECURITY TEST FAILED: owner update policy lacks USING or WITH CHECK';
  end if;
end $$;

-- Private external calendars must not gain a household-membership policy path.
do $$
declare leaks integer;
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

-- Budget tables must expose no anon privileges and every mutable budget table must
-- retain cloud_version optimistic concurrency support.
do $$
declare
  anon_budget_grants integer;
  t text;
  has_version boolean;
begin
  select count(*) into anon_budget_grants
  from information_schema.role_table_grants
  where table_schema='public'
    and table_name in ('planly_budget_scopes','planly_budget_categories','planly_budget_targets','planly_budget_entries')
    and grantee='anon';
  if anon_budget_grants <> 0 then
    raise exception 'SECURITY TEST FAILED: anon has direct budget table privileges';
  end if;

  foreach t in array array['planly_budget_scopes','planly_budget_categories','planly_budget_targets','planly_budget_entries'] loop
    select exists(
      select 1 from information_schema.columns
      where table_schema='public' and table_name=t and column_name='cloud_version' and data_type='bigint'
    ) into has_version;
    if not has_version then
      raise exception 'SECURITY TEST FAILED: cloud_version missing on public.%', t;
    end if;
  end loop;
end $$;

select 'Planly database security invariant tests passed' as result;
