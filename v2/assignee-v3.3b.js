(()=>{
'use strict';
let client=null,ctx=null,hydratePromise=null,hydrateTimer=0;
const rowsByKey=new Map();
let rowsReady=false;
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
  const previousUser=String(ctx?.userId||'');
  const {data:{session}={},error}=await c.auth.getSession();
  if(error||!session?.user?.id){ctx=null;rowsByKey.clear();rowsReady=false;return null;}
  const userId=String(session.user.id);
  if(previousUser&&previousUser!==userId){rowsByKey.clear();rowsReady=false;}
  const {data:membership,error:memberError}=await c.from('planly_household_members').select('household_id').eq('user_id',userId).limit(1).maybeSingle();
  if(memberError||!membership?.household_id){ctx={userId,householdId:''};rowsByKey.clear();rowsReady=true;return ctx;}
  ctx={userId,householdId:String(membership.household_id)};
  return ctx;
}
function cardKey(card){return String(card.dataset.owner||'')+'::'+String(card.dataset.id||'')}
function markPending(card,x){
  if(!x?.userId||rowsReady)return;
  const owner=String(card.dataset.owner||'');
  if(!owner||owner===x.userId)return;
  const mark=card.querySelector('.sharedReadOnlyMark');
  if(mark&&mark.textContent==='View only')mark.textContent='Checking assignment…';
}
function applyRow(card,row,x){
  if(!row||!x?.userId)return;
  const check=card.querySelector('.check');
  const mark=card.querySelector('.sharedReadOnlyMark');
  const mine=String(row.assignee_id||'')===x.userId&&String(row.owner_id||'')!==x.userId;
  let pill=card.querySelector('.taskAssigneePill');
  if(mine){
    if(!pill){pill=document.createElement('span');pill.className='pill taskAssigneePill';card.querySelector('.meta')?.appendChild(pill);}
    pill.textContent='✓ Assigned to you';
    if(mark)mark.textContent='Assigned to you';
    if(check){check.disabled=false;check.dataset.assigneeRpc='true';check.setAttribute('aria-label',row.completed?'Mark assigned task incomplete':'Complete assigned task');}
    card.classList.add('assignedToMeTask');
  }else{
    if(pill&&pill.textContent==='✓ Assigned to you')pill.remove();
    if(mark&&(mark.textContent==='Assigned to you'||mark.textContent==='Checking assignment…'))mark.textContent='View only';
    if(check){delete check.dataset.assigneeRpc;if(String(row.owner_id||'')!==x.userId)check.disabled=true;}
    card.classList.remove('assignedToMeTask');
  }
}
function applyCached(){
  const x=ctx;
  if(!x?.userId)return;
  for(const card of document.querySelectorAll('.task[data-id][data-owner]')){
    const row=rowsByKey.get(cardKey(card));
    if(row)applyRow(card,row,x);else markPending(card,x);
  }
}
async function hydrate(){
  if(hydratePromise)return hydratePromise;
  hydratePromise=(async()=>{
    const c=sb(),x=await context();
    if(!c||!x?.userId||!x.householdId){rowsReady=true;applyCached();return;}
    const cards=[...document.querySelectorAll('.task[data-id][data-owner]')];
    if(!cards.length)return;
    applyCached();
    const {data:rows,error}=await c.from('planly_tasks').select('owner_id,client_id,assignee_id,completed').eq('household_id',x.householdId).eq('visibility','household').is('deleted_at',null);
    if(error){console.warn('Planly assignee card hydration failed',error);return;}
    rowsByKey.clear();
    for(const row of rows||[])rowsByKey.set(String(row.owner_id)+'::'+String(row.client_id),row);
    rowsReady=true;
    applyCached();
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
  const key=cardKey(card),cached=rowsByKey.get(key);
  if(cached)rowsByKey.set(key,{...cached,completed:done});
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
function schedule(){applyCached();clearTimeout(hydrateTimer);hydrateTimer=setTimeout(()=>void hydrate(),80)}
new MutationObserver(schedule).observe(document.documentElement,{subtree:true,childList:true});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){applyCached();void context(true).then(hydrate)}});
window.addEventListener('focus',()=>{applyCached();void context(true).then(hydrate)});
window.addEventListener('online',()=>setTimeout(()=>void context(true).then(hydrate),120));
const c=sb();
if(c)c.auth.onAuthStateChange((_event,session)=>{if(session?.user){rowsByKey.clear();rowsReady=false;ctx=null;}else{ctx=null;rowsByKey.clear();rowsReady=false;}queueMicrotask(()=>void context(true).then(hydrate))});
queueMicrotask(()=>void context(true).then(hydrate));
})();