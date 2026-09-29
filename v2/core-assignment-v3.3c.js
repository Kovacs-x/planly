
/* Injected by sw.js inside the main Planly app closure. No observer / second renderer. */
function planlyHouseholdCompletionEligible(t){
  if(!t||t.visibility!=='household'||t._planlyOwnedByMe!==false)return false;
  const userId=String(planlySession?.user?.id||'');
  return !!userId&&(!t.assigneeId||String(t.assigneeId)===userId);
}
function planlyCompletionActorLabel(userId){
  const id=String(userId||'');if(!id)return '';
  if(id===String(planlySession?.user?.id||''))return 'you';
  const member=planlyHouseholdMembers.find(m=>String(m.user_id||'')===id);
  return member?planlyHouseholdMemberLabel(member):'household member';
}
function planlyHouseholdNextDate(t){
  if(!t?.date||!t.recurrence||t.recurrence==='none')return null;
  const cfg=recurrenceConfigForTask(t);if(!cfg)return null;
  const current=Number(t.occurrenceNumber||1);
  if(cfg.endMode==='count'&&current>=Number(cfg.maxOccurrences||0))return null;
  const next=nextOccurrence(t.date,t.recurrence,cfg);if(!next)return null;
  if(cfg.endMode==='date'&&cfg.endDate&&next>cfg.endDate)return null;
  return next;
}
const __planlyBaseTaskHtml=taskHtml;
taskHtml=function(t,top3Mode=false){
  let html=__planlyBaseTaskHtml(t,top3Mode);
  const eligible=planlyHouseholdCompletionEligible(t);
  if(eligible){
    html=html.replace('class="check" disabled aria-label="Shared task status"','class="check" data-household-completion="true" aria-label="'+(t.completed?'Mark household task incomplete':'Complete household task')+'"');
    const assignment=t.assigneeId?'✓ Assigned to you':'✓ Anyone can complete';
    html=html.replace('<span class="pill householdTaskPill">⌂ Household</span>','<span class="pill householdTaskPill">⌂ Household</span><span class="pill taskAssigneePill">'+assignment+'</span>');
    html=html.replace('<span class="sharedReadOnlyMark" title="Creator-owned">View only</span>','<span class="sharedReadOnlyMark" title="Household completion allowed">Household task</span>');
    html=html.replace('sharedReadOnlyTask','sharedReadOnlyTask assignedToMeTask');
  }
  if(t?.visibility==='household'&&t.completed&&t.completedBy){
    const label=planlyCompletionActorLabel(t.completedBy);
    html=html.replace('<span class="pill householdTaskPill">⌂ Household</span>','<span class="pill householdTaskPill">⌂ Household</span><span class="pill taskCompletionActorPill">Done by '+esc(label)+'</span>');
  }
  return html;
};

/* Authoritative household completion hydration. Database columns are the source
   of truth for assignment, completion actor and optimistic concurrency version. */
const __planlyBaseLoadVerifiedCloudPreview=loadVerifiedCloudPreview;
loadVerifiedCloudPreview=async function(){
  const loaded=await __planlyBaseLoadVerifiedCloudPreview();
  if(!loaded||!planlySession?.user||!initPlanlySupabase())return loaded;
  const ownerId=String(planlySession.user.id||'');
  const {data:syncState,error:syncStateError}=await planlySupabase.from('planly_sync_state')
    .select('initial_migration_completed_at')
    .eq('owner_id',ownerId)
    .maybeSingle();
  if(syncStateError)throw syncStateError;
  if(syncState?.initial_migration_completed_at){
    planlyCloudReadOnly=false;
    const status=planlyCloudLocalStatus();
    setPlanlyCloudLocalStatus({...status,state:'cloud-write-test',pendingWrites:readPlanlyPendingWrites().length});
  }
  const householdTasks=state.tasks.filter(t=>t&&t.visibility==='household'&&t.id&&(t._planlyOwnerId||ownerId));
  if(!householdTasks.length){persistPlanlyCloudCache();return loaded;}
  const owners=[...new Set(householdTasks.map(t=>String(t._planlyOwnerId||ownerId)).filter(Boolean))];
  const ids=[...new Set(householdTasks.map(t=>String(t.id)).filter(Boolean))];
  const {data:rows,error}=await planlySupabase.from('planly_tasks')
    .select('owner_id,client_id,assignee_id,completed_by,completed_at,cloud_version')
    .eq('visibility','household').is('deleted_at',null).in('owner_id',owners).in('client_id',ids);
  if(error)throw error;
  const byKey=new Map((rows||[]).map(r=>[String(r.owner_id)+'|'+String(r.client_id),r]));
  for(const task of householdTasks){
    const row=byKey.get(String(task._planlyOwnerId||ownerId)+'|'+String(task.id));if(!row)continue;
    if(row.assignee_id)task.assigneeId=String(row.assignee_id);else delete task.assigneeId;
    task.completedBy=row.completed_by?String(row.completed_by):null;
    task.completedAt=row.completed_at||null;
    task._planlyCloudVersion=Number(row.cloud_version||0);
  }
  persistPlanlyCloudCache();
  return loaded;
};

function stagePlanlyHouseholdCompletion(t,next,nextDate){
  const id=String(t.id),ownerId=String(t._planlyOwnerId||''),baseVersion=Number(t._planlyCloudVersion||0);
  const current=readPlanlyPendingWrites(),list=current.filter(x=>!(x.kind==='householdCompletion'&&x.id===id&&String(x.data?.ownerId||'')===ownerId));
  list.push({kind:'householdCompletion',action:'complete',id,data:{ownerId,clientId:id,completed:!!next,nextDate:nextDate||null,nextDateFrom:t.date||null},baseVersion,operationId:uid(),stagedAt:new Date().toISOString(),lastEditedAt:new Date().toISOString(),attempts:0,lastAttemptAt:'',lastError:'',status:'queued'});
  writePlanlyPendingWrites(list);persistPlanlyCloudCache();
}
async function executePlanlyHouseholdCompletion(op){
  const payload=op.data||{};
  const {data,error}=await planlySupabase.rpc('planly_set_household_task_completed',{
    p_owner_id:payload.ownerId,p_client_id:payload.clientId,p_completed:!!payload.completed,
    p_expected_cloud_version:Number(op.baseVersion||0),p_next_date:payload.nextDate||null
  });
  if(error)throw error;
  const row=Array.isArray(data)?data[0]:data;
  const t=state.tasks.find(x=>String(x.id)===String(payload.clientId)&&String(x._planlyOwnerId||'')===String(payload.ownerId));
  if(t&&row){
    t.completed=!!row.completed;t.completedBy=row.completed_by?String(row.completed_by):null;t.completedAt=row.completed_at||null;
    t._planlyCloudVersion=Number(row.cloud_version||t._planlyCloudVersion||0);
  }
  clearPlanlyPendingWrite('householdCompletion',op.id);
  await reconcilePlanlyCloud({render:false,replay:false}).catch(()=>{});
  persistPlanlyCloudCache();render();
  return row;
}
async function replayQueuedPlanlyHouseholdCompletions(){
  if(!planlySession?.user||!navigator.onLine||!initPlanlySupabase())return;
  const ops=readPlanlyPendingWrites().filter(x=>x.kind==='householdCompletion');
  for(const original of ops){
    const op=markPlanlyPendingAttempt(original)||original;
    try{await executePlanlyHouseholdCompletion(op)}
    catch(err){
      const code=String(err?.code||'');
      if(code==='P0409'){
        await reconcilePlanlyCloud({render:false,replay:false}).catch(()=>{});
        const payload=op.data||{},fresh=state.tasks.find(x=>String(x.id)===String(payload.clientId)&&String(x._planlyOwnerId||'')===String(payload.ownerId));
        if(!fresh){clearPlanlyPendingWrite('householdCompletion',op.id);render();showToast('This household task is no longer available.');continue}
        if(!!fresh.completed===!!payload.completed){clearPlanlyPendingWrite('householdCompletion',op.id);persistPlanlyCloudCache();render();continue}
        if(!planlyHouseholdCompletionEligible(fresh)){clearPlanlyPendingWrite('householdCompletion',op.id);render();showToast('This household task can no longer be completed by you.');continue}
        const retryNextDate=payload.completed
          ?(String(fresh.date||'')===String(payload.nextDateFrom||'')?(payload.nextDate||null):planlyHouseholdNextDate(fresh))
          :null;
        const retry={...op,baseVersion:Number(fresh._planlyCloudVersion||0),data:{...payload,nextDate:retryNextDate,nextDateFrom:fresh.date||null}};
        updatePlanlyPendingWrite('householdCompletion',op.id,{baseVersion:retry.baseVersion,data:retry.data,status:'queued',lastError:''});
        try{await executePlanlyHouseholdCompletion(retry)}
        catch(retryErr){
          const retryCode=String(retryErr?.code||'');
          if(retryCode==='42501'||retryCode==='P0002'){
            clearPlanlyPendingWrite('householdCompletion',op.id);
            await reconcilePlanlyCloud({render:false,replay:false}).catch(()=>{});render();
            showToast(retryCode==='42501'?'This household task can no longer be completed by you.':'This household task is no longer available.');
            continue;
          }
          if(isOfflineCloudError(retryErr)){updatePlanlyPendingWrite('householdCompletion',op.id,{status:'queued',lastError:String(retryErr?.message||retryErr)});break}
          updatePlanlyPendingWrite('householdCompletion',op.id,{status:'error',lastError:String(retryErr?.message||retryErr)});
        }
        continue;
      }
      if(code==='42501'||code==='P0002'){
        clearPlanlyPendingWrite('householdCompletion',op.id);
        await reconcilePlanlyCloud({render:false,replay:false}).catch(()=>{});render();
        showToast(code==='42501'?'This household task can no longer be completed by you.':'This household task is no longer available.');
        continue;
      }
      if(isOfflineCloudError(err)){updatePlanlyPendingWrite('householdCompletion',op.id,{status:'queued',lastError:String(err?.message||err)});break}
      updatePlanlyPendingWrite('householdCompletion',op.id,{status:'error',lastError:String(err?.message||err)});
    }
  }
}
const __planlyBaseReplayPendingWrites=replayPlanlyPendingWrites;
replayPlanlyPendingWrites=async function(){
  await replayQueuedPlanlyHouseholdCompletions();
  const custom=readPlanlyPendingWrites().filter(x=>x.kind==='householdCompletion');
  if(!custom.length)return __planlyBaseReplayPendingWrites();
  writePlanlyPendingWrites(readPlanlyPendingWrites().filter(x=>x.kind!=='householdCompletion'));
  try{return await __planlyBaseReplayPendingWrites()}
  finally{
    const basePending=readPlanlyPendingWrites();
    writePlanlyPendingWrites([...basePending,...custom.filter(op=>!basePending.some(x=>x.kind===op.kind&&x.id===op.id))]);
    persistPlanlyCloudCache();
  }
};

/* A partner RPC can create the same next series occurrence before an owner's
   offline insert replays. The unique series/date key makes that duplicate benign. */
const __planlyBaseCloudInsertTask=cloudInsertTask;
cloudInsertTask=async function(t,replay=false){
  try{return await __planlyBaseCloudInsertTask(t,replay)}
  catch(err){
    if(String(err?.code||'')==='23505'&&String(err?.message||'').includes('planly_tasks_live_series_occurrence_key')){
      clearPlanlyPendingWrite('task',String(t?.id||''));
      await reconcilePlanlyCloud({render:false,replay:false}).catch(()=>{});
      render();return null;
    }
    throw err;
  }
};

/* Supabase may emit SIGNED_IN while signInWithPassword is still resolving.
   Both paths used to start household/cloud reads independently. Share each
   authenticated bootstrap read per account so both callers await the same work. */
const __planlyBaseLoadHousehold=loadPlanlyHousehold;
let __planlyHouseholdLoadFlight=null,__planlyHouseholdLoadOwner='';
loadPlanlyHousehold=function(){
  const owner=String(planlySession?.user?.id||'');
  if(!owner)return __planlyBaseLoadHousehold();
  if(__planlyHouseholdLoadFlight&&__planlyHouseholdLoadOwner===owner)return __planlyHouseholdLoadFlight;
  __planlyHouseholdLoadOwner=owner;
  const flight=Promise.resolve().then(()=>__planlyBaseLoadHousehold());
  __planlyHouseholdLoadFlight=flight;
  return flight.finally(()=>{if(__planlyHouseholdLoadFlight===flight){__planlyHouseholdLoadFlight=null;__planlyHouseholdLoadOwner=''}});
};
const __planlyAssignedLoadVerifiedCloudPreview=loadVerifiedCloudPreview;
let __planlyCloudLoadFlight=null,__planlyCloudLoadOwner='';
loadVerifiedCloudPreview=function(){
  const owner=String(planlySession?.user?.id||'');
  if(!owner)return __planlyAssignedLoadVerifiedCloudPreview();
  if(__planlyCloudLoadFlight&&__planlyCloudLoadOwner===owner)return __planlyCloudLoadFlight;
  __planlyCloudLoadOwner=owner;
  const flight=Promise.resolve().then(()=>__planlyAssignedLoadVerifiedCloudPreview());
  __planlyCloudLoadFlight=flight;
  return flight.finally(()=>{if(__planlyCloudLoadFlight===flight){__planlyCloudLoadFlight=null;__planlyCloudLoadOwner=''}});
};

/* The original sign-in renders immediately after adoptPlanlySession(). That is
   too early for household assignment state. Replace the handler so the first
   authenticated UI waits for both household identity and cloud task hydration. */
planlySignIn=async function(){
  if(!initPlanlySupabase())throw new Error('Planly cloud service is unavailable.');
  const email=$('#planlyAuthEmail')?.value.trim(),password=$('#planlyAuthPassword')?.value||'';
  if(!email||!password)throw new Error('Enter your email and password.');
  const {data,error}=await planlySupabase.auth.signInWithPassword({email,password});
  if(error)throw error;
  adoptPlanlySession(data.session);
  try{
    await loadPlanlyHousehold();
    await loadVerifiedCloudPreview();
  }catch(err){
    console.warn('Planly authenticated bootstrap failed',err);
    throw err;
  }
  showToast('Signed in to Planly');
  render();
};

document.addEventListener('click',async e=>{
  const check=e.target.closest('.check[data-household-completion="true"]');if(!check)return;
  const card=check.closest('.task[data-id][data-owner]');if(!card)return;
  const ownerId=String(card.dataset.owner||''),clientId=String(card.dataset.id||'');
  const t=state.tasks.find(x=>String(x.id)===clientId&&String(x._planlyOwnerId||'')===ownerId);
  if(!planlyHouseholdCompletionEligible(t))return;
  e.preventDefault();e.stopImmediatePropagation();
  const before={completed:!!t.completed,completedBy:t.completedBy||null,completedAt:t.completedAt||null};
  const next=!before.completed,nextDate=next?planlyHouseholdNextDate(t):null;
  t.completed=next;t.completedBy=next?String(planlySession.user.id):null;t.completedAt=next?new Date().toISOString():null;t.updatedAt=Date.now();
  persistPlanlyCloudCache();render();
  showUndoToast(next?'Task completed':'Task reopened',()=>{
    t.completed=before.completed;t.completedBy=before.completedBy;t.completedAt=before.completedAt;t.updatedAt=Date.now();
    persistPlanlyCloudCache();render();
  },()=>{
    stagePlanlyHouseholdCompletion(t,next,nextDate);
    queuePlanlyPendingReplay(next?'Household task completed':'Household task reopened');
  });
},true);
