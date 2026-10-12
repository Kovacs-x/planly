import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8'),fail=m=>{throw new Error(m)};
const paths={app:'v2/app-v3.2.0.js',hardening:'v2/hardening-v3.3b.js',projects:'v2/core-projects-v3.3c.js',build:'v2/core-build-v3.3c.js',assignment:'v2/core-assignment-v3.3c.js',planning:'v2/core-project-planning-v3.3c.js',calendar:'v2/core-household-calendar-v3.3c.js',budgetNav:'v2/core-budget-nav-v4.0b1.js',redesignR1:'v2/core-redesign-r1.js',budget:'v2/core-budget-v4.0b.js',budgetUi:'v2/core-budget-ui-v4.0b.js',budgetScope:'v2/core-budget-scope-v4.0c.js',budgetLifecycle:'v2/core-budget-lifecycle-v4.0d.js',budgetMonthly:'v2/core-budget-monthly-v4.0e.js',budgetMonthState:'v2/core-budget-month-state-v4.0f.js',budgetActions:'v2/core-budget-actions-v4.0l.js',budgetScroll:'v2/core-budget-scroll-v4.0m.js',lists:'v2/core-lists-v4.1.js',dashboard:'v2/core-household-dashboard-v4.2.js',intelligence:'v2/core-intelligence-v5.js',update:'v2/core-update-v4.3.js',sw:'v2/sw.js',config:'v2/supabase-config.js'};
const s=Object.fromEntries(Object.entries(paths).map(([k,p])=>[k,read(p)])),manifest=JSON.parse(read('v2/runtime-modules.json'));
const closeIndex=s.app.lastIndexOf('})();');if(closeIndex<0)fail('Planly core injection point missing');
const core=[s.projects,s.build,s.assignment,s.planning,s.calendar,s.budgetNav],appended=[s.budget,s.budgetUi,s.budgetScope,s.budgetLifecycle,s.budgetMonthly,s.budgetMonthState,s.budgetActions,s.budgetScroll,s.lists,s.dashboard,s.update,s.intelligence];
const generated=s.app.slice(0,closeIndex)+'\n'+core.join('\n')+'\n'+s.app.slice(closeIndex)+'\n;'+s.hardening+'\n;'+appended.join('\n;');
for(const [name,source] of [...Object.entries(s),['generated',generated]])try{new Function(source)}catch(err){fail(name+' does not parse: '+err.message)}
for(const source of [generated,s.sw,s.config]){if(source.includes('$$$'))fail('Found $$$ regression');const bad=(source.match(/(^|[^$])\$\([^)]*\)\.forEach/g)||[]).filter(x=>!x.includes('$$('));if(bad.length)fail('Found accidental $().forEach')}
for(const needle of ["$$('.nav button').forEach","$$('#quickDates .chip').forEach","$$('[data-planly-calendar-refresh]').forEach","$$('[data-planly-calendar-remove]').forEach","$$('[data-planly-calendar-toggle]').forEach","$$('[data-planly-calendar-colour]').forEach"])if(!generated.includes(needle))fail('Missing collection handler: '+needle);
for(const needle of ['function todayView','function upcomingView','function settingsView','function openSheet','function completeTaskWithUndo','function reconcilePlanlyCloud','PLANLY_HOUSEHOLD_EXTERNAL_CALENDAR_SHARING=false','function planlyMonthTasksForDate','function planlyMonthExternalForDate','window.PlanlyBudget','window.PlanlyLists','window.PlanlyHouseholdDashboard','window.PlanlyIntelligence','window.PlanlyUpdate'])if(!generated.includes(needle))fail('Missing critical runtime function: '+needle);
for(const needle of ['data-budget-scope="personal"','data-budget-scope="household"','PlanlyBudgetActions.mutate','Coming up','Unplanned','persistedEntryUpdate','persistedDelete','persistedCategoryUpdate','classifyZero','readScopePreference(owner)',"switchScope('household')",'bootstrap:bootstrapWithPreference','function budgetActions()','scrollTopNow','planly:budget-ui-rendered','Left to plan','Coming up','Money in'])if(!generated.includes(needle))fail('Missing Budget review invariant: '+needle);
if(s.budgetLifecycle.includes('decorateCategory(')||s.budgetLifecycle.includes('data-life-quick-delete'))fail('Legacy index-mapped expense action owner remains active');
const cache=s.sw.match(/const CACHE='([^']+)'/)?.[1],version=s.sw.match(/const VERSION='([^']+)'/)?.[1];if(!cache||!version)fail('Service worker cache/version markers missing');
for(const module of manifest.modules||[])if(!s.sw.includes(module))fail('Service worker missing runtime manifest module marker: '+module);
for(const needle of ["const RUNTIME_MANIFEST_URL='./runtime-modules.json'",'INTELLIGENCE_RUNTIME_URL','UPDATE_RUNTIME_URL','await self.clients.claim()','FETCH_TIMEOUT=8000','AbortController','results.some(ok=>!ok)','await caches.delete(CACHE)'])if(!s.sw.includes(needle))fail('Missing service-worker/runtime marker: '+needle);
for(const needle of ['runtime-modules.json','__planly_sw_probe__','function verifyPlanlyOfflineCache','function probePlanlyServiceWorker'])if(!s.build.includes(needle))fail('Offline verifier missing: '+needle);if(/window\.(verifyPlanlyOfflineCache|probePlanlyServiceWorker)\s*=/.test(generated))fail('Offline verifier must not be redefined on window');
for(const needle of ['runtime-modules.json','planlyKeys','probePlanlyServiceWorker','/^planly-v2-sw-'])if(!s.build.includes(needle))fail('N16 offline readiness fix missing: '+needle);
for(const needle of ['controllerchange','Planly update ready','SKIP_WAITING','editing()','reg.update()'])if(!s.update.includes(needle))fail('Safe update coordinator invariant missing: '+needle);
if(s.build.includes("const CACHE='planly-v2-")||s.build.includes("SW='planly-v2-sw-"))fail('Core build hard-codes release cache/version markers');
if(s.sw.includes('client.navigate(client.url)'))fail('Unsafe unconditional activation-time navigation present');
if(/Date\.prototype\.(?:toISOString|valueOf|getTime)\s*=/.test(generated))fail('Unsafe Date monkeypatch in final runtime');
if(/service_role|sb_secret_/i.test(appended.join('\n')+s.config))fail('Privileged credential marker in browser runtime');
console.log(`Planly FINAL generated runtime regression checks passed (${cache} / ${version}).`);

const runtimeClientFiles=['v2/app-v3.2.0.js','v2/core-budget-v4.0b.js','v2/core-budget-actions-v4.0l.js','v2/core-budget-monthly-v4.0e.js','v2/core-lists-v4.1.js','v2/core-household-dashboard-v4.2.js','v2/core-intelligence-v5.js','v2/hardening-v3.3b.js'];
for(const file of runtimeClientFiles){if(read(file).includes('window.supabase.createClient('))fail('runtime module creates a secondary Supabase client: '+file)}
const supabaseConfig=read('v2/supabase-config.js');
if((supabaseConfig.match(/window\.supabase\.createClient\(/g)||[]).length!==1)fail('supabase-config must contain exactly one createClient constructor');
if(!supabaseConfig.includes('window.PlanlySupabase={get()'))fail('shared PlanlySupabase singleton missing');

const p2bApp=read('v2/app-v3.2.0.js'),p2bHardening=read('v2/hardening-v3.3b.js');
if(!p2bApp.includes('PLANLY_HOUSEHOLD_TTL_MS=60000'))fail('household loader TTL missing');
if(!p2bApp.includes('planlyHouseholdLoadPromise'))fail('household loader single-flight missing');
if(!p2bApp.includes('PLANLY_CALENDAR_TTL_MS=15000'))fail('calendar loader TTL missing');
if(!p2bApp.includes('planlyCalendarLoadPromise'))fail('calendar loader single-flight missing');
if(!p2bApp.includes("if(session&&previousUser&&previousUser===nextUser)return"))fail('same-user auth events must not reload cloud loaders');
if(p2bHardening.includes("kickForegroundHouseholdSync(){if(!navigator.onLine)return;const now=Date.now();if(now-lastForegroundKick<1200)return;lastForegroundKick=now;kickHouseholdSync()"))fail('foreground wake must not masquerade as remote household change');
if(!p2bHardening.includes("const ctx=await loadAssignmentContext(false)"))fail('realtime must reuse assignment household context');

if(!p2bHardening.includes("window.dispatchEvent(new CustomEvent('planly:foreground-resume'))"))fail('genuine foreground resume event missing');
if(p2bHardening.includes("window.addEventListener('focus'"))fail('plain focus must not trigger household/cloud resume work');
if(!p2bApp.includes("window.addEventListener('planly:foreground-resume'"))fail('foreground resume reconcile listener missing');

const assignmentWrapper=read('v2/core-assignment-v3.3c.js');
if(!assignmentWrapper.includes('function loadPlanlyHousehold(force=false)'))fail('household loader must preserve force argument');
if(!assignmentWrapper.includes('loadPlanlyHouseholdCore(force)'))fail('household loader must forward force argument');
for(const fn of ['createPlanlyHousehold','createPlanlyHouseholdInvite','revokePlanlyHouseholdInvite','acceptPlanlyHouseholdInvite','transferPlanlyHouseholdOwnership','deletePlanlyHousehold','leavePlanlyHousehold']){const start=p2bApp.indexOf('function '+fn);const body=start>=0?p2bApp.slice(start,p2bApp.indexOf('\n}',start)+2):'';if(!body.includes('loadPlanlyHousehold(true)'))fail(fn+' must force household reload after mutation')}

const p2cApp=read('v2/app-v3.2.0.js'),p2cHardening=read('v2/hardening-v3.3b.js'),p2cLists=read('v2/core-lists-v4.1.js');
if(!p2cApp.includes('window.PlanlyHouseholdContext=detail'))fail('authoritative shared household context missing');
if(!p2cApp.includes("acceptedInvites=householdId&&planlyHousehold?.myRole==='owner'"))fail('shared household labels must derive only from authoritative owner invite data');
if((p2cHardening.match(/from\('planly_household_members'\)/g)||[]).length)fail('hardening must not query household membership');
if((p2cHardening.match(/from\('planly_household_invites'\)/g)||[]).length)fail('hardening must not query household invites');
if((p2cLists.match(/from\('planly_household_members'\)/g)||[]).length)fail('Lists must not query household membership');
if(!p2cLists.includes('window.PlanlyHouseholdContext'))fail('Lists shared household context consumer missing');
if(!p2cHardening.includes('window.PlanlyHouseholdContext'))fail('assignment shared household context consumer missing');

const p3App=read('v2/app-v3.2.0.js'),p3Html=read('v2/index.html');
if(!p3App.includes('setTimeout(()=>void flushPlanlyLastSuccessfulSync().catch(()=>{}),5000)'))fail('sync-state touch must debounce for 5 seconds');
if(!p3App.includes("document.visibilityState==='hidden'&&planlySyncTouchTimer"))fail('hidden handler must flush only an already-pending sync-state touch');
if(p3App.includes("window.addEventListener('focus',()=>{if(PLANLY_CLOUD_PREVIEW"))fail('legacy focus reconcile must be removed');
if(p3App.includes("document.visibilityState==='visible'&&PLANLY_CLOUD_PREVIEW"))fail('legacy visible reconcile must be removed');
if(!p3App.includes("window.addEventListener('planly:foreground-resume'"))fail('dedicated foreground reconcile missing');
if(!p3App.includes("publishPlanlyHouseholdContext();await loadPlanlyHousehold(true)"))fail('leave household must clear shared context before forced verification');
if(!p3Html.includes('.eyebrow{color:var(--muted);font-size:13px;min-height:14px}'))fail('header eyebrow height reservation missing');

const p3Lists=read('v2/core-lists-v4.1.js');
if(!p3Lists.includes("if(!householdId){lists=lists.filter(l=>l.visibility!=='household')"))fail('Lists must drop household rows immediately when household scope ends');
if(!p3App.includes("await loadPlanlyHousehold(true);await reconcilePlanlyCloud({render:true,replay:true,replayToast:''})"))fail('leave household must reconcile shared task visibility after verified reload');

const r1=read('v2/core-redesign-r1.js'),r1Html=read('v2/index.html');
for(const x of ["data-section=\"today\"","data-section=\"plan\"","data-section=\"home\"","data-section=\"budget\"","data-section=\"settings\"",'id="planlySyncChip"','class="planSegments"','function renderHome()'])if(!(r1+r1Html).includes(x))fail('R1 navigation invariant missing: '+x);
for(const old of ['<span class="navLabel">Upcoming</span>','<span class="navLabel">Month</span>','title="Household Dashboard">⌂','title="Lists">☑'])if(r1Html.includes(old))fail('R1 old primary navigation/header control remains: '+old);
if(!s.sw.includes("const CORE_REDESIGN_R1_URL='./core-redesign-r1.js?v=719r01'"))fail('R1 core runtime missing from service worker');
if(!s.sw.includes("const CACHE='planly-v2-721t-113'"))fail('R1 cache marker mismatch');
// iPhone Safari zooms in on focus of any field under 16px and stays zoomed: keep a 16px floor and no smaller overrides.
if(!r1Html.includes('input,select,textarea{font-size:max(16px,1em)}'))fail('form field 16px floor missing (iOS focus zoom)');
if(!r1Html.includes('content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover"'))fail('viewport must disable zoom');
if(!r1Html.includes('html{touch-action:pan-x pan-y}'))fail('pinch/double-tap zoom must be disabled with touch-action');
// Calendar conflict convergence: a stale refresh must not roll back a newer local write (lost googleEventId -> duplicate
// Google event + version conflict), and both conflict resolutions must leave Google matching the chosen version.
{const app=read('v2/app-v3.2.0.js'),projects=read('v2/core-projects-v3.3c.js');
// core-projects owns the live reconcilePlanlyCloud (it replaces the app's): the stale-snapshot guard must be there.
for(const x of ["if(owned&&Number(row.cloud_version||1)<Number(planlyCloudSyncMeta.tasks.get(id)||0))continue;","if(owned&&planlyCloudSyncMeta.tasks.has(id)&&!ownedTaskIds.has(id))return true;","if(owned&&Number(row.cloud_version||1)<Number(planlyCloudSyncMeta.projects.get(id)||0))continue;","if(owned&&planlyCloudSyncMeta.projects.has(id)&&!ownedProjectIds.has(id))return true;"])if(!projects.includes(x))fail('stale refresh guard missing from live reconcile: '+x.slice(0,70));
if(!read('v2/sw.js').includes("CORE_PROJECTS_URL='./core-projects-v3.3c.js?v=717p03'"))fail('core-projects cache marker not bumped');
for(const x of ["async function reconcilePlanlyConflictGoogle(task,duplicateEventId)","if(cloudEvent){if(localEvent&&localEvent!==cloudEvent)googleDuplicate=localEvent;local.googleEventId=cloudEvent}local.calendarSync='pending'",
 "if(localEvent&&localEvent!==cloudEvent)googleDuplicate=localEvent;","if(kind==='task'&&(googleTask||googleDuplicate)){await reconcilePlanlyConflictGoogle(googleTask,googleDuplicate);",
 "if(googleTask||googleDuplicate){await reconcilePlanlyConflictGoogle(googleTask,googleDuplicate);","catch(err){if(err?.status===404||err?.status===410)continue;remaining.push(id);"])if(!app.includes(x))fail('calendar conflict convergence invariant missing: '+x.slice(0,70));
for(const x of ["function settlePlanlyPendingWrite(kind,id,mark,version)","settlePlanlyPendingWrite('task',id,mark,data.cloud_version);clearPlanlyConflict('task',id);return data}","planlyCloudSyncMeta.tasks.set(id,Number(data.cloud_version));settlePlanlyPendingWrite('task',id,mark,data.cloud_version);return data}","edits:Number(existing?.edits||0)+1","settlePlanlyPendingWrite('project',id,mark,data.cloud_version);clearPlanlyConflict('project',id);return data}","planlyCloudSyncMeta.projects.set(id,Number(data.cloud_version));settlePlanlyPendingWrite('project',id,mark,data.cloud_version);return data}"])if(!app.includes(x))fail('in-flight task edit must stay queued: '+x.slice(0,70));
// Budget categories: "+ Create category" straight from the Budget screen; Add payment / Add income never dead-end without a category.
{const ui=read('v2/core-budget-ui-v4.0b.js');
for(const x of ['data-act="create-category" data-kind="expense">+ Create category</button>',"${d.cats.length?'<button class=\"budgetLink\" data-act=\"manage\">Edit</button>':''}".replace(/\\"/g,'"'),'function createCategoryView()','id="budgetCategoryCreateForm"',
 'id="allocNewCategory"',"chosen=d.a.addCategory({name:newCat.value,kind:'expense'",'id="incomeNewCategory"',"cat=d.a.addCategory({name:newCat.value,kind:'income'","else if(mode==='create-category')createCategoryView();"])if(!ui.includes(x))fail('Budget category flow invariant missing: '+x.slice(0,70));
// Every Budget page change goes through navigate()/swapView() so the scroll module returns to the top (no mid-page carry-over).
for(const x of ["selectedCategory=chosen;navigate('category',()=>categoryView(chosen))","navigate('dashboard',dashboard)};rendered()}","selectedCategory='';navigate('dashboard',dashboard)","function swapView(from,to,fn)","swapView(mode,'edit-payment',","swapView(mode,'edit-category',","swapView('edit-payment','category',","swapView('edit-category','category',","const from=mode;mode='dashboard';dashboard();if(from!=='dashboard')emitViewChange(from);return}"])if(!ui.includes(x))fail('Budget page change must reset scroll: '+x.slice(0,60));
if(/mode='(dashboard|category)';(dashboard|categoryView)\(/.test(ui.replace("const from=mode;mode='dashboard';dashboard();if(from!=='dashboard')emitViewChange(from);return}","")))fail('Budget page change bypasses navigate() (scroll stays mid-page)');
// Profile name: saved on the account (works with no household), carried into a household, saves on Done/tap-away, failures inline.
{const app=read('v2/app-v3.2.0.js');
for(const x of ["function planlyAccountDisplayName(){return String(planlySession?.user?.user_metadata?.planly_display_name||'').trim()}","planlySupabase.auth.updateUser({data:{planly_display_name:name||null}})","if(planlyHousehold){const {error}=await planlySupabase.rpc('planly_set_household_display_name'",
 "async function carryPlanlyNameIntoHousehold()","await carryPlanlyNameIntoHousehold();showToast('Household created')","await carryPlanlyNameIntoHousehold();showToast('Household joined')","return inviteCard+planlyNamePanelHtml()+",
 "if(e.key==='Enter'&&e.target?.id==='planlyDisplayName')","if(e.target?.id==='planlyDisplayName')void savePlanlyDisplayName()",'id="planlyDisplayNameStatus"',"if(planlyNameSaving)return;"])if(!app.includes(x))fail('profile name invariant missing: '+x.slice(0,70));
if(app.includes("showToast('Join a household first.')"))fail('profile name must not require a household');}
// Collapsible category page: payment Edit/Delete inside a closed <details> row (one open at a time), To pay/Paid folds remembered, Category options folded.
for(const x of ['<details class="budgetRowDetails" data-budget-row=','data-budget-section="topay" ${sectionOpen(\'topay\')?\'open\':\'\'}'.replace(/\\'/g,"'"),'data-budget-section="paid"','<details class="budgetFold budgetCategoryOptions">',"const SECTION_KEY='planly-budget-sections-v1'","o.open=false","rememberSection(d.dataset.budgetSection,d.open)"])if(!ui.includes(x))fail('Budget collapsible layout invariant missing: '+x.slice(0,60));
// Checklist dropdown in place (Batch 4): tasks/chores with a checklist expand inline instead of opening the editor; one at a time; read-only for others.
{const app=read('v2/app-v3.2.0.js'),r1=read('v2/core-redesign-r1.js');
for(const x of ['function planlyInlineChecklistHtml(t,readOnly,footer=\'\')'.replace(/\\'/g,"'"),"else{expandedTaskChecklists.clear();expandedTaskChecklists.add(t.id)}","data-action=\"expand-checklist\" role=\"button\"".replace(/\\"/g,'"'),"(listOpen?planlyInlineChecklistHtml(t,readOnly&&!(typeof planlyHouseholdCompletionEligible==='function'&&planlyHouseholdCompletionEligible(t))):'')+'</div></div>';","e.target.closest('button,input,select,textarea,a,.inlineChecklist')"])if(!app.includes(x))fail('inline checklist invariant missing: '+x.slice(0,60));
if(!read('v2/index.html').includes('.inlineChecklist[data-inline-checklist]{justify-self:start;width:max-content;max-width:100%;gap:0!important;margin:6px 0 2px!important;padding:0 0 0 10px!important;border:0!important;border-left:2px solid var(--line)!important'))fail('inline checklist must stay a light indented list');
if(/inlineChecklist\[data-inline-checklist\]\{[^}]*overflow-y:auto/.test(read('v2/index.html')))fail('inline checklist must not scroll inside the card (nested scrolling jitters on iOS)');
if(read('v2/app-v3.2.0.js').includes('Only its creator can tick these for now.'))fail('read-only checklist note was removed at the user\'s request');
if(read('v2/index.html').includes('.compactTask .inlineChecklist{margin:0 8px 8px 52px'))fail('compact checklist must render inside the card surface, not under the swipe actions');
if(app.includes('data-action="checklist" aria-label="Open checklist"'))fail('checklist tap must expand in place, not open the editor');
for(const x of ["hasList?'data-action=\"expand-checklist\"".replace(/\\"/g,'"'),"planlyInlineChecklistHtml(t,readOnlyList,","data-chore-open=\"'+escR1(t.id)+'\">Edit chore ⋯</button>".replace(/\\"/g,'"')])if(!r1.includes(x))fail('Home chore checklist invariant missing: '+x.slice(0,60));}
// Household checklist collaboration (migration 048): either member can tick checklist items and complete any shared task.
{const m48=read('supabase/migrations/048_household_checklist_collaboration.sql'),assign=read('v2/core-assignment-v3.3c.js'),app2=read('v2/app-v3.2.0.js');
for(const x of ['create or replace function planly_private.set_household_subtask_done(','security definer','set search_path = pg_catalog, public',"where m.household_id = v_task.household_id and m.user_id = v_user","t.visibility = 'household' and t.household_id is not null",'for update;',"raise exception 'Checklist item not found'",'revoke all on function public.planly_set_household_subtask_done(uuid,text,text,boolean) from public, anon;','revoke all on function planly_private.set_household_subtask_done(uuid,text,text,boolean) from public, anon, authenticated;'])if(!m48.includes(x))fail('migration 048 invariant missing: '+x.slice(0,60));
if(m48.includes('assigned to another household member'))fail('048 must remove the assigned-member completion restriction');
if(/delete\s+from/i.test(m48)||/disable row level security|grant[^;]*to anon/i.test(m48))fail('048 must not delete rows, disable RLS or grant anon');
for(const x of ["return !!userId;","async function runQueuedPlanlyHouseholdSubtasks()","rpc('planly_set_household_subtask_done'","function toggleHouseholdTaskSubtask(t,subtaskId)","function settleHouseholdSubtaskOp(op){const cur=readPlanlyPendingWrites().find(x=>x.kind==='householdSubtask'&&x.id===op.id);if(cur&&cur.operationId===op.operationId)clearPlanlyPendingWrite('householdSubtask',op.id)}","if(planlyHouseholdAutoCompleteIntent.has(key)&&!queued.length&&row){","if(t&&state.autoCompleteParentSubtasks&&!row.completed&&serverSubs.length&&serverSubs.every(s=>s.done))planlyCompleteHouseholdTaskDirect(t);","if(!planlyHouseholdSubtaskRun)planlyHouseholdSubtaskRun=runQueuedPlanlyHouseholdSubtasks()","customKinds=new Set(['householdCompletion','householdSubtask'])"])if(!assign.includes(x))fail('household checklist client invariant missing: '+x.slice(0,60));
if(assign.includes("clearPlanlyPendingWrite('householdSubtask',op.id);")||/then\(\(\)=>planlyCompleteHouseholdTaskDirect/.test(assign))fail('household subtask: acknowledge only the sent operation; auto-complete only on server-confirmed state');
if(!app2.includes("if(action==='toggle-subtask'&&!taskCanEdit(t)&&typeof planlyHouseholdCompletionEligible==='function'&&planlyHouseholdCompletionEligible(t)){toggleHouseholdTaskSubtask(t,actionEl.dataset.subtaskId);return}"))fail('household checklist tick must route before the owner-only gate');
if(!read('v2/sw.js').includes("CORE_ASSIGNMENT_URL='./core-assignment-v3.3c.js?v=718s01'"))fail('core-assignment marker not bumped');}
// Reviewer follow-ups: Budget entry inserts follow the update rule; auto-complete intent survives restarts; checklist rows keyboard-reachable.
{const m49=read('supabase/migrations/049_budget_entry_insert_hardening.sql'),assign=read('v2/core-assignment-v3.3c.js'),app3=read('v2/app-v3.2.0.js'),html=read('v2/index.html');
for(const x of ['create policy planly_budget_entries_insert_authorized','for insert to authenticated','planly_budget_entries.owner_id = (select auth.uid())','s.deleted_at is null',"(s.scope_type = 'personal' and s.owner_id = (select auth.uid()))","(s.scope_type = 'household' and s.household_id is not null and planly_private.is_household_member(s.household_id))"])if(!m49.includes(x))fail('049 budget entry insert invariant missing: '+x);
if(/delete\s+from|disable row level security|grant[^;]*to anon|security definer/i.test(m49))fail('049 must only replace the insert policy');
for(const x of ["function clearPlanlyHouseholdAutoCompleteFlag(ownerId,clientId)","if(op.autoComplete)planlyHouseholdAutoCompleteIntent.add(key);","stagePlanlyHouseholdSubtask(t,s.id,s.done,autoComplete);","...(autoComplete?{autoComplete:true}:{})"])if(!assign.includes(x))fail('household auto-complete restart invariant missing: '+x.slice(0,70));
if((app3.match(/data-action="expand-checklist" role="button" tabindex="0"/g)||[]).length!==2)fail('checklist task rows must be keyboard-focusable in both densities');
if(!app3.includes(`if(!body?.matches?.('.taskBody[role="button"][data-action]'))return;`))fail('checklist row Enter/Space handler missing');
if(html.includes('planlyChecklistIn'))fail('unused planlyChecklistIn keyframes returned');}
// Bottom tab bar is docked to the screen edge (safe-area aware), opaque, and is the last nav rule in the page.
{const html=read('v2/index.html'),i=html.indexOf('<style id="planlyDockedNav">');if(i<0)fail('docked bottom nav style missing');else{const css=html.slice(i,html.indexOf('</style>',i));
for(const x of ['bottom:0!important','border-radius:0!important','calc(6px + env(safe-area-inset-bottom))','background:var(--bg)!important','#addBtn{bottom:calc(var(--planly-nav-h) + 12px + 16px + env(safe-area-inset-bottom))!important}'])if(!css.includes(x))fail('docked nav invariant missing: '+x);
if(!css.includes('html{scroll-padding-bottom:'))fail('focused content must scroll clear of the docked nav');if(!read('v2/app-v3.2.0.js').includes(`document.querySelector('[data-inline-checklist="'+CSS.escape(String(t.id))+'"]')?.scrollIntoView({block:'nearest'`))fail('opened checklist must scroll clear of the docked nav');
if(/\.nav\{[^}]*bottom:calc\(/.test(html.slice(i+css.length)))fail('a later rule floats the bottom nav again');}}
// Impeccable stage A: sheets above the tab bar, + hidden while a sheet is open, one selected date chip, no decorative glow/gradient.
{const html=read('v2/index.html'),app=read('v2/app-v3.2.0.js'),i=html.indexOf('<style id="planlyRefineA">');if(i<0)fail('refine stage A styles missing');else{const css=html.slice(i,html.indexOf('</style>',i));
for(const x of ['#sheetWrap{z-index:70!important}','body:has(#sheetWrap.open','.dashboardActions .primaryDash{background:var(--today)!important;background-image:none!important','.dashboardHero:after{display:none!important}'])if(!css.includes(x))fail('stage A invariant missing: '+x);}
for(const x of ['let planlyQuickDatePick','pick=hits.find(c=>c.dataset.q===planlyQuickDatePick)||hits[0]','planlyQuickDatePick=q;'])if(!app.includes(x))fail('single selected date chip invariant missing: '+x);}
// Impeccable stage B: grouped task rows, no side stripes, no decorative eyebrow labels on Today.
{const html=read('v2/index.html'),app=read('v2/app-v3.2.0.js'),i=html.indexOf('<style id="planlyRefineB">');if(i<0)fail('refine stage B styles missing');else{const css=html.slice(i,html.indexOf('</style>',i));
for(const x of ['#view .task .taskSurface,#view .task .swipeUnderlay{border:0!important;border-radius:0!important;box-shadow:none!important}','#view .task:has(+.task) .taskSurface{box-shadow:inset 0 -1px 0','.projectCard:before{display:none!important}'])if(!css.includes(x))fail('stage B invariant missing: '+x);}
for(const l of ['Time blocked','Flexible','Needs attention','Priorities'])if(app.includes('calendarGroupLabel">'+l+'<'))fail('decorative eyebrow label returned: '+l);
if(app.includes('<span class="dashboardLabel">Today</span>'))fail('decorative Today eyebrow returned');}
// Impeccable stage C: Today shows tasks first; Top 3, deadlines and the capacity check sit below the lists; compact summary.
{const app=read('v2/app-v3.2.0.js');if(!app.includes("$('#view').innerHTML=`${planlyPushPromptHtml()}${dashboard}${todayCardOn('suggestions')?planlySuggestLineHtml():''}${statusCard}${billsDue}${schedule}${anytimeSection}${overdueSection}${household}${top3}${todayDeadlinesHtml()}${completedSection(completed,'today:'+key)}`"))fail('Today order must put tasks before Top 3 and deadlines, with the Suggestions line under the summary');
for(const x of ['function todayDeadlinesHtml(){','class="dashboardHero dashboardCompact"','class="dashboardSummaryLine"','role="progressbar"'])if(!app.includes(x))fail('compact Today summary invariant missing: '+x);
if(!read('v2/index.html').includes('<style id="planlyRefineC">'))fail('refine stage C styles missing');}
// Impeccable stage D: one design vocabulary (header, primary/secondary/quiet buttons, selected state, overlays), recorded in DESIGN.md.
{const html=read('v2/index.html'),i=html.indexOf('<style id="planlyRefineD">');if(i<0)fail('refine stage D styles missing');else{const css=html.slice(i,html.indexOf('</style>',i));
for(const x of ['#searchToggle,#profileToggle{width:40px!important;height:40px!important','#taskForm .formActions .primary,.budgetBtn.budgetPrimary{background:var(--sec)!important','.planSegments button.active,.budgetScopeBar button.active,.taskChoiceSegments button.active,#quickDates .chip.active{background:var(--secTint)!important;color:var(--sec)!important','.sheet,.taskActionSheet{border:0!important}'])if(!css.includes(x))fail('stage D invariant missing: '+x);
if(/linear-gradient|radial-gradient/.test(css))fail('stage D must not add gradients');}
for(const f of ['DESIGN.md','PRODUCT.md'])if(!read(f).length)fail(f+' missing');}
// Impeccable stage E: Home and Budget follow DESIGN.md; unnamed people fall back to "You" / "Partner".
{const html=read('v2/index.html'),app=read('v2/app-v3.2.0.js'),r1=read('v2/core-redesign-r1.js'),i=html.indexOf('<style id="planlyRefineE">');if(i<0)fail('refine stage E styles missing');else{const css=html.slice(i,html.indexOf('</style>',i));
for(const x of ['.homeRows>.homeListCard,.homeRows>.homeProjectCard{background:transparent!important;border:0!important','#view .homeChoreGroup .task.homeChore,#view .homeChoreGroup .task.homeChore .taskSurface{border:0!important;border-radius:0!important','.budgetHero,.budgetCard{background:var(--card)!important;background-image:none!important','.budgetIcon.budgetEmoji{background:color-mix(in srgb,var(--cat,#64748B) 22%,transparent)!important'])if(!css.includes(x))fail('stage E invariant missing: '+x);
if(/linear-gradient|radial-gradient/.test(css))fail('stage E must not add gradients');}
if(!app.includes("if(id&&id===me)return 'You';return 'Partner'}"))fail('unnamed partner must fall back to "Partner"');
if(/'Household member'/.test(r1))fail('core-redesign-r1 must label an unnamed member "Partner", not "Household member"');
if(!read('PRODUCT.md').includes('"Partner"'))fail('PRODUCT.md must record the naming rule');}
for(const dead of ["'<div class=\"budgetEmpty\">Create an income category first.</div>'","'<div class=\"budgetEmpty\">Create a category first.</div>'"])if(ui.includes(dead.replace(/\\"/g,'"')))fail('Budget dead-end empty state returned: '+dead);}
if(app.includes('else await cloudUpdateTask(conflict.localData,true,server.serverVersion);'))fail('Keep my version must reconcile Google, not only write the cloud row');}
if(!r1Html.includes("for(const t of ['gesturestart','gesturechange','gestureend'])document.addEventListener(t,e=>e.preventDefault(),{passive:false});"))fail('iOS pinch gestures must be cancelled');
for(const m of r1Html.matchAll(/([^{}]*\b(?:input|select|textarea)\b[^{}]*)\{[^}]*?font-size:\s*(\d+(?:\.\d+)?)px/g))if(+m[2]<16)fail('form field font-size under 16px causes iOS focus zoom: '+m[1].trim().slice(-80)+' '+m[2]+'px');

const r2Html=read('v2/index.html'),r2App=read('v2/app-v3.2.0.js');
for(const x of ['grid-template-columns:minmax(0,1fr) auto auto','searchIcon{grid-column:3;width:44px!important;height:44px!important}','grid-template-columns:44px minmax(0,1fr) auto!important','min-width:44px!important;height:44px!important','id="pi-star"','id="pi-more"','id="pi-repeat"','id="pi-clock"'])if(!r2Html.includes(x))fail('R2 presentation invariant missing: '+x);
for(const x of ['href="#pi-star"','href="#pi-more"','href="#pi-repeat"','href="#pi-clock"','aria-pressed='])if(!r2App.includes(x))fail('R2 task-row invariant missing: '+x);

const r2Assign=read('v2/core-assignment-v3.3c.js');
if(r2Assign.includes('taskAssigneePill')||r2Assign.includes('taskCompletionActorPill'))fail('R4 duplicate household assignment/completion renderer returned');
for(const x of ["Anyone can complete","Assigned to ","Done by "])if(!r2App.includes(x))fail('R4 authoritative household assignment/completion label missing: '+x);
for(const x of ['id="pi-grip"','id="pi-checklist"','id="pi-check"','min-height:44px!important}.taskBody>.chip[data-action="today"]','--r2Personal:#2F4FD0','--r2Health:#BE2F55','--r2Home:#1B7A4C'])if(!r2Html.includes(x))fail('R2 review presentation invariant missing: '+x);
for(const x of ['href="#pi-grip"','href="#pi-checklist"','href="#pi-check"'])if(!r2App.includes(x))fail('R2 review task glyph invariant missing: '+x);

const r3BudgetUi=read('v2/core-budget-ui-v4.0b.js'),r3BudgetScope=read('v2/core-budget-scope-v4.0c.js'),r3BudgetMonthState=read('v2/core-budget-month-state-v4.0f.js'),r3BudgetCore=read('v2/core-budget-v4.0b.js'),r3BudgetHtml=read('v2/index.html');
for(const needle of ['Left to plan','Coming up','Categories','Money in','Paid','To pay','Unplanned','data-budget-paid','PlanlyBudgetActions.mutate'])if(!r3BudgetUi.includes(needle))fail('R3 Budget presentation invariant missing: '+needle);
for(const needle of ['id="catKind"','value="income"','data-manage-category','Income categories',"kind:host.querySelector('#catKind').value"])if(!r3BudgetUi.includes(needle))fail('R3 Budget category management invariant missing: '+needle);
for(const needle of ['toPay.map(x=>paymentRow(x,true))','paid.map(x=>paymentRow(x,true))','up.map(x=>paymentRow(x))'])if(!r3BudgetUi.includes(needle))fail('R3 Budget row action placement invariant missing: '+needle);if(r3BudgetUi.includes('up.map(paymentRow)'))fail('R3 Coming up Array.map callback-index leakage returned');
for(const needle of ['function localDateKey','start=localDateKey(now)','end=localDateKey(new Date(now.getFullYear(),now.getMonth(),now.getDate()+7))'])if(!r3BudgetUi.includes(needle))fail('R3 Coming up local-date invariant missing: '+needle);
for(const needle of ['data-budget-category-edit',"PlanlyBudgetActions.mutate('category',id,{name,icon_key:icon})",'--budgetToPay,#A15C07'])if(!r3BudgetUi.includes(needle))fail('R3/C1 Budget review follow-up missing: '+needle);
if(r3BudgetScope.includes("shared&&!a.canAdmin?.()"))fail('Household member category management is hidden');
for(const needle of ["function structureOwner(){return state.scope?.scope_type==='household'?state.scope.owner_id:owner}","owner_id:structureOwner()"])if(!s.budget.includes(needle))fail('Household category structure-owner invariant missing: '+needle);
if(!r3BudgetHtml.includes(':root:not([data-theme="dark"]) .priorityHigh,:root:not([data-theme="dark"]) .overdueSection .calendarGroupLabel{color:#B52D51!important}'))fail('R3 dark priority contrast scope missing');
if(r3BudgetHtml.includes('.priorityHigh,.overdueSection .calendarGroupLabel{color:#B52D51!important}'))fail('R3 unscoped priority rose returned');
if([r3BudgetMonthState,r3BudgetUi].some(x=>x.includes('Monthly snapshot')))fail('R3 legacy Monthly snapshot decorator returned');
if(r3BudgetCore.includes('function patchCategory'))fail('R3 legacy category DOM replacement returned');
for(const needle of ['for="planlyCalendarName"','for="planlyCalendarUrl"','for="defaultCat"','for="planningStart"','for="planningEnd"','for="googleClientId"','for="themeSetting"'])if(!s.app.includes(needle))fail('R3 Settings label invariant missing: '+needle);
for(const needle of ['.monthControls button{width:auto;min-width:44px!important;height:44px!important','.calendarFilters button{min-height:44px!important}','.calendarShiftLabel{font-size:10px!important'])if(!r3BudgetHtml.includes(needle))fail('R3 Month accessibility invariant missing: '+needle);

// R4 member names + Bills on Today release invariants.
for(const needle of ["'+namePanel+planlyHouseholdMemberRowsHtml()","id=\"planlyDisplayName\"","Your name could not be saved. Check your connection and try again.","characters Planly can't show","function planlyBudgetBillsDueHtml()","getTodayBills?.()","mutateTodayEntry(row.id,row.cloud_version"])if(!r2App.includes(needle))fail('R4 app invariant missing: '+needle);
for(const needle of ["name=String(m.display_name||'').trim()","escR1(label)"])if(!r1.includes(needle))fail('R4 Home member-name invariant missing: '+needle);
for(const needle of ["async function refreshTodayBills({force=false}={})","getTodayBills:()=>structuredClone(todayBills)",".eq('show_on_today',true)",".neq('allocation_status','paid')","planly:foreground-resume","planly:household-remote-change"])if(!s.budget.includes(needle))fail('R4 fresh Today bills invariant missing: '+needle);
for(const needle of ["async function mutateTodayEntry(id,expectedVersion,patch)","eq('cloud_version',version)"])if(!read('v2/core-budget-actions-v4.0l.js').includes(needle))fail('R4 Today mutation invariant missing: '+needle);
for(const needle of ["id=\"allocShowToday\"","id=\"editPaymentShowToday\"","entryDate:due?"])if(!r3BudgetUi.includes(needle))fail('R4 Budget form invariant missing: '+needle);

for(const needle of ['homeCardMain','homeScopeTag household',"?'household':'personal'"])if(!r1.includes(needle))fail('R4 Home list/project meta invariant missing: '+needle);
for(const needle of ['.homeCardMain{display:grid;gap:3px;min-width:0}', '.homeCardMain strong{display:block;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}', '.homeScopeTag.household{background:var(--homeTint);color:var(--home)}'])if(!r1Html.includes(needle))fail('R4 Home list/project layout invariant missing: '+needle);

// C1 cleanup invariants.
for(const needle of ["todayBillsRefreshedAt","now()-todayBillsRefreshedAt<2000","sb.auth.refreshSession()","acceptTodayBillMutation(server)","bootstrap()).then(()=>refreshTodayBills({force:true}))","state[bucket]=state[bucket].filter(x=>x.id!==id)","localDateKey(new Date()).slice(0,7)"])if(!s.budget.includes(needle))fail('C1 Budget invariant missing: '+needle);
for(const needle of ["const api=()=>window.PlanlyBudget,localMonth=()=>","function editCategory(id)","data-budget-category-edit","if(!api().getState()?.scope)await api().bootstrap()"])if(!s.budgetUi.includes(needle))fail('C1 Budget UI invariant missing: '+needle);
if(s.budgetUi.includes("prompt('Rename category'")||s.budgetUi.includes("prompt('Icon:"))fail('C1 category prompt regression');
if(s.app.includes('Assigned to You'))fail('C1 assignment capitalisation regression');
for(const needle of ['#planlyDisplayName{min-height:44px!important;height:44px!important}', '.inboxCount{color:#704400!important}', '.monthControls .monthToday{color:#115766!important}'])if(!r1Html.includes(needle))fail('C1 contrast/tap invariant missing: '+needle);

for(const needle of ["function failedMessage(op)","You do not have permission to save this Budget change.","One of the Budget values is not valid.","Your sign-in could not be refreshed. Sign in again and retry."])if(!s.budgetUi.includes(needle))fail('C1 failure-copy invariant missing: '+needle);

// #78 F1-F4 follow-up invariants.
for(const needle of ["planly:household-remote-change',()=>void refreshTodayBills()","planly:budget-mutation-confirmed',()=>void refreshTodayBills()","then(()=>window.dispatchEvent(new CustomEvent('planly:budget-sync-state-changed')))"])if(!s.budget.includes(needle))fail('F1/F2 Budget refresh invariant missing: '+needle);
if(s.budget.includes("planly:household-remote-change',()=>void refreshTodayBills({force:true})")||s.budget.includes("planly:budget-mutation-confirmed',()=>void refreshTodayBills({force:true})"))fail('F1 startup Today-bills forced refresh returned');
if(!s.budgetUi.includes("planly:budget-sync-state-changed',()=>queueMicrotask(refreshVisible)"))fail('F2 successful Retry visible refresh missing');
for(const needle of ["function planlyHouseholdSentencePersonLabel","return label==='You'?'you':label","Assigned to '+planlyHouseholdSentencePersonLabel","Done by '+planlyHouseholdSentencePersonLabel",'aria-label="Calendar colour"'])if(!s.app.includes(needle))fail('F3/F4 app invariant missing: '+needle);
for(const needle of [':root:not([data-theme="dark"]) .day.isToday:not(.selected)>span{background:#238AA6!important;color:#041419!important}','.calendarColourControl input[type="color"][data-planly-calendar-colour]{width:44px!important;height:44px!important;min-width:44px!important;min-height:44px!important}'])if(!r1Html.includes(needle))fail('F4 Month/calendar accessibility invariant missing: '+needle);

for(const needle of ['id="taskHouseholdControls"','id="taskVisibilitySegments"','data-task-visibility="household"'])if(!r1Html.includes(needle))fail('H2A task sharing invariant missing: '+needle);
for(const needle of ["data-task-assignee","syncTaskChoiceButtons","refreshAssignmentField"])if(!s.hardening.includes(needle))fail('H2A assignment invariant missing: '+needle);
for(const needle of ["taskRowDensity:'compact'","state.taskRowDensity!=='comfortable'","class=\"task taskSwipe compactTask","id=\"taskRowDensity\""])if(!s.app.includes(needle))fail('H2B compact-row invariant missing: '+needle);
for(const needle of ["This week’s chores","No chores this week. Add one to share the load.","data-add-chore","homeChoresHtml"])if(!r1.includes(needle))fail('H2C chores invariant missing: '+needle);
if(!r1Html.includes('.day.isToday.selected>span{background:#17687D!important;color:#fff!important}'))fail('H2 F4b selected-today contrast invariant missing');

if(s.hardening.includes('state.tasks'))fail('H2 hardening must not read app-closure state');
for(const needle of ["top3Mode&&!t.completed?'<button type=\"button\" class=\"top3DragHandle\"","class=\"compactProjectLink\"","href=\"#pi-checklist\""])if(!s.app.includes(needle))fail('H2 compact review invariant missing: '+needle);
if(!s.app.includes("detail:{taskId:task?.id||'',readOnly,assigneeId:"))fail('H2 task-sheet bridge invariant missing');

{const compactStart=s.app.indexOf("if(state.taskRowDensity!=='comfortable'){"),compactEnd=s.app.indexOf("\n  const surface=",compactStart),compactBranch=s.app.slice(compactStart,compactEnd);if(!compactBranch.includes("top3Mode&&!t.completed?'<button type=\"button\" class=\"top3DragHandle\""))fail('H2 compact renderer must include Top-3 drag handle in its own branch');}


// Planly Intelligence I1 release invariants.
for(const needle of ["window.PlanlyIntelligence","function analyse(input={})","visibility!=='household'","isWorkDay=busyMinutes>=360","projects:projectSignals,household:"])if(!s.intelligence.includes(needle))fail('Intelligence I1 engine invariant missing: '+needle);
if(/Date\s*\.|new\s+Date|Date\.now|Math\.random|fetch\s*\(|\.from\s*\(|document\.|localStorage/.test(s.intelligence))fail('Intelligence engine purity regression');
for(const needle of ['window.PlanlyIntelligence.analyse(','id="intelligenceSuggestions"','id="intelligenceNightRest"'])if(!s.app.includes(needle))fail('Intelligence I1 composed UI invariant missing: '+needle);
if(s.app.includes('.map(taskHtml)'))fail('Task renderer Array.map callback-index leakage returned');
if(!read('v2/index.html').includes('id="pi-spark"'))fail('Intelligence spark sprite missing');
if(!read('v2/index.html').includes("RUNTIME_URL='./app-v3.2.0.js?v=721t02'"))fail('Intelligence app runtime boot marker mismatch');
const mods=manifest.modules||[];if(mods[mods.length-1]!=='./core-intelligence-v5.js?v=704i01')fail('Intelligence must be final runtime module');
await import('./validate-intelligence-v5.mjs');


if(!s.intelligence.includes('Not done yet today'))fail('Left-today engine reason missing');
if(!s.assignment.includes('window.PlanlyCompleteHouseholdTask=planlyCompleteHouseholdTaskDirect'))fail('Direct B2 household completion API missing');
for(const file of manifest.modules.map(x=>x.replace(/^\.\//,'').replace(/\?.*$/,'')).filter(Boolean)){const src=read('v2/'+file);if(src.includes('.map(taskHtml)'))fail('Composed module callback-index leakage: '+file)}

if(/async function planlyCompleteHouseholdTaskDirect\(t\)\{[\s\S]{0,300}await planlyCompleteHouseholdTaskDirect\(t\)/.test(s.assignment))fail('Direct B2 completion recurses');
if(!s.assignment.includes("stagePlanlyHouseholdCompletion(t,next,nextDate)"))fail('Direct B2 completion must stage household RPC');

for(const needle of ['Next: ','deferCount','intelligenceWhySheet'])if(!s.app.includes(needle))fail('I2 runtime invariant missing: '+needle);
if(!s.app.includes("t._planlyOwnedByMe!==false)).forEach((t,i)=>{t.top3Order=i})"))fail('normalizeTop3Orders must be owner-only');
if(fs.existsSync('v2/app.js'))fail('Legacy v2/app.js must remain deleted');
if(!s.app.includes("planlyBusyIntervals(key).map(x=>({start:x.start,end:x.end}))"))fail('Today intelligence must reuse loaded calendar state');
if(!s.app.includes("const api=window.PlanlyBudget,rows=(api?.getTodayBills?.()||[])"))fail('Today bills must reuse loaded Budget state');


for(const needle of ["const VERSION='5.0.0-i5'","factors:x.factors","score:x.score"])if(!s.intelligence.includes(needle))fail('I2 weighted explanation invariant missing: '+needle);
if(s.app.includes("rec.day.status==='over'?-20:12")||s.app.includes("['Work day',-8")||s.app.includes("['Night rest',-10"))fail('I2 Why contains invented weights');


for(const needle of ["const VERSION='5.0.0-i5'","projectSignals.push","nextStepId"])if(!s.intelligence.includes(needle))fail('I3 engine invariant missing: '+needle);for(const needle of ["function planProjectBlock(p)","projectStatusHtml(p)","plan-block"])if(!generated.includes(needle))fail('I3 runtime invariant missing: '+needle);

for(const needle of ["calendarClashes=new Set","taskClashes=new Set","<span>Clashes</span>"])if(!s.app.includes(needle))fail('I3 Timeline clash consistency invariant missing: '+needle);

{const a=s.app.indexOf('function planProjectBlock('),b=s.app.indexOf('\nfunction projectById',a),block=s.app.slice(a,b);if(!block.includes("t.visibility==='household'"))fail('I3 Plan a Block household boundary missing');if(!block.includes('stageChangedTasksFromSnapshot(before)')||!block.includes("showUndoToast('Planned "))fail('I3 Plan a Block cloud/Undo path missing');}
if(!s.intelligence.includes("owned(t)&&t.visibility!=='household'&&!t.completed&&String(t.projectId||'')"))fail('I3 project actions must rank personal owner-safe tasks only');

const i3r1=read('v2/core-redesign-r1.js'),i3projects=read('v2/core-projects-v3.3c.js');
if(!i3r1.includes("typeof projectStatusHtml==='function'?projectStatusHtml(p,projectAnalysis)"))fail('I4 R1 composed project status must reuse cached analysis');if(!i3projects.includes("typeof projectStatusHtml==='function'?projectStatusHtml(p)"))fail('I3 3.3C composed project status missing')
for(const needle of ['projectIntelligence(p.id)','Next step','data-project-action="plan-block"',"typeof planProjectBlock==='function'"])if(!i3projects.includes(needle))fail('I3 composed project detail/action missing: '+needle);
for(const needle of ["function firstPlanningGap(","todayTime||firstPlanningGap(tomorrow,t,0)"])if(!s.app.includes(needle))fail('I3 review #99 planning invariant missing: '+needle);
for(const needle of ["activeAll=all.filter(t=>!t.completed)","status='done'","status='not-scheduled'",'weekCandidates'])if(!s.intelligence.includes(needle))fail('I3 review #99 engine invariant missing: '+needle);
if(!read('v2/index.html').includes('.projectIntelStatus{font-size:11px'))fail('I3 review #99 mobile type floor missing');

// I3 #100 composed project-detail execution guard: execute the final override in a minimal runtime harness.
{const source=s.projects,start=source.indexOf('function renderProjectsPanel()'),end=source.indexOf('\nfunction openProjects',start);if(start<0||end<0)fail('I3 project detail override not found');const fn=source.slice(start,end);const nodes={projectsContent:{innerHTML:'',hidden:false},projectsTitle:{textContent:'',hidden:false},projectsEyebrow:{textContent:'',hidden:false},projectsBack:{hidden:false}};const dollar=sel=>nodes[sel.slice(1)]||null,state0={projects:[{id:'p1',name:'Project',dueDate:'',notes:'',visibility:'private',archived:false}],tasks:[{id:'t1',projectId:'p1',title:'Task',completed:false,visibility:'private',_planlyOwnedByMe:true}]};const args=[dollar,state0,'detail','p1','','',null,id=>state0.projects.find(p=>p.id===id),()=>({done:0,total:1,pct:0,active:state0.tasks,completed:[]}),()=>true,()=>'',()=>({status:'on-track',reasons:['Active work is scheduled'],nextStepId:'t1',nextStepReasons:['High priority']}),()=>'<span>On track</span>',x=>x,t=>'<div>'+t.title+'</div>',x=>String(x),x=>String(x),()=> '2026-10-01',(k,n,inner)=>n?'<details class="doneFold">'+inner+'</details>':''];try{const run=new Function('$','state','projectPanelMode','activeProjectId','editingProjectId','activeProjectOwnerId','planlyHousehold','projectById','projectStats','planlyProjectOwnedByMe','planlyProjectShareLabel','projectIntelligence','projectStatusHtml','sortTasks','taskHtml','esc','fmt','localKey','planlyDoneFold',fn+';renderProjectsPanel();');run(...args)}catch(err){fail('I3 composed project detail runtime error: '+err.message)}if(!nodes.projectsContent.innerHTML.includes('Next step')||!nodes.projectsContent.innerHTML.includes('Plan a block')||!nodes.projectsContent.innerHTML.includes('Add task')||!nodes.projectsContent.innerHTML.includes('Edit project'))fail('I3 composed project detail did not render expected actions')}

// I4 chore-balance and deferred I3 review invariants.
for(const needle of ['intelligenceChoreBalance:false','id="intelligenceChoreBalance"','function householdChoreIntelligence()',"return showToast('Already planned at '+t.time)"])if(!s.app.includes(needle))fail('I4 app invariant missing: '+needle);
for(const needle of ['function homeChoreBalanceHtml','function openShareOut()','data-share-out','data-share-accept','t._planlyOwnedByMe===false',"t.visibility!=='household'"])if(!r1.includes(needle))fail('I4 Home/share-out invariant missing: '+needle);
if(!r1.includes('projectStatusHtml(p,projectAnalysis)'))fail('I4 project list must reuse one Intelligence analysis per render');
for(const needle of ['completedDate','weekCounts','ownerUnassigned','shareOut','longShifts'])if(!s.intelligence.includes(needle))fail('I4 engine invariant missing: '+needle);

if(!s.app.includes("assignee_id:visibility==='household'?(t.assigneeId||t.assignee_id||null):null"))fail('I4 authoritative assignee column must travel through optimistic taskCloudRow');

// I5 final Intelligence invariants.
for(const needle of ["PLANLY_INTELLIGENCE_HISTORY_KEY","intelligenceLearning","learnedPlanningDuration","recurringLearningCandidate",'<option value="11">11 hours</option>','<option value="12">12 hours</option>'])if(!s.app.includes(needle))fail('I5 app invariant missing: '+needle);
if(!s.intelligence.includes("Number(loads[ordered[0].id]||0)===Number(loads[ordered[1].id]||0)"))fail('I5 Share out must leave equal-load ties as Anyone');

for(const needle of ["learning:intelligenceLearningInput()","function dismissRecurringLearning(t)","data-repeat-no"])if(!s.app.includes(needle))fail('I5 review fix missing: '+needle);

// Stage 4 correctness invariants.
for(const needle of ['finiteDuration','fixedDuration','t.time?fixedDuration(t,defaultDuration):duration(t,defaultDuration,learning)',"top3=targetPersonal.slice(0,(isWorkDay||overnightRest)?2:3)"])if(!s.intelligence.includes(needle))fail('Stage4 Intelligence correctness invariant missing: '+needle);
if(!s.assignment.includes("if(!!fresh.completed===!!payload.completed){clearPlanlyPendingWrite('householdCompletion',op.id);await reconcilePlanlyCloud({render:false,replay:false})"))fail('Stage4 household completion same-state conflict must reconcile authoritatively');

// Stage 4 four-tab/Profile/person-colour invariants.
const indexHtml=read('v2/index.html'),navMarkup=(indexHtml.match(/<nav class="nav"[\s\S]*?<\/nav>/)||[''])[0];if((navMarkup.match(/<button data-tab=/g)||[]).length!==5)fail('Primary nav must contain exactly five buttons (Today, Plan, Home, Budget, Fitness)');for(const t of ['today','upcoming','home','budget','fitness'])if(!navMarkup.includes(`<button data-tab="${t}"`))fail('Primary nav tab missing: '+t);
for(const needle of ['id="profileToggle"','id="profileWrap"','planlyStage4Profile'])if(!indexHtml.includes(needle))fail('Stage4 Profile surface missing: '+needle);for(const needle of ['function settingsHubHtml()','data-settings-page=','function openSettingsPage(page,focusName=false)',"function openProfile(){closeProfile();openSettingsPage('')}",'planlyRenderProfileButton();'])if(!s.app.includes(needle))fail('Stage4 Profile / Settings hub missing: '+needle);
for(const needle of ['function openProfile()','function openSettingsFromProfile(focusHousehold=false)',"$('#profileToggle').onclick=openProfile"])if(!s.app.includes(needle))fail('Stage4 Profile runtime missing: '+needle);
if(navMarkup.includes('<button data-tab="settings"'))fail('Stage4 Settings must not remain a primary nav tab');


for(const needle of ['function planlyTaskConflictIsCompletionOnly(localData,serverData)','async function adoptCompletedCloudTaskConflict(op,record)','if(await adoptCompletedCloudTaskConflict(op,err.planlyConflictRecord)){replayed++;continue}','showToast(\'Already done by \'+planlyHouseholdSentencePersonLabel(row.completed_by))'])if(!s.app.includes(needle))fail('Stage4 owner completion convergence missing: '+needle);
if(s.app.includes('function planlyPersonColour(userId)'))fail('Stage4 Part 1 must not ship premature person-colour model');

// Stage 4 Part 1 (#111): header stays one row with 44px profile/search; Suggest 3 and compact project links keep usable sizes.
{const html=read('v2/index.html');for(const needle of ['.topbar{grid-template-columns:minmax(0,1fr) auto auto auto!important}','.topbar .searchIcon{grid-column:3!important;grid-row:1!important}','.topbar .profileIcon{grid-column:4!important;grid-row:1!important;width:44px!important;height:44px!important','.compactTaskMeta>.compactProjectLink{flex:0 1 auto;min-width:min(22vw,72px)}'])if(!html.includes(needle))fail('Stage 4 Part 1 layout invariant missing: '+needle);}

// Stage 4 Part 1 review #113: one Top 3 rule (2 on work / protected-rest days, else 3) for the summary, Today counter and manual star.
for(const needle of ['function planlyTop3LimitFor(rec){return (rec?.day?.isWorkDay||rec?.day?.overnightRest)?2:3}','function planlyTop3LimitForDate(key)','planlyTop3LimitForDate(t.date)','.length>=top3Limit){','${pins.length}/${planlyTop3LimitFor(intel)}'])if(!generated.includes(needle))fail('Stage4 Top 3 limit surface missing: '+needle);
for(const bad of ["<strong>'+pins.length+'/3</strong>",'${pins.length}/3<','x.pinned&&!x.completed).length>=3)'])if(generated.includes(bad))fail('Stage4 hard-coded Top 3 limit remains: '+bad);
// Stage 4 Part 2 (#106 P1, #108 F1-F3/F6): meta line, Upcoming headings, status strip, Month today/shift colours, Home name prompt, slim day check, project "No tasks yet".
{const html=read('v2/index.html');for(const needle of ['<style id="planlyStage4Part2">','.compactTaskMeta .pIcon{display:inline-block!important','.upcomingDateGroup{display:block!important','.planlyStatusShield{position:fixed;left:0;right:0;top:0;height:env(safe-area-inset-top,0px);background:var(--bg);z-index:95','<div id="planlyStatusShield" class="planlyStatusShield" aria-hidden="true"></div>','.calendarShiftLabel.shiftNight','.homeBalanceCount{display:flex!important;flex-direction:column!important','.planProjectCard .planProjectHead>.projectIntelStatus{flex:0 0 auto;display:inline-block'])if(!html.includes(needle))fail('Stage 4 Part 2 layout invariant missing: '+needle);
for(const needle of ['function planlyShiftClass(label)','class="compactRepeat"',"x.status==='empty'?'No tasks yet'"])if(!s.app.includes(needle))fail('Stage 4 Part 2 app invariant missing: '+needle);
for(const needle of ['homeNamePrompt','planly-name-prompt-dismissed-v1','inChoreWeek','function r1ProjectMeta(p)'])if(!s.redesignR1.includes(needle))fail('Stage 4 Part 2 Home/Projects invariant missing: '+needle);
if(!s.calendar.includes('planlyShiftClass(sourceLabel)'))fail('Stage 4 Part 2 shift colour hook missing');
if(!s.intelligence.includes("status='empty';reasons=['No tasks yet']"))fail('Stage 4 Part 2 engine empty-project status missing');}
if((s.app.match(/isWorkDay\|\|[a-zA-Z?.]*overnightRest/g)||[]).length!==1)fail('Stage4: the 2/3 Top 3 rule must live only in planlyTop3LimitFor');

// Stage 4 Part 2 iPhone follow-up: meta line wraps whole items; a hidden day check can be shown again.
{const html=read('v2/index.html');for(const needle of ['<style id="planlyStage4Part2Fixes">','.compactTaskMeta{flex-wrap:wrap;','.compactTaskMeta>span[aria-hidden]{display:none}'])if(!html.includes(needle))fail('Stage 4 Part 2 follow-up layout invariant missing: '+needle);}
{const html=read('v2/index.html');for(const needle of ['.nav{grid-template-columns:repeat(5,minmax(0,1fr))!important}'])if(!html.includes(needle))fail('Stage 4 Part 2 follow-up layout invariant missing: '+needle);
for(const needle of ["const PLANLY_TODAY_CARDS=[['summary'","function todayCardOn(key)","todayHidden:planlyTodayHiddenList()","data-today-card=","todayCardOn('summary')","todayCardOn('deadlines')","todayCardOn('top3')","todayCardOn('bills')","todayCardOn('household')",'class="todayQuickActions dashboardActions"><button id="timelineBtn"'])if(!s.app.includes(needle))fail('Show on Today invariant missing: '+needle);}

// Stage 4 Part 3a: grouped Profile & Settings hub, clear tab icons, version shown in About matches the cache.
{const html=read('v2/index.html');for(const needle of ['<style id="planlyStage4Part3a">','.settingsPaged [data-sp]{display:none}','.settingsPaged[data-page="household"] [data-sp~="household"]','.profileIcon .profileInitial','<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.2','<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 9.5h17'])if(!html.includes(needle))fail('Stage 4 Part 3a surface missing: '+needle);
const rel=(s.app.match(/const PLANLY_RELEASE='([^']+)'/)||[])[1],cache=(s.sw.match(/const CACHE='([^']+)'/)||[])[1];if(!rel||rel!==cache)fail('About version must match the service-worker cache: '+rel+' vs '+cache);
const pages=['appearance','planning','intelligence','calendars','household','account','data'];for(const pg of pages){if(!s.app.includes("['"+pg+"',"))fail('Settings page missing: '+pg);if(!html.includes('.settingsPaged[data-page="'+pg+'"] [data-sp~="'+pg+'"]'))fail('Settings page CSS missing: '+pg);if(!new RegExp('data-sp="[^"]*\\b'+pg+'\\b').test(s.app))fail('No settings card assigned to page: '+pg)}
for(const id of ['planlyDisplayName','defaultCat','defaultDuration','planningStart','planningEnd','intelligenceSuggestions','intelligenceChoreBalance','intelligenceNightRest','autoCalendarTimed','themeSetting','taskRowDensity','exportBtn','importBtn','clearBtn'])if(!s.app.includes('id="'+id+'"'))fail('Settings control removed: '+id);}

// Type: self-hosted Outfit (OFL), four static faces whose weight ranges collapse old weights; sentence-case labels; cached for offline.
{const html=read('v2/index.html');for(const [w,r] of [[400,'1 449'],[500,'450 549'],[600,'550 790'],[700,'791 1000']]){if(!html.includes("url('./fonts/outfit-"+w+".woff2') format('woff2');font-weight:"+r))fail('Outfit face missing: '+w);if(!fs.existsSync('v2/fonts/outfit-'+w+'.woff2'))fail('Outfit file missing: '+w);if(!s.sw.includes("'./fonts/outfit-"+w+".woff2'"))fail('Outfit not cached by SW: '+w)}
if(!fs.existsSync('v2/fonts/OFL.txt')||!read('v2/fonts/OFL.txt').includes('SIL OPEN FONT LICENSE Version 1.1'))fail('Outfit licence missing');
for(const needle of ['<style id="planlyType">',"html,body,button,input,select,textarea{font-family:'Outfit',",'.calendarGroupLabel,.householdEyebrow{text-transform:none!important','.nav button[data-section="today"] .pIcon{color:var(--today)}','.nav button[data-section="budget"] .pIcon{color:var(--budget)}'])if(!html.includes(needle))fail('Type invariant missing: '+needle);
if(html.lastIndexOf('<style id="planlyType">')<html.lastIndexOf('<style id="planlyStage4Part3a">'))fail('Type styles must load last');}

// Part 3b person colours: relative tones from one helper, applied to rows, chips, Home, Month dots and assign buttons; text always present.
{const html=read('v2/index.html');for(const needle of ['<style id="planlyPersonColours">','--personSelf:#2F6FEB','--personPartner:#D9534F','--personAnyone:#1b7a4c','.task.personEdge .taskSurface{box-shadow:inset 3px 0 0 var(--tone)}','.calendarDot.personDot{background:var(--tone)!important}'])if(!html.includes(needle))fail('Person colour CSS missing: '+needle);
for(const needle of ["function planlyPersonTone(userId){const id=String(userId||''),me=String(planlySession?.user?.id||'');return !id?'anyone':id===me?'self':'partner'}",'function planlyTaskTone(t)',"personEdge tone-'+planlyTaskTone(t)","personChip tone-'+planlyPersonTone(assigneeId)","personChip tone-'+planlyPersonTone(completedBy)",'householdPersonPill personChip tone-'])if(!s.app.includes(needle))fail('Person colour runtime missing: '+needle);
if(!s.redesignR1.includes("personChip tone-'+planlyPersonTone(actor)"))fail('Home chore Done by colour missing');
if(!s.redesignR1.includes('personAvatarTone tone-')||!s.redesignR1.includes('personGroupHead tone-'))fail('Home person colours missing');
if(!s.calendar.includes("calendarDot personDot tone-"))fail('Month person dots missing');
if(!s.hardening.includes('personDot tone-'))fail('Assign buttons person dot missing');}

// Part 4: "Completed (n)" folds everywhere, open/closed remembered per section on the device; signed-out welcome screen.
{const html=read('v2/index.html');for(const needle of ['<style id="planlyStage4Part4">','.doneFold>summary{','.planlyWelcome{position:fixed;inset:0;z-index:300'])if(!html.includes(needle))fail('Part 4 CSS missing: '+needle);
for(const needle of ["const PLANLY_DONE_OPEN_KEY='planly-completed-open-v1'","function planlyDoneSectionKey(key){return String(key||'').split(':')[0]||'tasks'}",'<summary class="doneFoldToggle"><span>Completed (\'+count+\')</span>','window.planlyDoneFold=planlyDoneFold',"localStorage.setItem(PLANLY_DONE_OPEN_KEY,JSON.stringify(completedOpen))","return planlyDoneFold(key,tasks.length,","planlyDoneFold('upcoming',done.length,"])if(!s.app.includes(needle))fail('Completed fold runtime missing: '+needle);
if(!s.projects.includes("planlyDoneFold('project',stats.completed.length,"))fail('Project detail completed fold missing');
if(!s.lists.includes("window.planlyDoneFold('lists',done.length,"))fail('Lists completed fold missing');
if(!s.redesignR1.includes("planlyDoneFold('home',doneRows.length,"))fail('Home shared tasks completed fold missing');
if(!s.calendar.includes("completedSection(completed,'month:"))fail('Month completed fold missing');
for(const needle of ['function planlyWelcomeSync()','id="planlyWelcomeEmail">','<span>Continue with email</span></button>','<span>Sign in with Google</span></button>','data-provider-slot="google"','<form class="welcomeEmailForm" id="planlyWelcomeForm" autocomplete="on" hidden novalidate>','autocomplete="username"','planlySignUp({email,password}):planlySignIn({email,password})',"planlyAuthChecked=true;adoptPlanlySession(data?.session||null)","if(!planlyAuthChecked||planlySession?.user||!planlySupabase)return false"])if(!s.app.includes(needle))fail('Welcome runtime missing: '+needle);
for(const banned of ['planlyWelcomeLater','Use without an account','planly-welcome-dismissed-v1','Not now'])if(s.app.includes(banned))fail('Welcome must be sign-in only (no guest option): '+banned);
if(!/planlyWelcomeSync\(\);(planlyRecoverySync\(\);)?\n  return \{previousOwner,nextOwner,ownerChanged,explicitSignOut\}/.test(s.app))fail('Welcome must sync on every session change');
if((s.app.match(/PLANLY_WELCOME_SLIDES=\[/g)||[]).length!==1||(s.app.match(/\['(today|home|plan)','[^']+','[^']+','<div class="wfx/g)||[]).length!==3)fail('Welcome must have exactly 3 slides');
if(/planlySupabase\.(from|rpc|auth\.(signIn|signUp))[^;]*/.test(s.app.slice(s.app.indexOf('function planlyWelcomeHtml'),s.app.indexOf('function adoptPlanlySession'))))fail('Welcome must not make network calls');}
// Part 4: Google sign-in on the welcome screen is gated by PLANLY_GOOGLE_SIGNIN (an explicit true/false in supabase-config.js; on since 1 Oct 2026).
{if(!/^window\.PLANLY_GOOGLE_SIGNIN=(true|false);$/m.test(read('v2/supabase-config.js')))fail('Google sign-in flag must be an explicit boolean in supabase-config.js');
for(const needle of ['function planlyGoogleSignInEnabled(){return window.PLANLY_GOOGLE_SIGNIN===true}',"signInWithOAuth({provider:'google',options:{redirectTo:'https://kovacs-x.github.io/planly/v2/'","(planlyGoogleSignInEnabled()?'<button type=\"button\" class=\"wfxBtn wfxGoogle\" id=\"planlyWelcomeGoogle\""])if(!s.app.includes(needle))fail('Google welcome sign-in missing: '+needle);}
// Settings redesign: coloured icon squares on hub rows/tiles/Log out, gradient profile card, iOS switches.
{const html=read('v2/index.html');for(const needle of ['<style id="planlySettingsDesign">','.settingsPaged input[type="checkbox"]{-webkit-appearance:none;appearance:none;','.settingsHubRow>.setIcon,.settingsHubTile>.setIcon,.settingsHubSignOut>.setIcon{flex:0 0 32px!important'])if(!html.includes(needle))fail('Settings design CSS missing: '+needle);
if(html.lastIndexOf('<style id="planlySettingsDesign">')<html.lastIndexOf('<style id="planlyStage4Part4">'))fail('Settings design styles must load after Part 4');
for(const needle of ["function planlySettingsIcon(id){",'data-settings-page="\'+x[0]+\'">\'+planlySettingsIcon(x[0])+\'<span><strong>',"planlySettingsIcon('household')+'<small>Household</small>","planlySettingsIcon('intelligence')+'<small>Suggestions</small>","planlySettingsIcon('logout')+'<span>Log out</span></button>","(planlyGoogleSignInEnabled()?'<button id=\"planlyAccountGoogleBtn\""])if(!s.app.includes(needle))fail('Settings design runtime missing: '+needle);
for(const id of ['appearance','planning','intelligence','calendars','household','account','data'])if(!html.includes('.set-'+id+'{background:'))fail('Settings icon colour missing: '+id);}
// The composed sign-in is the core-assignment override: it must accept the welcome form's credentials and return the session.
{if(!s.assignment.includes("async function planlySignIn(creds){")||!s.assignment.includes("const email=creds?String(creds.email||'').trim():$('#planlyAuthEmail')?.value.trim()")||!/showToast\('Signed in to Planly'\);\n  render\(\);\n  return data\.session;\n\};?/.test(s.assignment))fail('Composed sign-in must accept welcome credentials');}
// Settings switches: the row holding a switch is a >=44px tap target.
{const html=read('v2/index.html');if(!html.includes('.settingsPaged label:has(>input[type="checkbox"]){min-height:48px;align-items:center}')||!html.includes('width:51px;height:31px;margin:7px 0;'))fail('Settings switch rows must be >=44px tap targets');}
// Settings identity card: name and email are opaque white (>=5.17:1 on every gradient stop; 88% white was 4.37:1 on #2563EB).
{const html=read('v2/index.html');if(!html.includes('.settingsHubIdentity small{font-size:14px;color:#fff}')||!html.includes('.settingsHubIdentity strong{font-size:20px;font-weight:700;letter-spacing:-.02em;color:#fff}'))fail('Settings identity text must be opaque white');}
// Tab switching: every tab switch starts at the top (no inherited scroll); re-tapping the current tab scrolls smoothly to the top; Plan segment changes reset too.
{for(const needle of ["function planlyScrollTop(smooth){","document.addEventListener('click',e=>{const b=e.target.closest?.('.nav button[data-section]');if(!b)return;const same=b.dataset.section===sectionForTab(state.tab);requestAnimationFrame(()=>planlyScrollTop(same))},true);","render();if(segmentChanged)planlyScrollTop(false)}"])if(!s.redesignR1.includes(needle))fail('Tab scroll reset missing: '+needle);
if(s.redesignR1.lastIndexOf('function planlyScrollTop(')>s.redesignR1.lastIndexOf('})();'))fail('Tab scroll reset must live inside the R1 scope');}
// Polish: no pop-ups for successful syncs or completing / reopening a task; completed rows carry Undo; the profile initial is a true circle.
{const q=s.app.slice(s.app.indexOf('function queueCloudWrite('),s.app.indexOf('function queueCloudWrite(')+700);if(/if\(success\)showToast\(success\)/.test(q))fail('Successful syncs must not show a pop-up');
if(s.app.includes("showToast('Saved and synced to Google Calendar')"))fail('Google save success must not show a pop-up');
for(const needle of ["const PLANLY_SILENT_UNDO=/^(Task completed|Task reopened|Checklist finished)/;","if(PLANLY_SILENT_UNDO.test(String(message||''))){try{finalize?.()}catch{}return}","class=\"undoDoneBtn\" data-action=\"toggle\""])if(!s.app.includes(needle))fail('Silent completion / Undo missing: '+needle);
if((s.app.match(/class=\\?"undoDoneBtn\\?"/g)||[]).length<2)fail('Undo button must be on both compact and comfortable rows');
if(!/showToast\(offline\?'Offline · changes remain queued'/.test(s.app))fail('Sync failure pop-ups must remain');
const html=read('v2/index.html');for(const needle of ['<style id="planlyPolish">','#profileToggle.profileIcon:has(.profileInitial){padding:0!important;','#profileToggle.profileIcon .profileInitial{width:40px!important;height:40px!important;','.undoDoneBtn{min-height:44px;','.compactTask.done .check,.compactTask.done .taskBody,.compactTask.done .taskActions>:not(.undoDoneBtn){opacity:.72}'])if(!html.includes(needle))fail('Polish CSS missing: '+needle);}
// Budget: amber (stands apart from Home green); opens instantly from loaded data, refreshing stale data (>60s) in the background.
{const html=read('v2/index.html');if(!html.includes('<style id="planlyBudgetAmber">')||!html.includes(':root{--budget:#B45309;--budgetTint:#FFF3DC}')||!html.includes(':root[data-theme="dark"]{--budget:#FBBF24;--budgetTint:#3A2A10}'))fail('Budget amber tokens missing');
const sc=read('v2/core-budget-scope-v4.0c.js');for(const needle of ['const BUDGET_FRESH_MS=60000;','if(bootstrap){if(!a.getState?.()?.scope){await a.bootstrap();budgetLoadedAt=Date.now()}else budgetBackgroundRefresh(a)}',"new CustomEvent('planly:budget-invalidated',{detail:{reason:'background-refresh'}})"])if(!sc.includes(needle))fail('Budget instant open missing: '+needle);}
// Stage 4a (D10): a partner's calendar never counts as the user's busy time; whose-calendar choice; neutral wording.
{for(const needle of ["show_timeline,enabled,status,last_synced_at,represents","function planlySourceRepresents(sourceId){return planlyCalendarSource(sourceId)?.represents==='partner'?'partner':'self'}","function planlyBusyIntervals(key){return externalTimelineIntervals(key).filter(x=>planlySourceRepresents(x.event?.source_id)!=='partner')}","allowed.represents=patch.represents==='partner'?'partner':'self'","data-planly-calendar-represents=","function planlyCalendarTwin(s)","function planlyScheduleTitle(events)"])if(!s.app.includes(needle))fail('Stage 4a missing: '+needle);
// every busy input to Intelligence / planning uses the D10-filtered intervals
if(/busy:externalTimelineIntervals\(/.test(s.app)||/busy=\[\.\.\.externalTimelineIntervals\(/.test(s.app)||/clash=\[\.\.\.externalTimelineIntervals\(/.test(s.app))fail('D10: busy time must come from planlyBusyIntervals');
if((s.app.match(/busy:planlyBusyIntervals\(/g)||[]).length<3)fail('D10: Intelligence busy inputs must be filtered');
for(const banned of ['Wife’s schedule','Wife — NHS rota',"['wife','Wife']",'>Rota items<','Rota / all day'])if(s.app.includes(banned))fail('Neutral wording: remove '+banned);
if(!read('supabase/migrations/045_calendar_source_represents.sql').includes("check (represents in ('self', 'partner'))"))fail('Migration 045 missing');}
// Stage 4b: account management and password recovery. Sign out is this device by default; "all devices" is explicit.
{for(const needle of ["const PLANLY_AUTH_LINK=(()=>{","sessionStorage.setItem(PLANLY_RECOVERY_KEY,'1')","async function planlySignOut({everywhere=false}={}){if(!initPlanlySupabase())return;await planlySupabase.auth.signOut({scope:everywhere?'global':'local'});","function planlySignInMethods(u)","await planlySupabase.auth.updateUser({password})","await planlySupabase.auth.updateUser({email},{emailRedirectTo:PLANLY_APP_URL})","await planlySupabase.auth.resetPasswordForEmail(email,{redirectTo:PLANLY_APP_URL})","const PLANLY_APP_URL='https://kovacs-x.github.io/planly/v2/';",'id="planlySignOutAllBtn"','id="planlyChangePasswordForm"','id="planlyChangeEmailForm"','id="planlyWelcomeForgot">Forgot password?</button>',"function planlyRecoverySync()","planlyWelcomeSync();planlyRecoverySync();"])if(!s.app.includes(needle))fail('Stage 4b missing: '+needle);
if(/auth\.signOut\(\)/.test(s.app))fail('Sign out must pass an explicit scope');
if(!read('v2/index.html').includes('<style id="planlyStage4b">'))fail('Stage 4b CSS missing');}
// Stage 5: weekly chore rotation (client rule mirrors SQL 046; the owner's own completion assigns the next occurrence by rotation).
{for(const needle of ["function planlyRotationAssignee(t,dateKey)","return ((weeks%2)+2)%2===0?String(r.a):String(r.b)","if(!ids.has(String(r.a))||!ids.has(String(r.b)))return null;","assigneeId:planlyRotationAssignee(t,nextDate)||t.assigneeId,","function planlyRotationEligible(t){return !!t&&t.visibility==='household'&&t._planlyOwnedByMe!==false","data-task-menu=\"rotate\"","if(action==='rotate'){planlyToggleRotation(t);","t.rotation={enabled:true,a,b,anchorWeek:startMonday(t.date)}"])if(!s.app.includes(needle))fail('Stage 5 missing: '+needle);
if(!s.redesignR1.includes("t.rotation?.enabled?' · <span class=\"choreSwap\">⇄ Swaps weekly</span>'"))fail('Home chore swap label missing');
const m=read('supabase/migrations/046_household_chore_rotation.sql');for(const needle of ['create or replace function planly_private.household_rotation_assignee(','revoke all on function planly_private.household_rotation_assignee(uuid,jsonb,date,uuid) from public, anon, authenticated;',"v_next_assignee := planly_private.household_rotation_assignee(v_task.household_id, v_task.data->'rotation', p_next_date, v_task.assignee_id);",'      v_next_assignee, null, null'])if(!m.includes(needle))fail('Migration 046 missing: '+needle);}
{const app=read('v2/app-v3.2.0.js'),hard=read('v2/hardening-v3.3b.js');
if(!/function planlyRotationEligible\(t\)\{[^\n]*&&!!t\.assigneeId&&!!planlyRotationOther\(t\.assigneeId\)\}/.test(app))fail('Stage 5: Rotate must require an assigned partner (Anyone stays Anyone)');
if(!app.includes("function planlyRotationNormalize(t)")||!/function stageTaskMutation\(t\)\{[^\n]*planlyRotationNormalize\(t\);/.test(app))fail('Stage 5: every staged task write must normalise rotation');
if(!/function planlyRotationNormalize\(t\)\{[^\n]*who===String\(r\.a\)\|\|who===String\(r\.b\)[^\n]*t\.rotation=\{enabled:false\}/.test(app))fail('Stage 5: assignment changes must switch rotation off when the assignee leaves the pair');}
// Stage 5 (reviewer N4): the privileged rotation helper must never become client-callable.
{const fs=await import('node:fs');const dir='supabase/migrations',all=fs.readdirSync(dir).filter(f=>f.endsWith('.sql')).sort().map(f=>fs.readFileSync(dir+'/'+f,'utf8')).join('\n'),m046=fs.readFileSync(dir+'/046_household_chore_rotation.sql','utf8');
if(!/revoke all on function planly_private\.household_rotation_assignee\(uuid,jsonb,date,uuid\) from public, anon, authenticated;/.test(m046))fail('N4: rotation helper must revoke execute from public, anon, authenticated');
if(/grant[^;]*household_rotation_assignee/i.test(all))fail('N4: rotation helper must never be granted to any role');
if(!/household_rotation_assignee[\s\S]*?security definer[\s\S]*?set search_path/i.test(m046))fail('N4: rotation helper must be security definer with a pinned search_path');}

// Budget: (1) replay drains mutations staged while a replay is in flight (lost wake-up, from PR #209);
// (2) deleting a repeating payment/income stops the series (recurring_monthly off on earlier sources) so it is never re-offered.
{const core=read('v2/core-budget-v4.0b.js'),actions=read('v2/core-budget-actions-v4.0l.js'),ui=read('v2/core-budget-ui-v4.0b.js'),life=read('v2/core-budget-lifecycle-v4.0d.js');
for(const needle of ["replayRequested=false","function replay(){replayRequested=true;if(replayPromise)return replayPromise","while(replayRequested){replayRequested=false;await replayNow()}","if(replayRequested)void replay().catch(console.warn)","replayPromise=null;replayRequested=false;cancelReplayTimer();"])if(!core.includes(needle))fail('Budget replay drain invariant missing: '+needle);
for(const needle of ['function repeatingSources(row)','async function deleteEntryFlow(row)',"await mutate('entry',src.id,{recurring_monthly:false})",'window.PlanlyBudgetActions={mutate,deleteEntryFlow,'])if(!actions.includes(needle))fail('Budget repeating-delete invariant missing: '+needle);
if(!ui.includes('await window.PlanlyBudgetActions.deleteEntryFlow(row)')||ui.includes("window.PlanlyBudgetActions.mutate('entry',row.id,{}, {remove:true})"))fail('Payment Delete must use deleteEntryFlow');
if(!life.includes('await window.PlanlyBudgetActions.deleteEntryFlow(entry)'))fail('Income Delete must use deleteEntryFlow');}

// Household Budget reset: owner-only server function (auth.uid + role='owner' of the scope's household; anon revoked),
// UI shown only to the owner, typed RESET confirmation, reload after reset.
{const mig=read('supabase/migrations/047_household_budget_reset.sql');for(const needle of ['create or replace function public.planly_reset_household_budget(','security definer','v_user uuid := auth.uid();',"and m.role = 'owner'","raise exception 'Not authorized'",'revoke all on function public.planly_reset_household_budget(uuid, boolean) from public, anon;','grant execute on function public.planly_reset_household_budget(uuid, boolean) to authenticated;','set deleted_at = v_now'])if(!mig.includes(needle))fail('Household Budget reset migration invariant missing: '+needle);
if(/delete\s+from/i.test(mig))fail('Household Budget reset must soft-delete, never hard delete');
for(const needle of ['function planlyIsHouseholdOwner()',"function planlyBudgetResetCardHtml(){if(!planlyIsHouseholdOwner())return '';","planlySupabase.rpc('planly_reset_household_budget',{p_scope_id:scope.id,p_include_categories:!!includeCategories})","go.disabled=input.value.trim().toUpperCase()!=='RESET'",'await budget?.bootstrap?.()',"getPending?.().some(x=>x.status==='queued')"])if(!s.app.includes(needle))fail('Household Budget reset UI invariant missing: '+needle);
if(!read('v2/index.html').includes('<style id="planlyBudgetReset">'))fail('Household Budget reset styles missing');}
{const app=read('v2/app-v3.2.0.js'),asg=read('v2/core-assignment-v3.3c.js'),bui=read('v2/core-budget-ui-v4.0b.js'),html=read('v2/index.html');
for(const needle of ['function planlyHaptic(){if(state.haptics===false)return;','navigator.vibrate(10)',"input.setAttribute('switch','')",'window.planlyHaptic=planlyHaptic;','haptics:state.haptics!==false','state.haptics=d.haptics!==false','id="hapticsSetting"',"$('#hapticsSetting').checked=state.haptics!==false","state.haptics=e.target.checked;save()","if(!t||t.completed)return;\n  planlyHaptic();","if(subtask.done)planlyHaptic();",'mutateTodayEntry)return;planlyHaptic();'])if(!app.includes(needle))fail('Haptics missing: '+needle);
if(/state\.haptics[^;]*stagePreferenceMutation/.test(app))fail('Haptics setting must stay device-local');
for(const needle of ['if(s.done)window.planlyHaptic?.();','if(next)window.planlyHaptic?.();'])if(!asg.includes(needle))fail('Household haptics missing: '+needle);
if(!bui.includes("if(next==='paid')window.planlyHaptic?.();"))fail('Budget paid haptic missing');
if(!html.includes('.budgetEmojiTab{min-width:36px;min-height:44px;'))fail('Emoji picker tabs must be 44px tall');}
{const html=read('v2/index.html'),sw=read('v2/sw.js');
if(!html.includes('<link rel="apple-touch-icon" sizes="180x180" href="../icon-180.png" />'))fail('Home Screen icon must use the 180px icon');
if(!sw.includes("'../icon-180.png','../icon-192.png','../icon-512.png'"))fail('Service worker must cache all app icons');
for(const f of ['icon-180.png','icon-192.png','icon-512.png','icon-source.svg'])if(!fs.existsSync(f))fail('Missing icon file '+f);}
{const app=read('v2/app-v3.2.0.js'),sw=read('v2/sw.js'),html=read('v2/index.html'),mig=read('supabase/migrations/050_push_notifications.sql'),fn=read('supabase/functions/planly-push/index.ts'),wp=read('supabase/functions/planly-push/webpush.js');
for(const needle of ["['notifications','Notifications','Reminders, morning summary, chores']","const PLANLY_PUSH_PUBLIC_KEY='B","planlySupabase.rpc('planly_save_push_subscription',{p_endpoint:j.endpoint,p_p256dh:","planlySupabase.rpc('planly_revoke_push_subscription'","planlySupabase.rpc('planly_queue_test_push')","const ask=Notification.requestPermission();","userVisibleOnly:true",'id="planlyPushPanel"'])if(!app.includes(needle))fail('Notifications client missing: '+needle);
if(/p_user_id|p_owner_id/.test(app.slice(app.indexOf('// ---- Push notifications'),app.indexOf('function openSettingsPage('))))fail('Push client must never send an owner/user id');
if(!sw.includes("self.addEventListener('push'")||!sw.includes('showNotification(')||!sw.includes("self.addEventListener('notificationclick'"))fail('Service worker push handlers missing');
if(!html.includes('.settingsPaged[data-page="notifications"] [data-sp~="notifications"]'))fail('Notifications settings page CSS missing');
for(const needle of ['v_user uuid := auth.uid();','security definer','planly_private.push_subscriptions','push_endpoint_service','grant execute on function public.planly_push_worklist(timestamptz) to service_role;','revoke all on function public.planly_push_config() from public, anon, authenticated;',"v_quiet := v_local::time >= time '22:00' or v_local::time < time '07:00';","t.visibility is distinct from 'household'","exception when others then\n  -- A notification problem must never block saving a task.\n  return new;","cron.schedule('planly-push', '*/5 * * * *'","vault.decrypted_secrets"])if(!mig.includes(needle))fail('Migration 050 missing: '+needle);
if(/grant execute on function public\.planly_push_(worklist|config|report)[^;]*to (authenticated|anon)/.test(mig))fail('Worker functions must be service_role only');
if(/calendar_source|ical/i.test(mig.replace(/--.*$/gm,'')))fail('Push must never read calendar sources');
if(!fn.includes("req.headers.get('x-planly-cron')")||!fn.includes("rpc('planly_push_worklist')")||!fn.includes('sameSecret('))fail('planly-push function must check the cron secret');
if(!wp.includes("'Content-Encoding': 'aes128gcm'")||!wp.includes("'WebPush: info\\0'"))fail('Web Push encryption must be RFC 8291 aes128gcm');
for(const f of [app,sw,html,mig,fn,wp])if(/"d"\s*:\s*"[A-Za-z0-9_-]{40,}"/.test(f))fail('A private key must never be committed');}
{const app=read('v2/app-v3.2.0.js'),html=read('v2/index.html');
for(const needle of ["$('#view').innerHTML=`${planlyPushPromptHtml()}${dashboard}","Notification.permission!=='default')return ''","if(p.optedOut||(p.snoozedUntil&&Date.now()<Number(p.snoozedUntil)))return ''","planlyPushPromptSave({snoozedUntil:Date.now()+14*86400000})","planlyPushPromptSave({optedOut:true})","if(b.dataset.pushPrompt==='on'){planlyPushEnable();return}"])if(!app.includes(needle))fail('Notification prompt missing: '+needle);
if(!html.includes('<style id="planlyPushPromptStyle">'))fail('Notification prompt styles missing');}
{const r1=read('v2/core-redesign-r1.js'),html=read('v2/index.html');
for(const needle of ["const HOME_CHORE_FOLD_KEY='planly-home-chore-fold-v1';","data-chore-fold=","const open=items.filter(t=>!t.completed)","isOpen=fold[key]!==false","doneOpen=fold.done===true","(total?rows+doneRows:"])if(!r1.includes(needle))fail('Home chore folding missing: '+needle);
if(!html.includes('<style id="planlyHomeChoreFold">'))fail('Home chore folding styles missing');}
if(!read('v2/core-redesign-r1.js').includes("(actor&&t.completed?' · <span class=\"personChip tone-'"))fail('"Done by" must only show on finished chores');
{const app=read('v2/app-v3.2.0.js'),r1=read('v2/core-redesign-r1.js'),html=read('v2/index.html'),intel=read('v2/core-intelligence-v5.js');
for(const needle of ['function planlySuggestions(){if(state.intelligenceSuggestions===false','window.PlanlyIntelligence.suggest(planlySuggestInput())',"function planlySuggestInput(){","today,tomorrow:addDays(today,1),weekend:sat,nowMinutes:",'busy:planlyBusyIntervals(today).map(x=>({start:x.start,end:x.end}))','function planlySuggestLineHtml(){','function openSuggestions(){','function applySuggestion(act){',"t._planlyOwnedByMe!==false&&t.visibility!=='household'&&!t.completed",'const pendingIds=stageChangedTasksFromSnapshot(before);save();render();','clearPendingTaskIds(pendingIds);restoreTaskSnapshot(before)',"const PLANLY_SUGGEST_DISMISSED_KEY='planly-suggest-dismissed-v1',","['suggestions','Suggestions','A short line when Planly has suggestions for today.']",'<button id="suggestBtn" type="button" class="primaryDash" data-suggest-open>','data-suggest-open>✨ Suggest</button></div>',"if(e.target.closest('[data-suggest-open]')){openSuggestions();return}"])if(!app.includes(needle))fail('Suggestions missing: '+needle);
for(const gone of ['id="planMyDayBtn"','>Plan my day</button>','data-plan-week>Plan my week','data-i2-suggest3>Suggest 3</button>','data-i2-tidy>Tidy up</button>','${dayCheck}'])if(app.includes(gone))fail('Old Intelligence entry point still reachable: '+gone);
if(r1.includes("planSegmentsHtml()+(planSegment==='upcoming'?weeklyReviewHtml():'')"))fail('Monday review must no longer render');
if(!intel.includes('window.PlanlyIntelligence=Object.freeze({version:VERSION,analyse,suggest,learn,parseQuick,titleKey});'))fail('Suggest engine not exported');
if(!html.includes('<style id="planlySuggestions">'))fail('Suggestions styles missing');}
// Smarter Suggestions: learning runs on this phone from your own private finished tasks; nothing new is sent anywhere.
{const app=read('v2/app-v3.2.0.js'),a=app.indexOf("const PLANLY_SUGGEST_DISMISSED_KEY="),b=app.indexOf('\nfunction openSettingsPage(',a),block=app.slice(a,b);if(a<0||b<0)fail('Suggestions block not found');
if(/fetch\(|planlySupabase|\.from\(|\.rpc\(|XMLHttpRequest|sendBeacon/.test(block))fail('Suggestions/learning must not call the network');
for(const needle of ["function planlyLearningHistory(){const out=[];for(const t of state.tasks){if(!t||!t.completed||t._planlyOwnedByMe===false||t.visibility==='household')continue;","history:planlyLearningHistory(),feedback:planlySuggestFeedback()","PLANLY_SUGGEST_FEEDBACK_KEY='planly-suggest-feedback-v1'","if(act&&applySuggestion(act)!==false)planlyRecordSuggestFeedback(x,'a')","planlyRecordSuggestFeedback(x,'d')","if(act.op==='repeat')return planlyRepeatFromHabit(act);","if(act.op==='move'){if(t.date&&act.date&&act.date>t.date)t.deferCount=Math.max(0,Number(t.deferCount||t.data?.deferCount||0))+1;"])if(!block.includes(needle))fail('Smarter Suggestions invariant missing: '+needle);
const r=block.slice(block.indexOf('function planlyRepeatFromHabit('),block.indexOf('\nfunction applySuggestion('));for(const needle of ["src._planlyOwnedByMe===false||src.visibility==='household'","recurrence:'custom',recurrenceConfig:cfg","const pendingIds=stageChangedTasksFromSnapshot(before);save();render();","clearPendingTaskIds(pendingIds);restoreTaskSnapshot(before)","delete next._planlyCloudVersion"])if(!r.includes(needle))fail('Make it repeat invariant missing: '+needle);
// Learning is continuous: no reset, no start date; recent days simply count more.
if(/resetIntelligenceHistory|intelligenceResetHistory|Start learning again|planly-learn-since|planlyLearnSince/.test(app))fail('Learning must be continuous (no reset / start-again)');
if(!read('v2/core-intelligence-v5.js').includes('const HALF_LIFE=30,recency=age=>Math.pow(0.5,Math.max(0,age)/HALF_LIFE);'))fail('Learning must weight recent days');
// Learning stays in the background: nothing in the app shows what was learned.
if(/planlyLearnedSummary|What Planly has learned/.test(app)||read('v2/index.html').includes('.learnedSummary'))fail('Learned summary must not be shown');}
// Smart quick add: new tasks are read as you type (engine parseQuick, pure); fields you change yourself are never overwritten; nothing leaves the phone.
{const app=read('v2/app-v3.2.0.js'),html=read('v2/index.html'),intel=read('v2/core-intelligence-v5.js'),a=app.indexOf('// Smart quick add:'),b=app.indexOf('function renderSubtaskEditor(',a),block=app.slice(a,b);if(a<0||b<0)fail('Smart quick add block missing');
if(/fetch\(|planlySupabase|\.from\(|\.rpc\(|XMLHttpRequest|sendBeacon/.test(block))fail('Smart quick add must not call the network');
for(const needle of ["function planlyQuickAddActive(){return !$('#taskId')?.value&&!$('#taskForm')?.classList.contains('taskReadOnlySheet')","if(!t.has('date'))","if(!t.has('repeat'))","if(!e.target?.closest?.('#taskForm'))return;","t._planlyOwnedByMe!==false&&t.visibility!=='household'&&api.titleKey(t.title)===key","function planlySetDuration(minutes){"])if(!block.includes(needle))fail('Smart quick add invariant missing: '+needle);
if(!app.includes("  planlyQuickFinal();\n  const id=$('#taskId').value,now=Date.now(),wasExisting=!!id;")||!app.includes('  planlySetDuration(task?.durationMinutes||state.defaultDuration||30);')||!app.includes('  planlyQuickAddReset();\n  refreshQuickDateSelection();'))fail('Smart quick add wiring missing');
{const q=app.slice(app.indexOf('// Smart quick add:'),app.indexOf('function renderSubtaskEditor('));if(/dispatchEvent/.test(q))fail('Quick add must never fire input/change events (they mark fields as changed by the user)')}
if(app.includes("$('#taskDuration').value=String("))fail('Duration must go through planlySetDuration so any length survives editing');
if(!html.includes('<div id="quickUnderstood" class="quickUnderstood" hidden aria-live="polite"></div>')||html.includes('quickFillBtn')||!html.includes('.quickChip{display:inline-flex;align-items:center;gap:6px;min-height:44px;'))fail('Smart quick add markup/styles wrong');
for(const gone of ['parseNaturalTaskInput','smartAddSuggestionHtml','refreshSmartAddSuggestion','data-learning-category'])if(app.includes(gone))fail('Old quick fill still present: '+gone);
if(!intel.includes('window.PlanlyIntelligence=Object.freeze({version:VERSION,analyse,suggest,learn,parseQuick,titleKey});'))fail('parseQuick not exported');
if(/\(\?<[=!]/.test(intel))fail('Engine must not use regex lookbehind (older iPhone Safari cannot parse it)');}
// Reopen paint: every style must be read before the first script that waits on the network (supabase-js from the CDN),
// otherwise iPhone paints a half-styled screen (menu stacked down the left) while that download is pending.
{const html=read('v2/index.html'),firstNet=html.search(/<script[^>]+src="https?:/);if(firstNet<0)fail('external script marker missing');
if(html.indexOf('<style',firstNet)>=0)fail('A <style> block comes after a network script: it would paint half-styled on reopen');
if(html.trimEnd().slice(-7)!=='</html>')fail('Nothing may follow </html>');
if(html.indexOf('<style id="planlyDockedNav">')<0||html.indexOf('<style id="planlyDockedNav">')>html.indexOf('</head>'))fail('Docked nav styles must be in <head>');}
// Instant open: the installed version opens from its saved copy (no network wait); updates come as a new service worker.
{const sw=read('v2/sw.js'),html=read('v2/index.html');
for(const needle of ["async function cachedOrFresh(cache,url){const hit=await cache.match(url);return hit||freshOrCached(cache,url)}","const cache=await caches.open(CACHE),saved=await cache.match('./index.html');if(saved)return saved;","await Promise.all([cachedOrFresh(cache,APP_URL),cachedOrFresh(cache,HARDENING_URL),...CORE_URLS.map(url=>cachedOrFresh(cache,url)),...appendUrls.map(url=>cachedOrFresh(cache,url))]);","response=await cachedOrFresh(cache,RUNTIME_MANIFEST_URL)","if(event.request.url===SUPABASE_JS_URL){"])if(!sw.includes(needle))fail('Instant open invariant missing: '+needle);
const pinned=(sw.match(/const SUPABASE_JS_URL='([^']+)'/)||[])[1];if(!pinned||!html.includes('<script src="'+pinned+'"></script>'))fail('Service worker must cache exactly the supabase-js URL the page loads');
if(!/@\d+\.\d+\.\d+$/.test(pinned))fail('Cached supabase-js URL must be an exact version');}
// Settled first screen: drawn for the account already signed in on this phone (display only), with saved calendar and bills,
// after every module has run; the sign-in is then confirmed in the background and a rejected one ends on the welcome screen.
{const app=read('v2/app-v3.2.0.js'),budget=read('v2/core-budget-v4.0b.js'),a=app.indexOf('function planlyStoredSignedInUser('),stored=app.slice(a,app.indexOf('\n',app.indexOf('function planlyAdoptStoredUser(')));
if(a<0)fail('stored signed-in user missing');
if(!stored.includes("String(u.id)!==String(localStorage.getItem(PLANLY_CLOUD_LAST_ACCOUNT_KEY)||''))return null"))fail('Stored user must match the last account on this phone');
if(/access_token|refresh_token/.test(stored))fail('The early (unconfirmed) session must not carry any token');
if(!stored.includes("planlySession={user,provisional:true};restorePlanlyHouseholdCopy(user.id);restorePlanlyCalendarCache();return true"))fail('Early session must be marked provisional');
{const save=app.slice(app.indexOf('function savePlanlyHouseholdCopy('),app.indexOf('function restorePlanlyHouseholdCopy('));if(!save||/invite/i.test(save.replace('never invites','')))fail('Household copy must hold names and roles only, never invites');if((app.match(/;savePlanlyHouseholdCopy\(userId\);/g)||[]).length!==2)fail('Household copy must be saved whenever the household is confirmed');}
{const hard=read('v2/hardening-v3.3b.js');if(!hard.includes("if(userId&&shared.householdId&&userId===String(localStorage.getItem(LAST_ACCOUNT_KEY)||''))assignmentContext=assignmentContextFromShared(shared,userId)"))fail('Assignment names must start from the household the app already has (same account only)');}
if(!app.includes("onAuthStateChange((_event,session)=>{const previousUser=planlySession?.provisional?'':String(planlySession?.user?.id||''),"))fail('A provisional session must not skip the first confirmed sign-in work');
if(!app.includes("load();applyTheme();if(PLANLY_CLOUD_PREVIEW)planlyAdoptStoredUser();"))fail('Stored user must be adopted before the first render');
if(!app.includes("queueMicrotask(()=>render());"))fail('Render after all modules have run (before first paint) missing');
for(const needle of ["const TODAY_BILLS_COPY='planly-budget-today-bills-v1:';","{const last=String(localStorage.getItem('planly-cloud-last-account-v1')||''),copy=last&&readTodayBillsCopy(last);if(copy)todayBills=copy}","if(!owner||owner!==String(localStorage.getItem('planly-cloud-last-account-v1')||''))todayBills=[];","todayBillsRefreshedAt=now();saveTodayBillsCopy();"])if(!budget.includes(needle))fail('Today bills copy invariant missing: '+needle);}
// Household Budget mirrors the Me budget: no "Household Budget · owner" explainer above it.
{const scope=read('v2/core-budget-scope-v4.0c.js');if(/budgetSharedNote|can see this budget/.test(scope)||read('v2/index.html').includes('.budgetSharedNote'))fail('Household budget explainer must stay removed');
if(read('v2/core-budget-nav-v4.0b1.js').includes('Private finance')||!read('v2/core-budget-nav-v4.0b1.js').includes("setHeader('Budget',window.PlanlyBudget?.getScopeType?.()==='household'?'Household':'Personal');")||!scope.includes("const sub=shared?'Household':'Personal';"))fail('Budget subtitle must say Personal / Household for the tab shown');}
// Completed tick: one green circle with the check centred (the button's own green background drew a second, offset circle).
{const html=read('v2/index.html');if(/\.task\.done \.check[,{][^}]*background:var\(--planlyGreenSoft\)/.test(html))fail('completed tick must not paint a second circle behind it');
 if(!html.includes(".check:before{content:'';position:absolute;left:50%;top:50%;width:24px;height:24px;margin:-12px 0 0 -12px;"))fail('tick circle must be centred absolutely');
 if(!/\.task\.done \.check:after\{content:'';position:absolute;left:50%;top:50%;/.test(html)||html.includes(".check:not(:empty):after"))fail('completed check mark must be drawn centred and keyed on .task.done');}
// iOS 26.5+ only plays a haptic when the finger itself toggles a native switch: tick buttons carry an invisible one.
{const app=read('v2/app-v3.2.0.js'),r1=read('v2/core-redesign-r1.js'),html=read('v2/index.html');
 if(!app.includes(`<input type="checkbox" switch class="planlyTapSwitch" tabindex="-1" aria-hidden="true">`))fail('native tap switch markup missing');
 if((app.match(/readOnly\?'':planlyTapSwitch\(\)|\$\{readOnly\?'':planlyTapSwitch\(\)\}/g)||[]).length!==2)fail('task tick buttons must carry the tap switch (not when read-only)');
 if(!r1.includes("(t._planlyOwnedByMe===false&&!eligible||typeof planlyTapSwitch!=='function'?'':planlyTapSwitch())"))fail('chore tick must carry the tap switch');
 if(!app.includes("<use href=\"#pi-check\"/></svg>'+planlyTapSwitch()+'</button>"))fail('Today bill tick must carry the tap switch');
 if(!/\.planlyTapSwitch\{position:absolute;inset:0;width:100%;height:100%;margin:0;padding:0;opacity:0;clip-path:inset\(0 round 999px\)/.test(html)||/\.planlyTapSwitch\{[^}]*appearance/.test(html))fail('tap switch must cover the button, invisible and unstyled');
 if(!html.includes('html.planlyNoHaptics .planlyTapSwitch{display:none}')||!app.includes("function render(){planlySyncHaptics();")||!app.includes('save();planlySyncHaptics();'))fail('Haptic feedback off must remove the tap switch');
 if(!app.includes("if(Date.now()-planlyNativeTapAt<1000)return;")||!app.includes("e.target?.classList?.contains('planlyTapSwitch'))e.stopPropagation()"))fail('native tap must not double the haptic or leak change events');}
// Google Calendar stays connected: the refresh token lives only server-side (migration 051 + google-calendar-token Edge Function).
{const app=read('v2/app-v3.2.0.js'),mig=read('supabase/migrations/051_google_calendar_tokens.sql'),fn=read('supabase/functions/google-calendar-token/index.ts'),cfg=read('v2/supabase-config.js');
 if(!app.includes("google.accounts.oauth2.initCodeClient({")||!app.includes("ux_mode:'popup'")||!app.includes("planlyGoogleTokenCall('exchange',{code:resp.code})"))fail('signed-in Google connect must use the one-time code flow through the server');
 if(/refresh_?token/i.test(app.replace(/refresh_token:'r'/g,'').split('function googleTokenFresh')[1]?.split('function getDeleteQueue')[0]||'x')||/GOOGLE_CLIENT_SECRET|client_secret/.test(app+cfg))fail('browser code must never hold a Google refresh token or client secret');
 if(!app.includes("function googleLinked(a=getGoogleAuth()){return !!a.linked&&!!planlySession?.user?.id&&a.user===String(planlySession.user.id)}"))fail('a Google link must belong to the signed-in Planly account');
 if(!app.includes("if(ownerChanged||explicitSignOut){resetPlanlyCloudRuntimeState();clearGoogleAuth()}"))fail('signing out or switching account must forget the Google connection on this phone');
 if(!/revoke all on planly_private\.google_calendar_tokens from public, anon, authenticated/.test(mig)||!mig.includes('enable row level security'))fail('Google token table must be closed to browser roles');
 for(const f of ['planly_google_token_save(uuid,text,text)','planly_google_token_get(uuid)','planly_google_token_delete(uuid)']){if(!mig.includes('revoke all on function public.'+f+' from public, anon, authenticated')||!mig.includes('grant execute on function public.'+f+' to service_role'))fail('Google token RPC must be service_role only: '+f);if(new RegExp('grant execute on function public\\.'+f.replace(/[().]/g,'\\$&')+' to (authenticated|anon)').test(mig))fail('Google token RPC granted to browser role: '+f)}
 if(!fn.includes("fetch(SB + '/auth/v1/user', { headers: { apikey: ANON, Authorization: auth } })")||/p_user:\s*body\.|body\.(user|owner)/.test(fn))fail('Edge Function must take the user from the verified session, never the body');
 if(!fn.includes("Deno.env.get('GOOGLE_CLIENT_SECRET')")||/client_secret:\s*'[^']/.test(fn))fail('Google client secret must come from an Edge Function secret');
 if(!fn.includes("'Access-Control-Allow-Origin': 'https://kovacs-x.github.io'")||/refresh_token\s*:\s*String\(r\.data\.refresh_token\)\s*}/.test(fn)||/json\(\{[^}]*refresh/.test(fn))fail('Edge Function must not return the refresh token and must limit CORS');}
// Privacy page linked from Google's consent screen (needed to publish the Google app out of Testing).
{const pp=read('privacy.html');for(const x of ['including the Limited Use requirements','https://developers.google.com/terms/api-services-user-data-policy','calendar.events.owned','does not read, copy or store your other calendar events','Settings › Calendars › Disconnect','https://myaccount.google.com/permissions'])if(!pp.includes(x))fail('privacy page is missing: '+x);
 if(/<script\b/i.test(pp)||/<link[^>]+href="https?:/i.test(pp))fail('privacy page must stay static, with no scripts or external assets');}
// Stage 1 tidy-up: old app versions and the public preview copies (old code wired to the live database) stay deleted.
{for(const d of ['preview','preview-3.2','v2-preview'])if(fs.existsSync(d))fail('retired preview site must stay deleted: '+d);
 const stale=fs.readdirSync('v2').filter(f=>/^app-v(2\.|3\.[01]\.|3\.2\.0-)/.test(f)||/^(assignee-v3\.3b|boot-diagnostic-v3\.3d)\.js$|^diagnostic\.html$|^validation-.*\.md$|^validate-.*\.js$/.test(f));if(stale.length)fail('retired v2 files must stay deleted: '+stale.join(', '));
 if(fs.existsSync('app.js')||fs.existsSync('manifest.webmanifest'))fail('retired root app files must stay deleted');
 const root=read('index.html'),rsw=read('sw.js');if(!root.includes("location.replace('./v2/'+location.search+location.hash)")||!root.includes('url=./v2/')||/<script[^>]+src=/i.test(root))fail('root page must only redirect to ./v2/');
 if(!rsw.includes('self.registration.unregister()')||/addEventListener\('fetch'/.test(rsw)||/planly-v2/.test(rsw))fail('root service worker must only remove itself and old root caches');}
// Tidy-up 2a-i: folded functions are hoisted declarations that run from the first render, so the state they read
// must exist before the app's first render (a module-level `let` would throw "Cannot access … before initialization").
{if(!s.app.includes("let activeProjectOwnerId='';")||/^let activeProjectOwnerId/m.test(s.projects))fail('activeProjectOwnerId must be declared in the app, before the first render');
 for(const f of ['core-closeout-v3.3c.js','core-cloud-readiness-v3.3d.js','core-release-gate-v3.3d.js'])if(fs.existsSync('v2/'+f))fail('folded patch module must stay deleted: '+f);
 const reassigned=['projectById','projectNameForTask','projectTasks','projectStats','projectOptionsHtml','refreshProjectSelect','projectCloudRow','renderProjectsPanel','openProjects','saveProjectEditor','handleProjectsClick','reconcilePlanlyCloud','verifyPlanlyOfflineCache','probePlanlyServiceWorker','planlySignIn','monthView','loadVerifiedCloudPreview'];
 for(const n of reassigned){const decl=(generated.match(new RegExp('(^|[;\\n}])\\s*(async\\s+)?function\\s+'+n+'\\s*\\(','g'))||[]).length,assign=new RegExp('(^|[;\\n{}])\\s*'+n+'\\s*=\\s*(async\\s+)?function').test(generated);if(decl!==1||assign)fail('folded function must be defined exactly once, as a declaration: '+n+' ('+decl+' declarations'+(assign?', reassigned':'')+')')}}
// Tidy-up 2a-ii: wrapper chains are named declarations (…Core → public name). Nothing in the composed app may replace an
// already-declared function at runtime; render's Budget/diagnostic layers are the only exception until stage 2b.
{const declared=new Set([...generated.matchAll(/(?:^|[;\n}])\s*(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g)].map(m=>m[1]));
 const patched=[...generated.matchAll(/(?:^|[;\n{}])\s*([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?function\b/g)].map(m=>m[1]).filter(n=>declared.has(n)&&n!=='render');
 if(patched.length)fail('functions must not be replaced at runtime: '+[...new Set(patched)].join(', '));
 for(const n of ['taskHtmlCore','taskHtmlWithHousehold','taskHtml','projectCardMarkup','projectCardHtml','closeProjectsCore','closeProjects','stageProjectMutationCore','stageProjectMutation','replayPlanlyPendingWritesCore','replayPlanlyPendingWrites','cloudInsertTaskCore','cloudInsertTask','loadPlanlyHouseholdCore','loadPlanlyHousehold']){const c=(generated.match(new RegExp('(^|[;\\n}])\\s*(async\\s+)?function\\s+'+n+'\\s*\\(','g'))||[]).length;if(c!==1)fail('wrapper layer must be declared exactly once: '+n+' ('+c+')')}
 for(const d of ["const planlyHouseholdAutoCompleteIntent=new Set();","let planlyHouseholdSubtaskRun=null;","let __planlyHouseholdLoadFlight=null,__planlyHouseholdLoadOwner='';"])if(!s.app.includes(d)||s.assignment.includes(d))fail('household state must be declared in the app before the first render: '+d);}
// Cleanup: Focus mode and the old Intelligence screens (Plan My Day, Plan my week, Day check, Suggest 3, Tidy up, Why, Monday review) are gone.
{const html=read('v2/index.html'),sw=read('v2/sw.js'),runtime=[s.app,s.hardening,...[...new Set(sw.match(/core-[a-z0-9.-]+\.js/g))].map(f=>read('v2/'+f))].join('\n');
for(const gone of ['openFocus','closeFocus','renderFocus','refreshFocusIfOpen','focusTicker','data-timeline-focus','data-task-menu="focus"','data-dashboard-focus','focusMs','openPlanDay','renderPlanDay','commitPlanDay','dayPlanDraft','openPlanWeek','weeklyReviewHtml','data-plan-week','todayDayCheckHtml','suggestTop3WithUndo','tidyOverdue','showIntelligenceWhy','intelligenceSnoozeDate','data-i2-','recordIntelligenceCompletion','removeIntelligenceCompletionSample'])if(runtime.includes(gone))fail('Removed feature still referenced: '+gone);
for(const gone of ['id="focusWrap"','id="planDayWrap"','.focusWrap','.planDayWrap','.todayDayCheck','.tidyRows','.weeklyReview','#planMyDayBtn'])if(html.includes(gone))fail('Removed feature markup/CSS still present: '+gone);
if(fs.existsSync('v2/core-household-planning-safety-v3.3c.js')||sw.includes('core-household-planning-safety'))fail('Plan My Day safety module must be removed');
if(!s.app.includes('data-dashboard-open="${esc(t.id)}"')||!s.app.includes("if(dashboardOpen){const t=state.tasks.find(x=>String(x.id)===String(dashboardOpen.dataset.dashboardOpen));if(t)openTaskActions(t);return}"))fail('Today Next card must open the task menu');
if(!html.includes('body:has(#sheetWrap.open,#searchWrap.open,#timelineWrap.open,#taskActionWrap.open,#profileWrap.open) #addBtn{opacity:0!important'))fail('Add button must stay hidden while sheets are open');
if(!html.includes('.planDayFooter{display:grid'))fail('Repeat prompt footer styles must remain');}
// Tidy-up 2b-i: the Budget insights, review-hardening and core-guard patch modules are folded into core-budget/month-state.
{for(const f of ['core-budget-insights-v4.0g.js','core-budget-review-hardening-v4.0p.js','core-budget-core-guard-v4.0q.js'])if(fs.existsSync('v2/'+f)||s.sw.includes(f)||read('v2/runtime-modules.json').includes(f))fail('folded Budget module must stay deleted: '+f);
 if(/BUDGET_(INSIGHTS|REVIEW|CORE_GUARD)_URL/.test(s.sw))fail('service worker still lists a folded Budget module');}
// Theme is Light or Dark only. New devices start in Light; an old 'System' choice becomes what the phone shows, and is saved.
{const html=read('v2/index.html');for(const m of ["tab:'today',theme:'light',","function planlyThemeChoice(t){return t==='dark'?'dark':t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}","state.theme=planlyThemeChoice(savedTheme||state.theme);","if(savedTheme==='system')persistPlanlyDeviceSettings();","state.theme=planlyThemeChoice(d.theme);","const device={theme:planlyThemeChoice(s.theme),","function applyTheme(){document.documentElement.dataset.theme=state.theme==='dark'?'dark':'light'}"])if(!s.app.includes(m))fail('theme must be Light or Dark, defaulting to Light: '+m);
 if(/<option value="system">/.test(s.app))fail('Settings must not offer a System theme');
 if(!html.includes("let theme=saved?.theme||'light';")||!html.includes("catch{document.documentElement.dataset.theme='light'}"))fail('boot theme must default to Light');
 if(/theme\|\|'system'|theme:'system'/.test(s.app+html))fail('System must not be the default theme');}
// The assigned person is saved with the task in one write. A second, separate assignment update raced the task save
// and left the phone stuck on a rejected copy showing "Anyone" (7 Oct 2026).
{const save="data.assigneeId=data.visibility==='household'?(assigneeField?String(assigneeField.value||'')||null:(id?(state.tasks.find(x=>x.id===id)?.assigneeId||null):null)):null;";
 if(!s.app.includes("const assigneeField=$('#taskAssignee');")||!s.app.includes(save))fail('task save must carry the assigned person');
 if(/applyPendingAssignment|pendingAssignment|from\('planly_tasks'\)\.update\(\{assignee_id/.test(s.hardening))fail('assignment must not be written separately after the task save');}
// Bottom tabs always work from Projects: tapping one leaves Projects (saving a named new or changed project first)
// instead of leaving the full-screen Projects layer on top of the new tab (11 Oct 2026).
{if(!s.projects.includes("function leaveProjectsForNavigation(){")||!s.projects.includes("document.addEventListener('click',e=>{if(!e.target.closest?.('.nav button[data-section]'))return;if(!leaveProjectsForNavigation()){e.preventDefault();e.stopImmediatePropagation()}},true);"))fail('bottom tabs must leave Projects');
 if(!/function leaveProjectsForNavigation\(\)\{[^\n]*if\(typed\)\{if\(!name\)\{[^}]*return false\}saveProjectEditor\(\);if\(projectPanelMode==='editor'\)return false\}\}closeProjects\(\);return true\}/.test(s.projects))fail('leaving Projects must save typed work, and keep the editor when it has no name or saving is refused');
 if(!s.projects.includes(":!!(name||due||notes||vis==='household');"))fail('choosing Household on a new project must count as typed work');}
// Repeating tasks with no date (weekly chores) come back: the next copy is counted from the day they are completed,
// in the app (own tasks) and in the date sent to set_household_task_completed (migration 052) (11 Oct 2026).
{if(!s.app.includes("function planlyRecurrenceBaseDate(t){return t?.date||localKey(new Date())}")||!s.app.includes("const nextDate=nextOccurrence(planlyRecurrenceBaseDate(t),t.recurrence,cfg);")||/function createNextRecurring\(t\)\{\n\s*if\([^\n]*!t\.date/.test(s.app))fail('undated repeats must create their next copy from the completion day');
 if(!s.assignment.includes("const next=nextOccurrence(planlyRecurrenceBaseDate(t),t.recurrence,cfg);")||s.assignment.includes("if(!t?.date||!t.recurrence"))fail('household completion must send a next date for undated repeats');
 const m52=read('supabase/migrations/052_undated_repeats.sql');
 if(!m52.includes("if p_completed and v_task.recurrence <> 'none' and p_next_date is not null then")||!m52.includes("if p_next_date <= coalesce(v_task.task_date, current_date - 2) then raise exception")||!m52.includes("revoke all on function planly_private.set_household_task_completed(uuid,text,boolean,bigint,date) from public, anon, authenticated;"))fail('migration 052 must allow undated repeats and keep the grants');}
// Morning summary also counts shared tasks for the person (assigned to them or Anyone) and overdue ones (migration 053).
{const m53=read('supabase/migrations/053_morning_summary_shared.sql');
 for(const x of ["(t.visibility = 'household' and (t.assignee_id is null or t.assignee_id = s.user_id)","t.household_id in (select m.household_id from public.planly_household_members m where m.user_id = s.user_id)","if v_count > 0 or v_overdue > 0 then","insert into planly_private.push_sent(subscription_id, kind, ref) values (s.id, 'summary', v_date::text)","revoke all on function public.planly_push_worklist(timestamptz) from public, anon, authenticated;","grant execute on function public.planly_push_worklist(timestamptz) to service_role;"])if(!m53.includes(x))fail('migration 053 morning summary invariant missing: '+x);
 if(/grant execute on function public\.planly_push_worklist\(timestamptz\) to (anon|authenticated)/.test(m53))fail('push worklist must stay service_role only');}
// Fitness › Food (5.1): fifth tab, private to the signed-in person (tables from migrations 054/055).
{const fit=read('v2/core-fitness-v5.1.js'),sw=s.sw,html=read('v2/index.html'),r1=read('v2/core-redesign-r1.js');
 if(!sw.includes("const CORE_FITNESS_URL='./core-fitness-v5.1.js?v=721t02';")||!sw.includes('CORE_BUDGET_NAV_URL,CORE_FITNESS_URL,CORE_REDESIGN_R1_URL];'))fail('Fitness core module must load after Budget nav and before R1');
 if(!html.includes('<button data-tab="fitness" data-section="fitness" aria-label="Fitness">')||!html.includes('<style id="planlyFitness">')||!html.includes('body:has(.nav [data-section="fitness"].active){--sec:var(--fitness);--secTint:var(--fitnessTint)}'))fail('Fitness tab, styles or section colour missing');
 if(!r1.includes("if(tab==='fitness')return'fitness';")||!r1.includes("['settings','home','budget','fitness'].includes(state.tab)?'none':'block'"))fail('R1 must treat Fitness as its own section without the add button');
 for(const x of ["owner_id:userId","sb.from('planly_food_profile').select('*').eq('owner_id',userId)","sb.from('planly_food_entries').select('*').eq('owner_id',userId)","sb.from('planly_food_favourites').select('*').eq('owner_id',userId)",".eq(idCol,op.key).eq('cloud_version',op.base)","e.code='PLANLY_CONFLICT'","STORE+userId","const OFF_FAST='https://search.openfoodfacts.org/search',OFF_SEARCH='https://world.openfoodfacts.org/cgi/search.pl',OFF_PRODUCT='https://world.openfoodfacts.org/api/v2/product/';","try{const found=await fastSearch(q,20,8000);if(found.length)return found}catch(e){fastWhy=whyFailed(e)}","err.detail='Fast search: '+fastWhy+'. Main search: '+whyFailed(e)+'.';","if(!mineCtl.signal.aborted&&q===query.trim())sugNote=","const asks=[ask([...qw.slice(0,-1),qw[qw.length-1]+'*'].join(' '),size)];","asks.push(ask((qw.length>1?qw.slice(0,-1):qw).join(' '),30).then(list=>rankFoods(list,q)));","if(got.every(x=>x.status==='rejected')){const e=got[0].reason;","const qw=words(q).slice(0,8);","const redraw=()=>{if(!frame)frame=requestAnimationFrame(drawList)};","timer=setTimeout(()=>suggest(q),300)","ctl?.abort();ctl=new AbortController();","const suggestOff=(q,signal)=>fastSearch(q,12,6000,signal);","new URLSearchParams({search_terms:q,"])if(!fit.includes(x))fail('Fitness invariant missing: '+x);
 if(/service_role|household_id|\bvisibility\b|\bhousehold\b/.test(fit.replace(/\/\/.*$/gm,'')))fail('Fitness must stay private (no household or service-role access)');
 // Text that comes from people or Open Food Facts (names, brands, serving labels, search words, messages) is always escaped.
 // A bare value of that kind may only go into plain-text toasts, attribute selectors or fixed segment names, never into HTML.
 for(const m of fit.matchAll(/\$\{([^{}]*)\}/g)){const e=m[1].trim(),before=fit.slice(Math.max(0,m.index-40),m.index);if(/^[\w.]*\b(name|brand|servingLabel|query|status|message)$/.test(e)&&!/showToast\(`[^`]*$|querySelector\(`[^`]*$|data-seg="$/.test(before))fail('Fitness renders unescaped text: ${'+e+'}');
  if(/\?\s*[\w.]*\b(name|brand|servingLabel|query|status|message)\s*:|:\s*[\w.]*\b(name|brand|servingLabel|query|status|message)\s*$/.test(e))fail('Fitness renders unescaped text in a condition: ${'+e+'}');}
 if(/fetch\([^)]*openfoodfacts[^)]*\b(userId|owner_id|email)/.test(fit))fail('Only search words may be sent to Open Food Facts');
 // Behaviour: load the module in a sandbox with the app helpers it uses, then check the maths.
 const vm=await import('node:vm');const nav={addEventListener(){}},ctx={window:{},state:{tab:'today'},render(){},localKey:d=>{const x=new Date(d);return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0')},setHeader(){},esc:v=>String(v),$:sel=>sel.includes('fitness')?nav:null,setTimeout(){},document:{addEventListener(){}},navigator:{onLine:false},localStorage:{getItem:()=>null,setItem(){}},crypto:{randomUUID:()=>'u'},structuredClone,URLSearchParams,AbortController,console};ctx.addEventListener=()=>{};ctx.window.addEventListener=()=>{};
 vm.runInNewContext(fit.replace("window.addEventListener('online'","(window.addEventListener||(()=>{}))('online'"),ctx);const F=ctx.window.PlanlyFitness;if(!F)fail('Fitness module did not start');
 const y=new Date().getFullYear(),m=F.suggestTargets({sex:'male',birth_year:y-30,height_cm:180,weight_kg:85,activity:'moderate',goal:'lose',pace_kg_week:0.5});
 // BMR 10*85+6.25*180-5*30+5=1830; x1.55=2836.5; -0.5*7700/7=-550 -> 2286.5 -> 2290
 if(!m||m.kcal_target!==2290||m.protein_g!==170||m.fat_g!==64||m.carbs_g!==259)fail('Fitness target maths wrong: '+JSON.stringify(m));
 const f=F.suggestTargets({sex:'female',birth_year:y-40,height_cm:150,weight_kg:45,activity:'sedentary',goal:'lose',pace_kg_week:1});if(!f||f.kcal_target!==1200)fail('Fitness target must not go below the 1,200 kcal floor: '+JSON.stringify(f));
 if(F.suggestTargets({sex:'',height_cm:180,weight_kg:80}))fail('No suggestion without sex');
 const yog={basis:'100g',per:{kcal:57,protein:10.2,carbs:4,fat:0.2},servingG:150};
 const a=F.nutrientsFor(yog,150,'g'),b=F.nutrientsFor(yog,1,'serving'),c=F.nutrientsFor({basis:'serving',per:{kcal:320,protein:12,carbs:50,fat:8}},2,'serving');
 if(a.kcal!==85.5||a.protein_g!==15.3||JSON.stringify(a)!==JSON.stringify(b)||c.kcal!==640||c.carbs_g!==100)fail('Fitness nutrient scaling wrong');
 const p=F.offProduct({code:'5000436589457',product_name:'Greek Style Yogurt',brands:'Tesco, Other',nutriments:{'energy-kcal_100g':57,proteins_100g:10.2,carbohydrates_100g:4,fat_100g:0.2},serving_quantity:'150',serving_size:'1 pot (150 g)'});
 if(!p||p.brand!=='Tesco'||p.barcode!=='5000436589457'||p.servingG!==150||p.per.kcal!==57)fail('Open Food Facts product parsing wrong');
 const kj=F.offProduct({product_name:'Oats',nutriments:{'energy-kj_100g':1569}});if(!kj||Math.round(kj.per.kcal)!==375||kj.barcode!==null)fail('kJ-only products must convert to kcal');
 if(F.offProduct({product_name:'',nutriments:{'energy-kcal_100g':5}})||F.offProduct({product_name:'X',nutriments:{}}))fail('Products without a name or energy must be skipped');}
// Fitness stage 3: barcode scanner. ZXing is vendored (byte-identical to npm @zxing/library 0.23.0, integrity
// sha512-6fkkoFwP8CHxl6ugnPsj74PLJgX2iRv5zczGAyt5OBzQgxFhuhF0NCEc4t4OvSr8xAv2MRLlI0Iu9ZGDZQ2urA==), loaded only from this site.
{const fit=read('v2/core-fitness-v5.1.js'),sw=s.sw,crypto=await import('node:crypto'),priv=read('privacy.html');
 const z=crypto.createHash('sha256').update(fs.readFileSync('v2/vendor/zxing-library-0.23.0.min.js')).digest('hex');
 if(z!=='3ede94153fb0c5b67a12d7adff6decd827c2b22714fdc6faecf27a8f20937ea6')fail('Vendored ZXing differs from the reviewed npm file: '+z);
 if(!fs.existsSync('v2/vendor/zxing-library-0.23.0.LICENSE.txt'))fail('ZXing Apache-2.0 licence file missing');
 if(!sw.includes("const OPTIONAL=['./','./vendor/zxing-library-0.23.0.min.js',"))fail('Scanner library must be saved for offline use');
 for(const x of ["const ZXING_URL='./vendor/zxing-library-0.23.0.min.js';","sc.src=ZXING_URL;","getUserMedia({audio:false,video:{facingMode:{ideal:'environment'}","function closeSheet(){stopCamera();","function showSheet(title,html,onBack){stopCamera();","document.visibilityState==='hidden'&&camera){stopCamera();","fetch(OFF_PRODUCT+c+'.json?'+new URLSearchParams({fields:'code,product_name,brands,nutriments,serving_size,serving_quantity'})","if(hit&&validBarcode(hit.code,hit.format)){if(key===last){found(hit.code,hit.format);return}last=key}","res.getBarcodeFormat()","formats.get(res.getBarcodeFormat())","format:String(r[0].format||'')"])if(!fit.includes(x))fail('Scanner invariant missing: '+x);
 if(/src=['"`]https?:/.test(fit)||/toDataURL|toBlob|captureStream|MediaRecorder/.test(fit))fail('Scanner must not load remote scripts or keep camera images');
 for(const x of ['Barcode scanning','no picture is saved or sent','Only the barcode number'])if(!priv.includes(x))fail('Privacy page scanner note missing: '+x);
 const vm=await import('node:vm');const ctx={window:{addEventListener(){}},state:{tab:'today'},render(){},localKey:d=>String(d),setHeader(){},esc:v=>String(v),$:sel=>sel.includes('fitness')?{addEventListener(){}}:null,setTimeout(){},document:{addEventListener(){}},navigator:{onLine:false},localStorage:{getItem:()=>null,setItem(){}},crypto:{randomUUID:()=>'u'},structuredClone,URLSearchParams,AbortController,console,addEventListener(){}};
 vm.runInNewContext(fit,ctx);const V=ctx.window.PlanlyFitness.validBarcode;
 for(const ok of ['5000436589457','96385074','036000291452','4006381333931','5449000000996'])if(!V(ok))fail('valid barcode rejected: '+ok);
 for(const bad of ['5000436589458','96385075','036000291453','123','50004365894577','abcdefghijklm',''])if(V(bad))fail('invalid barcode accepted: '+bad);
 // UPC-E: expanded to UPC-A before its check digit is verified (04252614 → 042100005264, 01234565 → 012345000065)
 const C=ctx.window.PlanlyFitness.barcodeCandidates;
 for(const [code,fmt] of [['04252614','upc_e'],['01234565','upc_e'],['04252614',''],['96385074','ean_8'],['96385074',''],['036000291452','upc_a'],['5000436589457','ean_13']])if(!V(code,fmt))fail('valid barcode rejected: '+code+' '+fmt);
 for(const [code,fmt] of [['04252615','upc_e'],['01234566','upc_e'],['04252614','ean_8'],['96385074','upc_e'],['24252614','upc_e'],['5000436589457','upc_a'],['036000291452','ean_13']])if(V(code,fmt))fail('invalid barcode accepted: '+code+' '+fmt);
 if(JSON.stringify(C('04252614','upc_e'))!=='["042100005264","0042100005264","04252614"]'||JSON.stringify(C('01234565','upc_e'))!=='["012345000065","0012345000065","01234565"]'||JSON.stringify(C('96385074','ean_8'))!=='["96385074"]'||JSON.stringify(C('036000291452'))!=='["036000291452","0036000291452"]')fail('barcode lookup candidates wrong');
 // UPC-E vectors cross-checked with bwip-js 4.11.4 (an independent encoder that computes the check digit): each is valid
 // as UPC-E and every other last digit is not.
 for(const v of ["13816130","13194125","06813217","17037297","06137496","13446383","10929797","16361386","09484126","09089952","15763949","05825310"]){
  if(!V(v,'upc_e'))fail('UPC-E vector rejected: '+v);for(const d of '0123456789')if(d!==v[7]&&V(v.slice(0,7)+d,'upc_e'))fail('UPC-E with wrong check digit accepted: '+v.slice(0,7)+d)}
 // ZXing in Planly's settings: reads EAN-13, EAN-8 and UPC-A drawn by tests/browser/barcodes.mjs, reporting the format Planly
 // validates with. UPC-E stays off for ZXing: its 0.23.0 JavaScript UPC-E reader never returns a correct code (see core-fitness).
 {const {ean13Modules,ean8Modules,upcaModules,upceModules,barcodePixels}=await import('../tests/browser/barcodes.mjs');const zc={};zc.globalThis=zc;vm.runInNewContext(fs.readFileSync('v2/vendor/zxing-library-0.23.0.min.js','utf8'),zc);const Z=zc.ZXing;
  const U8=vm.runInContext('Uint8ClampedArray',zc),ZM=vm.runInContext('Map',zc),ZA=vm.runInContext('Array',zc);
  const fmts={[Z.BarcodeFormat.EAN_13]:'ean_13',[Z.BarcodeFormat.EAN_8]:'ean_8',[Z.BarcodeFormat.UPC_A]:'upc_a'};
  const reader=new Z.MultiFormatReader(),hints=new ZM();hints.set(Z.DecodeHintType.POSSIBLE_FORMATS,ZA.of(Z.BarcodeFormat.EAN_13,Z.BarcodeFormat.EAN_8,Z.BarcodeFormat.UPC_A));hints.set(Z.DecodeHintType.TRY_HARDER,true);reader.setHints(hints);
  const decode=m=>{const {w,h,Y}=barcodePixels(m);try{const r=reader.decodeWithState(new Z.BinaryBitmap(new Z.HybridBinarizer(new Z.RGBLuminanceSource(new U8(Y),w,h))));return [r.getText(),fmts[r.getBarcodeFormat()]]}catch{return null}finally{reader.reset()}};
  for(const [mods,code,fmt,first] of [[ean13Modules('5000436589457'),'5000436589457','ean_13','5000436589457'],[ean8Modules('96385074'),'96385074','ean_8','96385074'],[upcaModules('036000291452'),'036000291452','upc_a','036000291452']]){
   const r=decode(mods);if(!r||r[0]!==code||r[1]!==fmt)fail('ZXing did not read '+fmt+' '+code+': '+JSON.stringify(r));if(C(r[0],r[1])[0]!==first)fail('lookup candidates wrong for '+fmt)}
  if(decode(upceModules('04252614')))fail('ZXing now reads UPC-E: re-check its UPC-E output before enabling it');
  if(/POSSIBLE_FORMATS,\[[^\]]*UPC_E/.test(fit))fail('UPC-E must stay off for ZXing (its 0.23.0 UPC-E reader is broken)');
  if(!fit.includes("formats:['ean_13','ean_8','upc_a','upc_e'].filter(x=>f.includes(x))"))fail('Built-in BarcodeDetector should still read UPC-E');}}
// Typing in Search must not redraw the sheet (it made the page jump on iPhone): only the list under the box changes.
{const fit=read('v2/core-fitness-v5.1.js'),i=fit.indexOf('function openSearch('),j=fit.indexOf('function openScan(');const body=fit.slice(i,j);
 if((body.match(/showSheet\(/g)||[]).length!==1||!/const drawList=\(\)=>\{/.test(body)||/drawList[^;]*showSheet/.test(body))fail('Search must draw its sheet once and only redraw the list');}
// Search ranking: every typed word must start a word of the name or brand; names starting with the query come first.
{const vm=await import('node:vm'),fit=read('v2/core-fitness-v5.1.js'),ctx={window:{addEventListener(){}},state:{tab:'today'},render(){},localKey:d=>String(d),setHeader(){},esc:v=>String(v),$:sel=>sel.includes('fitness')?{addEventListener(){}}:null,setTimeout(){},document:{addEventListener(){}},navigator:{onLine:false},localStorage:{getItem:()=>null,setItem(){}},crypto:{randomUUID:()=>'u'},structuredClone,URLSearchParams,AbortController,console,addEventListener(){}};
 vm.runInNewContext(fit,ctx);const R=(list,q)=>JSON.parse(JSON.stringify(ctx.window.PlanlyFitness.rankFoods(list,q))).map(f=>f.name+(f.brand?' / '+f.brand:''));
 const foods=[{name:"Coconut Milk",brand:'Alpro'},{name:"Kellogg's Coco Pops",brand:"Kellogg's"},{name:'Coco Pops',brand:"Kellogg's"},{name:'Coco Pops',brand:"Kellogg's"},{name:'Hot Chocolate',brand:'Cadbury'},{name:'Crème brûlée',brand:'Gü'}];
 const r1=R(foods,'coco p');if(JSON.stringify(r1)!==JSON.stringify(["Coco Pops / Kellogg's","Kellogg's Coco Pops / Kellogg's"]))fail('ranking for "coco p" wrong: '+JSON.stringify(r1));
 const K=JSON.parse(JSON.stringify(ctx.window.PlanlyFitness.rankFoods([{name:'Greek yoghurt',brand:'X'},{name:'Greek Yogurt',brand:'Y'}],'greek yogurt',undefined,true))).map(f=>f.name);if(JSON.stringify(K)!=='["Greek Yogurt","Greek yoghurt"]')fail('Open Food Facts answers must be re-ranked, not dropped: '+JSON.stringify(K));
 // Open Food Facts answers: strict matches only; non-matching answers appear only as labelled close matches when nothing matches
 {const SC=(list,q)=>{const r=ctx.window.PlanlyFitness.strictOrClose(list,q);return {names:JSON.parse(JSON.stringify(r)).map(f=>f.name),close:!!r.close}};
  const a=SC([{name:'Hot Chocolate',brand:'Cadbury'},{name:'Coco Pops',brand:"Kellogg's"}],'coco p');if(JSON.stringify(a)!=='{"names":["Coco Pops"],"close":false}')fail('an answer not matching every typed word must be dropped when real matches exist: '+JSON.stringify(a));
  const b=SC([{name:'Chausson aux pommes',brand:'U'}],'apple');if(JSON.stringify(b)!=='{"names":["Chausson aux pommes"],"close":true}')fail('when nothing matches, answers must be marked as close matches: '+JSON.stringify(b));
  const c=SC([],'apple');if(JSON.stringify(c)!=='{"names":[],"close":false}')fail('no answers: nothing, not close matches: '+JSON.stringify(c));}
 for(const x of ["const out=strictOrClose(got.flatMap(x=>x.status==='fulfilled'?x.value:[]),q),top=out.slice(0,size);top.close=out.close;return top;","return strictOrClose((j.products||[]).map(offProduct).filter(Boolean),q)}","${shown.off.close&&shown.off.length?' · close matches':''}"])if(!fit.includes(x))fail('Fitness strict-match invariant missing: '+x);
 if((fit.match(/,undefined,true\)/g)||[]).length!==1||!fit.includes('const close=rankFoods(list,q,undefined,true);close.close=true;'))fail('Open Food Facts answers must go through strictOrClose, not keepAll ranking');
 if(R(foods,'kell').length!==2||R(foods,'cadbury')[0]!=='Hot Chocolate / Cadbury'||R(foods,'creme')[0]!=='Crème brûlée / Gü'||R(foods,'pops coco').length!==2||R(foods,'xyz').length!==0||R(foods,'').length!==5)fail('search matching rules wrong');}
// The search sheet itself must say that words are sent as you type (privacy.html says the same).
{const fit=read('v2/core-fitness-v5.1.js'),priv=read('privacy.html');
 for(const x of ['As you type, the words in the search box are sent to it after a short pause, from three letters, to show suggestions.','Only those words, or a barcode number, are sent: never your account or food log.'])if(!fit.includes(x))fail('Search sheet privacy note missing: '+x);
 if(!priv.includes('Suggestions appear as you type, so the words you type in the food search are sent to it as you type (after a short pause, from three letters)'))fail('Privacy page must describe suggestions sent as you type');
 if(!/const redraw=[\s\S]{0,4000}timer=setTimeout\(\(\)=>suggest\(q\),300\)/.test(fit)||!fit.includes("if(q.length>=3&&!/^\\d+$/.test(q)&&navigator.onLine)"))fail('Suggestions must wait 300 ms and start at three letters, as the notes say');}
console.log('Fitness checks passed.');
