#!/usr/bin/env python3
# diff.py <prod.tsv> <rebuild.tsv> : prod-only, repo-only and differing catalog objects, by kind.
import sys,re,collections
IGNORE_EVT_OWNERS={'supabase_admin'}  # platform event triggers (pg_cron/pg_net/graphql/postgrest hooks)
def load(p):
    d={}
    for line in open(p):
        k,key,val=(line.rstrip('\n').split('\t')+['',''])[:3]
        if k=='event_trigger' and re.search(r' owner=(\w+)$',val) and re.search(r' owner=(\w+)$',val).group(1) in IGNORE_EVT_OWNERS: continue
        if k.endswith('grant'): val=','.join(x for x in val.split(',') if x and not x.endswith(':MAINTAIN'))  # PG16 replay has no MAINTAIN
        d[(k,key)]=re.sub(r'\s+',' ',val).strip()
    return d
a,b=load(sys.argv[1]),load(sys.argv[2])
out=collections.defaultdict(list)
for k in sorted(set(a)|set(b)):
    if k not in b: out['prod-only '+k[0]].append(k[1])
    elif k not in a: out['repo-only '+k[0]].append(k[1])
    elif a[k]!=b[k]: out['differs '+k[0]].append(k[1]+'\n      prod: '+a[k][:300]+'\n      repo: '+b[k][:300])
total=0
for g in sorted(out):
    print(f'== {g} ({len(out[g])})'); total+=len(out[g])
    for x in out[g]: print('   ',x)
print(f'TOTAL differences: {total}' if total else 'NO DIFFERENCES: repo-applied-to-fresh == prod')
sys.exit(1 if total else 0)
