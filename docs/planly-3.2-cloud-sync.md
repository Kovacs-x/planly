# Planly 3.2 — Personal Cloud Sync Design

## Goal

Move Planly's personal task/project data from localStorage-only persistence to an authenticated Supabase-backed account while preserving the current instant/offline-first behaviour.

This phase is personal-only. Household sharing is explicitly deferred until personal sync is stable.

## Current 3.1 persistence verified

The current application store is:

`planly-data-v1`

It serialises:

- `tasks`
- `projects`
- `theme`
- `showCompleted`
- `defaultCategory`
- `defaultDuration`
- `autoCalendarTimed`
- `autoCompleteParentSubtasks`
- `planningStart`
- `planningEnd`

Transient navigation/UI state is not written to this store.

### Current task aggregate

A newly created task currently contains the following persisted fields:

- `id`
- `title`
- `date`
- `time`
- `durationMinutes`
- `priority`
- `category`
- `projectId`
- `recurrence`
- `recurrenceConfig`
- `reminder`
- `notes`
- `subtasks`
- `addToCalendar`
- `updatedAt`
- `occurrenceNumber` for recurring tasks
- `completed`
- `pinned`
- `googleEventId`
- `calendarSync`
- `createdAt`

Existing task mutations can additionally persist:

- `seriesId`
- `top3Order`
- `calendarSyncedAt`
- `googleRecurrenceStartDate`
- `googleRecurrenceVersion`

`recurrenceConfig` is intentionally nullable for non-recurring tasks.

Recurring completion clones the whole task aggregate with `...t`, then overrides the occurrence-specific fields. That means cloud migration must preserve fields it does not yet understand rather than rebuilding tasks from a fixed whitelist.

### Current recurrenceConfig shape

The current recurrence configuration can contain:

- `unit`
- `interval`
- `weekdays`
- `monthlyMode`
- `monthDay`
- `ordinal`
- `weekday`
- `endMode`
- `endDate`
- `maxOccurrences`
- `anchorDate`

### Current subtask shape

Subtasks remain part of the task aggregate in 3.2:

- `id`
- `title`
- `done`

This is deliberate. Planly updates the parent task's `updatedAt` when checklist state changes, so splitting subtasks into separate cloud rows now would introduce avoidable partial-update/conflict cases.

### Current project aggregate

Projects currently contain:

- `id`
- `name`
- `dueDate`
- `notes`
- `archived`
- `createdAt`
- `updatedAt`

## Cloud data model

### planly_projects

Each project keeps:

- the existing local string ID as `client_id`
- a server UUID as `cloud_id`
- queryable/indexed project columns
- the complete local project object in `data`
- client timestamps
- server `updated_at`
- monotonically increasing `cloud_version`
- `deleted_at` tombstone

The JSON `data` copy is a migration-safety mechanism. It prevents unknown/legacy fields from being silently discarded and gives migration verification a full logical record to compare.

### planly_tasks

Each task keeps:

- the existing local string ID as `client_id`
- a server UUID as `cloud_id`
- queryable/indexed columns for every currently known task property
- the complete local task object in `data`
- client timestamps
- server `updated_at`
- monotonically increasing `cloud_version`
- `deleted_at` tombstone

`projectId` and `seriesId` remain client-ID references in 3.2. We intentionally do not add strict foreign keys for them because legacy backups may contain orphaned references and migration must prefer preservation over rejection.

### planly_preferences

Only account-level planner preferences sync in 3.2:

- `defaultCategory`
- `defaultDuration`
- `autoCompleteParentSubtasks`
- `planningStart`
- `planningEnd`

The following stay device-local for 3.2:

- `theme`
- `showCompleted`
- `autoCalendarTimed`
- selected tab/date
- open panels/sheets
- Timeline/Focus transient state
- Undo state
- Google OAuth access token/expiry
- Google deletion queue

`autoCalendarTimed` stays local because enabling it on a second device that has not authorised Google Calendar could create confusing cross-device behaviour.

### planly_sync_state

Stores account-level migration/sync metadata:

- schema version
- initial migration completion timestamp
- verified task/project counts
- migration digest
- last successful sync timestamp

Device-specific queue/version metadata remains local.

## Security model

All 3.2 tables have RLS enabled.

At this phase an authenticated user can only SELECT/INSERT/UPDATE rows where:

`owner_id = auth.uid()`

No anonymous table access is granted.

Tasks/projects deliberately do not grant authenticated hard DELETE. Normal deletion is a tombstone update that sets `deleted_at`. This prevents a stale device from interpreting physical row absence as permission to recreate an item.

Household/cross-user policies are not introduced in 3.2.

## Initial local → cloud migration

### Gate 1 — authenticated account and immutable local snapshot

Before uploading anything:

1. Require a signed-in Supabase user.
2. Read the exact current `planly-data-v1` JSON.
3. Save an untouched copy under an account-scoped migration-backup key such as:
   `planly-cloud-migration-backup-v1:<user-id>`
4. Record task IDs, project IDs, counts and a deterministic SHA-256 digest of the canonical migration payload.
5. Never clear or rewrite the existing local Planly store.

### Gate 2 — inspect cloud state

Read projects, tasks, preferences and sync state for the signed-in owner.

- If `initial_migration_completed_at` is already set, do not re-run the initial import.
- If cloud rows already exist while migration is not marked complete, stop automatic migration and enter a recovery/reconciliation path.
- Never infer that an empty local store should replace a non-empty cloud store.

### Gate 3 — idempotent upload

Upload projects first, then tasks, then synced preferences.

Use owner-scoped upserts on:

`(owner_id, client_id)`

Each task/project write sends both:

1. the complete local object in `data`
2. its current known/queryable projections

Re-running the migration therefore updates the same owner/client row instead of creating duplicates.

Do not mark migration complete yet.

### Gate 4 — verify before activation

Re-read the cloud rows and verify:

- every local project ID exists exactly once
- every local task ID exists exactly once
- cloud counts match the snapshot counts
- the saved `data` JSON for each entity round-trips against the migration snapshot
- project IDs and recurrence/series IDs are unchanged
- recurrence config, subtasks and Google sync metadata are preserved
- the recomputed cloud migration digest matches the local snapshot digest

Only after all verification succeeds may `initial_migration_completed_at`, verified counts and digest be written.

### Gate 5 — enable cloud sync

Only after verified migration succeeds should the client-side 3.2 feature flag permit regular cloud sync.

The original local store remains in place as the fast/offline working cache and rollback source.

## Regular offline-first sync

For 3.2, prefer correctness over premature incremental-sync optimisation.

Planly data volumes are small enough that an authenticated sync can initially pull the owner's complete task/project rows, including tombstones. This avoids timestamp-cursor race conditions while the sync model is being proven.

Maintain an account-scoped local sync metadata store containing at minimum, per entity:

- last observed `cloud_version`
- dirty flag
- pending tombstone flag
- optionally the last accepted server snapshot for conflict recovery

Recommended cycle:

1. Render immediately from localStorage.
2. If signed in and online, fetch owner cloud rows.
3. For locally clean entities, accept newer cloud versions.
4. For locally dirty entities whose cloud version is unchanged from the local base, push with an optimistic `cloud_version` condition.
5. If a dirty local entity sees a higher remote cloud version than its base, do not silently overwrite either side; record an explicit conflict.
6. Push pending tombstones using the same optimistic version rule.
7. Pull again after successful writes to capture authoritative versions/server timestamps.
8. Persist local cache and local sync metadata.
9. Update `last_successful_sync_at`.

## Conflict semantics

Do not use device wall-clock time alone as last-write-wins ordering. A phone and another browser can have clock skew, and an offline edit may have an older client timestamp even though it is the user's later logical edit.

Instead:

- `client_updated_at` preserves Planly's existing timestamp for round-trip/debugging.
- `updated_at` records server receipt time.
- `cloud_version` is the concurrency token.
- pushes use optimistic version matching.
- a version mismatch is an explicit concurrent-edit conflict, not permission to overwrite.

This is simpler than CRDTs, deterministic, and avoids losing offline edits.

## Deletes

Deleting a task/project locally should:

1. remove it from the visible local UI immediately
2. add a pending-delete entry to local sync metadata
3. update the cloud row with `deleted_at`
4. retain the tombstone in cloud for cross-device propagation

Physical purge is a later maintenance concern and should not be exposed to ordinary authenticated clients in 3.2.

## Backup and rollback

Existing JSON Export Backup remains unchanged and continues to export local Planly state.

Cloud sync must be feature-gated while tested.

If migration or sync fails:

- local Planly remains usable
- the migration backup remains available
- local data is not cleared
- cloud activation is not marked complete

Production `/v2/` should not become cloud-authoritative until migration, offline, retry, conflict and multi-device tests pass on the isolated 3.2 route/branch.

## Future household compatibility

3.2 keeps server UUIDs separate from local IDs and keeps strict owner-only RLS.

That allows 3.3 to add household membership/share relationships without changing existing local task IDs or weakening the personal-data boundary established here.
