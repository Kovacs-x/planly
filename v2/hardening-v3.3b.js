(()=>{
'use strict';
const STATUS_PREFIX='planly-cloud-migration-status-v1:';
const LAST_ACCOUNT_KEY='planly-cloud-last-account-v1';
const WRITABLE_STATES=new Set(['cloud-write-test','offline-retry-needed','conflict']);
let refreshTimer=0,lastForegroundKick=0,realtimeClient=null,realtimeChannel=null,realtimeHouseholdId='',realtimeArmPromise=null;

function cloudStatus(){
  const ownerId=String(localStorage.getItem(LAST_ACCOUNT_KEY)||'');
  if(!ownerId)return {};
  try{return JSON.parse(localStorage.getItem(STATUS_PREFIX+ownerId)||'{}')||{}}catch{return {}}
}
function householdWritesReady(){return WRITABLE_STATES.has(String(cloudStatus().state||''))}
function refreshSharingGate(){
  const select=document.getElementById('taskVisibility');
  if(!select)return;
  const option=[...select.options].find(o=>o.value==='household');
  if(!option)return;
  const ready=householdWritesReady();
  option.disabled=!ready;
  const editingShared=!!document.getElementById('taskId')?.value&&select.value==='household';
  if(!ready&&select.value==='household'&&!editingShared)select.value='private';
  const help=document.getElementById('taskVisibilityHelp');
  if(help&&!ready){
    help.textContent='Household sharing becomes available once Planly Cloud Sync is active. This prevents a task looking shared before it can be safely synced.';
  }
}
function scheduleGateRefresh(){clearTimeout(refreshTimer);refreshTimer=setTimeout(refreshSharingGate,0)}
function kickHouseholdSync(){
  if(!navigator.onLine)return;
  // The core app's online reconciliation path is unthrottled and already owns conflict handling.
  window.dispatchEvent(new Event('online'));
  setTimeout(scheduleGateRefresh,250);
}
function kickForegroundHouseholdSync(){
  if(!navigator.onLine)return;
  const now=Date.now();
  if(now-lastForegroundKick<1200)return;
  lastForegroundKick=now;
  kickHouseholdSync();
  void armHouseholdRealtime();
}
async function stopHouseholdRealtime(){
  const client=realtimeClient,channel=realtimeChannel;
  realtimeChannel=null;realtimeHouseholdId='';
  if(client&&channel){try{await client.removeChannel(channel)}catch{}}
}
async function armHouseholdRealtime(){
  if(realtimeArmPromise)return realtimeArmPromise;
  realtimeArmPromise=(async()=>{
    if(!navigator.onLine||!window.supabase?.createClient||!window.PLANLY_SUPABASE_CONFIG)return;
    const cfg=window.PLANLY_SUPABASE_CONFIG;
    if(!realtimeClient){
      realtimeClient=window.supabase.createClient(cfg.url,cfg.publishableKey,{auth:{persistSession:true,autoRefreshToken:false,detectSessionInUrl:false}});
    }
    const {data:{session}={},error:sessionError}=await realtimeClient.auth.getSession();
    if(sessionError||!session?.access_token){await stopHouseholdRealtime();return}
    const ownerId=String(localStorage.getItem(LAST_ACCOUNT_KEY)||'');
    if(!ownerId||ownerId!==String(session.user?.id||'')){await stopHouseholdRealtime();return}
    const {data:memberships,error:membershipError}=await realtimeClient.from('planly_household_members').select('household_id').eq('user_id',session.user.id).limit(1);
    if(membershipError||!memberships?.[0]?.household_id){await stopHouseholdRealtime();return}
    const householdId=String(memberships[0].household_id);
    if(realtimeChannel&&realtimeHouseholdId===householdId)return;
    await stopHouseholdRealtime();
    await realtimeClient.realtime.setAuth(session.access_token);
    realtimeHouseholdId=householdId;
    realtimeChannel=realtimeClient
      .channel(`household:${householdId}`,{config:{private:true}})
      .on('broadcast',{event:'*'},()=>kickHouseholdSync())
      .subscribe(status=>{
        if(status==='CHANNEL_ERROR'||status==='TIMED_OUT'||status==='CLOSED'){
          if(realtimeChannel){void realtimeClient.removeChannel(realtimeChannel).catch(()=>{});realtimeChannel=null;realtimeHouseholdId=''}
        }
      });
  })().catch(()=>{}).finally(()=>{realtimeArmPromise=null});
  return realtimeArmPromise;
}

document.addEventListener('submit',e=>{
  if(e.target?.id!=='taskForm')return;
  const select=document.getElementById('taskVisibility');
  if(select?.value==='household'&&!householdWritesReady()){
    e.preventDefault();
    e.stopImmediatePropagation();
    alert('Household sharing is not ready yet. Enable Planly Cloud Sync in Settings, then save the task again.');
    scheduleGateRefresh();
  }
},true);

document.addEventListener('change',e=>{
  if(e.target?.id!=='taskVisibility')return;
  if(e.target.value==='household'&&!householdWritesReady()){
    e.target.value='private';
    alert('Enable Planly Cloud Sync in Settings before sharing a task with your household.');
  }
  scheduleGateRefresh();
},true);

document.addEventListener('click',e=>{
  if(e.target.closest('#addBtn,[data-action="edit"],#duplicateTask'))setTimeout(scheduleGateRefresh,0);
},true);

document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')kickForegroundHouseholdSync()});
window.addEventListener('focus',kickForegroundHouseholdSync);
window.addEventListener('online',()=>{setTimeout(scheduleGateRefresh,300);setTimeout(()=>void armHouseholdRealtime(),350)});
window.addEventListener('pagehide',()=>void stopHouseholdRealtime());
new MutationObserver(scheduleGateRefresh).observe(document.documentElement,{subtree:true,childList:true});
refreshSharingGate();
setTimeout(()=>void armHouseholdRealtime(),500);
})();
