import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const fail=m=>{throw new Error(m)};
const files=['v2/core-budget-nav-v4.0b1.js','v2/core-budget-v4.0b.js','v2/core-budget-ui-v4.0b.js','v2/core-budget-scope-v4.0c.js','v2/core-budget-lifecycle-v4.0d.js','v2/core-budget-monthly-v4.0e.js','v2/core-budget-month-state-v4.0f.js','v2/core-budget-insights-v4.0g.js'];
const budget=files.map(read).join('\n'),html=read('v2/index.html'),sw=read('v2/sw.js'),nav=read('v2/core-budget-nav-v4.0b1.js'),lists=read('v2/core-lists-v4.1.js');
for(const f of files){const name=path.basename(f);if(!html.includes(name)&&!sw.includes(name))fail(`Budget layer is not shipped: ${name}`)}
for(const marker of ['Budget','PlanlyBudget','PlanlyBudgetMonth'])if(!budget.includes(marker)&&!html.includes(marker))fail(`Missing Budget acceptance surface: ${marker}`);
for(const marker of ['createPersonal','ensureHouseholdScope','addEntry','updateEntry','deleteEntry','addCategory','updateCategory','setTarget','Carry forward','window.PlanlyBudgetMonth','Monthly snapshot','conflict','cloud_version'])if(!budget.includes(marker))fail(`Missing Budget user journey marker: ${marker}`);
for(const marker of ["scope_type:'personal'","scope_type:'household'",'membership.role','You can only edit budget entries you added.','You can only delete budget entries you added.'])if(!budget.includes(marker))fail(`Missing Budget authorization acceptance marker: ${marker}`);
if(/service_role|SUPABASE_SERVICE_ROLE|sb_secret_/i.test(budget))fail('Privileged credential marker in Budget browser runtime');
for(const marker of ['planly-budget-cache-v2:','planly-budget-pending-v2:','planly-budget-conflicts-v2:','operationId:uuid()'])if(!budget.includes(marker))fail(`Missing Budget offline acceptance marker: ${marker}`);
for(const f of files){const name=path.basename(f);if(!sw.includes(name))fail(`Budget runtime missing from service-worker composition: ${name}`)}
for(const marker of ['budgetComplete(view)','budgetInvalidated','planly:budget-invalidated','.budgetMonthBar'])if(!nav.includes(marker))fail(`Budget deterministic render gate missing: ${marker}`);
if(nav.includes('budgetRenderedView===view'))fail('Legacy DOM-presence Budget short-circuit can suppress composed render layers');
for(const marker of ["b.id='planlyListsBtn'","setAttribute('aria-label','Lists')",'actions.prepend(b)','data-lists-create','querySelector(\'input[name="item"]\')'])if(!lists.includes(marker))fail(`Shared Lists production entry point missing: ${marker}`);
if(lists.includes('elements.item'))fail('Shared Lists item submit still collides with HTMLFormControlsCollection.item');
for(const marker of ['LISTS_RUNTIME_URL','core-lists-v4.1.js?v=410a03'])if(!sw.includes(marker))fail('Shared Lists runtime is not shipped in generated production JS: '+marker);
console.log('Planly Budget 4.0 functional acceptance checks passed.');
