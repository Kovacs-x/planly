-- Cover budget foreign-key columns reported by the Supabase performance advisor.
create index if not exists planly_budget_categories_owner_id_idx on public.planly_budget_categories(owner_id);
create index if not exists planly_budget_targets_owner_id_idx on public.planly_budget_targets(owner_id);
create index if not exists planly_budget_entries_scope_category_kind_idx on public.planly_budget_entries(scope_id,category_id,kind);
