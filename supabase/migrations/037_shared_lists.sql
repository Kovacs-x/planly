-- Planly 4.1 — private and explicitly Household-shared lists.
-- Private rows are owner-only. Household rows are visible/editable only to current members.

create table if not exists public.planly_lists (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  household_id uuid references public.planly_households(id) on delete cascade,
  client_id text not null,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  visibility text not null default 'private' check (visibility in ('private','household')),
  sort_order integer not null default 0,
  client_created_at bigint not null,
  client_updated_at bigint not null,
  cloud_version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique(owner_id,client_id),
  constraint planly_lists_scope_ck check (
    (visibility='private' and household_id is null)
    or (visibility='household' and household_id is not null)
  )
);

create table if not exists public.planly_list_items (
  id uuid primary key,
  list_id uuid not null references public.planly_lists(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  client_id text not null,
  title text not null check (char_length(btrim(title)) between 1 and 240),
  notes text not null default '' check (char_length(notes)<=1000),
  completed boolean not null default false,
  sort_order integer not null default 0,
  client_created_at bigint not null,
  client_updated_at bigint not null,
  cloud_version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique(owner_id,client_id)
);

create index if not exists planly_lists_owner_idx on public.planly_lists(owner_id) where deleted_at is null;
create index if not exists planly_lists_household_idx on public.planly_lists(household_id) where visibility='household' and deleted_at is null;
create index if not exists planly_list_items_list_idx on public.planly_list_items(list_id) where deleted_at is null;

alter table public.planly_lists enable row level security;
alter table public.planly_list_items enable row level security;
revoke all on public.planly_lists, public.planly_list_items from anon;
grant select,insert,update,delete on public.planly_lists, public.planly_list_items to authenticated;

create or replace function public.planly_protect_list_identity()
returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin
  if tg_table_name='planly_lists' then
    if new.id is distinct from old.id or new.owner_id is distinct from old.owner_id
       or new.client_id is distinct from old.client_id or new.household_id is distinct from old.household_id
       or new.visibility is distinct from old.visibility then
      raise exception 'List identity and sharing scope are immutable';
    end if;
  else
    if new.id is distinct from old.id or new.owner_id is distinct from old.owner_id
       or new.client_id is distinct from old.client_id or new.list_id is distinct from old.list_id then
      raise exception 'List item identity is immutable';
    end if;
  end if;
  return new;
end $$;

create trigger planly_lists_bump_version before update on public.planly_lists for each row execute function public.bump_planly_cloud_version();
create trigger planly_list_items_bump_version before update on public.planly_list_items for each row execute function public.bump_planly_cloud_version();
create trigger planly_lists_protect_identity before update on public.planly_lists for each row execute function public.planly_protect_list_identity();
create trigger planly_list_items_protect_identity before update on public.planly_list_items for each row execute function public.planly_protect_list_identity();

create policy planly_lists_select_authorized on public.planly_lists for select to authenticated using (
  owner_id=(select auth.uid())
  or (visibility='household' and household_id is not null and public.planly_is_household_member(household_id))
);
create policy planly_lists_insert_owner on public.planly_lists for insert to authenticated with check (
  owner_id=(select auth.uid()) and (
    (visibility='private' and household_id is null)
    or (visibility='household' and household_id is not null and public.planly_is_household_member(household_id))
  )
);
create policy planly_lists_update_authorized on public.planly_lists for update to authenticated using (
  owner_id=(select auth.uid())
  or (visibility='household' and household_id is not null and public.planly_is_household_member(household_id))
) with check (
  owner_id=(select auth.uid())
  or (visibility='household' and household_id is not null and public.planly_is_household_member(household_id))
);
create policy planly_lists_delete_owner on public.planly_lists for delete to authenticated using (owner_id=(select auth.uid()));

create policy planly_list_items_select_authorized on public.planly_list_items for select to authenticated using (
  exists(select 1 from public.planly_lists l where l.id=list_id and l.deleted_at is null and (
    l.owner_id=(select auth.uid()) or (l.visibility='household' and public.planly_is_household_member(l.household_id))
  ))
);
create policy planly_list_items_insert_authorized on public.planly_list_items for insert to authenticated with check (
  owner_id=(select auth.uid()) and exists(select 1 from public.planly_lists l where l.id=list_id and l.deleted_at is null and (
    l.owner_id=(select auth.uid()) or (l.visibility='household' and public.planly_is_household_member(l.household_id))
  ))
);
create policy planly_list_items_update_authorized on public.planly_list_items for update to authenticated using (
  exists(select 1 from public.planly_lists l where l.id=list_id and l.deleted_at is null and (
    l.owner_id=(select auth.uid()) or (l.visibility='household' and public.planly_is_household_member(l.household_id))
  ))
) with check (
  exists(select 1 from public.planly_lists l where l.id=list_id and l.deleted_at is null and (
    l.owner_id=(select auth.uid()) or (l.visibility='household' and public.planly_is_household_member(l.household_id))
  ))
);
create policy planly_list_items_delete_authorized on public.planly_list_items for delete to authenticated using (
  exists(select 1 from public.planly_lists l where l.id=list_id and l.deleted_at is null and (
    l.owner_id=(select auth.uid()) or (l.visibility='household' and public.planly_is_household_member(l.household_id))
  ))
);
