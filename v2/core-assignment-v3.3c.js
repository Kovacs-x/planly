
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
