#!/usr/bin/env python3
"""diff.py <prod.tsv> <rebuild.tsv> --rebuild-major N : prod-only, repo-only and differing catalog objects, by kind.

N is the PostgreSQL major version of the database the migrations were replayed onto (check.sh passes it). Production
is PostgreSQL 17. PostgreSQL 16 has no MAINTAIN privilege, so only when N is 16 or lower are MAINTAIN grants left out
of the comparison, on both sides, and the output says so. On 17 or later every grant is compared.
Exit 0: no differences. Exit 1: differences. Exit 2: bad arguments.
"""
import argparse, collections, re, sys

IGNORE_EVT_OWNERS = {'supabase_admin'}  # Supabase's own platform event triggers (pg_cron/pg_net/graphql/postgrest hooks)

p = argparse.ArgumentParser()
p.add_argument('prod'); p.add_argument('rebuild')
p.add_argument('--rebuild-major', type=int, required=True, help='PostgreSQL major version of the rebuild database')
args = p.parse_args()
skip_maintain = args.rebuild_major < 17

def load(path):
    d = {}
    for line in open(path):
        k, key, val = (line.rstrip('\n').split('\t') + ['', ''])[:3]
        owner = re.search(r' owner=(\w+)$', val)
        if k == 'event_trigger' and owner and owner.group(1) in IGNORE_EVT_OWNERS:
            continue
        if k.endswith('grant') and skip_maintain:
            val = ','.join(x for x in val.split(',') if x and not x.endswith(':MAINTAIN'))
        d[(k, key)] = re.sub(r'\s+', ' ', val).strip()
    return d

a, b = load(args.prod), load(args.rebuild)
out = collections.defaultdict(list)
for k in sorted(set(a) | set(b)):
    if k not in b: out['prod-only ' + k[0]].append(k[1])
    elif k not in a: out['repo-only ' + k[0]].append(k[1])
    elif a[k] != b[k]: out['differs ' + k[0]].append(k[1] + '\n      prod: ' + a[k][:300] + '\n      repo: ' + b[k][:300])
if skip_maintain:
    print(f'NOTE: rebuild is PostgreSQL {args.rebuild_major}, which has no MAINTAIN privilege: MAINTAIN grants were not compared.')
total = 0
for g in sorted(out):
    print(f'== {g} ({len(out[g])})'); total += len(out[g])
    for x in out[g]: print('   ', x)
print(f'TOTAL differences: {total}' if total else 'NO DIFFERENCES: repo-applied-to-fresh == prod')
sys.exit(1 if total else 0)
