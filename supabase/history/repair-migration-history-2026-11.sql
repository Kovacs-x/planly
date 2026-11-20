-- ONE-OFF BOOKKEEPING REPAIR for production (dtniwcwjucepsjzoojuc). Not a migration. Run once, in the SQL Editor,
-- AFTER migrations 065-068 have been run (they change nothing on production; see docs/production-drift-2026-11.md).
--
-- Production's history table lists 51 timestamp versions with their own names; the repo's migrations are 001-068.
-- The Supabase CLI refuses to push while the history holds versions with no matching file, and 001-007 / 056-062
-- were never recorded at all. This replaces the 51 rows with one row per repo migration (001-068, no 021), which
-- is exactly what `supabase migration repair --status reverted <51 versions>` followed by
-- `supabase migration repair --status applied <001..068>` would do. Only the bookkeeping table changes: no schema,
-- no app data. The 51 original rows, with their SQL, are archived in production-migration-history-2026-11-20.sql.
-- The guard stops without changing anything unless the table holds exactly those 51 rows.

begin;

do $$
begin
  if (select count(*) from supabase_migrations.schema_migrations) <> 51
     or exists (select 1 from supabase_migrations.schema_migrations where version not in (
       '20260924135632', '20260924135713', '20260924143832', '20260924150958', '20260924152249', '20260924160121',
       '20260924202357', '20260924224827', '20260924225009', '20260924233815', '20260925021101', '20260925043432',
       '20260925043929', '20260925044112', '20260925044301', '20260925064152', '20260925064233', '20260925092503',
       '20260925192350', '20260925192608', '20260925203318', '20260925203335', '20260925203437', '20260925203524',
       '20260925203649', '20260925203713', '20260926051433', '20260927041812', '20260927042518', '20260927044543',
       '20260927045839', '20260927045922', '20260927073429', '20260927075708', '20260928044835', '20260929110317',
       '20260930053755', '20260930053756', '20261001204454', '20261002005243', '20261004002348', '20261004193144',
       '20261004213932', '20261005111710', '20261006215701', '20261011161716', '20261011173125', '20261011225943',
       '20261012001347', '20261116164642', '20261116164704'
     )) then
    raise exception 'Migration history is not in the expected state (51 archived rows); nothing changed.';
  end if;
end
$$;

delete from supabase_migrations.schema_migrations where version in (
  '20260924135632', '20260924135713', '20260924143832', '20260924150958', '20260924152249', '20260924160121',
  '20260924202357', '20260924224827', '20260924225009', '20260924233815', '20260925021101', '20260925043432',
  '20260925043929', '20260925044112', '20260925044301', '20260925064152', '20260925064233', '20260925092503',
  '20260925192350', '20260925192608', '20260925203318', '20260925203335', '20260925203437', '20260925203524',
  '20260925203649', '20260925203713', '20260926051433', '20260927041812', '20260927042518', '20260927044543',
  '20260927045839', '20260927045922', '20260927073429', '20260927075708', '20260928044835', '20260929110317',
  '20260930053755', '20260930053756', '20261001204454', '20261002005243', '20261004002348', '20261004193144',
  '20261004213932', '20261005111710', '20261006215701', '20261011161716', '20261011173125', '20261011225943',
  '20261012001347', '20261116164642', '20261116164704'
);

insert into supabase_migrations.schema_migrations (version, name) values
  ('001', 'planly_3_1_foundation'),
  ('002', 'secure_calendar_credentials'),
  ('003', 'calendar_importer_support'),
  ('004', 'client_calendar_event_read'),
  ('005', 'atomic_calendar_refresh'),
  ('006', 'least_privilege_table_grants'),
  ('007', 'planly_cloud_sync'),
  ('008', 'security_hardening'),
  ('009', 'household_foundation'),
  ('010', 'household_authorization_hardening'),
  ('011', 'household_membership_invite_hardening'),
  ('012', 'household_lifecycle_controls'),
  ('013', 'shared_tasks_foundation'),
  ('014', 'shared_tasks_realtime'),
  ('015', 'household_task_broadcast'),
  ('016', 'household_task_assignment'),
  ('017', 'assignee_task_completion'),
  ('018', 'shared_projects_foundation'),
  ('019', 'shared_projects_integrity'),
  ('020', 'shared_projects_household_delete'),
  ('022', 'household_release_gate_hardening'),
  ('023', 'assignee_completion_null_guard'),
  ('024', 'cloud_native_account_sync_readiness'),
  ('025', 'planly_post_33_fk_index_hardening'),
  ('026', 'planly_post_33_internal_helper_permissions'),
  ('027', 'household_two_member_invariant'),
  ('028', 'budget_foundation'),
  ('029', 'restore_rls_helper_execution'),
  ('030', 'budget_integrity_hardening'),
  ('031', 'private_rls_authorization_helpers'),
  ('032', 'budget_fk_indexes'),
  ('033', 'planly_budget_allocation_model'),
  ('034', 'household_budget_lifecycle_closeout'),
  ('035', 'departing_member_privacy_closeout'),
  ('036', 'collaborative_household_budget'),
  ('037', 'shared_lists'),
  ('038', 'shared_lists_private_helper'),
  ('039', 'real_device_household_grants'),
  ('040', 'realtime_household_helper_closeout'),
  ('041', 'collaborative_household_budget_entries'),
  ('042', 'household_task_completion'),
  ('043', 'r4_household_display_names'),
  ('044', 'r4_budget_today_bills'),
  ('045', 'calendar_source_represents'),
  ('046', 'household_chore_rotation'),
  ('047', 'household_budget_reset'),
  ('048', 'household_checklist_collaboration'),
  ('049', 'budget_entry_insert_hardening'),
  ('050', 'push_notifications'),
  ('051', 'google_calendar_tokens'),
  ('052', 'undated_repeats'),
  ('053', 'morning_summary_shared'),
  ('054', 'fitness_food_foundation'),
  ('055', 'revoke_extra_table_rights'),
  ('056', 'fitness_body_weight'),
  ('057', 'body_composition'),
  ('058', 'body_import_key'),
  ('059', 'budget_debts_savings'),
  ('060', 'body_import_service_grant'),
  ('061', 'push_quiet_hours_instant_deals'),
  ('062', 'budget_month_start_day'),
  ('063', 'revoke_guard_execute'),
  ('064', 'budget_entries_select_explicit_predicate'),
  ('065', 'rls_auto_enable'),
  ('066', 'task_project_guard_production'),
  ('067', 'household_project_broadcast'),
  ('068', 'baseline_names_match_production')
on conflict (version) do nothing;

commit;
