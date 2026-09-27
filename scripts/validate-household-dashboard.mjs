import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8'),fail=m=>{throw new Error(m)};
const dash=read('v2/core-household-dashboard-v4.2.js'),sw=read('v2/sw.js');
new Function(dash);new Function(sw);
for(const bad of ['MutationObserver','service_role','SUPABASE_SERVICE_ROLE','sb_secret_','calendar_sources','external_calendar_events'])if(dash.includes(bad))fail('Dashboard forbidden marker: '+bad);
for(const marker of [".eq('visibility','household')",".eq('household_id',householdId)",".eq('scope_type','household')",".gte('entry_date',start)",".lt('entry_date',end)",".eq('budget_month',start)",'Private tasks, Personal Budget data and private calendar sources are excluded','private ICS calendars are never promoted','planlyHouseholdDashboardBtn','window.PlanlyHouseholdDashboard'])if(!dash.includes(marker))fail('Dashboard privacy/composition invariant missing: '+marker);
if(/\.(?:insert|update|upsert|delete)\s*\(/.test(dash))fail('Household Dashboard must remain read-only');
for(const marker of ["const CACHE='planly-v2-420a-01'","const VERSION='planly-v2-sw-420a-01'","core-household-dashboard-v4.2.js?v=420a01","APPEND_URLS.push(LISTS_RUNTIME_URL,HOUSEHOLD_DASHBOARD_URL)"])if(!sw.includes(marker))fail('Dashboard service-worker composition missing: '+marker);
console.log('Planly Household Dashboard 4.2 release checks passed.');
