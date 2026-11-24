-- ONE-OFF BOOKKEEPING REPAIR for production (dtniwcwjucepsjzoojuc). Not a migration. Run once, in the SQL Editor,
-- AFTER migrations 065-068 have been run (they leave production's catalog as it is; see docs/production-drift-2026-11.md).
--
-- Production's history table lists 51 timestamp versions with their own names; the repo's migrations are 001-068.
-- The Supabase CLI refuses to push while the history holds versions with no matching file, and 001-007 / 056-062
-- were never recorded at all. This replaces the 51 rows with one row per repo migration (001-068, no 021): the same
-- end state as `supabase migration repair --status reverted <51 versions>` then `--status applied <001..068>`. Only
-- the bookkeeping table changes: no schema, no app data.
--
-- Guard: the table is locked, then every row is compared with production's exact history as archived in
-- production-migration-history-2026-11-20.sql: version, name, and md5 of the stored statements (as PostgreSQL prints
-- text[]). Any missing, extra, renamed or edited row stops the script with an error naming it, before anything is
-- deleted; the transaction then changes nothing. scripts/prod-drift/test_gate.py checks this manifest against the
-- archive, and scripts/prod-drift/test-repair-guard.sh checks the refusals on a copy of the table.

begin;

lock table supabase_migrations.schema_migrations in share row exclusive mode;

do $$
declare
  v_bad text;
begin
  with expected(version, name, stmt_md5) as (values
    ('20260924135632', 'security_hardening', '974e50061324269e88e45a1abaa2dd93'),
    ('20260924135713', 'credential_rpc_explicit_grants', 'e53eecd10f4aa58cf3b5752de780b8c2'),
    ('20260924143832', 'household_foundation', '0b5ea45ccd449787044f75419c38c849'),
    ('20260924150958', 'household_caller_bound_helpers', 'd31358923f4de50b525522999a425c7f'),
    ('20260924152249', 'household_authorization_hardening', 'b5e4d6166f7aa075e8af420bd8eb4859'),
    ('20260924160121', 'household_lifecycle_controls', '725186dbba5d88f38038edd694647b20'),
    ('20260924202357', 'shared_tasks_foundation', 'bab686b6bac252a22855f79e188d396c'),
    ('20260924224827', 'shared_tasks_realtime', '1528c33f466a23e7b4a1e275a8ee52a6'),
    ('20260924225009', 'household_task_broadcast', '5e3f37179a7bd5a79ed0c1243c3b7cb4'),
    ('20260924233815', 'household_task_assignment', 'b29616403f04eab2cf72dba1c230d16c'),
    ('20260925021101', 'assignee_task_completion', '3e1003b923644452449097d50ddd2556'),
    ('20260925043432', 'shared_projects_foundation', '4d7e5dc6f1bc47ccf1ad8774e0b44a69'),
    ('20260925043929', 'shared_projects_integrity', 'b79ea59bfd326de5cbf536e6eb504329'),
    ('20260925044112', 'shared_projects_household_delete', '3c2cc5d0a2df325046d9cf5ec5e3255a'),
    ('20260925044301', 'shared_projects_broadcast', '3a7492f1bff62192b2cc34a6a02096ff'),
    ('20260925064152', 'household_release_gate_hardening', '9eb88d0d411a18c4bc18ec1863bf274b'),
    ('20260925064233', 'assignee_completion_null_guard', '2139e6f09e894d50faf20a87ec4cedd7'),
    ('20260925092503', 'cloud_native_account_sync_readiness', '1959173f43eec546576602d13f9edf9b'),
    ('20260925192350', 'planly_post_33_fk_index_hardening', 'c53d0403151616514eaaff95d9bf886e'),
    ('20260925192608', 'planly_post_33_internal_helper_permissions', '949df93c9a6cf8cfcfbd426c2adfced2'),
    ('20260925203318', 'household_two_member_invariant', '93ca7cac5527faa2087232cd9d9d474a'),
    ('20260925203335', 'budget_foundation', 'dbb4dc9394a9c61120c208c5e1602c07'),
    ('20260925203437', 'restore_rls_helper_execution', '784964f3ba57d56a275e23a1cce6b1e3'),
    ('20260925203524', 'budget_integrity_hardening', '8f9e8ddfa8f1b77ad2c14d49f4811647'),
    ('20260925203649', 'private_rls_authorization_helpers', '3214b2f0a6a1fcfb2dac68b75c722d72'),
    ('20260925203713', 'budget_fk_indexes', '01f3bb2d99a2ad8a6984d6b4df701bc6'),
    ('20260926051433', 'planly_budget_allocation_model', '5e001c5cc6cafd5b6d28a87f5c73d396'),
    ('20260927041812', 'household_budget_lifecycle_closeout', '70605c5dc059d74cfe37f174236da8c1'),
    ('20260927042518', 'departing_member_privacy_closeout', '8a6824cdfeefdd285d01ea662d16a5bc'),
    ('20260927044543', 'collaborative_household_budget', '68ec0f7f53cbc1bcafaea2e54fef99df'),
    ('20260927045839', 'shared_lists_4_1', 'b5ccf299a07d65aab84f955bf2605c17'),
    ('20260927045922', 'shared_lists_private_helper', 'c47c08b1108294bf738d3cadadeb669b'),
    ('20260927073429', 'restore_authenticated_household_rpc_and_data_grants', 'def042776fefa4afa3a0a68bd8a2284b'),
    ('20260927075708', 'realtime_household_helper_closeout', '54a33a36cd79ed640e1305cebc93c564'),
    ('20260928044835', 'collaborative_household_budget_entries', '6a3b63963ee2a0f2ab50b883c55a3a8f'),
    ('20260929110317', 'household_task_completion', '4691cdc52c9a6ec44bd2ac12611655a1'),
    ('20260930053755', 'r4_household_display_names', '83f0382f427145cda806e06fe1ebc33e'),
    ('20260930053756', 'r4_budget_today_bills', '0e73411d4d5e5cb46ac7b8c32303057b'),
    ('20261001204454', '045_calendar_source_represents', '0a4f3d34ffa91c3ef7a25955d35dfc0c'),
    ('20261002005243', '046_household_chore_rotation', '3771fedc5383a9b63e3ddd2a416c8e55'),
    ('20261004002348', '047_household_budget_reset', 'dfb38b919515e82f1a724f11523ab035'),
    ('20261004193144', '048_household_checklist_collaboration', 'd3a64576192f290d71128514de56837a'),
    ('20261004213932', '049_budget_entry_insert_hardening', 'c920ce1f38a5f16c38f3fcbdff637b91'),
    ('20261005111710', '050_push_notifications', '0480ccacd75075b25584f9e966d1aa58'),
    ('20261006215701', '051_google_calendar_tokens', '527b9e43144f66ff7693cc9b21906cbe'),
    ('20261011161716', '052_undated_repeats', 'a1ecdd87cede38a52c8d48209add7a71'),
    ('20261011173125', '053_morning_summary_shared', '6bbd636dc4686d3626603de93a6a6ff6'),
    ('20261011225943', '054_fitness_food_foundation', '018413811f1bec0bc53a94bca6f30fbc'),
    ('20261012001347', '055_revoke_extra_table_rights', 'd7b5953ee42c28f343588bfacd18c9d3'),
    ('20261116164642', '063_revoke_guard_execute', '5b733b12f7d230fd9fbf3a86fa933c2e'),
    ('20261116164704', '064_budget_entries_select_explicit_predicate', '4cebfc773c1cd8f9d0d864bddcd58458')
  ),
  actual as (
    select version, name, md5(coalesce(statements::text, '')) as stmt_md5
      from supabase_migrations.schema_migrations
  )
  select string_agg(coalesce(e.version, a.version) || case
           when e.version is null then ' unexpected'
           when a.version is null then ' missing'
           when a.name is distinct from e.name then ' name differs'
           else ' statements differ' end, ', ' order by coalesce(e.version, a.version))
    into v_bad
    from expected e full join actual a on a.version = e.version
   where e.version is null or a.version is null
      or a.name is distinct from e.name
      or a.stmt_md5 is distinct from e.stmt_md5;
  if v_bad is not null then
    raise exception 'Migration history is not production''s archived 51 rows (%); nothing changed.', v_bad;
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
