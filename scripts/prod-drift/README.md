# Production drift gate

Answers one question: **does a clean rebuild from `supabase/migrations` reproduce production?**

`check.sh` builds a fresh database with Supabase's platform baseline (`bootstrap.sql`), replays every migration in
order, snapshots the catalog with `snapshot.sql`, and compares that with production's snapshot (`prod-snapshot-*.tsv`)
using `diff.py`. Exit 0 and `NO DIFFERENCES` means the rebuild matches production.

It compares, for the `public` and `planly_private` schemas (plus the `realtime.messages` policies):

- functions: definition (comments and whitespace ignored), security definer, volatility, settings, owner;
- grants: function, table, column and schema privileges (grantor ignored);
- RLS flags, policies, triggers, event triggers, constraints, indexes, columns and the realtime publication.

It does not compare data, Supabase's own platform event triggers (owned by `supabase_admin`), or anything in the
`auth`, `storage`, `vault`, `cron` and `net` schemas.

## Run

```sh
cp scripts/prod-drift/stub-extensions/* "$(pg_config --sharedir)/extension/"   # once, as root
PSQL="psql -h localhost -p 5432 -U postgres" scripts/prod-drift/check.sh
```

Use a scratch PostgreSQL where you are superuser; the script drops and re-creates `planly_drift_rebuild`. The stub
extensions stand in for `supabase_vault`, `pg_net` and `pg_cron`, so the migrations run unchanged.

**PostgreSQL version.** Production is 17.6. `check.sh` passes the rebuild's major version to `diff.py`
(`--rebuild-major`, required). On 17 every grant is compared, `MAINTAIN` included. On 16, which has no `MAINTAIN`,
the script removes it from the migrations' privilege lists for the replay, `diff.py` leaves `MAINTAIN` grants out on
both sides, and its output starts with a NOTE saying so.

## Self-tests

- `python3 -I scripts/prod-drift/test_gate.py` (no database; runs in CI):
  - the verbatim history archive re-hashes to the manifest in the repair script and to production's whole-history
    hash;
  - the repair records every repo migration;
  - its guard checks names and statements and locks the table before deleting;
  - `diff.py` compares `MAINTAIN` on 17 and ignores it only on 16.
- `PSQL="psql …" scripts/prod-drift/test-repair-guard.sh` (scratch PostgreSQL): rebuilds the history table from the
  archive, then checks that the repair accepts the untouched history, and refuses, changing nothing, a second run, a
  renamed row, an edited statement, a removed statement, a missing row and an extra row.

## Refresh production's snapshot

Run `snapshot.sql` against production, read-only (SQL Editor or a read-only connection). Save the rows as
tab-separated `kind`, `key`, `val` lines in `prod-snapshot-YYYY-MM-DD.tsv`. The newest file is used by default. The
snapshot holds schema metadata only: names, definitions and grants, with no rows of app data.
