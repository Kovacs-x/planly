-- Planly 3.1 secure per-user calendar subscription credentials
-- Feed URLs are encrypted in Supabase Vault and are never exposed through the Data API.

create extension if not exists supabase_vault with schema vault;

create table if not exists public.calendar_source_credentials (
  source_id uuid primary key references public.calendar_sources(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  vault_secret_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.calendar_source_credentials enable row level security;
revoke all on table public.calendar_source_credentials from anon, authenticated;

create or replace function public.set_calendar_source_credential(p_source_id uuid, p_feed_url text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_secret_id uuid;
  v_existing uuid;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if p_feed_url is null or length(trim(p_feed_url)) < 10 then raise exception 'Invalid calendar feed URL'; end if;
  if not exists(select 1 from public.calendar_sources where id=p_source_id and owner_id=v_uid) then raise exception 'Calendar source not found'; end if;

  select vault_secret_id into v_existing from public.calendar_source_credentials where source_id=p_source_id and owner_id=v_uid;
  if v_existing is not null then
    perform vault.update_secret(v_existing, trim(p_feed_url), 'planly_calendar_'||p_source_id::text, 'Planly private iCalendar subscription');
    update public.calendar_source_credentials set updated_at=now() where source_id=p_source_id and owner_id=v_uid;
  else
    select vault.create_secret(trim(p_feed_url), 'planly_calendar_'||p_source_id::text, 'Planly private iCalendar subscription') into v_secret_id;
    insert into public.calendar_source_credentials(source_id,owner_id,vault_secret_id) values(p_source_id,v_uid,v_secret_id);
  end if;
end;
$$;

revoke all on function public.set_calendar_source_credential(uuid,text) from public;
grant execute on function public.set_calendar_source_credential(uuid,text) to authenticated;

create or replace function public.delete_calendar_source_credential(p_source_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_secret_id uuid;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  select vault_secret_id into v_secret_id from public.calendar_source_credentials where source_id=p_source_id and owner_id=v_uid;
  if v_secret_id is not null then
    delete from vault.secrets where id=v_secret_id;
    delete from public.calendar_source_credentials where source_id=p_source_id and owner_id=v_uid;
  end if;
end;
$$;

revoke all on function public.delete_calendar_source_credential(uuid) from public;
grant execute on function public.delete_calendar_source_credential(uuid) to authenticated;
