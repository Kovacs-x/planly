import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
const exists=p=>fs.existsSync(p);
const fail=m=>{throw new Error(m)};

// Repository hygiene: v2 is production. Old root loader shims must not return.
for(const f of fs.readdirSync('.').filter(x=>/^loader-v\d/.test(x))) fail(`Dead legacy loader remains at repo root: ${f}`);
for(const f of ['README.md','docs/ARCHITECTURE.md','docs/SECURITY.md','v2/runtime-modules.json']) if(!exists(f)) fail(`Required release documentation/runtime file missing: ${f}`);

const runtime=JSON.parse(read('v2/runtime-modules.json'));
const modules=runtime.modules||[];
for(const f of ['core-budget-v4.0b.js','core-budget-ui-v4.0b.js','core-budget-scope-v4.0c.js','core-budget-monthly-v4.0e.js','core-budget-insights-v4.0g.js','core-lists-v4.1.js','core-household-dashboard-v4.2.js']){
  if(!modules.some(x=>String(x).includes(f))) fail(`Production runtime manifest missing ${f}`);
}

const sw=read('v2/sw.js'), build=read('v2/core-build-v3.3c.js');
for(const marker of ['RUNTIME_MANIFEST_URL','runtimeModuleUrls(cache)',"freshOrCached(cache,RUNTIME_MANIFEST_URL)",'validRuntimeModule','appendUrls=await runtimeModuleUrls(cache)']) if(!sw.includes(marker)) fail(`Service-worker upgrade/reachability guard missing: ${marker}`);
for(const marker of ['verifyPlanlyOfflineCache','probePlanlyServiceWorker']) if(!build.includes(marker)) fail(`Offline/release probe missing: ${marker}`);

const budget=read('v2/core-budget-v4.0b.js');
const budgetMonthly=read('v2/core-budget-monthly-v4.0e.js');
const insights=read('v2/core-budget-insights-v4.0g.js');
for(const marker of ["scope_type:'personal'","scope_type:'household'",".eq('cloud_version',op.baseVersion)",'structureOwner()','membership.role!==\'owner\'']) if(!budget.includes(marker)) fail(`Budget authorization/concurrency invariant missing: ${marker}`);
for(const marker of ['budgetInvalidated','renderBudgetStable(view)','budgetComplete(view)']) if(!insights.includes(marker)) fail(`Budget deterministic composition guard missing: ${marker}`);
for(const marker of ['Carry forward only recurring items you created','installEntryMonthGuard']) if(!budgetMonthly.includes(marker)) fail(`Budget member ownership/month guard missing: ${marker}`);

const lists=read('v2/core-lists-v4.1.js');
for(const marker of ['cloud_version','household','owner_id','planlyListsBtn']) if(!lists.includes(marker)) fail(`Lists integrated release invariant missing: ${marker}`);
const dash=read('v2/core-household-dashboard-v4.2.js');
for(const marker of [".eq('visibility','household')",'private calendar sources','planlyHouseholdDashboardBtn']) if(!dash.includes(marker)) fail(`Household Dashboard privacy/reachability invariant missing: ${marker}`);

const calendar=read('v2/core-household-calendar-v3.3c.js');
if(!calendar.includes('PLANLY_HOUSEHOLD_EXTERNAL_CALENDAR_SHARING=false')) fail('Private external-calendar household boundary missing');

console.log('Planly integrated Household release gate passed.');
