/* Planly 3.3C — planning mutation boundary for incoming Household tasks. */
commitPlanDay=function(){
  if(!dayPlanDraft||!dayPlanStartSnapshot)return;
  for(const input of $$('#planDayContent [data-plan-time]')){
    if(input.checked){
      const t=dayPlanTask(input.dataset.planTime);
      if(t&&planlyTaskOwnedByMe(t)&&!t.time){t.time=input.dataset.time;t.updatedAt=Date.now();if(t.addToCalendar)t.calendarSync='pending'}
    }
  }
  const before=cloneTasks(),fields=['date','time','pinned','top3Order','calendarSync'];
  for(const draft of dayPlanDraft){
    if(!planlyTaskOwnedByMe(draft))continue;
    const original=dayPlanStartSnapshot.find(x=>String(x.id)===String(draft.id));
    const live=state.tasks.find(x=>String(x.id)===String(draft.id));
    if(!original||!live||!planlyTaskOwnedByMe(live))continue;
    for(const key of fields){
      const a=original[key]??null,b=draft[key]??null;
      if(JSON.stringify(a)!==JSON.stringify(b)){if(draft[key]===undefined)delete live[key];else live[key]=draft[key];live.updatedAt=Date.now()}
    }
  }
  normalizeTop3Orders(dayPlanDate);
  stageChangedTasksFromSnapshot(before);save();queuePlanlyPendingReplay('Day plan synced');closePlanDay();state.tab='today';state.selectedDate=localKey(new Date());render();showToast('Day plan saved');
  if(googleConnected())syncPendingGoogle().then(()=>render()).catch(()=>{});
};
