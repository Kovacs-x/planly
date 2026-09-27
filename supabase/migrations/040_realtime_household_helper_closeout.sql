-- Keep Household realtime authorization on the authenticated-only private helper.
-- The legacy public helper is intentionally not executable by browser roles.
drop policy if exists planly_household_task_broadcast_receive on realtime.messages;
create policy planly_household_task_broadcast_receive
on realtime.messages
for select
to authenticated
using (
  extension = 'broadcast'
  and (select realtime.topic()) ~ '^household:[0-9a-fA-F-]{36}$'
  and planly_private.is_household_member(split_part((select realtime.topic()), ':', 2)::uuid)
);
