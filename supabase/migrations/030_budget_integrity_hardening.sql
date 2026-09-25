-- Planly 4.0A budget integrity hardening.
-- Prevent an update from silently moving existing financial history between
-- private/household scopes or transferring ownership.

alter table public.planly_budget_categories
  add constraint planly_budget_categories_scope_id_kind_key unique(scope_id,id,kind);

alter table public.planly_budget_entries
  add constraint planly_budget_entries_category_kind_fkey
  foreign key (scope_id,category_id,kind)
  references public.planly_budget_categories(scope_id,id,kind)
  on delete restrict;

create or replace function public.planly_budget_protect_identity()
returns trigger language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if tg_table_name='planly_budget_scopes' then
    if new.owner_id is distinct from old.owner_id
       or new.client_id is distinct from old.client_id
       or new.scope_type is distinct from old.scope_type
       or new.household_id is distinct from old.household_id then
      raise exception 'Budget scope identity is immutable';
    end if;
  elsif tg_table_name='planly_budget_categories' then
    if new.owner_id is distinct from old.owner_id
       or new.client_id is distinct from old.client_id
       or new.scope_id is distinct from old.scope_id then
      raise exception 'Budget category identity is immutable';
    end if;
  elsif tg_table_name='planly_budget_targets' then
    if new.owner_id is distinct from old.owner_id
       or new.client_id is distinct from old.client_id
       or new.scope_id is distinct from old.scope_id then
      raise exception 'Budget target identity is immutable';
    end if;
  elsif tg_table_name='planly_budget_entries' then
    if new.owner_id is distinct from old.owner_id
       or new.client_id is distinct from old.client_id
       or new.scope_id is distinct from old.scope_id then
      raise exception 'Budget entry identity is immutable';
    end if;
  end if;
  return new;
end $$;

revoke all on function public.planly_budget_protect_identity() from public, anon, authenticated;

create trigger planly_budget_scopes_protect_identity before update on public.planly_budget_scopes
for each row execute function public.planly_budget_protect_identity();
create trigger planly_budget_categories_protect_identity before update on public.planly_budget_categories
for each row execute function public.planly_budget_protect_identity();
create trigger planly_budget_targets_protect_identity before update on public.planly_budget_targets
for each row execute function public.planly_budget_protect_identity();
create trigger planly_budget_entries_protect_identity before update on public.planly_budget_entries
for each row execute function public.planly_budget_protect_identity();
