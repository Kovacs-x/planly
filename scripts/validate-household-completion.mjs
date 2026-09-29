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
