import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8'),fail=m=>{throw new Error(m)};
const paths={app:'v2/app-v3.2.0.js',hardening:'v2/hardening-v3.3b.js',projects:'v2/core-projects-v3.3c.js',build:'v2/core-build-v3.3c.js',assignment:'v2/core-assignment-v3.3c.js',planning:'v2/core-project-planning-v3.3c.js',calendar:'v2/core-household-calendar-v3.3c.js',safety:'v2/core-household-planning-safety-v3.3c.js',closeout:'v2/core-closeout-v3.3c.js',cloud:'v2/core-cloud-readiness-v3.3d.js',gate:'v2/core-release-gate-v3.3d.js',budgetNav:'v2/core-budget-nav-v4.0b1.js',redesignR1:'v2/core-redesign-r1.js',budget:'v2/core-budget-v4.0b.js',budgetUi:'v2/core-budget-ui-v4.0b.js',budgetScope:'v2/core-budget-scope-v4.0c.js',budgetLifecycle:'v2/core-budget-lifecycle-v4.0d.js',budgetMonthly:'v2/core-budget-monthly-v4.0e.js',budgetMonthState:'v2/core-budget-month-state-v4.0f.js',budgetInsights:'v2/core-budget-insights-v4.0g.js',budgetActions:'v2/core-budget-actions-v4.0l.js',budgetScroll:'v2/core-budget-scroll-v4.0m.js',lists:'v2/core-lists-v4.1.js',dashboard:'v2/core-household-dashboard-v4.2.js',budgetReview:'v2/core-budget-review-hardening-v4.0p.js',budgetCoreGuard:'v2/core-budget-core-guard-v4.0q.js',update:'v2/core-update-v4.3.js',sw:'v2/sw.js',config:'v2/supabase-config.js'};
const s=Object.fromEntries(Object.entries(paths).map(([k,p])=>[k,read(p)])),manifest=JSON.parse(read('v2/runtime-modules.json'));
const closeIndex=s.app.lastIndexOf('})();');if(closeIndex<0)fail('Planly core injection point missing');
const core=[s.projects,s.build,s.assignment,s.planning,s.calendar,s.safety,s.closeout,s.cloud,s.gate,s.budgetNav],appended=[s.budget,s.budgetUi,s.budgetScope,s.budgetLifecycle,s.budgetMonthly,s.budgetMonthState,s.budgetInsights,s.budgetActions,s.budgetScroll,s.lists,s.dashboard,s.budgetReview,s.budgetCoreGuard,s.update];
const generated=s.app.slice(0,closeIndex)+'\n'+core.join('\n')+'\n'+s.app.slice(closeIndex)+'\n;'+s.hardening+'\n;'+appended.join('\n;');
for(const [name,source] of [...Object.entries(s),['generated',generated]])try{new Function(source)}catch(err){fail(name+' does not parse: '+err.message)}
for(const source of [generated,s.sw,s.config]){if(source.includes('$$$'))fail('Found $$$ regression');const bad=(source.match(/(^|[^$])\$\([^)]*\)\.forEach/g)||[]).filter(x=>!x.includes('$$('));if(bad.length)fail('Found accidental $().forEach')}
for(const needle of ["$$('.nav button').forEach","$$('#quickDates .chip').forEach","$$('[data-planly-calendar-refresh]').forEach","$$('[data-planly-calendar-remove]').forEach","$$('[data-planly-calendar-toggle]').forEach","$$('[data-planly-calendar-colour]').forEach"])if(!generated.includes(needle))fail('Missing collection handler: '+needle);
for(const needle of ['function todayView','function upcomingView','function settingsView','function openSheet','function completeTaskWithUndo','function reconcilePlanlyCloud','PLANLY_HOUSEHOLD_EXTERNAL_CALENDAR_SHARING=false','function planlyMonthTasksForDate','function planlyMonthExternalForDate','commitPlanDay=function()','function planly33dReleaseGateAudit','window.PlanlyBudget','window.PlanlyLists','window.PlanlyHouseholdDashboard','window.PlanlyUpdate'])if(!generated.includes(needle))fail('Missing critical runtime function: '+needle);
for(const needle of ['data-budget-scope="personal"','data-budget-scope="household"','PlanlyBudgetActions.mutate','Coming up','Unplanned','persistedEntryUpdate','persistedDelete','persistedCategoryUpdate','classifyZero','readPreference(owner)',"api.switchScope('household')",'api.__legacyMutationGuard','scrollTopNow','planly:budget-ui-rendered','Left to plan','Coming up','Money in'])if(!generated.includes(needle))fail('Missing Budget review invariant: '+needle);
if(s.budgetLifecycle.includes('decorateCategory(')||s.budgetLifecycle.includes('data-life-quick-delete'))fail('Legacy index-mapped expense action owner remains active');
const cache=s.sw.match(/const CACHE='([^']+)'/)?.[1],version=s.sw.match(/const VERSION='([^']+)'/)?.[1];if(!cache||!version)fail('Service worker cache/version markers missing');
for(const module of manifest.modules||[])if(!s.sw.includes(module))fail('Service worker missing runtime manifest module marker: '+module);
for(const needle of ["const RUNTIME_MANIFEST_URL='./runtime-modules.json'",'BUDGET_REVIEW_URL','BUDGET_CORE_GUARD_URL','UPDATE_RUNTIME_URL','await self.clients.claim()','FETCH_TIMEOUT=8000','AbortController','results.some(ok=>!ok)','await caches.delete(CACHE)'])if(!s.sw.includes(needle))fail('Missing service-worker/runtime marker: '+needle);
for(const needle of ['runtime-modules.json','__planly_sw_probe__','window.verifyPlanlyOfflineCache','window.probePlanlyServiceWorker'])if(!s.budgetCoreGuard.includes(needle))fail('Offline verifier override missing: '+needle);
for(const needle of ['runtime-modules.json','planlyKeys','probePlanlyServiceWorker','/^planly-v2-sw-'])if(!s.build.includes(needle))fail('N16 offline readiness fix missing: '+needle);
for(const needle of ['controllerchange','Planly update ready','SKIP_WAITING','editing()','reg.update()'])if(!s.update.includes(needle))fail('Safe update coordinator invariant missing: '+needle);
if(s.budgetCoreGuard.includes("const CACHE='planly-v2-")||s.budgetCoreGuard.includes("SW='planly-v2-sw-"))fail('Core guard hard-codes release cache/version markers');
if(s.sw.includes('client.navigate(client.url)'))fail('Unsafe unconditional activation-time navigation present');
if(/Date\.prototype\.(?:toISOString|valueOf|getTime)\s*=/.test(generated))fail('Unsafe Date monkeypatch in final runtime');
if(/service_role|sb_secret_/i.test(appended.join('\n')+s.config))fail('Privileged credential marker in browser runtime');
console.log(`Planly FINAL generated runtime regression checks passed (${cache} / ${version}).`);

const runtimeClientFiles=['v2/app-v3.2.0.js','v2/core-budget-v4.0b.js','v2/core-budget-actions-v4.0l.js','v2/core-budget-monthly-v4.0e.js','v2/core-lists-v4.1.js','v2/core-household-dashboard-v4.2.js','v2/hardening-v3.3b.js'];
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
if(!s.sw.includes("const CORE_REDESIGN_R1_URL='./core-redesign-r1.js?v=500r104'"))fail('R1 core runtime missing from service worker');
if(!s.sw.includes("const CACHE='planly-v2-430f-26'"))fail('R1 cache marker mismatch');

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
for(const needle of ['data-budget-category-icon',"PlanlyBudgetActions.mutate('category',row.id,{icon_key:icon})",'--budgetToPay,#A15C07'])if(!r3BudgetUi.includes(needle))fail('R3 Budget review follow-up missing: '+needle);
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
for(const needle of ["async function refreshTodayBills()","getTodayBills:()=>structuredClone(todayBills)",".eq('show_on_today',true)",".neq('allocation_status','paid')","planly:foreground-resume","planly:household-remote-change"])if(!s.budget.includes(needle))fail('R4 fresh Today bills invariant missing: '+needle);
for(const needle of ["async function mutateTodayEntry(id,expectedVersion,patch)","eq('cloud_version',version)"])if(!read('v2/core-budget-actions-v4.0l.js').includes(needle))fail('R4 Today mutation invariant missing: '+needle);
for(const needle of ["id=\"allocShowToday\"","id=\"editPaymentShowToday\"","entryDate:due?"])if(!r3BudgetUi.includes(needle))fail('R4 Budget form invariant missing: '+needle);

for(const needle of ['homeCardMain','homeScopeTag household',"?'household':'personal'"])if(!r1.includes(needle))fail('R4 Home list/project meta invariant missing: '+needle);
for(const needle of ['.homeCardMain{display:grid;gap:3px;min-width:0}', '.homeCardMain strong{display:block;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}', '.homeScopeTag.household{background:var(--homeTint);color:var(--home)}'])if(!r1Html.includes(needle))fail('R4 Home list/project layout invariant missing: '+needle);
