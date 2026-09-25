/* Planly 3.3C — household-aware project planning integration.
   Injected inside the primary app closure. Shared project/task data remains
   creator-owned; this layer only fixes owner-aware navigation/statistics and
   prevents planning gestures from mutating another member's task locally. */
function planlyProjectForOwnerAndId(ownerId,projectId){
  const owner=String(ownerId||''),id=String(projectId||'');
  if(!id)return null;
  return state.projects.find(p=>String(p.id)===id&&planlyProjectOwnerId(p)===owner)||null;
}
function planlyProjectStatsFor(p){
  if(!p)return {tasks:[],done:0,total:0,pct:0,active:[],completed:[]};
  const owner=planlyProjectOwnerId(p),id=String(p.id||'');
  const tasks=state.tasks.filter(t=>String(t.projectId||'')===id&&String(t._planlyOwnerId||planlySession?.user?.id||'')===owner);
  const done=tasks.filter(t=>t.completed).length,total=tasks.length;
  return {tasks,done,total,pct:total?Math.round(done/total*100):0,active:tasks.filter(t=>!t.completed),completed:tasks.filter(t=>t.completed)};
}
projectStats=function(projectId){
  const p=projectById(projectId);
  return planlyProjectStatsFor(p);
};
const __planlyPlanningProjectCardHtml=projectCardHtml;
projectCardHtml=function(p){
  const previousOwner=activeProjectOwnerId;
  activeProjectOwnerId=planlyProjectOwnerId(p);
  try{return __planlyPlanningProjectCardHtml(p)}finally{activeProjectOwnerId=previousOwner}
};
const __planlyPlanningTaskHtml=taskHtml;
taskHtml=function(t,top3Mode=false){
  let html=__planlyPlanningTaskHtml(t,top3Mode);
  if(!t?.projectId)return html;
  const owner=String(t._planlyOwnerId||planlySession?.user?.id||'');
  return html.replace(`data-project-id="${esc(t.projectId)}"`,`data-project-id="${esc(t.projectId)}" data-project-owner="${esc(owner)}"`);
};
function planlyPlanningTaskFromElement(el){
  const card=el?.closest?.('[data-id][data-owner]');
  if(card){
    const id=String(card.dataset.id||''),owner=String(card.dataset.owner||'');
    return state.tasks.find(t=>String(t.id)===id&&String(t._planlyOwnerId||planlySession?.user?.id||'')===owner)||null;
  }
  const id=String(el?.dataset?.timelineDrag||el?.dataset?.timelineFocus||'');
  if(!id)return null;
  return state.tasks.find(t=>String(t.id)===id)||null;
}
/* Project pills must open the project belonging to the task owner. This is
   significant when two household members happen to use the same client id. */
document.addEventListener('click',e=>{
  const pill=e.target.closest('[data-action="project"][data-project-id][data-project-owner]');
  if(!pill)return;
  const owner=String(pill.dataset.projectOwner||''),id=String(pill.dataset.projectId||'');
  const p=planlyProjectForOwnerAndId(owner,id);
  if(!p)return;
  e.preventDefault();e.stopImmediatePropagation();
  openProjects(id,owner);
},true);
/* Timeline drag/reschedule is an owner mutation. Incoming household tasks can
   participate in availability/planning display, but another member cannot move
   them. Assignment completion remains handled by the authoritative RPC layer. */
document.addEventListener('pointerdown',e=>{
  const handle=e.target.closest('[data-timeline-drag]');
  if(!handle)return;
  const t=planlyPlanningTaskFromElement(handle);
  if(t?._planlyOwnedByMe!==false)return;
  e.preventDefault();e.stopImmediatePropagation();
  showToast('Shared task · only its creator can reschedule it');
},true);
/* Keep external calendar sources device/account-private. Household project
   integration deliberately does not copy, publish or alter calendar sources. */
const PLANLY_HOUSEHOLD_EXTERNAL_CALENDAR_SHARING=false;
