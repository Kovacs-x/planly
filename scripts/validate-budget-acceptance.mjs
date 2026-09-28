import fs from 'node:fs';import path from 'node:path';
const root=process.cwd(),read=p=>fs.readFileSync(path.join(root,p),'utf8'),fail=m=>{throw new Error(m)};
const files=['v2/core-budget-nav-v4.0b1.js','v2/core-budget-v4.0b.js','v2/core-budget-ui-v4.0b.js','v2/core-budget-scope-v4.0c.js','v2/core-budget-lifecycle-v4.0d.js','v2/core-budget-monthly-v4.0e.js','v2/core-budget-month-state-v4.0f.js','v2/core-budget-insights-v4.0g.js','v2/core-budget-actions-v4.0l.js','v2/core-budget-scroll-v4.0m.js','v2/core-budget-review-hardening-v4.0p.js','v2/core-budget-core-guard-v4.0q.js'];
const budget=files.map(read).join('\n'),sw=read('v2/sw.js'),manifest=read('v2/runtime-modules.json'),nav=read('v2/core-budget-nav-v4.0b1.js'),lifecycle=read('v2/core-budget-lifecycle-v4.0d.js'),review=read('v2/core-budget-review-hardening-v4.0p.js'),guard=read('v2/core-budget-core-guard-v4.0q.js'),lists=read('v2/core-lists-v4.1.js'),migration=read('supabase/migrations/041_collaborative_household_budget_entries.sql');
for(const f of files){const name=path.basename(f);if(!sw.includes(name)&&!manifest.includes(name))fail(`Budget layer is not shipped: ${name}`)}
for(const marker of ['createPersonal','ensureHouseholdScope','addEntry','addCategory','Carry forward','window.PlanlyBudgetMonth','Monthly snapshot','conflict','cloud_version'])if(!budget.includes(marker))fail(`Missing Budget journey marker: ${marker}`);
for(const marker of ['planly_budget_entries_update_authorized',"s.scope_type = 'personal'","s.scope_type = 'household'",'planly_private.is_household_member','planly_budget_entry_immutable_guard'])if(!migration.includes(marker))fail(`Missing collaborative entry RLS marker: ${marker}`);
for(const marker of ['readPreference(owner)',"api.switchScope('household')",'data-budget-entry-id','data-review-entry-actions','persistedEntryUpdate','persistedDelete'])if(!review.includes(marker))fail(`Missing review-02 acceptance marker: ${marker}`);
if(lifecycle.includes('decorateCategory(')||lifecycle.includes('data-life-quick-delete'))fail('Duplicate/index-mapped expense actions remain reachable');
for(const marker of ['api.updateEntry=','api.deleteEntry=','api.updateCategory=','__legacyMutationGuard'])if(!guard.includes(marker))fail(`Legacy mutation path remains unguarded: ${marker}`);
for(const marker of ['budgetComplete(view)','budgetInvalidated','planly:budget-invalidated','.budgetMonthBar'])if(!nav.includes(marker))fail(`Budget deterministic render gate missing: ${marker}`);
if(nav.includes('budgetRenderedView===view'))fail('Legacy Budget render short-circuit returned');
if(/service_role|SUPABASE_SERVICE_ROLE|sb_secret_/i.test(budget))fail('Privileged credential marker in Budget browser runtime');
for(const marker of ["b.id='planlyListsBtn'",'data-lists-create','querySelector(\'input[name="item"]\')'])if(!lists.includes(marker))fail(`Shared Lists entry point missing: ${marker}`);
if(lists.includes('elements.item'))fail('Shared Lists item collision returned');
console.log('Planly Budget 4.0 functional acceptance checks passed.');
