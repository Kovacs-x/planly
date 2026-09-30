-- R4 corrective migration for production drift discovered before client release.
-- Requires independent SQL approval before application.
-- Existing rows were checked before preparation: no today_lead_days values outside 0..14.

-- R4: household member display names.
-- Authoritative repository migration. Production drift is corrected separately before R4 release.

alter table public.planly_household_members
  add column if not exists display_name text null;

alter table public.planly_household_members
  drop constraint if exists planly_household_members_display_name_check;
alter table public.planly_household_members
  add constraint planly_household_members_display_name_check
  check (
    display_name is null
    or (
      display_name = btrim(display_name)
      and char_length(display_name) between 1 and 40
      and display_name !~ '[[:cntrl:]]'
    )
  );

create or replace function planly_private.set_my_display_name(p_name text)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user uuid := auth.uid();
  v_name text := nullif(btrim(p_name), '');
begin
  if v_user is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if v_name is not null and (char_length(v_name) > 40 or v_name ~ '[[:cntrl:]]') then
    raise exception 'Display name must be 40 characters or fewer and contain no control characters' using errcode = '22023';
  end if;
  update public.planly_household_members
     set display_name = v_name
   where user_id = v_user;
  if not found then raise exception 'Household membership required' using errcode = '42501'; end if;
  return v_name;
end
$$;

alter function planly_private.set_my_display_name(text) owner to postgres;
revoke all on function planly_private.set_my_display_name(text) from public, anon, authenticated;
grant execute on function planly_private.set_my_display_name(text) to authenticated;

create or replace function public.planly_set_my_display_name(p_name text)
returns text
language sql
security invoker
set search_path = pg_catalog, public
as $$
  select planly_private.set_my_display_name(p_name)
$$;

alter function public.planly_set_my_display_name(text) owner to postgres;
revoke all on function public.planly_set_my_display_name(text) from public, anon;
grant execute on function public.planly_set_my_display_name(text) to authenticated;


drop function if exists public.planly_set_household_display_name(text);

alter table public.planly_budget_entries
  alter column today_lead_days set default 3;
alter table public.planly_budget_entries
  drop constraint if exists planly_budget_entries_today_lead_days_check;
alter table public.planly_budget_entries
  add constraint planly_budget_entries_today_lead_days_check
  check (today_lead_days between 0 and 14);
