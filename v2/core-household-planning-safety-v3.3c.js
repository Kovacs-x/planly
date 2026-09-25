/* Planly 3.3C — planning mutation boundary for incoming Household tasks. */
commitPlanDay=function(){
  if(!dayPlanDraft)return;
  const before=cloneTasks();
  const incoming=before.filter(t=>!planlyTaskOwnedByMe(t));
  const ownedDraft=dayPlanDraft.filter(planlyTaskOwnedByMe);
  state.tasks=[...ownedDraft,...incoming];
  normalizeTop3Orders(localKey(new Date()));
  /* normalizeTop3Orders predates Household. Restore incoming rows byte-for-byte
     so planning can never mutate another creator's task in runtime state. */
  const incomingByKey=new Map(incoming.map(t=>[planlyLocalTaskKey(t),t]));
  state.tasks=state.tasks.map(t=>planlyTaskOwnedByMe(t)?t:(incomingByKey.get(planlyLocalTaskKey(t))||t));
  stageChangedTasksFromSnapshot(before);save();queuePlanlyPendingReplay('Day plan synced');closePlanDay();state.tab='today';state.selectedDate=localKey(new Date());render();showToast('Day plan saved');
  if(googleConnected())syncPendingGoogle().then(()=>render()).catch(()=>{});
};
