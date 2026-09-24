(()=>{
'use strict';
const STATUS_PREFIX='planly-cloud-migration-status-v1:';
const LAST_ACCOUNT_KEY='planly-cloud-last-account-v1';
const WRITABLE_STATES=new Set(['cloud-write-test','offline-retry-needed','conflict']);
let refreshTimer=0,lastForegroundKick=0;

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
function kickForegroundHouseholdSync(){
  if(!navigator.onLine)return;
  const now=Date.now();
  if(now-lastForegroundKick<1200)return;
  lastForegroundKick=now;
  // Planly's online reconciliation path is intentionally unthrottled. Reusing it here
  // makes household tasks refresh immediately when the app returns to the foreground,
  // rather than waiting for the generic 15-second focus/visibility throttle.
  window.dispatchEvent(new Event('online'));
  setTimeout(scheduleGateRefresh,250);
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
window.addEventListener('online',()=>setTimeout(scheduleGateRefresh,300));
new MutationObserver(scheduleGateRefresh).observe(document.documentElement,{subtree:true,childList:true});
refreshSharingGate();
})();
