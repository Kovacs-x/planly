import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const fail=m=>{throw new Error(m)};
const exists=p=>fs.existsSync(path.join(root,p));

const budgetFiles=[
  'v2/core-budget-nav-v4.0b1.js',
  'v2/core-budget-v4.0b.js',
  'v2/core-budget-ui-v4.0b.js',
  'v2/core-budget-scope-v4.0c.js',
  'v2/core-budget-lifecycle-v4.0d.js',
  'v2/core-budget-monthly-v4.0e.js',
  'v2/core-budget-month-state-v4.0f.js',
  'v2/core-budget-insights-v4.0g.js'
];
for(const f of budgetFiles)if(!exists(f))fail(`Missing Budget runtime file: ${f}`);
const budget=budgetFiles.map(read).join('\n');
const migrations=fs.readdirSync(path.join(root,'supabase/migrations')).filter(f=>f.endsWith('.sql')).sort().map(f=>read(`supabase/migrations/${f}`)).join('\n');
const sw=read('v2/sw.js'),build=read('v2/core-build-v3.3c.js');

// Browser code must never contain privileged credentials or trust browser-supplied ownership changes.
if(/service_role|SUPABASE_SERVICE_ROLE|sb_secret_/i.test(budget))fail('Privileged credential marker in Budget browser runtime');
for(const marker of ["for(const k of ['owner_id','scope_id','client_id','id'])delete next[k]","row.owner_id!==owner","membership.role!=='owner'"])if(!budget.includes(marker))fail(`Missing client ownership guard: ${marker}`);

// Offline state is isolated by authenticated owner and explicit scope; optimistic concurrency is mandatory.
for(const marker of ['planly-budget-cache-v2:','planly-budget-pending-v2:','planly-budget-conflicts-v2:','scopeKey=(p,type=activeType)',".eq('cloud_version',op.baseVersion)",'operationId:uuid()','status:\'conflict\''])if(!budget.includes(marker))fail(`Missing Budget offline/concurrency invariant: ${marker}`);

// Household Budget is an explicit permission path; private personal scopes remain owner-only.
for(const marker of ["scope_type:'personal'","scope_type:'household'",'ensureHouseholdScope','Only the Household owner can create the shared budget.','You can only edit budget entries you added.','You can only delete budget entries you added.'])if(!budget.includes(marker))fail(`Missing Budget privacy/household invariant: ${marker}`);
for(const marker of ["scope_type='personal' and household_id is null","scope_type='household' and household_id is not null",'planly_budget_entries_update_own','planly_budget_scopes_select_authorized','planly_budget_categories_select_authorized','planly_budget_targets_select_authorized'])if(!migrations.includes(marker))fail(`Missing Budget RLS/schema invariant: ${marker}`);

// Month navigation and recurring carry-forward must remain scoped, creator-owned, and non-destructive.
for(const marker of ['x.owner_id===viewer','Carry forward only recurring items you created','allocationStatus:\'planned\'','window.PlanlyBudgetMonth={get,set,date}','Monthly snapshot',"Derived from this month's budget only"] )if(!budget.includes(marker))fail(`Missing monthly Budget invariant: ${marker}`);
if(/Date\.prototype\.(?:toISOString|valueOf|getTime)\s*=/.test(budget))fail('Budget runtime monkeypatches Date');

// Release composition/cache markers must include every Budget layer so offline and online execute the same build.
for(const file of budgetFiles){const name=path.basename(file);if(!sw.includes(name))fail(`Service worker composition missing ${name}`);if(!build.includes(name))fail(`Build diagnostics/cache list missing ${name}`)}
if(!sw.includes('...APPEND_URLS.map(url=>freshOrCached(cache,url))'))fail('Budget append runtime is not covered by offline fresh-or-cache composition');

console.log('Planly Budget 4.0 release-hardening checks passed.');
