# Planly 4.0J Household + Budget release closeout

This gate closes the deferred Household 3.3D validation and Budget 4.0 release hardening.

## Automated/live acceptance completed

- Clean third-account path created a new Household, created a Household Budget, category, monthly target and entry through authenticated RLS, exercised an invite, then deleted the Household through the production lifecycle RPC.
- Household deletion removed the shared Household Budget in dependency order while leaving Personal Budget semantics untouched. The test Household and all release-gate rows were removed afterwards.
- Household ownership transfer was exercised round-trip on an existing Household Budget. Scope/category/target administration followed the Household owner; ledger entry creator ownership did not change; the original owner was restored.
- A departing Household member with an owned shared task and an owned Household Budget entry was exercised through the real leave RPC. The task became private and detached from the Household; the former member lost Household Budget visibility; the shared ledger entry remained visible to the remaining Household owner. The member was then re-invited/rejoined and the release-gate rows were removed.
- Personal Budget CRUD was exercised with a clean account: scope, categories, monthly target, income and expense entries, optimistic cloud_version update, denied cross-account read/update, and complete cleanup.
- Shared project/task visibility and assignment were exercised with temporary rows. The Household member could read shared data and complete an assigned task only through the constrained completion RPC; direct mutation was denied; an unrelated account could not read the shared rows. Temporary rows were removed.
- Household members could not see another user's Personal Budget, private calendar source, or imported external calendar events. The private external-calendar boundary remains unchanged.
- Unauthorized Household Budget reads/writes and non-owner plan-structure updates were explicitly denied by RLS.
- Stale cloud_version writes did not overwrite newer Budget data.
- No release-gate rows or temporary Household remain in production after cleanup.

## Lifecycle hardening added

- Household ownership transfer now transfers Household Budget plan administration while preserving per-entry creator ownership.
- Household deletion now explicitly deletes the shared Household Budget before the Household, avoiding the Budget FK RESTRICT failure.
- Departing members' own shared tasks are converted back to private before membership removal.
- Household Budget entry visibility now depends on current scope authorization, so a former member cannot retain access merely because they created an entry.
- Household deletion UI explicitly warns that the shared Household Budget is permanently removed while Personal budgets/private Planly data remain intact.

## Release invariants

The repository gates continue to require final generated JavaScript parsing, no `$$$`, no accidental `$().forEach`, preserved `$$()` navigation/Quick Dates/Calendar Source handlers, optimistic concurrency markers, RLS/privacy markers, Budget renderer composition, offline cache composition, and current service-worker/cache version markers.

Supabase's security advisor still reports its general leaked-password-protection setting as disabled. That is an account/project Auth setting rather than a Planly data-path defect and is not changed by this release.
