import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const sql=read('supabase/migrations/042_household_task_completion.sql');
const assignment=read('v2/core-assignment-v3.3c.js');
const app=read('v2/app-v3.2.0.js');
const fail=m=>{console.error('Household completion gate failed: '+m);process.exit(1)};
for(const n of [
  'completed_by uuid null references auth.users(id) on delete set null',
  'completed_at timestamptz null',
  'planly_tasks_live_series_occurrence_key',
  'planly_private.set_household_task_completed',
  'security definer',
  'set search_path = pg_catalog, public',
  "raise exception 'Task not found' using errcode = 'P0002'",
  "raise exception 'Task changed elsewhere' using errcode = 'P0409'",
  'if v_task.completed is not distinct from p_completed then return v_task; end if;',
  'on conflict (owner_id, series_client_id, task_date)',
  'do nothing;',
  'v_create_next boolean := false;',
  'if v_create_next then',
  'v_create_next := false;',
  'planly_stamp_task_completion_actor',
  'new.completed_by := auth.uid()',
  'new.completed_by := old.completed_by'
])if(!sql.includes(n))fail('missing SQL invariant: '+n);
if(/drop policy|create policy/i.test(sql))fail('B2 must not widen task RLS policies');
if(/set\s+cloud_version\s*=/i.test(sql))fail('RPC must rely on bump trigger for cloud_version');
for(const n of [
  'planlyHouseholdCompletionEligible',
  'planlyHouseholdNextDate',
  "kind:'householdCompletion'",
  "planly_set_household_task_completed",
  "code==='P0409'",
  "const retry={...op,baseVersion:Number(fresh._planlyCloudVersion||0)",
  "planlyHouseholdNextDate(fresh)",
  "nextDateFrom:t.date||null",
  "code==='42501'",
  'planly_tasks_live_series_occurrence_key',
  'showUndoToast',
  "Done by '+esc(label)"
])if(!assignment.includes(n))fail('missing client invariant: '+n);
if(!app.includes('completed_by,completed_at,cloud_version'))fail('cloud hydration does not fetch completion metadata');
if(!app.includes('_planlyCloudVersion:Number(row.cloud_version||0)'))fail('cloud version is not hydrated onto tasks');
console.log('Household collaborative completion static gates passed.');

if(sql.includes("raise exception 'Recurring series has ended'"))fail('terminal series must complete without raising');
if(!assignment.includes("if(!!fresh.completed===!!payload.completed)"))fail('stale retry must accept already-satisfied completion intent');
if(!assignment.includes("if(!planlyHouseholdCompletionEligible(fresh))"))fail('stale retry must re-check eligibility');

const taskSelectFiles=['v2/app-v3.2.0.js','v2/core-projects-v3.3c.js','v2/core-cloud-readiness-v3.3d.js','v2/core-assignment-v3.3c.js'];
for(const file of taskSelectFiles){
  const src=read(file);
  for(const match of src.matchAll(/from\(['"]planly_tasks['"]\)\.select\(([^)]*)\)/g)){
    const expr=match[1];
    if(expr.includes('owner_id,client_id,data,visibility,household_id')&&!expr.includes('PLANLY_TASK_SELECT')&&!expr.includes('completed_by'))fail(file+' authoritative task select omits completed_by');
  }
}
const appSource=read('v2/app-v3.2.0.js');
if(!appSource.includes("const PLANLY_TASK_SELECT='owner_id,client_id,data,visibility,household_id,assignee_id,completed_by,completed_at,cloud_version,deleted_at'"))fail('shared PLANLY_TASK_SELECT missing attribution columns');
const assignmentSource=read('v2/core-assignment-v3.3c.js');
if(assignmentSource.includes(".select('owner_id,client_id,assignee_id,completed_by,completed_at,cloud_version')"))fail('redundant attribution hydration query returned');

const schemaAllowed={
  planly_tasks:new Set('owner_id client_id data visibility household_id assignee_id completed_by completed_at cloud_version deleted_at'.split(' ')),
  planly_projects:new Set('owner_id client_id data visibility household_id cloud_version deleted_at'.split(' '))
};
const selectConstants={PLANLY_TASK_SELECT:'owner_id,client_id,data,visibility,household_id,assignee_id,completed_by,completed_at,cloud_version,deleted_at',PLANLY_PROJECT_SELECT:'owner_id,client_id,data,visibility,household_id,cloud_version,deleted_at'};
for(const file of ['v2/app-v3.2.0.js','v2/core-projects-v3.3c.js','v2/core-cloud-readiness-v3.3d.js','v2/core-assignment-v3.3c.js']){
  const src=read(file);
  for(const m of src.matchAll(/from\(['"]([^'"]+)['"]\)\.select\(([^)]*)\)/g)){
    const allowed=schemaAllowed[m[1]];if(!allowed)continue;
    let expr=m[2].trim(),select='';
    if((expr.startsWith("'")&&expr.endsWith("'"))||(expr.startsWith('"')&&expr.endsWith('"')))select=expr.slice(1,-1);
    else select=selectConstants[expr]||'';
    if(!select)continue;
    for(const raw of select.split(',')){const col=raw.trim().split(/[:(]/)[0].trim();if(col&&col!=='*'&&!allowed.has(col))fail(file+' selects invalid '+m[1]+' column '+col);}
  }
}
if(!read('v2/core-projects-v3.3c.js').includes("from('planly_projects').select(PLANLY_PROJECT_SELECT)"))fail('core-projects must use PLANLY_PROJECT_SELECT');

const hardening=read('v2/hardening-v3.3b.js');
if(/new MutationObserver\([\s\S]*hydrateIncomingAssignments/.test(hardening))fail('assignment hydration must not be driven by MutationObserver');
if(!hardening.includes('ASSIGNMENT_CONTEXT_TTL_MS=60000'))fail('assignment context TTL cache missing');
if(!hardening.includes("window.addEventListener('planly:household-ready'"))fail('household-ready assignment context invalidation missing');
if(hardening.includes("if(!assigneeId){if(existing)existing.remove()}"))fail('hardening must not remove B2 unassigned task pill');

const hardeningPhase3=read('v2/hardening-v3.3b.js');
if(hardeningPhase3.includes("dispatchEvent(new Event('online'))"))fail('assignment sync must not dispatch synthetic online events');
if(!hardeningPhase3.includes("if(userId===authUserId)return"))fail('assignment auth sync must ignore repeated same-user auth events');
if(hardeningPhase3.includes("loadAssignmentContext(true).then(()=>{kickHouseholdSync()"))fail('same-user auth path must not force assignment context reload');
if(!read('v2/app-v3.2.0.js').includes("new CustomEvent('planly:household-ready'"))fail('household-ready must be dispatched after household load');

const hardeningRealtime=read('v2/hardening-v3.3b.js');
if(!hardeningRealtime.includes("householdReconcileTimer=setTimeout(()=>{if(typeof reconcilePlanlyCloud==='function')void reconcilePlanlyCloud({render:true}).catch(()=>{})},400)"))fail('household broadcast must directly debounce task reconciliation');
if(!hardeningRealtime.includes("householdId===assignmentContext.householdId&&assignmentContextLoadedAt"))fail('unchanged household-ready events must not force assignment reload');
