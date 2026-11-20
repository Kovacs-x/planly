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

**PostgreSQL version.** Production is 17.6. On 16, `MAINTAIN` does not exist: the script removes it from the
migrations' privilege lists for the replay, and `diff.py` ignores `:MAINTAIN` grants on both sides. Use 17 for a full
comparison of those grants.

## Refresh production's snapshot

Run `snapshot.sql` against production, read-only (SQL Editor or a read-only connection). Save the rows as
tab-separated `kind`, `key`, `val` lines in `prod-snapshot-YYYY-MM-DD.tsv`. The newest file is used by default. The
snapshot holds schema metadata only: names, definitions and grants, with no rows of app data.
