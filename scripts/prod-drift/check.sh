#!/bin/bash
# Production drift gate: replay every repo migration onto a fresh database with Supabase's platform baseline, snapshot
# the catalog, and compare it with production's snapshot. Exit 0 means a clean rebuild reproduces production.
#   PSQL="psql -h localhost -p 5432 -U postgres" scripts/prod-drift/check.sh [prod-snapshot.tsv]
# Needs a scratch PostgreSQL (superuser; 17 like production, or 16 with the MAINTAIN note in README.md) with the stub
# extensions installed: cp scripts/prod-drift/stub-extensions/* "$(pg_config --sharedir)/extension/"
set -euo pipefail
cd "$(dirname "$0")/../.."
G=scripts/prod-drift; DB=${DRIFT_DB:-planly_drift_rebuild}; PROD=${1:-$(ls $G/prod-snapshot-*.tsv | sort | tail -1)}
PSQL=${PSQL:-psql}; OUT=$(mktemp -d)
run() { $PSQL -q -v ON_ERROR_STOP=1 "$@"; }
run -d postgres -c "drop database if exists $DB" -c "create database $DB" >/dev/null
run -d $DB -c "alter database $DB set search_path = \"\$user\", public, extensions" >/dev/null
run -d $DB < $G/bootstrap.sql >/dev/null 2>&1 || { echo "baseline failed"; run -d $DB < $G/bootstrap.sql; }
v=$($PSQL -qAt -d $DB -c "show server_version_num")
for f in $(ls supabase/migrations/*.sql | sort); do
  if [ "$v" -lt 170000 ]; then sql=$(sed -E 's/, *maintain\b//Ig; s/\bmaintain *, *//Ig' "$f"); else sql=$(cat "$f"); fi  # PG16 has no MAINTAIN
  if ! msg=$(printf '%s\n' "$sql" | run -d $DB 2>&1); then echo "FAILED at $f:"; echo "$msg" | grep -v NOTICE | head -8; exit 1; fi
done
$PSQL -qAt -F $'\t' -d $DB < $G/snapshot.sql > $OUT/rebuild.tsv
echo "replayed $(ls supabase/migrations/*.sql | wc -l) migrations onto PostgreSQL $v; comparing with $(basename $PROD)"
python3 -I $G/diff.py "$PROD" $OUT/rebuild.tsv
