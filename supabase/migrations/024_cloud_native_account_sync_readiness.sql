-- Planly 3.3D: make cloud sync writable by default for cloud-native accounts.
-- Legacy accounts keep the existing explicit migration gate.

create or replace function public.handle_new_planly_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'display_name',
      new.raw_user_meta_data ->> 'full_name',
      split_part(coalesce(new.email, ''), '@', 1)
    )
  );

  insert into public.planly_sync_state (
    owner_id,
    initial_migration_completed_at,
    migration_project_count,
    migration_task_count,
    migration_digest,
    last_successful_sync_at
  ) values (
    new.id,
    now(),
    0,
    0,
    'cloud-native-account',
    now()
  )
  on conflict (owner_id) do nothing;

  return new;
end;
$function$;

-- Accounts created during the 3.3 household release gate were created after
-- cloud sync became part of normal onboarding, so they have no legacy local
-- dataset to migrate. Older accounts retain their migration safeguard.
insert into public.planly_sync_state (
  owner_id,
  initial_migration_completed_at,
  migration_project_count,
  migration_task_count,
  migration_digest,
  last_successful_sync_at
)
select u.id, now(), 0, 0, 'cloud-native-account', now()
from auth.users u
where u.created_at >= timestamptz '2026-09-24 00:00:00+00'
  and not exists (
    select 1 from public.planly_sync_state s where s.owner_id = u.id
  );

revoke all on function public.handle_new_planly_user() from public, anon, authenticated;
