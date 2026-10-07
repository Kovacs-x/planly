
/* Injected by sw.js inside the main Planly app closure. No observer / second renderer. */
function planlyHouseholdCompletionEligible(t){
  if(!t||t.visibility!=='household'||t._planlyOwnedByMe!==false)return false;
  const userId=String(planlySession?.user?.id||'');
  return !!userId;
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
    html=html.replace('<span class="sharedReadOnlyMark" title="Creator-owned">View only</span>','<span class="sharedReadOnlyMark" title="Household completion allowed">Household task</span>');
    html=html.replace('sharedReadOnlyTask','sharedReadOnlyTask assignedToMeTask');
  }
  return html;
};

/* Authoritative household completion hydration. Database columns are the source
   of truth for assignment, completion actor and optimistic concurrency version. */
/* Assignment and completion metadata is hydrated by authoritative task loaders via PLANLY_TASK_SELECT. */

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
        if(!!fresh.completed===!!payload.completed){clearPlanlyPendingWrite('householdCompletion',op.id);await reconcilePlanlyCloud({render:false,replay:false}).catch(()=>{});persistPlanlyCloudCache();render();continue}
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
function stagePlanlyHouseholdSubtask(t,subtaskId,done,autoComplete=false){
  const ownerId=String(t._planlyOwnerId||''),clientId=String(t.id),id=clientId+'|'+String(subtaskId);
  const list=readPlanlyPendingWrites().filter(x=>!(x.kind==='householdSubtask'&&x.id===id&&String(x.data?.ownerId||'')===ownerId));
  list.push({kind:'householdSubtask',action:'set',id,data:{ownerId,clientId,subtaskId:String(subtaskId),done:!!done},baseVersion:Number(t._planlyCloudVersion||0),operationId:uid(),stagedAt:new Date().toISOString(),lastEditedAt:new Date().toISOString(),attempts:0,lastAttemptAt:'',lastError:'',status:'queued',...(autoComplete?{autoComplete:true}:{})});
  writePlanlyPendingWrites(list);persistPlanlyCloudCache();
}
/* The auto-complete intent rides on the queued tick (the queue survives an app restart); unticking drops it from every queued tick of that task. */
function clearPlanlyHouseholdAutoCompleteFlag(ownerId,clientId){const list=readPlanlyPendingWrites();let changed=false;for(const x of list)if(x.kind==='householdSubtask'&&x.autoComplete&&String(x.data?.clientId)===String(clientId)&&String(x.data?.ownerId||'')===String(ownerId)){delete x.autoComplete;changed=true}if(changed){writePlanlyPendingWrites(list);persistPlanlyCloudCache()}}
/* Acknowledge exactly the operation that was sent: a newer tap on the same item (same queue id, new operationId)
   made while that request was in flight must stay queued and be sent next, never cleared by the older reply. */
function settleHouseholdSubtaskOp(op){const cur=readPlanlyPendingWrites().find(x=>x.kind==='householdSubtask'&&x.id===op.id);if(cur&&cur.operationId===op.operationId)clearPlanlyPendingWrite('householdSubtask',op.id)}
function householdSubtaskTaskKey(ownerId,clientId){return String(ownerId)+'|'+String(clientId)}
/* Tasks whose last checklist item this device ticked: complete them only once the server confirms every item done. */
const planlyHouseholdAutoCompleteIntent=new Set();
/* One replay at a time; a tap during a run is picked up by that run's loop (it re-reads the queue each step). */
let planlyHouseholdSubtaskRun=null;
function replayQueuedPlanlyHouseholdSubtasks(){if(!planlyHouseholdSubtaskRun)planlyHouseholdSubtaskRun=runQueuedPlanlyHouseholdSubtasks().finally(()=>{planlyHouseholdSubtaskRun=null});return planlyHouseholdSubtaskRun}
async function runQueuedPlanlyHouseholdSubtasks(){
  if(!planlySession?.user||!navigator.onLine||!initPlanlySupabase())return;
  const sent=new Set();
  for(;;){
    const original=readPlanlyPendingWrites().find(x=>x.kind==='householdSubtask'&&x.status!=='error'&&!sent.has(x.operationId));
    if(!original)break;
    sent.add(original.operationId);
    const op=markPlanlyPendingAttempt(original)||original,p=op.data||{},key=householdSubtaskTaskKey(p.ownerId,p.clientId);
    if(op.autoComplete)planlyHouseholdAutoCompleteIntent.add(key);
    try{
      const {data,error}=await planlySupabase.rpc('planly_set_household_subtask_done',{p_owner_id:p.ownerId,p_client_id:p.clientId,p_subtask_id:p.subtaskId,p_done:!!p.done});
      if(error)throw error;
      const row=Array.isArray(data)?data[0]:data,t=state.tasks.find(x=>String(x.id)===String(p.clientId)&&String(x._planlyOwnerId||'')===String(p.ownerId));
      settleHouseholdSubtaskOp(op);
      const queued=readPlanlyPendingWrites().filter(x=>x.kind==='householdSubtask'&&x.data?.clientId===p.clientId&&String(x.data?.ownerId||'')===String(p.ownerId));
      // Server copy, with this device's still-queued intents on top.
      if(t&&row&&Array.isArray(row.subtasks)){t.subtasks=row.subtasks.map(s=>{const q=queued.find(x=>String(x.data.subtaskId)===String(s.id));return q?{...s,done:!!q.data.done}:s});t._planlyCloudVersion=Number(row.cloud_version||t._planlyCloudVersion||0)}
      // Auto-complete only on the server's confirmed state, with nothing of ours still pending for this task.
      if(planlyHouseholdAutoCompleteIntent.has(key)&&!queued.length&&row){
        planlyHouseholdAutoCompleteIntent.delete(key);
        const serverSubs=Array.isArray(row.subtasks)?row.subtasks:[];
        if(t&&state.autoCompleteParentSubtasks&&!row.completed&&serverSubs.length&&serverSubs.every(s=>s.done))planlyCompleteHouseholdTaskDirect(t);
      }
      persistPlanlyCloudCache();
    }catch(err){
      const code=String(err?.code||'');
      if(code==='42501'||code==='P0002'){planlyHouseholdAutoCompleteIntent.delete(key);settleHouseholdSubtaskOp(op);await reconcilePlanlyCloud({render:false,replay:false}).catch(()=>{});render();showToast(code==='42501'?'You can no longer tick this checklist.':'This checklist item is no longer available.');continue}
      if(isOfflineCloudError(err)){updatePlanlyPendingWrite('householdSubtask',op.id,{status:'queued',lastError:String(err?.message||err)});break}
      planlyHouseholdAutoCompleteIntent.delete(key);
      const cur=readPlanlyPendingWrites().find(x=>x.kind==='householdSubtask'&&x.id===op.id);if(cur&&cur.operationId===op.operationId)updatePlanlyPendingWrite('householdSubtask',op.id,{status:'error',lastError:String(err?.message||err)});
    }
  }
  render();
}
function toggleHouseholdTaskSubtask(t,subtaskId){
  if(!planlyHouseholdCompletionEligible(t)||!Array.isArray(t.subtasks))return;
  const s=t.subtasks.find(x=>String(x.id)===String(subtaskId));if(!s)return;
  s.done=!s.done;
  if(s.done)window.planlyHaptic?.();
  const key=householdSubtaskTaskKey(t._planlyOwnerId||'',t.id),autoComplete=!!(state.autoCompleteParentSubtasks&&s.done&&!t.completed&&t.subtasks.every(x=>x.done));
  if(!autoComplete)clearPlanlyHouseholdAutoCompleteFlag(t._planlyOwnerId||'',t.id);
  stagePlanlyHouseholdSubtask(t,s.id,s.done,autoComplete);
  if(autoComplete)planlyHouseholdAutoCompleteIntent.add(key);else planlyHouseholdAutoCompleteIntent.delete(key);
  render();
  void replayQueuedPlanlyHouseholdSubtasks().catch(()=>{});
}
const __planlyBaseReplayPendingWrites=replayPlanlyPendingWrites;
replayPlanlyPendingWrites=async function(){
  await replayQueuedPlanlyHouseholdSubtasks();
  await replayQueuedPlanlyHouseholdCompletions();
  const customKinds=new Set(['householdCompletion','householdSubtask']),custom=readPlanlyPendingWrites().filter(x=>customKinds.has(x.kind));
  if(!custom.length)return __planlyBaseReplayPendingWrites();
  writePlanlyPendingWrites(readPlanlyPendingWrites().filter(x=>!customKinds.has(x.kind)));
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
loadPlanlyHousehold=function(force=false){
  const owner=String(planlySession?.user?.id||'');
  if(!owner)return __planlyBaseLoadHousehold(force);
  if(!force&&__planlyHouseholdLoadFlight&&__planlyHouseholdLoadOwner===owner)return __planlyHouseholdLoadFlight;
  const previous=force&&__planlyHouseholdLoadFlight&&__planlyHouseholdLoadOwner===owner?__planlyHouseholdLoadFlight.catch(()=>{}):Promise.resolve();
  __planlyHouseholdLoadOwner=owner;
  const flight=previous.then(()=>__planlyBaseLoadHousehold(force));
  __planlyHouseholdLoadFlight=flight;
  return flight.finally(()=>{if(__planlyHouseholdLoadFlight===flight){__planlyHouseholdLoadFlight=null;__planlyHouseholdLoadOwner=''}});
};


/* The original sign-in renders immediately after adoptPlanlySession(). That is
   too early for household assignment state. Replace the handler so the first
   authenticated UI waits for both household identity and cloud task hydration. */
async function planlySignIn(creds){
  if(!initPlanlySupabase())throw new Error('Planly cloud service is unavailable.');
  const email=creds?String(creds.email||'').trim():$('#planlyAuthEmail')?.value.trim(),password=creds?String(creds.password||''):$('#planlyAuthPassword')?.value||'';
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
  return data.session;
}

async function planlyCompleteHouseholdTaskDirect(t){
  if(!planlyHouseholdCompletionEligible(t))return false;
  const before={completed:!!t.completed,completedBy:t.completedBy||null,completedAt:t.completedAt||null};
  const next=!before.completed,nextDate=next?planlyHouseholdNextDate(t):null;
  if(next)window.planlyHaptic?.();
  t.completed=next;t.completedBy=next?String(planlySession.user.id):null;t.completedAt=next?new Date().toISOString():null;t.updatedAt=Date.now();
  persistPlanlyCloudCache();render();
  showUndoToast(next?'Task completed':'Task reopened',()=>{
    t.completed=before.completed;t.completedBy=before.completedBy;t.completedAt=before.completedAt;t.updatedAt=Date.now();
    persistPlanlyCloudCache();render();
  },()=>{
    stagePlanlyHouseholdCompletion(t,next,nextDate);
    queuePlanlyPendingReplay(next?'Household task completed':'Household task reopened');
  });
  return true;
}
window.PlanlyCompleteHouseholdTask=planlyCompleteHouseholdTaskDirect;

document.addEventListener('click',async e=>{
  const check=e.target.closest('.check[data-household-completion="true"]');if(!check)return;
  const card=check.closest('.task[data-id][data-owner]');if(!card)return;
  const ownerId=String(card.dataset.owner||''),clientId=String(card.dataset.id||'');
  const t=state.tasks.find(x=>String(x.id)===clientId&&String(x._planlyOwnerId||'')===ownerId);
  if(!planlyHouseholdCompletionEligible(t))return;
  e.preventDefault();e.stopImmediatePropagation();
  await planlyCompleteHouseholdTaskDirect(t);
},true);
