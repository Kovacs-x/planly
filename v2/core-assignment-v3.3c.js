
/* Injected by sw.js inside the main Planly app closure. No observer / second renderer. */
const __planlyBaseTaskHtml=taskHtml;
taskHtml=function(t,top3Mode=false){
  let html=__planlyBaseTaskHtml(t,top3Mode);
  const userId=String(planlySession?.user?.id||'');
  const assignedToMe=t?.visibility==='household'&&t?._planlyOwnedByMe===false&&!!userId&&String(t.assigneeId||'')===userId;
  if(!assignedToMe)return html;
  html=html.replace('class="check" disabled aria-label="Shared task status"','class="check" data-assignee-core="true" aria-label="'+(t.completed?'Mark assigned task incomplete':'Complete assigned task')+'"');
  html=html.replace('<span class="pill householdTaskPill">⌂ Household</span>','<span class="pill householdTaskPill">⌂ Household</span><span class="pill taskAssigneePill">✓ Assigned to you</span>');
  html=html.replace('<span class="sharedReadOnlyMark" title="Creator-owned">View only</span>','<span class="sharedReadOnlyMark" title="Assigned task">Assigned to you</span>');
  html=html.replace('sharedReadOnlyTask','sharedReadOnlyTask assignedToMeTask');
  return html;
};

/* Authoritative assignment hydration. The DB column is the source of truth and
   is merged into the runtime task before the bootstrap promise resolves. */
const __planlyBaseLoadVerifiedCloudPreview=loadVerifiedCloudPreview;
loadVerifiedCloudPreview=async function(){
  const loaded=await __planlyBaseLoadVerifiedCloudPreview();
  if(!loaded||!planlySession?.user||!initPlanlySupabase())return loaded;
  const incoming=state.tasks.filter(t=>t&&t.visibility==='household'&&t._planlyOwnedByMe===false&&t.id&&t._planlyOwnerId);
  if(!incoming.length)return loaded;
  const owners=[...new Set(incoming.map(t=>String(t._planlyOwnerId)).filter(Boolean))];
  const ids=[...new Set(incoming.map(t=>String(t.id)).filter(Boolean))];
  const {data:rows,error}=await planlySupabase.from('planly_tasks')
    .select('owner_id,client_id,assignee_id')
    .eq('visibility','household')
    .is('deleted_at',null)
    .in('owner_id',owners)
    .in('client_id',ids);
  if(error)throw error;
  const byKey=new Map((rows||[]).map(r=>[String(r.owner_id)+'|'+String(r.client_id),r.assignee_id?String(r.assignee_id):'']));
  for(const task of incoming){
    const key=String(task._planlyOwnerId)+'|'+String(task.id);
    if(!byKey.has(key))continue;
    const assigneeId=byKey.get(key);
    if(assigneeId)task.assigneeId=assigneeId;else delete task.assigneeId;
  }
  persistPlanlyCloudCache();
  return loaded;
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
  const check=e.target.closest('.check[data-assignee-core="true"]');
  if(!check)return;
  const card=check.closest('.task[data-id][data-owner]');
  if(!card)return;
  const userId=String(planlySession?.user?.id||'');
  const ownerId=String(card.dataset.owner||'');
  const clientId=String(card.dataset.id||'');
  const t=state.tasks.find(x=>String(x.id)===clientId&&String(x._planlyOwnerId||'')===ownerId);
  if(!t||t._planlyOwnedByMe!==false||String(t.assigneeId||'')!==userId)return;
  e.preventDefault();e.stopImmediatePropagation();
  check.disabled=true;
  try{
    if(!initPlanlySupabase())throw new Error('Planly cloud service is unavailable.');
    const next=!t.completed;
    const {data,error}=await planlySupabase.rpc('planly_set_assigned_task_completed',{p_owner_id:ownerId,p_client_id:clientId,p_completed:next});
    if(error)throw error;
    t.completed=typeof data?.completed==='boolean'?data.completed:next;
    t.updatedAt=Date.now();
    persistPlanlyCloudCache();
    render();
  }catch(err){
    console.warn('Planly assigned task completion failed',err);
    alert('Planly could not update this assigned task. Please try again.');
    check.disabled=false;
  }
},true);
