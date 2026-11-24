#!/bin/bash
# The history repair must refuse anything but production's exact 51-row history, and change nothing when it refuses.
# Builds supabase_migrations.schema_migrations from the verbatim archive in a scratch database, then runs
# supabase/history/repair-migration-history-2026-11.sql against the untouched history and against tampered copies.
#   PSQL="psql -h localhost -p 5432 -U postgres" scripts/prod-drift/test-repair-guard.sh
set -uo pipefail
cd "$(dirname "$0")/../.."
PSQL=${PSQL:-psql}; DB=${DRIFT_GUARD_DB:-planly_history_guard}; REPAIR=supabase/history/repair-migration-history-2026-11.sql
pass=0; fail=0; check(){ if [ "$2" = 1 ]; then echo "PASS $1"; pass=$((pass+1)); else echo "FAIL $1 :: $3"; fail=$((fail+1)); fi; }
q(){ $PSQL -qAt -d $DB -c "$1"; }
seed(){  # fresh history table holding the archived rows exactly
  $PSQL -q -d postgres -c "drop database if exists $DB" -c "create database $DB" >/dev/null 2>&1
  python3 -I - <<'PY' | $PSQL -q -v ON_ERROR_STOP=1 -d $DB >/dev/null
import sys; sys.path.insert(0, 'scripts/prod-drift'); from history_archive import read_archive, ARCHIVE
lit = lambda s: "'" + s.replace("'", "''") + "'"
print('create schema supabase_migrations;')
print('create table supabase_migrations.schema_migrations (version text primary key, statements text[], name text, created_by text, idempotency_key text unique, rollback text[]);')
for v, n, st in read_archive(ARCHIVE):
    print(f"insert into supabase_migrations.schema_migrations(version, name, statements, created_by) values ({lit(v)}, {lit(n)}, array[{', '.join(lit(s) for s in st)}]::text[], 'someone@example.invalid');")
PY
}
fingerprint(){ q "select count(*)||':'||md5(string_agg(version||'|'||coalesce(name,'')||'|'||md5(coalesce(statements::text,'')), ',' order by version)) from supabase_migrations.schema_migrations"; }
run_repair(){ $PSQL -q -v ON_ERROR_STOP=1 -d $DB < $REPAIR 2>&1; }

scenario(){  # name, tamper SQL
  seed; q "$2" >/dev/null; before=$(fingerprint); out=$(run_repair); rc=$?; after=$(fingerprint)
  check "refused: $1" "$([ $rc -ne 0 ] && [ "$before" = "$after" ] && echo 1)" "exit $rc; history $( [ "$before" = "$after" ] && echo unchanged || echo REPLACED )"
}
seed; check 'the archived history matches production (51 rows, whole-history hash)' "$([ "$(fingerprint)" = "51:9e84f3b4b88e78272278b6b9fa388ec1" ] && echo 1)" "$(fingerprint)"
out=$(run_repair); rc=$?
check 'untouched history: repair succeeds and records 001-068' "$([ $rc -eq 0 ] && [ "$(q "select count(*)||' '||min(version)||' '||max(version)||' '||count(*) filter (where version ~ '^2026') from supabase_migrations.schema_migrations")" = "67 001 068 0" ] && echo 1)" "exit $rc: $out"
before=$(fingerprint); out=$(run_repair); rc=$?
check 'second run: refused, history left as it is' "$([ $rc -ne 0 ] && [ "$before" = "$(fingerprint)" ] && echo 1)" "exit $rc"
scenario 'a renamed row' "update supabase_migrations.schema_migrations set name='shared_projects_foundation_v2' where version='20260925043432'"
scenario 'an edited statement' "update supabase_migrations.schema_migrations set statements=array[statements[1]||' '] where version='20261116164704'"
scenario 'a statement removed' "update supabase_migrations.schema_migrations set statements=null where version='20260924135713'"
scenario 'a missing row' "delete from supabase_migrations.schema_migrations where version='20261012001347'"
scenario 'an extra row' "insert into supabase_migrations.schema_migrations(version,name) values ('20261120000000','something_new')"
$PSQL -q -d postgres -c "drop database if exists $DB" >/dev/null 2>&1
echo "$pass passed, $fail failed"; [ $fail -eq 0 ]
