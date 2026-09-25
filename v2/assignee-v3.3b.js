(()=>{
'use strict';
let client=null,ctx=null,hydratePromise=null,hydrateTimer=0;
function sb(){
  if(client)return client;
  const c=window.PLANLY_SUPABASE_CONFIG;
  if(!window.supabase?.createClient||!c?.url||!c?.publishableKey)return null;
  client=window.supabase.createClient(c.url,c.publishableKey,{auth:{persistSession:true,autoRefreshToken:false,detectSessionInUrl:false}});
  return client;
}
async function context(force=false){
  if(ctx&&!force)return ctx;
  const c=sb(); if(!c)return null;
  const {data:{session}={},error}=await c.auth.getSession();
  if(error||!session?.user?.id){ctx=null;return null;}
  const userId=String(session.user.id);
  const {data:membership,error:memberError}=await c.from('planly_household_members').select('household_id').eq('user_id',userId).limit(1).maybeSingle();
  if(memberError||!membership?.household_id){ctx={userId,householdId:''};return ctx;}
  ctx={userId,householdId:String(membership.household_id)};
  return ctx;
}
function cardKey(card){return String(card.dataset.owner||'')+'::'+String(card.dataset.id||'')}
async function hydrate(){
  if(hydratePromise)return hydratePromise;
  hydratePromise=(async()=>{
    const c=sb(),x=await context();
    if(!c||!x?.userId||!x.householdId)return;
    const cards=[...document.querySelectorAll('.task[data-id][data-owner]')];
    if(!cards.length)return;
    const {data:rows,error}=await c.from('planly_tasks').select('owner_id,client_id,assignee_id,completed').eq('household_id',x.householdId).eq('visibility','household').is('deleted_at',null);
    if(error){console.warn('Planly assignee card hydration failed',error);return;}
    const rowsByKey=new Map((rows||[]).map(r=>[String(r.owner_id)+'::'+String(r.client_id),r]));
    for(const card of cards){
      const row=rowsByKey.get(cardKey(card));
      if(!row)continue;
      const check=card.querySelector('.check');
      const mark=card.querySelector('.sharedReadOnlyMark');
      const mine=String(row.assignee_id||'')===x.userId && String(row.owner_id||'')!==x.userId;
      let pill=card.querySelector('.taskAssigneePill');
      if(mine){
        if(!pill){pill=document.createElement('span');pill.className='pill taskAssigneePill';card.querySelector('.meta')?.appendChild(pill);}
        pill.textContent='✓ Assigned to you';
        if(mark)mark.textContent='Assigned to you';
        if(check){check.disabled=false;check.dataset.assigneeRpc='true';check.setAttribute('aria-label',row.completed?'Mark assigned task incomplete':'Complete assigned task');}
        card.classList.add('assignedToMeTask');
      }else{
        if(pill&&pill.textContent==='✓ Assigned to you')pill.remove();
        if(mark&&mark.textContent==='Assigned to you')mark.textContent='View only';
        if(check){delete check.dataset.assigneeRpc;if(String(row.owner_id||'')!==x.userId)check.disabled=true;}
        card.classList.remove('assignedToMeTask');
      }
    }
  })().finally(()=>{hydratePromise=null});
  return hydratePromise;
}
async function toggle(card,check){
  const c=sb(),x=await context(true); if(!c||!x?.userId)return;
  const ownerId=String(card.dataset.owner||''),clientId=String(card.dataset.id||'');
  if(!ownerId||!clientId)return;
  check.disabled=true;
  const currentlyDone=card.classList.contains('done');
  const {data,error}=await c.rpc('planly_set_assigned_task_completed',{p_owner_id:ownerId,p_client_id:clientId,p_completed:!currentlyDone});
  if(error){console.warn('Planly assignee completion failed',error);alert('Planly could not update this assigned task. Please try again.');check.disabled=false;return;}
  const done=!!data?.completed;
  card.classList.toggle('done',done);
  check.textContent=done?'✓':'';
  check.setAttribute('aria-label',done?'Mark assigned task incomplete':'Complete assigned task');
  check.disabled=false;
  window.dispatchEvent(new Event('online'));
  setTimeout(()=>void hydrate(),250);
}
document.addEventListener('click',e=>{
  const check=e.target.closest('.check[data-assignee-rpc="true"]');
  if(!check)return;
  const card=check.closest('.task[data-id][data-owner]');
  if(!card)return;
  e.preventDefault();e.stopImmediatePropagation();
  void toggle(card,check);
},true);
function schedule(){clearTimeout(hydrateTimer);hydrateTimer=setTimeout(()=>void hydrate(),100)}
new MutationObserver(schedule).observe(document.documentElement,{subtree:true,childList:true});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){void context(true).then(hydrate)}});
window.addEventListener('focus',()=>void context(true).then(hydrate));
window.addEventListener('online',()=>setTimeout(()=>void context(true).then(hydrate),250));
const c=sb();
if(c)c.auth.onAuthStateChange((_event,session)=>{ctx=session?.user?null:ctx;setTimeout(()=>void context(true).then(hydrate),150)});
setTimeout(()=>void context(true).then(hydrate),350);
})();