# Production drift report and reconciliation (November 2026)

Verified on 20 Nov 2026 against production (`dtniwcwjucepsjzoojuc`, PostgreSQL 17.6) with read-only queries, and
against a fresh rebuild of every repo migration (`scripts/prod-drift/check.sh`). Nothing was applied to production.

## Result

| | Differences |
|---|---|
| Before (fresh rebuild of 001–064 vs production) | 77 objects |
| After (fresh rebuild of 001–068 vs production) | **0**. A clean rebuild reproduces production. |
| 065–068 applied a second time | no change (idempotent) |
| 065–068 on production | catalog-state preserving: every object already matches, so the catalog is left as it is |
| Production after 065–068 | no change: every object already matches; the three function bodies are byte-identical |

Not a security issue. Every drifted object is either owned by `postgres` and not executable through the API, or is a
name or formatting difference with the same rule.

## Drift report

### Production-only (no migration created them)

| Object | Where it came from | Decision |
|---|---|---|
| `rls_auto_enable()` + event trigger `ensure_rls` | Supabase dashboard setting "enable RLS on new tables". Migration 008 only revokes from it (guarded in #317). | Keep. **065** creates both exactly as production has them. |
| `planly_broadcast_household_project_change()` + trigger `planly_household_project_broadcast` | Production migration `shared_projects_broadcast` (25 Sep), which has no repo file | Keep. **067** creates both from production's own SQL. |
| `planly_validate_task_project_visibility()` + trigger `planly_tasks_validate_project_visibility` | Production's version of `shared_projects_foundation` | Canonical. **066** keeps it. |
| Columns `calendar_sources.last_sync_status` / `last_sync_error` | Production's original base schema (before migrations) | Keep, nullable, unused. **068** adds them. |
| 7 policies named "Users can … own …" on `calendar_sources`, `external_calendar_events`, `profiles` | Production's original base schema | Canonical names and definitions (`(select auth.uid())`). **068** creates them. |

### Repo-only (a fresh rebuild has them; production does not)

| Object | Why | Decision |
|---|---|---|
| `planly_validate_task_project_scope()` + trigger, `planly_project_share_target_valid()` | Repo 018 is a **different version** of the shared-projects migration from the one production ran. This was not a later rename that failed to apply: production's own history shows its `shared_projects_foundation` created `…_visibility`. | Drop in rebuilds (**066**). Production's guard enforces the same rule and is what the app has run on since 25 Sep. |
| Policies `planly_projects_select_visible`, `planly_projects_update_owner` | Created by repo 018. Later migrations re-created production's project policies but never dropped these, so a rebuild had both sets. | Drop (**066**). |
| `external_calendar_events.title` default `'Busy'` | Repo 001 | Drop the default (**068**). Every writer supplies a title. |

### Same rule, different name

The repo's 001, 007 and 018 were written after production's tables existed and named things differently. **068**
renames them to production's names:

- 10 constraints;
- the unique index that comes with one of them;
- two indexes with identical definitions;
- two index swaps (`external_calendar_events_owner_date_idx` → production's `external_events_owner_idx` +
  `external_events_start_idx`; `planly_projects_household_updated_idx` → production's
  `planly_projects_household_active_idx`).

### Cosmetic only (no action)

13 functions differ only in whitespace, line endings or comments. Their bodies are identical once comments and
whitespace are ignored, and the gate compares them that way.

### Migration history (bookkeeping)

- Production's `supabase_migrations.schema_migrations` has 51 rows keyed by **timestamps**
  (`20260924135632 security_hardening` …), not the repo's `001`–`064`.
- Three of them have no repo file: `credential_rpc_explicit_grants`, `household_caller_bound_helpers` and
  `shared_projects_broadcast`.
- 001–007 and 056–062 were run in the SQL Editor and never recorded.

So `supabase migration repair --status applied 056 … 062` on its own would not make `db push` work: the CLI refuses
while the history holds versions with no matching file. The repair has to retire the 51 timestamp rows and record
001–068. The 51 rows and their SQL are archived first in `supabase/history/production-migration-history-2026-11-20.sql`
(checked: no secrets, keys, ids or email addresses; the `created_by` emails were left out).

## The four migrations

| File | On a fresh rebuild | On production |
|---|---|---|
| `065_rls_auto_enable.sql` | creates the function and `ensure_rls`, then revokes EXECUTE | re-states the same body, revoke matches, trigger skipped |
| `066_task_project_guard_production.sql` | drops 018's guard, helper and 2 policies; creates production's guard | nothing to drop, re-states the same body, trigger skipped |
| `067_household_project_broadcast.sql` | creates the function and trigger | re-states the same body, trigger skipped |
| `068_baseline_names_match_production.sql` | renames, swaps indexes, adds 2 columns, replaces 7 policies | every guard false; only a PostgREST schema-reload notice |

Each statement is guarded (`create or replace`, `if [not] exists`, catalog checks). 008's revoke is the only earlier
reference to `rls_auto_enable()` and it is guarded, so nothing uses the function before 065 creates it. Numbering
continues after 064; the gap at 021 stays.

On production the migrations are **catalog-state preserving** rather than literally empty. 065–067 run
`create or replace function` with production's exact bodies, which keeps owner, settings and grants (checked:
`md5(prosrc)` identical). 068's guards are all false, and it ends with `notify pgrst, 'reload schema'`.

Behaviour checked on the rebuild:

- a new public table gets RLS automatically;
- a project change sends one `household:<id>` broadcast;
- a household task that points at a private project is refused;
- a household task that points at a shared project is accepted.

## What to apply, in order

Prerequisite: merge #317 first. Its 008 guard and its 063/064 are the versions production ran. #316 carries
**different** 063/064 files (other names, and a different 064 predicate), so they must not land next to #317's.

**SQL Editor (no CLI needed):**

1. Run `065_rls_auto_enable.sql`, `066_task_project_guard_production.sql`, `067_household_project_broadcast.sql` and
   `068_baseline_names_match_production.sql`, in that order. They leave production's catalog as it is.
2. Run `supabase/history/repair-migration-history-2026-11.sql`. In one transaction it:
   - locks the history table;
   - checks every row's version, name and stored-statement hash against production's 51-row manifest;
   - stops with an error naming any missing, extra, renamed or edited row, before anything is deleted, so nothing
     changes;
   - only then records 001–068.

   The manifest is the archive re-hashed (`test_gate.py`, in CI), and the refusals are tested on a copy of the table
   (`test-repair-guard.sh`).
3. A read-only check follows: history = 001–068 without 021, and the drift gate still shows 0 differences.

**Or with the Supabase CLI** (needs `supabase init` and `supabase link --project-ref dtniwcwjucepsjzoojuc` once):

```sh
supabase migration repair --status reverted 20260924135632 20260924135713 20260924143832 20260924150958 20260924152249 20260924160121 20260924202357 20260924224827 20260924225009 20260924233815 20260925021101 20260925043432 20260925043929 20260925044112 20260925044301 20260925064152 20260925064233 20260925092503 20260925192350 20260925192608 20260925203318 20260925203335 20260925203437 20260925203524 20260925203649 20260925203713 20260926051433 20260927041812 20260927042518 20260927044543 20260927045839 20260927045922 20260927073429 20260927075708 20260928044835 20260929110317 20260930053755 20260930053756 20261001204454 20261002005243 20261004002348 20261004193144 20261004213932 20261005111710 20261006215701 20261011161716 20261011173125 20261011225943 20261012001347 20261116164642 20261116164704
supabase migration repair --status applied 001 002 003 004 005 006 007 008 009 010 011 012 013 014 015 016 017 018 019 020 022 023 024 025 026 027 028 029 030 031 032 033 034 035 036 037 038 039 040 041 042 043 044 045 046 047 048 049 050 051 052 053 054 055 056 057 058 059 060 061 062 063 064
supabase db push --dry-run   # must list exactly 065, 066, 067, 068
supabase db push
```

## Limits of this check

- The rebuild ran on PostgreSQL 16 (production is 17.6). 16 has no `MAINTAIN` privilege, so `diff.py` left `MAINTAIN`
  grants out on both sides for that run, and said so. On a 17 rebuild it compares them, along with every other grant.
- `MAINTAIN` was instead spot-checked read-only on production:
  - 51 grants, each paired with TRUNCATE on the same table and role;
  - held only by `postgres` and `service_role`, none by `anon` or `authenticated`.

  The rebuild has the same 51 TRUNCATE grants with the same holders, so they match by proxy, not by a direct
  automated comparison.
- The comparison covers the `public` and `planly_private` schemas and the `realtime.messages` policies. Supabase's
  own schemas (`auth`, `storage`, `vault`, `cron`, `net`) and its platform event triggers are out of scope.
- Production's default privileges for new objects (functions: no EXECUTE for `PUBLIC`/`anon`/`authenticated`; tables:
  no data rights) are a platform setting, not a migration. The rebuild baseline mirrors them.
