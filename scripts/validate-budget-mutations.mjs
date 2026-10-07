import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
const core=read('v2/core-budget-v4.0b.js');
const ui=read('v2/core-budget-ui-v4.0b.js');
const scope=read('v2/core-budget-scope-v4.0c.js');
const actions=read('v2/core-budget-actions-v4.0l.js');
const lifecycle=read('v2/core-budget-lifecycle-v4.0d.js');
const monthly=read('v2/core-budget-monthly-v4.0e.js');
const monthState=read('v2/core-budget-month-state-v4.0f.js');
const migration=read('supabase/migrations/041_collaborative_household_budget_entries.sql');
const fail=m=>{throw new Error(m)};
for(const marker of ["const versionBucket=k=>({category:'categories',target:'targets',entry:'entries'})[k]||null",'function acceptServer(op,server)','rows[i]={...rows[i],...server}','clearPending(op);clearConflict(op.kind,op.id)'])if(!core.includes(marker))fail('Authoritative create reconciliation invariant missing: '+marker);
if(core.includes("const bucket=k+'s'"))fail('Legacy misspelled Budget version bucket derivation is still active');
// The viewer-role label lived only in the "Household Budget · owner/member" explainer, which was removed so the Household budget mirrors Me.
if(/isOwner\?'owner':'member'|budgetSharedNote/.test(scope))fail('Household Budget explainer must stay removed');
for(const marker of ['mutate','persistedEntryUpdate','classifyZero','cloud_version',"code:'conflict'","code:'denied'",'select(\'*\').maybeSingle','await a.bootstrap()','planly:budget-mutation-confirmed','persistedCategoryUpdate','persistedDelete'])if(!actions.includes(marker))fail('Missing authoritative Budget mutation invariant: '+marker);
for(const marker of ['const used=state.entries.some','if(used){'])if(!actions.includes(marker))fail('Budget category removal note invariant missing: '+marker);
for(const marker of ['planly:budget-ui-rendered','mutate','persistedCategoryUpdate'])if(!actions.includes(marker))fail('Budget action composition invariant missing: '+marker);
for(const marker of ['planly:budget-ui-rendered','PlanlyBudgetActions.mutate',"navigate('category',()=>categoryView(chosen))",'planly:budget-mutation-confirmed','refreshVisible','Coming up','Unplanned'])if(!ui.includes(marker))fail('Budget R3 contextual render invariant missing: '+marker);
if(lifecycle.includes('decorateCategory(')||lifecycle.includes('data-life-quick-delete'))fail('Legacy index-mapped expense action owner is still active');
for(const marker of ['decorateIncome','persistedUpdate(entry.id','PlanlyBudgetActions.deleteEntryFlow(entry)'])if(!lifecycle.includes(marker))fail('Income lifecycle invariant missing: '+marker);
for(const marker of ['getState:normalizedState','v.categories[row.id]=Number(row.cloud_version)','v.targets[row.id]=Number(row.cloud_version)','v.entries[row.id]=Number(row.cloud_version)'])if(!core.includes(marker))fail('Budget version map must match the rows callers see: '+marker);
for(const marker of ['readScopePreference(owner)','JSON.parse(localStorage.getItem','switchScope(\'household\')','bootstrap:bootstrapWithPreference',"activeType==='household'&&state.scope",'return bootstrap()}'])if(!core.includes(marker))fail('Budget state hardening invariant missing: '+marker);
if(core.includes("if(pref==='household'){const ok=await switchScope('household')"))fail('Household bootstrap can still short-circuit an already-loaded household scope');
for(const marker of ['updateEntry:(id,patch)=>budgetActions().persistedEntryUpdate(id,patch)','deleteEntry:id=>budgetActions().persistedDelete(id)','updateCategory:(id,patch)=>budgetActions().persistedCategoryUpdate(id,patch)','function budgetActions()'])if(!core.includes(marker))fail('Legacy mutation guard missing: '+marker);
for(const marker of ['planly_budget_entries_update_authorized',"s.scope_type = 'personal'","s.scope_type = 'household'",'planly_private.is_household_member','planly_budget_entry_immutable_guard'])if(!migration.includes(marker))fail('Collaborative Household Budget RLS invariant missing: '+marker);
for(const forbidden of ['data-month-targets','targetsView','setTarget('])if(monthly.includes(forbidden))fail('Removed Set Budget surface is still reachable: '+forbidden);
if([monthState,ui].some(s=>s.includes("+' category targets'")))fail('Budget insights still expose removed category targets');
for(const source of [core,ui,scope,actions,lifecycle,monthly,monthState]){new Function(source);if(source.includes('$$$'))fail('Generated Budget JS contains $$$');if(source.includes('$().forEach'))fail('Generated Budget JS contains accidental $().forEach')}
console.log('Authoritative collaborative Budget mutation validation passed');

for(const marker of ["acceptTodayBillMutation(server)","planly-budget-mutation-confirmed"])if(!core.includes(marker))fail('C1 authoritative create refresh invariant missing: '+marker);
