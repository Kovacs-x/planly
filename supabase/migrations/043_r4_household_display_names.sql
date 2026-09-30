-- R4: household member display names.
-- SQL-review candidate only. Do not apply before independent approval.

alter table public.planly_household_members
  add column if not exists display_name text;

alter table public.planly_household_members
  drop constraint if exists planly_household_members_display_name_check;

alter table public.planly_household_members
  add constraint planly_household_members_display_name_check
  check (
    display_name is null
    or (
      display_name = btrim(display_name)
      and char_length(display_name) between 1 and 20
      and display_name !~ '[[:cntrl:]]'
      and display_name !~ '[​-‏‪-‮⁠-⁩﻿]'
    )
  );

create or replace function public.planly_set_household_display_name(p_display_name text)
returns public.planly_household_members
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_name text := nullif(
    btrim(regexp_replace(coalesce(p_display_name, ''), '\s+', ' ', 'g')),
    ''
  );
  v_row public.planly_household_members%rowtype;
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if v_name is not null
     and (
       v_name ~ '[[:cntrl:]]'
       or v_name ~ '[​-‏‪-‮⁠-⁩﻿]'
     ) then
    raise exception 'Display name contains unsupported characters' using errcode = '22023';
  end if;

  if v_name is not null and char_length(v_name) > 20 then
    raise exception 'Display name must be 20 characters or fewer' using errcode = '22001';
  end if;

  update public.planly_household_members
     set display_name = v_name
   where user_id = v_user
   returning * into v_row;

  if not found then
    raise exception 'Household membership required' using errcode = '42501';
  end if;

  return v_row;
end
$function$;

revoke all on function public.planly_set_household_display_name(text) from public;
revoke all on function public.planly_set_household_display_name(text) from anon;
grant execute on function public.planly_set_household_display_name(text) to authenticated;
