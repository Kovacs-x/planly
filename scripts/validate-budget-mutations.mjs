import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
const actions=read('v2/core-budget-actions-v4.0l.js');
const lifecycle=read('v2/core-budget-lifecycle-v4.0d.js');
const monthly=read('v2/core-budget-monthly-v4.0e.js');
const insights=read('v2/core-budget-insights-v4.0g.js');
const fail=m=>{throw new Error(m)};
for(const marker of ['persistedEntryUpdate','await a.replay()','mutationError','persistedCategoryUpdate','persistedDelete'])if(!actions.includes(marker))fail('Missing persistence-confirmed Budget action: '+marker);
for(const marker of ['await persistedUpdate(entry.id,patch)','await persistedDelete(entry.id)','data-life-quick-delete'])if(!lifecycle.includes(marker))fail('Budget lifecycle does not await mutation: '+marker);
for(const forbidden of ['data-month-targets','targetsView','setTarget('])if(monthly.includes(forbidden))fail('Removed Set Budget surface is still reachable: '+forbidden);
if(insights.includes("+' category targets'"))fail('Budget insights still expose removed category targets');
for(const source of [actions,lifecycle,monthly,insights]){new Function(source);if(source.includes('$$$'))fail('Generated Budget JS contains $$$');if(source.includes('$().forEach'))fail('Generated Budget JS contains accidental $().forEach')}
console.log('Budget mutation/target-removal validation passed');
