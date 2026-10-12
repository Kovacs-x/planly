import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8'),fail=m=>{throw new Error(m)};
const dash=read('v2/core-household-dashboard-v4.2.js'),sw=read('v2/sw.js'),manifest=JSON.parse(read('v2/runtime-modules.json'));
new Function(dash);new Function(sw);
for(const bad of ['MutationObserver','service_role','SUPABASE_SERVICE_ROLE','sb_secret_','calendar_sources','external_calendar_events'])if(dash.includes(bad))fail('Dashboard forbidden marker: '+bad);
for(const marker of [".eq('visibility','household')",".eq('household_id',householdId)",".eq('scope_type','household')",".gte('entry_date',start)",".lt('entry_date',end)",".eq('budget_month',start)",'planlyHouseholdDashboardBtn','window.PlanlyHouseholdDashboard'])if(!dash.includes(marker))fail('Dashboard privacy/composition invariant missing: '+marker);
// Private calendar sources (e.g. a private ICS rota calendar) can never appear: the dashboard reads no calendar data at all.
if(/calendar/i.test(dash))fail('Household Dashboard must not read or show calendar sources or events');
{const tables=[...new Set([...dash.matchAll(/from\('([a-z_]+)'\)/g)].map(m=>m[1]))].sort().join();if(tables!=='planly_budget_entries,planly_budget_scopes,planly_budget_targets,planly_household_members,planly_list_items,planly_lists,planly_projects,planly_tasks')fail('Household Dashboard reads unexpected tables: '+tables)}
if(/\.(?:insert|update|upsert|delete)\s*\(/.test(dash))fail('Household Dashboard must remain read-only');
const cache=sw.match(/const CACHE='([^']+)'/)?.[1],version=sw.match(/const VERSION='([^']+)'/)?.[1];if(!cache||!version)fail('Dashboard service-worker cache/version markers missing');
for(const marker of ["const RUNTIME_MANIFEST_URL='./runtime-modules.json'",'runtimeModuleUrls(cache)','validRuntimeModule(url)','appendUrls=await runtimeModuleUrls(cache)','appendTexts.length!==appendUrls.length'])if(!sw.includes(marker))fail('Dashboard first-load service-worker composition missing: '+marker);
if(!manifest.modules?.includes('./core-household-dashboard-v4.2.js?v=420a03'))fail('Runtime manifest does not expose Household Dashboard');
if(!manifest.modules?.some(module=>module.startsWith('./core-lists-v4.1.js?v=')))fail('Runtime manifest regressed Shared Lists');
for(const name of ['core-budget-v4.0b.js','core-budget-scope-v4.0c.js','core-budget-actions-v4.0l.js','core-budget-lifecycle-v4.0d.js','core-budget-scroll-v4.0m.js','core-budget-month-state-v4.0f.js'])if(!manifest.modules?.some(module=>module.startsWith('./'+name+'?v=')))fail('Runtime manifest regressed Budget acceptance module: '+name);
console.log(`Planly Household Dashboard 4.2 release checks passed (${cache} / ${version}), including cross-deployment first-load reachability.`);