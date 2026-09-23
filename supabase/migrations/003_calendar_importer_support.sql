-- Planly 3.1 trusted calendar importer support.
-- The browser cannot read Vault or write external events; this RPC is callable only by service_role.

create or replace function public.get_calendar_source_feed_url(p_source_id uuid, p_owner_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
begin
  select ds.decrypted_secret
    into v_url
  from public.calendar_source_credentials c
  join vault.decrypted_secrets ds on ds.id = c.vault_secret_id
  where c.source_id = p_source_id
    and c.owner_id = p_owner_id;

  return v_url;
end;
$$;

revoke all on function public.get_calendar_source_feed_url(uuid,uuid) from public, anon, authenticated;
grant execute on function public.get_calendar_source_feed_url(uuid,uuid) to service_role;

grant select, insert, update, delete on table public.external_calendar_events to service_role;
grant select, update on table public.calendar_sources to service_role;

notify pgrst, 'reload schema';
