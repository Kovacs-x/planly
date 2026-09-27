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
const budgetScope=read('v2/core-budget-scope-v4.0c.js');
const migrations=fs.readdirSync(path.join(root,'supabase/migrations')).filter(f=>f.endsWith('.sql')).sort().map(f=>read(`supabase/migrations/${f}`)).join('\n');
const sw=read('v2/sw.js'),build=read('v2/core-build-v3.3c.js');

if(/service_role|SUPABASE_SERVICE_ROLE|sb_secret_/i.test(budget))fail('Privileged credential marker in Budget browser runtime');
for(const marker of ["for(const k of ['owner_id','scope_id','client_id','id'])delete next[k]","row.owner_id!==owner","membership.role!=='owner'"])if(!budget.includes(marker))fail(`Missing client ownership guard: ${marker}`);

for(const marker of ['planly-budget-cache-v2:','planly-budget-pending-v2:','planly-budget-conflicts-v2:','scopeKey=(p,type=activeType)',".eq('cloud_version',op.baseVersion)",'operationId:uuid()',"current.status='conflict'"])if(!budget.includes(marker))fail(`Missing Budget offline/concurrency invariant: ${marker}`);

for(const marker of ["scope_type:'personal'","scope_type:'household'",'ensureHouseholdScope','Only the Household owner can create the shared budget.','You can only edit budget entries you added.','You can only delete budget entries you added.'])if(!budget.includes(marker))fail(`Missing Budget privacy/household invariant: ${marker}`);
for(const marker of ["scope_type='personal' and household_id is null","scope_type='household' and household_id is not null",'planly_budget_entries_update_own','planly_budget_scopes_select_authorized','planly_budget_categories_select_authorized','planly_budget_targets_select_authorized'])if(!migrations.includes(marker))fail(`Missing Budget RLS/schema invariant: ${marker}`);
for(const marker of ['planly_budget_shared_structure_owner','public.planly_private.is_household_member(s.household_id)','owner_id = public.planly_budget_shared_structure_owner(scope_id)'])if(!migrations.includes(marker))fail(`Missing collaborative Household Budget RLS invariant: ${marker}`);
for(const marker of ["state.scope?.scope_type==='personal'?state.scope?.owner_id===owner:state.scope?.scope_type==='household'","function structureOwner(){return state.scope?.scope_type==='household'?state.scope.owner_id:owner}",'owner_id:structureOwner()'])if(!budget.includes(marker))fail(`Missing collaborative Household Budget runtime invariant: ${marker}`);

for(const marker of ['x.owner_id===viewer','Carry forward only recurring items you created',"allocationStatus:'planned'",'window.PlanlyBudgetMonth={get,set,date}','Monthly snapshot',"Derived from this month's budget only"])if(!budget.includes(marker))fail(`Missing monthly Budget invariant: ${marker}`);
if(/Date\.prototype\.(?:toISOString|valueOf|getTime)\s*=/.test(budget))fail('Budget runtime monkeypatches Date');

for(const marker of [
  'const composed=window.PlanlyBudgetUI?.renderTab',
  "if(typeof composed==='function'&&composed!==render)return composed(host)",
  'await window.PlanlyBudget.switchScope(next);await rerender(host)',
  'await window.PlanlyBudget.ensureHouseholdScope();await rerender(host)'
])if(!budgetScope.includes(marker))fail(`Budget scope round-trip must re-enter the fully composed renderer: ${marker}`);
for(const stale of [
  'await window.PlanlyBudget.switchScope(next);await render(host,{bootstrap:false})',
  'await window.PlanlyBudget.ensureHouseholdScope();await render(host,{bootstrap:false})'
])if(budgetScope.includes(stale))fail(`Budget scope switch regressed to the partial local renderer: ${stale}`);

for(const marker of [
  "cachedScope?.id&&!create",
  "Promise.all([sb.from('planly_budget_scopes')",
  '...budgetChildTables.map',
  'getViewerId:()=>owner',
  "viewer=api()?.getViewerId?.()||viewer"
])if(!budget.includes(marker))fail(`Budget scope performance invariant missing: ${marker}`);

for(const file of budgetFiles){const name=path.basename(file);if(!sw.includes(name))fail(`Service worker composition missing ${name}`);if(!build.includes(name))fail(`Build diagnostics/cache list missing ${name}`)}
for(const marker of [
  "update public.planly_budget_scopes\n     set owner_id = p_new_owner",
  "update public.planly_budget_categories c\n     set owner_id = p_new_owner",
  "update public.planly_budget_targets t\n     set owner_id = p_new_owner",
  "delete from public.planly_budget_entries e",
  "delete from public.planly_budget_targets t",
  "delete from public.planly_budget_categories c",
  "delete from public.planly_budget_scopes",
  "Budget scope owner can change only with Household ownership",
  "Budget entry identity is immutable"
])if(!migrations.includes(marker))fail(`Household/Budget lifecycle closeout invariant missing: ${marker}`);

for(const marker of [
  'planly_private_departing_member_tasks',
  "drop policy if exists planly_budget_entries_select_authorized",
  "select 1\n      from public.planly_budget_scopes s\n     where s.id=scope_id"
])if(!migrations.includes(marker))fail(`Departing-member Budget privacy invariant missing: ${marker}`);

if(!sw.includes('...APPEND_URLS.map(url=>freshOrCached(cache,url))'))fail('Budget append runtime is not covered by offline fresh-or-cache composition');

console.log('Planly Budget 4.0 release-hardening checks passed.');
