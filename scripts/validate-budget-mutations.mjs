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
// Deleting a category deletes its payments in the cloud, and a payment counts only while its category is active.
for(const marker of ['async function deleteCategoryFlow(category)',"await mutate('category',category.id,{archived:true})",".update(mutablePatch('entry',{deleted_at:new Date().toISOString()})).eq('id',x.id).eq('scope_id',scope.id).eq('category_id',category.id).eq('cloud_version',x.version).is('deleted_at',null)",'version:Number(start.versions?.entries?.[x.id]||x.cloud_version||0)',"if(!x.version){unsynced.push(x.id);continue}","if(now.error||!now.data)failed.push(x.id);else if(now.data.deleted_at)gone.push(x.id);else if(Number(now.data.cloud_version)!==x.version)changed.push(x.id);else failed.push(x.id)","[[changed,'changed on another device'],[unsynced,'not synced yet'],[failed,'could not be removed']]",'deleteCategoryFlow,'])if(!actions.includes(marker))fail('Budget category delete invariant missing: '+marker);
for(const m of actions.matchAll(/from\('planly_budget_entries'\)\.update\(mutablePatch\('entry',\{deleted_at[\s\S]*?\.select\(/g))if(!m[0].includes(".eq('id',x.id)")||!m[0].includes(".eq('cloud_version',x.version)"))fail('Category payments must be deleted one by one at the version first seen, never in one unversioned update');
if((actions.match(/deleteCategoryFlow\(category\)/g)||[]).length!==3||actions.includes('await persistedCategoryArchive('))fail('Every category delete in Budget actions must go through deleteCategoryFlow');
if(!ui.includes('PlanlyBudgetActions.deleteCategoryFlow(row)')||ui.includes("mutate('category',row.id,{archived:true})"))fail('The Budget Delete category button must go through deleteCategoryFlow');
for(const marker of ['function isLiveEntry(row){return !!row&&!row.deleted_at&&state.categories.some(c=>c.id===row.category_id&&!c.archived&&!c.deleted_at)}','&&isLiveEntry(x))','summary,isLiveEntry,',"const removed=new Set((cats.data||[]).filter(c=>c.archived||c.deleted_at).map(c=>c.id));rows=rows.filter(x=>!removed.has(x.category_id))"])if(!core.includes(marker))fail('Budget live-payment invariant missing: '+marker);
if(!ui.includes("===m&&a.isLiveEntry(x))")||!lifecycle.includes('===m&&api().isLiveEntry(x))')||!monthly.includes('&&x.recurring_monthly&&Number(x.amount_minor)>0&&api().isLiveEntry(x))'))fail('Budget totals, income rows and carry forward must count only live payments (carry forward: only ones above £0)');
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
// Due date picker: quick days plus a calendar chip for any day, on Add and Edit payment.
for(const marker of ['const DUE_QUICK=[1,7,15,21,28];','function bindDuePicker(root,initial,onChange){','data-due-custom aria-pressed="false" aria-expanded="false"',"custom.setAttribute('aria-pressed',own?'true':'false')",'data-due-grid','bindDuePicker(host,due,v=>{due=v});','bindDuePicker(form,editDue,v=>{editDue=v});',"due_day:Number(editDue),entry_date:dueEntryDate(row.entry_date,editDue)",'last=new Date(y,mo,0).getDate()'])if(!ui.includes(marker))fail('Budget due date picker invariant missing: '+marker);
console.log('Authoritative collaborative Budget mutation validation passed');

for(const marker of ["acceptTodayBillMutation(server)","planly-budget-mutation-confirmed"])if(!core.includes(marker))fail('C1 authoritative create refresh invariant missing: '+marker);
// Budget forms keep what is typed: a form being filled in is not redrawn, and its typing is kept until saved or left.
{const ui=fs.readFileSync('v2/core-budget-ui-v4.0b.js','utf8');
 for(const x of ["const DRAFT_KEY='planly-budget-draft-v1'","function navigate(next,fn){const from=mode;if(formOpen())clearDraft();","function refreshVisible(){if(!host||formOpen())return;","host=target||document.getElementById('view');if(!host||formOpen())return;","function rendered(){restoreDraft();","document.addEventListener('click',e=>{const f=e.target?.closest?.('form.budgetForm');if(!f||!host?.contains(f)||!e.target.closest('button'))return;editingForm=f;saveDraft(f)},true);",'<form id="budgetAllocationForm" class="budgetForm"><div><label for="allocName">What for?</label>','budgetHeadAdd" data-act="allocation" data-category="${esc(c.id)}">+ Add a bill</button>'])
  if(!ui.includes(x))throw new Error('Budget form rule missing: '+x);
 if(/margin-top:14px" data-act="allocation"/.test(ui))throw new Error('Add a bill must not also sit at the bottom');}

