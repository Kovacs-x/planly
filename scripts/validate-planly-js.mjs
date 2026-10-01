import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8'),fail=m=>{throw new Error(m)};
const paths={app:'v2/app-v3.2.0.js',hardening:'v2/hardening-v3.3b.js',projects:'v2/core-projects-v3.3c.js',build:'v2/core-build-v3.3c.js',assignment:'v2/core-assignment-v3.3c.js',planning:'v2/core-project-planning-v3.3c.js',calendar:'v2/core-household-calendar-v3.3c.js',safety:'v2/core-household-planning-safety-v3.3c.js',closeout:'v2/core-closeout-v3.3c.js',cloud:'v2/core-cloud-readiness-v3.3d.js',gate:'v2/core-release-gate-v3.3d.js',budgetNav:'v2/core-budget-nav-v4.0b1.js',redesignR1:'v2/core-redesign-r1.js',budget:'v2/core-budget-v4.0b.js',budgetUi:'v2/core-budget-ui-v4.0b.js',budgetScope:'v2/core-budget-scope-v4.0c.js',budgetLifecycle:'v2/core-budget-lifecycle-v4.0d.js',budgetMonthly:'v2/core-budget-monthly-v4.0e.js',budgetMonthState:'v2/core-budget-month-state-v4.0f.js',budgetInsights:'v2/core-budget-insights-v4.0g.js',budgetActions:'v2/core-budget-actions-v4.0l.js',budgetScroll:'v2/core-budget-scroll-v4.0m.js',lists:'v2/core-lists-v4.1.js',dashboard:'v2/core-household-dashboard-v4.2.js',intelligence:'v2/core-intelligence-v5.js',budgetReview:'v2/core-budget-review-hardening-v4.0p.js',budgetCoreGuard:'v2/core-budget-core-guard-v4.0q.js',update:'v2/core-update-v4.3.js',sw:'v2/sw.js',config:'v2/supabase-config.js'};
const s=Object.fromEntries(Object.entries(paths).map(([k,p])=>[k,read(p)])),manifest=JSON.parse(read('v2/runtime-modules.json'));
const closeIndex=s.app.lastIndexOf('})();');if(closeIndex<0)fail('Planly core injection point missing');
const core=[s.projects,s.build,s.assignment,s.planning,s.calendar,s.safety,s.closeout,s.cloud,s.gate,s.budgetNav],appended=[s.budget,s.budgetUi,s.budgetScope,s.budgetLifecycle,s.budgetMonthly,s.budgetMonthState,s.budgetInsights,s.budgetActions,s.budgetScroll,s.lists,s.dashboard,s.budgetReview,s.budgetCoreGuard,s.update,s.intelligence];
const generated=s.app.slice(0,closeIndex)+'\n'+core.join('\n')+'\n'+s.app.slice(closeIndex)+'\n;'+s.hardening+'\n;'+appended.join('\n;');
for(const [name,source] of [...Object.entries(s),['generated',generated]])try{new Function(source)}catch(err){fail(name+' does not parse: '+err.message)}
for(const source of [generated,s.sw,s.config]){if(source.includes('$$$'))fail('Found $$$ regression');const bad=(source.match(/(^|[^$])\$\([^)]*\)\.forEach/g)||[]).filter(x=>!x.includes('$$('));if(bad.length)fail('Found accidental $().forEach')}
for(const needle of ["$$('.nav button').forEach","$$('#quickDates .chip').forEach","$$('[data-planly-calendar-refresh]').forEach","$$('[data-planly-calendar-remove]').forEach","$$('[data-planly-calendar-toggle]').forEach","$$('[data-planly-calendar-colour]').forEach"])if(!generated.includes(needle))fail('Missing collection handler: '+needle);
for(const needle of ['function todayView','function upcomingView','function settingsView','function openSheet','function completeTaskWithUndo','function reconcilePlanlyCloud','PLANLY_HOUSEHOLD_EXTERNAL_CALENDAR_SHARING=false','function planlyMonthTasksForDate','function planlyMonthExternalForDate','commitPlanDay=function()','function planly33dReleaseGateAudit','window.PlanlyBudget','window.PlanlyLists','window.PlanlyHouseholdDashboard','window.PlanlyIntelligence','window.PlanlyUpdate'])if(!generated.includes(needle))fail('Missing critical runtime function: '+needle);
for(const needle of ['data-budget-scope="personal"','data-budget-scope="household"','PlanlyBudgetActions.mutate','Coming up','Unplanned','persistedEntryUpdate','persistedDelete','persistedCategoryUpdate','classifyZero','readPreference(owner)',"api.switchScope('household')",'api.__legacyMutationGuard','scrollTopNow','planly:budget-ui-rendered','Left to plan','Coming up','Money in'])if(!generated.includes(needle))fail('Missing Budget review invariant: '+needle);
if(s.budgetLifecycle.includes('decorateCategory(')||s.budgetLifecycle.includes('data-life-quick-delete'))fail('Legacy index-mapped expense action owner remains active');
const cache=s.sw.match(/const CACHE='([^']+)'/)?.[1],version=s.sw.match(/const VERSION='([^']+)'/)?.[1];if(!cache||!version)fail('Service worker cache/version markers missing');
for(const module of manifest.modules||[])if(!s.sw.includes(module))fail('Service worker missing runtime manifest module marker: '+module);
for(const needle of ["const RUNTIME_MANIFEST_URL='./runtime-modules.json'",'BUDGET_REVIEW_URL','BUDGET_CORE_GUARD_URL','INTELLIGENCE_RUNTIME_URL','UPDATE_RUNTIME_URL','await self.clients.claim()','FETCH_TIMEOUT=8000','AbortController','results.some(ok=>!ok)','await caches.delete(CACHE)'])if(!s.sw.includes(needle))fail('Missing service-worker/runtime marker: '+needle);
for(const needle of ['runtime-modules.json','__planly_sw_probe__','window.verifyPlanlyOfflineCache','window.probePlanlyServiceWorker'])if(!s.budgetCoreGuard.includes(needle))fail('Offline verifier override missing: '+needle);
for(const needle of ['runtime-modules.json','planlyKeys','probePlanlyServiceWorker','/^planly-v2-sw-'])if(!s.build.includes(needle))fail('N16 offline readiness fix missing: '+needle);
for(const needle of ['controllerchange','Planly update ready','SKIP_WAITING','editing()','reg.update()'])if(!s.update.includes(needle))fail('Safe update coordinator invariant missing: '+needle);
if(s.budgetCoreGuard.includes("const CACHE='planly-v2-")||s.budgetCoreGuard.includes("SW='planly-v2-sw-"))fail('Core guard hard-codes release cache/version markers');
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
if(!assignmentWrapper.includes('loadPlanlyHousehold=function(force=false)'))fail('household wrapper must preserve force argument');
if(!assignmentWrapper.includes('__planlyBaseLoadHousehold(force)'))fail('household wrapper must forward force argument');
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
if(!s.sw.includes("const CORE_REDESIGN_R1_URL='./core-redesign-r1.js?v=610r113'"))fail('R1 core runtime missing from service worker');
if(!s.sw.includes("const CACHE='planly-v2-610a-51'"))fail('R1 cache marker mismatch');

const r2Html=read('v2/index.html'),r2App=read('v2/app-v3.2.0.js');
for(const x of ['grid-template-columns:minmax(0,1fr) auto auto','searchIcon{grid-column:3;width:44px!important;height:44px!important}','grid-template-columns:44px minmax(0,1fr) auto!important','min-width:44px!important;height:44px!important','id="pi-star"','id="pi-more"','id="pi-repeat"','id="pi-clock"'])if(!r2Html.includes(x))fail('R2 presentation invariant missing: '+x);
for(const x of ['href="#pi-star"','href="#pi-more"','href="#pi-repeat"','href="#pi-clock"','aria-pressed='])if(!r2App.includes(x))fail('R2 task-row invariant missing: '+x);

const r2Assign=read('v2/core-assignment-v3.3c.js');
if(r2Assign.includes('taskAssigneePill')||r2Assign.includes('taskCompletionActorPill'))fail('R4 duplicate household assignment/completion renderer returned');
for(const x of ["Anyone can complete","Assigned to ","Done by "])if(!r2App.includes(x))fail('R4 authoritative household assignment/completion label missing: '+x);
for(const x of ['id="pi-grip"','id="pi-checklist"','id="pi-check"','min-height:44px!important}.taskBody>.chip[data-action="today"]','--r2Personal:#2F4FD0','--r2Health:#BE2F55','--r2Home:#1B7A4C'])if(!r2Html.includes(x))fail('R2 review presentation invariant missing: '+x);
for(const x of ['href="#pi-grip"','href="#pi-checklist"','href="#pi-check"'])if(!r2App.includes(x))fail('R2 review task glyph invariant missing: '+x);

const r3BudgetUi=read('v2/core-budget-ui-v4.0b.js'),r3BudgetScope=read('v2/core-budget-scope-v4.0c.js'),r3BudgetInsights=read('v2/core-budget-insights-v4.0g.js'),r3BudgetReview=read('v2/core-budget-review-hardening-v4.0p.js'),r3BudgetHtml=read('v2/index.html');
for(const needle of ['Left to plan','Coming up','Categories','Money in','Paid','To pay','Unplanned','data-budget-paid','PlanlyBudgetActions.mutate'])if(!r3BudgetUi.includes(needle))fail('R3 Budget presentation invariant missing: '+needle);
for(const needle of ['id="catKind"','value="income"','data-manage-category','Income categories',"kind:host.querySelector('#catKind').value"])if(!r3BudgetUi.includes(needle))fail('R3 Budget category management invariant missing: '+needle);
for(const needle of ['toPay.map(x=>paymentRow(x,true))','paid.map(x=>paymentRow(x,true))','up.map(x=>paymentRow(x))'])if(!r3BudgetUi.includes(needle))fail('R3 Budget row action placement invariant missing: '+needle);if(r3BudgetUi.includes('up.map(paymentRow)'))fail('R3 Coming up Array.map callback-index leakage returned');
for(const needle of ['function localDateKey','start=localDateKey(now)','end=localDateKey(new Date(now.getFullYear(),now.getMonth(),now.getDate()+7))'])if(!r3BudgetUi.includes(needle))fail('R3 Coming up local-date invariant missing: '+needle);
for(const needle of ['data-budget-category-edit',"PlanlyBudgetActions.mutate('category',id,{name,icon_key:icon})",'--budgetToPay,#A15C07'])if(!r3BudgetUi.includes(needle))fail('R3/C1 Budget review follow-up missing: '+needle);
if(r3BudgetScope.includes("shared&&!a.canAdmin?.()"))fail('Household member category management is hidden');
for(const needle of ["function structureOwner(){return state.scope?.scope_type==='household'?state.scope.owner_id:owner}","owner_id:structureOwner()"])if(!s.budget.includes(needle))fail('Household category structure-owner invariant missing: '+needle);
if(!r3BudgetHtml.includes(':root:not([data-theme="dark"]) .priorityHigh,:root:not([data-theme="dark"]) .overdueSection .calendarGroupLabel{color:#B52D51!important}'))fail('R3 dark priority contrast scope missing');
if(r3BudgetHtml.includes('.priorityHigh,.overdueSection .calendarGroupLabel{color:#B52D51!important}'))fail('R3 unscoped priority rose returned');
if(r3BudgetInsights.includes('Monthly snapshot'))fail('R3 legacy Monthly snapshot decorator returned');
if(r3BudgetReview.includes('function patchCategory'))fail('R3 legacy category DOM replacement returned');
for(const needle of ['for="planlyCalendarName"','for="planlyCalendarUrl"','for="defaultCat"','for="planningStart"','for="planningEnd"','for="googleClientId"','for="themeSetting"'])if(!s.app.includes(needle))fail('R3 Settings label invariant missing: '+needle);
for(const needle of ['.monthControls button{width:auto;min-width:44px!important;height:44px!important','.calendarFilters button{min-height:44px!important}','.calendarShiftLabel{font-size:10px!important'])if(!r3BudgetHtml.includes(needle))fail('R3 Month accessibility invariant missing: '+needle);

// R4 member names + Bills on Today release invariants.
for(const needle of ["'+namePanel+planlyHouseholdMemberRowsHtml()","id=\"planlyDisplayName\"","Join a household first.","characters Planly can't show","function planlyBudgetBillsDueHtml()","getTodayBills?.()","mutateTodayEntry(row.id,row.cloud_version"])if(!r2App.includes(needle))fail('R4 app invariant missing: '+needle);
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
for(const needle of ['function buildDayPlanRecommendations','engine.analyse','busy:externalTimelineIntervals(target).map(x=>({start:x.start,end:x.end}))','Plan tomorrow','Use suggested Top 3','Chores today','Accept suggestions (','Suggested times','id="intelligenceSuggestions"','id="intelligenceNightRest"','data-plan-chore','data-plan-why','No suggestions today','t.date===target&&t.visibility'])if(!s.app.includes(needle))fail('Intelligence I1 composed UI invariant missing: '+needle);
if(s.app.includes('.map(taskHtml)'))fail('Task renderer Array.map callback-index leakage returned');
if(!read('v2/index.html').includes('id="pi-spark"'))fail('Intelligence spark sprite missing');
if(!read('v2/index.html').includes("RUNTIME_URL='./app-v3.2.0.js?v=610a01'"))fail('Intelligence app runtime boot marker mismatch');
const mods=manifest.modules||[];if(mods[mods.length-1]!=='./core-intelligence-v5.js?v=560i504')fail('Intelligence must be final runtime module');
await import('./validate-intelligence-v5.mjs');

if(/__planly33cBaseRenderPlanDay[\s\S]{0,300}innerHTML/.test(s.calendar))fail('Household calendar wrapper must not replace composed Plan My Day UI');

if(s.app.includes('state.tasks=dayPlanDraft'))fail('Plan My Day must not replace live tasks with stale draft');
for(const needle of ['dayPlanStartSnapshot','window.PlanlyCompleteHouseholdTask','Left from today','data-plan-time="','protected rest until'])if(!s.app.includes(needle))fail('Review #92 app invariant missing: '+needle);
if(/data-plan-time=[^>]+ checked/.test(s.app))fail('Suggested times must be opt-in');
if(!s.intelligence.includes('Not done yet today'))fail('Left-today engine reason missing');
if(!s.assignment.includes('window.PlanlyCompleteHouseholdTask=planlyCompleteHouseholdTaskDirect'))fail('Direct B2 household completion API missing');
for(const file of manifest.modules.map(x=>x.replace(/^\.\//,'').replace(/\?.*$/,'')).filter(Boolean)){const src=read('v2/'+file);if(src.includes('.map(taskHtml)'))fail('Composed module callback-index leakage: '+file)}

if(/async function planlyCompleteHouseholdTaskDirect\(t\)\{[\s\S]{0,300}await planlyCompleteHouseholdTaskDirect\(t\)/.test(s.assignment))fail('Direct B2 completion recurses');
if(!s.safety.includes("fields=['date','time','pinned','top3Order','calendarSync']")||!s.safety.includes("$$('#planDayContent [data-plan-time]')")||s.safety.includes('state.tasks=[...ownedDraft'))fail('Final composed commitPlanDay is not delta-only');
if(!s.safety.includes('if(!planlyTaskOwnedByMe(draft))continue')||!s.safety.includes('!planlyTaskOwnedByMe(live)'))fail('Final composed commitPlanDay owner boundary missing');
if(!s.assignment.includes("stagePlanlyHouseholdCompletion(t,next,nextDate)"))fail('Direct B2 completion must stage household RPC');

for(const needle of ['todayDayCheckHtml','data-i2-suggest3','data-i2-tidy','Next: ','deferCount','intelligenceWhySheet','intelligenceSnoozeDate'])if(!s.app.includes(needle))fail('I2 runtime invariant missing: '+needle);
if(!s.app.includes("t._planlyOwnedByMe!==false)).forEach((t,i)=>{t.top3Order=i})"))fail('normalizeTop3Orders must be owner-only');
if(fs.existsSync('v2/app.js'))fail('Legacy v2/app.js must remain deleted');
if(!s.app.includes("externalTimelineIntervals(key).map(x=>({start:x.start,end:x.end}))"))fail('Today intelligence must reuse loaded calendar state');
if(!s.app.includes("window.PlanlyBudget?.getTodayBills?.()"))fail('Today bill summary must reuse loaded Budget state');

if(!s.app.includes("data-i2-tidy-choice")||!s.app.includes("data-i2-accept-tidy"))fail('I2 Tidy up must be a review sheet with Accept all');
if(!s.app.includes("showUndoToast('Suggested Top 3 added'"))fail('I2 Suggest 3 must provide batch Undo');
if(!s.app.includes("state.intelligenceSnoozeDate=localKey(new Date())"))fail('I2 no-suggestions control must be device-day scoped');

for(const needle of ["const VERSION='5.0.0-i5'","factors:x.factors","score:x.score"])if(!s.intelligence.includes(needle))fail('I2 weighted explanation invariant missing: '+needle);
for(const needle of ["function tidyOverdue(rec=todayIntelligence())","const recById=new Map((rec?.overdue||[])","showUndoToast('Tidied '","clearPendingTaskIds(pendingIds);restoreTaskSnapshot(before)","showIntelligenceWhy(dayPlanRecommendations","state.intelligenceSnoozeDate===localKey(new Date())||!engine?.analyse"])if(!s.app.includes(needle))fail('I2 review #97 invariant missing: '+needle);
{const a=s.app.indexOf('function tidyOverdue('),b=s.app.indexOf('\nfunction showIntelligenceWhy',a),block=s.app.slice(a,b);if(block.includes('rescheduleTaskWithUndo('))fail('I2 Tidy up regressed to per-task Undo');if(!block.includes("t.deferCount=Math.max(0,Number(t.deferCount||t.data?.deferCount||0))+1"))fail('I2 Tidy batch must increment deferCount in the batch');}
if(!s.app.includes("t.date===key&&t.visibility!=='household'&&t._planlyOwnedByMe!==false&&!t.completed"))fail('I2 Suggest 3 must not clear household Top 3 state');
if(s.app.includes("rec.day.status==='over'?-20:12")||s.app.includes("['Work day',-8")||s.app.includes("['Night rest',-10"))fail('I2 Why contains invented weights');
if(!s.app.includes('class="i2CloseButton"')||!s.app.includes('href="#pi-plus"'))fail('I2 sheets must use sprite close controls');

if(!s.app.includes("factor.points!==null&&factor.points!==undefined&&Number.isFinite(Number(factor.points))"))fail('I2 Why must not coerce unweighted factors to zero');

for(const needle of ["const VERSION='5.0.0-i5'","projectSignals.push","nextStepId"])if(!s.intelligence.includes(needle))fail('I3 engine invariant missing: '+needle);for(const needle of ["function openPlanWeek()","function planProjectBlock(p)","projectStatusHtml(p)","data-plan-week","plan-block","showUndoToast('Week plan saved'"])if(!s.app.includes(needle))fail('I3 runtime invariant missing: '+needle);

for(const needle of ["calendarClashes=new Set","taskClashes=new Set","<span>Clashes</span>"])if(!s.app.includes(needle))fail('I3 Timeline clash consistency invariant missing: '+needle);

{const a=s.app.indexOf('function planProjectBlock('),b=s.app.indexOf('\nfunction openPlanWeek',a),block=s.app.slice(a,b);if(!block.includes("t.visibility==='household'"))fail('I3 Plan a Block household boundary missing');if(!block.includes('stageChangedTasksFromSnapshot(before)')||!block.includes("showUndoToast('Planned "))fail('I3 Plan a Block cloud/Undo path missing');}
{const a=s.app.indexOf('function openPlanWeek('),b=s.app.indexOf('\nfunction projectById',a),block=s.app.slice(a,b);for(const needle of ["t.visibility==='household'","rec.day.overnightRest||rec.day.isWorkDay","stageChangedTasksFromSnapshot(before)","showUndoToast('Week plan saved'","clearPendingTaskIds(pendingIds);restoreTaskSnapshot(before)","queuePlanlyPendingReplay('Week plan synced')","syncPendingGoogle()"]){if(!block.includes(needle))fail('I3 Plan My Week acceptance invariant missing: '+needle)}if(block.indexOf('save();')<block.indexOf('[data-week-save]'))fail('I3 Plan My Week must remain draft-only before Save week');}
if(!s.intelligence.includes("owned(t)&&t.visibility!=='household'&&!t.completed&&String(t.projectId||'')"))fail('I3 project actions must rank personal owner-safe tasks only');

const i3r1=read('v2/core-redesign-r1.js'),i3projects=read('v2/core-projects-v3.3c.js');
if(!i3r1.includes("typeof projectStatusHtml==='function'?projectStatusHtml(p,projectAnalysis)"))fail('I4 R1 composed project status must reuse cached analysis');if(!i3projects.includes("typeof projectStatusHtml==='function'?projectStatusHtml(p)"))fail('I3 3.3C composed project status missing')
for(const needle of ['projectIntelligence(p.id)','Next step','data-project-action="plan-block"',"typeof planProjectBlock==='function'"])if(!i3projects.includes(needle))fail('I3 composed project detail/action missing: '+needle);
for(const needle of ["Array.from({length:7},(_,i)=>addDays(today,i))","baseRec?.weekCandidates||[]","row.date<today","function firstPlanningGap(","todayTime||firstPlanningGap(tomorrow,t,0)"])if(!s.app.includes(needle))fail('I3 review #99 planning invariant missing: '+needle);
for(const needle of ["activeAll=all.filter(t=>!t.completed)","status='done'","status='not-scheduled'",'weekCandidates'])if(!s.intelligence.includes(needle))fail('I3 review #99 engine invariant missing: '+needle);
if(!read('v2/index.html').includes('.projectIntelStatus{font-size:11px')||!read('v2/index.html').includes('.planWeekDays small{font-size:11px'))fail('I3 review #99 mobile type floor missing');

// I3 #100 composed project-detail execution guard: execute the final override in a minimal runtime harness.
{const source=s.projects,start=source.indexOf('renderProjectsPanel=function()'),end=source.indexOf('\nopenProjects=function',start);if(start<0||end<0)fail('I3 project detail override not found');const fn=source.slice(start,end);const nodes={projectsContent:{innerHTML:'',hidden:false},projectsTitle:{textContent:'',hidden:false},projectsEyebrow:{textContent:'',hidden:false},projectsBack:{hidden:false}};const dollar=sel=>nodes[sel.slice(1)]||null,state0={projects:[{id:'p1',name:'Project',dueDate:'',notes:'',visibility:'private',archived:false}],tasks:[{id:'t1',projectId:'p1',title:'Task',completed:false,visibility:'private',_planlyOwnedByMe:true}]};const args=[dollar,state0,'detail','p1','','',null,id=>state0.projects.find(p=>p.id===id),()=>({done:0,total:1,pct:0,active:state0.tasks,completed:[]}),()=>true,()=>'',()=>({status:'on-track',reasons:['Active work is scheduled'],nextStepId:'t1',nextStepReasons:['High priority']}),()=>'<span>On track</span>',x=>x,t=>'<div>'+t.title+'</div>',x=>String(x),x=>String(x),()=> '2026-10-01',(k,n,inner)=>n?'<details class="doneFold">'+inner+'</details>':''];try{const run=new Function('$','state','projectPanelMode','activeProjectId','editingProjectId','activeProjectOwnerId','planlyHousehold','projectById','projectStats','planlyProjectOwnedByMe','planlyProjectShareLabel','projectIntelligence','projectStatusHtml','sortTasks','taskHtml','esc','fmt','localKey','planlyDoneFold',fn+';renderProjectsPanel();');run(...args)}catch(err){fail('I3 composed project detail runtime error: '+err.message)}if(!nodes.projectsContent.innerHTML.includes('Next step')||!nodes.projectsContent.innerHTML.includes('Plan a block')||!nodes.projectsContent.innerHTML.includes('Add task')||!nodes.projectsContent.innerHTML.includes('Edit project'))fail('I3 composed project detail did not render expected actions')}
if(!s.app.includes("const prefix=!t.date?(t.projectId?'Project task':'Inbox'):'Overdue';"))fail('I3 week candidate labels must identify undated project tasks before Inbox fallback');

// I4 chore-balance and deferred I3 review invariants.
for(const needle of ['intelligenceChoreBalance:false','id="intelligenceChoreBalance"','function householdChoreIntelligence()',"return showToast('Already planned at '+t.time)"])if(!s.app.includes(needle))fail('I4 app invariant missing: '+needle);
for(const needle of ['function homeChoreBalanceHtml','function openShareOut()','data-share-out','data-share-accept','t._planlyOwnedByMe===false',"t.visibility!=='household'"])if(!r1.includes(needle))fail('I4 Home/share-out invariant missing: '+needle);
if(!r1.includes('projectStatusHtml(p,projectAnalysis)'))fail('I4 project list must reuse one Intelligence analysis per render');
for(const needle of ['completedDate','weekCounts','ownerUnassigned','shareOut','longShifts'])if(!s.intelligence.includes(needle))fail('I4 engine invariant missing: '+needle);

if(!s.app.includes("assignee_id:visibility==='household'?(t.assigneeId||t.assignee_id||null):null"))fail('I4 authoritative assignee column must travel through optimistic taskCloudRow');

// I5 final Intelligence invariants.
for(const needle of ["PLANLY_INTELLIGENCE_HISTORY_KEY","recordIntelligenceCompletion","intelligenceLearning","learnedPlanningDuration","smartAddSuggestionHtml","recurringLearningCandidate","intelligenceResetHistory",'<option value="11">11 hours</option>','<option value="12">12 hours</option>'])if(!s.app.includes(needle))fail('I5 app invariant missing: '+needle);
for(const needle of ['weeklyReviewHtml','data-plan-week-review','Plan this week'])if(!r1.includes(needle))fail('I5 weekly review invariant missing: '+needle);
if(!s.intelligence.includes("Number(loads[ordered[0].id]||0)===Number(loads[ordered[1].id]||0)"))fail('I5 Share out must leave equal-load ties as Anyone');

for(const needle of ["if($('#intelligenceResetHistory'))$('#intelligenceResetHistory').onclick=()=>resetIntelligenceHistory()","function similarOwnedTasks(title)","learning:intelligenceLearningInput()","function dismissRecurringLearning(t)","data-repeat-no"])if(!s.app.includes(needle))fail('I5 review fix missing: '+needle);
if(!r1.includes("t.date>=start&&t.date<=end"))fail('I5 weekly slipped must be scoped to last week');

// Stage 4 correctness invariants.
for(const needle of ['finiteDuration','fixedDuration','t.time?fixedDuration(t,defaultDuration):duration(t,defaultDuration,learning)',"top3=targetPersonal.slice(0,(isWorkDay||overnightRest)?2:3)"])if(!s.intelligence.includes(needle))fail('Stage4 Intelligence correctness invariant missing: '+needle);
if(!s.assignment.includes("if(!!fresh.completed===!!payload.completed){clearPlanlyPendingWrite('householdCompletion',op.id);await reconcilePlanlyCloud({render:false,replay:false})"))fail('Stage4 household completion same-state conflict must reconcile authoritatively');

// Stage 4 four-tab/Profile/person-colour invariants.
const indexHtml=read('v2/index.html'),navMarkup=(indexHtml.match(/<nav class="nav"[\s\S]*?<\/nav>/)||[''])[0];if((navMarkup.match(/<button data-tab=/g)||[]).length!==4)fail('Stage4 primary nav must contain exactly four buttons');
for(const needle of ['id="profileToggle"','id="profileWrap"','planlyStage4Profile'])if(!indexHtml.includes(needle))fail('Stage4 Profile surface missing: '+needle);for(const needle of ['function settingsHubHtml()','data-settings-page=','function openSettingsPage(page,focusName=false)',"function openProfile(){closeProfile();openSettingsPage('')}",'planlyRenderProfileButton();'])if(!s.app.includes(needle))fail('Stage4 Profile / Settings hub missing: '+needle);
for(const needle of ['function openProfile()','function openSettingsFromProfile(focusHousehold=false)',"$('#profileToggle').onclick=openProfile"])if(!s.app.includes(needle))fail('Stage4 Profile runtime missing: '+needle);
if(navMarkup.includes('<button data-tab="settings"'))fail('Stage4 Settings must not remain a primary nav tab');


for(const needle of ['function planlyTaskConflictIsCompletionOnly(localData,serverData)','async function adoptCompletedCloudTaskConflict(op,record)','if(await adoptCompletedCloudTaskConflict(op,err.planlyConflictRecord)){replayed++;continue}','showToast(\'Already done by \'+planlyHouseholdSentencePersonLabel(row.completed_by))'])if(!s.app.includes(needle))fail('Stage4 owner completion convergence missing: '+needle);
if(s.app.includes('function planlyPersonColour(userId)'))fail('Stage4 Part 1 must not ship premature person-colour model');
for(const needle of ["top3Limit=planlyTop3LimitFor(dayPlanRecommendations)","const limit=planlyTop3LimitFor(dayPlanRecommendations)","(planlyTop3LimitFor(dayPlanRecommendations)===2?'two':'three')","selected+'/'+planlyTop3LimitFor(dayPlanRecommendations)+' selected"])if(!s.app.includes(needle))fail('Stage4 protected-rest Top 3 UI invariant missing: '+needle);

// Stage 4 Part 1 (#111): header stays one row with 44px profile/search; Suggest 3 and compact project links keep usable sizes.
{const html=read('v2/index.html');for(const needle of ['.topbar{grid-template-columns:minmax(0,1fr) auto auto auto!important}','.topbar .searchIcon{grid-column:3!important;grid-row:1!important}','.topbar .profileIcon{grid-column:4!important;grid-row:1!important;width:44px!important;height:44px!important','.compactTaskMeta>.compactProjectLink{flex:0 1 auto;min-width:min(22vw,72px)}','.prioritySection [data-i2-suggest3]{min-height:44px}'])if(!html.includes(needle))fail('Stage 4 Part 1 layout invariant missing: '+needle);}

// Stage 4 Part 1 review #113: one Top 3 rule (2 on work / protected-rest days, else 3) for the summary, Today counter and manual star.
for(const needle of ['function planlyTop3LimitFor(rec){return (rec?.day?.isWorkDay||rec?.day?.overnightRest)?2:3}','function planlyTop3LimitForDate(key)','planlyTop3LimitForDate(t.date)','.length>=top3Limit){',"<strong>'+pins.length+'/'+top3Limit+'</strong><span>Top priorities</span>",'${pins.length}/${planlyTop3LimitFor(intel)}'])if(!generated.includes(needle))fail('Stage4 Top 3 limit surface missing: '+needle);
for(const bad of ["<strong>'+pins.length+'/3</strong>",'${pins.length}/3<','x.pinned&&!x.completed).length>=3)'])if(generated.includes(bad))fail('Stage4 hard-coded Top 3 limit remains: '+bad);
// Stage 4 Part 2 (#106 P1, #108 F1-F3/F6): meta line, Upcoming headings, status strip, Month today/shift colours, Home name prompt, slim day check, project "No tasks yet".
{const html=read('v2/index.html');for(const needle of ['<style id="planlyStage4Part2">','.compactTaskMeta .pIcon{display:inline-block!important','.upcomingDateGroup{display:block!important','.planlyStatusShield{position:fixed;left:0;right:0;top:0;height:env(safe-area-inset-top,0px);background:var(--bg);z-index:95','<div id="planlyStatusShield" class="planlyStatusShield" aria-hidden="true"></div>','.calendarShiftLabel.shiftNight','.todayDayCheck.dayCheckSlim{display:flex!important','.todayDayCheck.dayCheckSlim .dayCheckLink{min-height:44px;min-width:44px','.homeBalanceCount{display:flex!important;flex-direction:column!important','.planProjectCard .planProjectHead>.projectIntelStatus{flex:0 0 auto;display:inline-block'])if(!html.includes(needle))fail('Stage 4 Part 2 layout invariant missing: '+needle);
for(const needle of ['function planlyShiftClass(label)','class="dayCheckMain"','data-i2-snooze>Hide today','class="compactRepeat"',"x.status==='empty'?'No tasks yet'"])if(!s.app.includes(needle))fail('Stage 4 Part 2 app invariant missing: '+needle);
if(s.app.includes('data-i2-snooze>No suggestions today'))fail('Stage 4 Part 2: day check must say Hide today');
for(const needle of ['homeNamePrompt','planly-name-prompt-dismissed-v1','inChoreWeek','function r1ProjectMeta(p)'])if(!s.redesignR1.includes(needle))fail('Stage 4 Part 2 Home/Projects invariant missing: '+needle);
if(!s.calendar.includes('planlyShiftClass(sourceLabel)'))fail('Stage 4 Part 2 shift colour hook missing');
if(!s.intelligence.includes("status='empty';reasons=['No tasks yet']"))fail('Stage 4 Part 2 engine empty-project status missing');}
if((s.app.match(/isWorkDay\|\|[a-zA-Z?.]*overnightRest/g)||[]).length!==1)fail('Stage4: the 2/3 Top 3 rule must live only in planlyTop3LimitFor');

// Stage 4 Part 2 iPhone follow-up: meta line wraps whole items; a hidden day check can be shown again.
{const html=read('v2/index.html');for(const needle of ['<style id="planlyStage4Part2Fixes">','.compactTaskMeta{flex-wrap:wrap;','.compactTaskMeta>span[aria-hidden]{display:none}'])if(!html.includes(needle))fail('Stage 4 Part 2 follow-up layout invariant missing: '+needle);
for(const needle of ['data-i2-unsnooze>Show','Suggestions hidden today',"closest('[data-i2-unsnooze]')"])if(!s.app.includes(needle))fail('Stage 4 Part 2 follow-up: hidden day check must offer Show: '+needle);}
{const html=read('v2/index.html');for(const needle of ['.nav{grid-template-columns:repeat(4,minmax(0,1fr))!important}','.todayDayCheck.dayCheckSlim .dayCheckLinks>.dayCheckLink{display:inline-flex!important;flex-direction:row!important;align-items:center!important'])if(!html.includes(needle))fail('Stage 4 Part 2 follow-up layout invariant missing: '+needle);
for(const needle of ["const PLANLY_TODAY_CARDS=[['summary'","function todayCardOn(key)","todayHidden:planlyTodayHiddenList()","data-today-card=","todayCardOn('summary')","todayCardOn('deadlines')","todayCardOn('dayCheck')","todayCardOn('top3')","todayCardOn('bills')","todayCardOn('household')",'class="todayQuickActions dashboardActions"><button id="timelineBtn"'])if(!s.app.includes(needle))fail('Show on Today invariant missing: '+needle);}

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
for(const needle of ["const PLANLY_WELCOME_DISMISSED_KEY='planly-welcome-dismissed-v1'",'function planlyWelcomeSync()','id="planlyWelcomeEmail">','<span>Continue with email</span></button>','id="planlyWelcomeLater">Use without an account</button>','data-provider-slot="google"',"openSettingsPage('account')","planlyAuthChecked=true;adoptPlanlySession(data?.session||null)","if(!planlyAuthChecked||planlyWelcomeHiddenThisRun||planlySession?.user||!planlySupabase)return false"])if(!s.app.includes(needle))fail('Welcome runtime missing: '+needle);
if(!/planlyWelcomeSync\(\);\n  return \{previousOwner,nextOwner,ownerChanged,explicitSignOut\}/.test(s.app))fail('Welcome must sync on every session change');
if((s.app.match(/PLANLY_WELCOME_SLIDES=\[/g)||[]).length!==1||(s.app.match(/\['(today|home|plan)','[^']+','[^']+','<div class="wfx/g)||[]).length!==3)fail('Welcome must have exactly 3 slides');
if(/planlySupabase\.(from|rpc|auth\.(signIn|signUp))[^;]*/.test(s.app.slice(s.app.indexOf('function planlyWelcomeHtml'),s.app.indexOf('function adoptPlanlySession'))))fail('Welcome must not make network calls');}
// Part 4: Google sign-in on the welcome screen is gated by PLANLY_GOOGLE_SIGNIN (off until the Supabase provider is enabled).
{if(!read('v2/supabase-config.js').includes('window.PLANLY_GOOGLE_SIGNIN=false;'))fail('Google sign-in flag must default to false');
for(const needle of ['function planlyGoogleSignInEnabled(){return window.PLANLY_GOOGLE_SIGNIN===true}',"signInWithOAuth({provider:'google',options:{redirectTo:'https://kovacs-x.github.io/planly/v2/'","(planlyGoogleSignInEnabled()?'<button type=\"button\" class=\"wfxBtn wfxGoogle\" id=\"planlyWelcomeGoogle\""])if(!s.app.includes(needle))fail('Google welcome sign-in missing: '+needle);}
