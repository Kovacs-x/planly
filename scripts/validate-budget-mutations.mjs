import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
const actions=read('v2/core-budget-actions-v4.0l.js');
const lifecycle=read('v2/core-budget-lifecycle-v4.0d.js');
const monthly=read('v2/core-budget-monthly-v4.0e.js');
const insights=read('v2/core-budget-insights-v4.0g.js');
const migration=read('supabase/migrations/041_collaborative_household_budget_entries.sql');
const fail=m=>{throw new Error(m)};
for(const marker of ['persistedEntryUpdate','classifyZero','cloud_version',"code:'conflict'","code:'denied'",'select(\'*\').maybeSingle','await a.bootstrap()','planly:budget-mutation-confirmed','persistedCategoryUpdate','persistedDelete'])if(!actions.includes(marker))fail('Missing authoritative Budget mutation invariant: '+marker);
for(const marker of ['await persistedUpdate(entry.id,patch)','await persistedDelete(entry.id)','data-life-quick-delete','row.remove()','Saved to Budget. You can keep editing','Deleted from Budget. Use Back'])if(!lifecycle.includes(marker))fail('Budget lifecycle does not preserve confirmed in-place mutation: '+marker);
for(const marker of ['planly_budget_entries_update_authorized',"s.scope_type = 'personal'","s.scope_type = 'household'",'planly_private.is_household_member','planly_budget_entry_immutable_guard'])if(!migration.includes(marker))fail('Collaborative Household Budget RLS invariant missing: '+marker);
for(const forbidden of ['data-month-targets','targetsView','setTarget('])if(monthly.includes(forbidden))fail('Removed Set Budget surface is still reachable: '+forbidden);
if(insights.includes("+' category targets'"))fail('Budget insights still expose removed category targets');
for(const source of [actions,lifecycle,monthly,insights]){new Function(source);if(source.includes('$$$'))fail('Generated Budget JS contains $$$');if(source.includes('$().forEach'))fail('Generated Budget JS contains accidental $().forEach')}
console.log('Authoritative collaborative Budget mutation validation passed');
