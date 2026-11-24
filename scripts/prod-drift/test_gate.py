#!/usr/bin/env python3
"""Self-tests for the production drift gate. No database needed. Run: python3 -I scripts/prod-drift/test_gate.py

1. The history archive is verbatim: re-hashing its statements reproduces the manifest that the repair script checks
   (md5 of each row's statements as PostgreSQL prints text[]), so the archive is a faithful record of production.
2. The repair script's manifest is exactly the archive's 51 rows, and it records every repo migration file.
3. diff.py compares MAINTAIN grants on a PostgreSQL 17 rebuild, and ignores them only on 16 (which has no MAINTAIN).
"""
import hashlib, os, re, subprocess, sys, tempfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from history_archive import ARCHIVE, pg_text_array, read_archive  # noqa: E402
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
REPAIR = os.path.join(ROOT, 'supabase/history/repair-migration-history-2026-11.sql')
DIFF = os.path.join(ROOT, 'scripts/prod-drift/diff.py')
passed = failed = 0
def check(name, ok, detail=''):
    global passed, failed
    print(('PASS ' if ok else 'FAIL ') + name + ('' if ok else ' :: ' + detail)); passed += ok; failed += (not ok)

def read_manifest(path):
    sql = open(path, encoding='utf-8').read()
    return re.findall(r"\('(\d{14})', '([^']+)', '([0-9a-f]{32})'\)", sql), sql

# 1 + 2: archive and repair manifest
try:
    rows = read_archive(ARCHIVE)
except Exception as e:  # noqa: BLE001
    rows = []; print('archive unreadable:', e)
manifest, repair = read_manifest(REPAIR)
archive_manifest = [(v, n, hashlib.md5(pg_text_array(s).encode()).hexdigest()) for v, n, s in rows]
check('the archive holds 51 migrations, one statement block each', len(rows) == 51 and all(len(s) >= 1 for _, _, s in rows), f'{len(rows)} rows')
check('the repair script carries a 51-row manifest (version, name, statements md5)', len(manifest) == 51, f'{len(manifest)} rows')
check('re-hashing the verbatim archive reproduces the repair manifest exactly', len(manifest) == 51 and archive_manifest == manifest,
      next((f'{a} != {b}' for a, b in zip(archive_manifest, manifest) if a != b), f'{len(archive_manifest)} vs {len(manifest)}'))
check('the whole-history hash matches production (read-only, 23 Nov 2026)',
      hashlib.md5(','.join(f'{v}|{n}|{h}' for v, n, h in manifest).encode()).hexdigest() == '9e84f3b4b88e78272278b6b9fa388ec1')
files = sorted(f for f in os.listdir(os.path.join(ROOT, 'supabase/migrations')) if f.endswith('.sql'))
recorded = re.findall(r"^\s*\('(\d{3})', '([^']+)'\)", repair, re.M)
check('the repair records every repo migration file, by version and name',
      [(f[:3], f[4:-4]) for f in files] == recorded, f'{len(files)} files, {len(recorded)} recorded')
check('the guard compares names and statements, not just versions, before anything is deleted',
      repair.find('stmt_md5') != -1 and repair.find('a.name is distinct from e.name') != -1
      and repair.find('raise exception') < repair.find('delete from supabase_migrations.schema_migrations'))
check('the history table is locked before it is checked', repair.find('lock table supabase_migrations.schema_migrations') != -1
      and repair.find('lock table') < repair.find('raise exception'))

# 3: MAINTAIN handling in diff.py
with tempfile.TemporaryDirectory() as t:
    prod, reb = os.path.join(t, 'prod.tsv'), os.path.join(t, 'reb.tsv')
    open(prod, 'w').write('table_grant\tpublic.t\tpostgres:MAINTAIN,postgres:SELECT,service_role:MAINTAIN\n')
    open(reb, 'w').write('table_grant\tpublic.t\tpostgres:MAINTAIN,postgres:SELECT\n')  # service_role MAINTAIN missing
    r17 = subprocess.run([sys.executable, '-I', DIFF, prod, reb, '--rebuild-major', '17'], capture_output=True, text=True)
    r16 = subprocess.run([sys.executable, '-I', DIFF, prod, reb, '--rebuild-major', '16'], capture_output=True, text=True)
    check('on a PostgreSQL 17 rebuild a missing MAINTAIN grant is reported', r17.returncode == 1 and 'service_role:MAINTAIN' in r17.stdout, r17.stdout + r17.stderr)
    check('on a PostgreSQL 16 rebuild MAINTAIN is ignored, and the output says so', r16.returncode == 0 and 'MAINTAIN' in r16.stdout, r16.stdout + r16.stderr)
    r0 = subprocess.run([sys.executable, '-I', DIFF, prod, reb], capture_output=True, text=True)
    check('diff.py refuses to guess the rebuild version', r0.returncode == 2, f'exit {r0.returncode}')

print(f'{passed} passed, {failed} failed'); sys.exit(1 if failed else 0)
