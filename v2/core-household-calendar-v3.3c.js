/* Planly 3.3C — household-aware planning and calendar integration.
   Runs inside the primary app closure. Calendar Sources remain account-private;
   Shared means explicitly household-visible Planly tasks, never external ICS. */
function planlyTaskOwnedByMe(t){return !!t&&t._planlyOwnedByMe!==false&&String(t._planlyOwnerId||planlySession?.user?.id||'')===String(planlySession?.user?.id||'')}
function planlyTaskHouseholdVisible(t){return !!t&&t.visibility==='household'&&!!t.householdId&&String(t.householdId)===String(planlyHousehold?.id||'')}
function planlyMonthTasksForDate(key,filter){
  const items=calendarTasksForDate(key);
  if(filter==='me')return items.filter(planlyTaskOwnedByMe);
  if(filter==='shared')return items.filter(planlyTaskHouseholdVisible);
  if(filter==='wife')return [];
  return items;
}
function planlyMonthExternalForDate(key,context,filter){
  /* External sources are deliberately excluded from Shared. RLS already keeps
     calendar_sources owner-only; this display rule prevents semantic leakage. */
  return filter==='all'||filter==='wife'?externalEventsForDate(key,context):[];
}
const __planly33cBaseDayPlanTask=dayPlanTask;
dayPlanTask=function(id){
  const candidates=dayPlanDraft?.filter(t=>String(t.id)===String(id))||[];
  return candidates.find(planlyTaskOwnedByMe)||__planly33cBaseDayPlanTask(id);
};
const __planly33cBaseOpenPlanDay=openPlanDay;
openPlanDay=function(){
  __planly33cBaseOpenPlanDay();
  for(const key of ['overdue','inbox','today'])dayPlanGroups[key]=(dayPlanGroups[key]||[]).filter(id=>planlyTaskOwnedByMe(dayPlanTask(id)));
  renderPlanDay();
};
const __planly33cBaseMoveDayPlanTask=moveDayPlanTask;
moveDayPlanTask=function(id,target){const t=dayPlanTask(id);if(t&&!planlyTaskOwnedByMe(t)){showToast('Shared task · only its creator can reschedule it');return}return __planly33cBaseMoveDayPlanTask(id,target)};
const __planly33cBaseToggleDayPlanTop3=toggleDayPlanTop3;
toggleDayPlanTop3=function(id){const t=dayPlanTask(id);if(t&&!planlyTaskOwnedByMe(t)){showToast('Shared task · only its creator can change Top 3');return}return __planly33cBaseToggleDayPlanTop3(id)};
const __planly33cBaseRenderPlanDay=renderPlanDay;
renderPlanDay=function(){
  __planly33cBaseRenderPlanDay();
  if(!dayPlanDraft)return;
  if(dayPlanStep===3){
    const today=localKey(new Date()),candidates=dayPlanDraft.filter(t=>planlyTaskOwnedByMe(t)&&!t.completed&&t.date===today),selected=candidates.filter(t=>t.pinned).length;
    $('#planDayContent').innerHTML=`<div class="planDayIntro">Choose up to three of your tasks that matter most today. Shared tasks owned by another household member stay visible in Planly but cannot be reprioritised here.</div><div class="planTop3Count">${selected}/3 selected</div><div class="planTop3List">${candidates.length?sortTasks(candidates).map(planTop3Card).join(''):'<div class="empty compactEmpty">You have no active tasks of your own planned for today.</div>'}</div>`;
  }
};
monthView=function(){
  const first=monthStart(state.monthAnchor),d=parseKey(first),year=d.getFullYear(),month=d.getMonth(),filter=monthCalendarFilter||'all';
  setHeader(new Intl.DateTimeFormat(undefined,{month:'long'}).format(d),String(year));
  const offset=(d.getDay()+6)%7,days=new Date(year,month+1,0).getDate();
  let cal='<div class="calendar">'+['M','T','W','T','F','S','S'].map(x=>`<div class="dow">${x}</div>`).join('');
  for(let i=0;i<offset;i++)cal+='<div></div>';
  for(let day=1;day<=days;day++){
    const k=localKey(new Date(year,month,day,12)),items=planlyMonthTasksForDate(k,filter),external=planlyMonthExternalForDate(k,'month',filter);
    const activeCount=items.filter(t=>!t.completed).length,completedCount=items.filter(t=>!t.virtualOccurrence&&t.completed).length;
    const dots=(activeCount?'<i class="calendarDot meDot"></i>':'')+(external.length?'<i class="calendarDot wifeDot"></i>':'');
    const hasAnything=activeCount||external.length,wifeLabel=external.length?externalEventShortLabel(external[0]):'';
    const calendarMark=external.length?'<small class="calendarShiftLabel">'+esc(wifeLabel)+(external.length>1?' +'+(external.length-1):'')+'</small>':dots?'<small class="calendarDots">'+dots+'</small>':completedCount?'<small>✓</small>':'';
    const isToday=k===localKey(new Date());
    cal+=`<button class="day ${hasAnything?'has':''} ${!hasAnything&&completedCount?'doneDay':''} ${isToday?'isToday':''} ${state.selectedDate===k?'selected':''}" data-date="${k}" aria-label="${esc(fmt(k,{weekday:'long',day:'numeric',month:'long'}))}"><span>${day}</span>${calendarMark}</button>`;
  }
  cal+='</div>';
  const dayTasks=planlyMonthTasksForDate(state.selectedDate,filter),active=sortTasks(dayTasks.filter(t=>!t.completed)),completed=sortTasks(dayTasks.filter(t=>!t.virtualOccurrence&&t.completed)),external=planlyMonthExternalForDate(state.selectedDate,'month',filter);
  const filters=`<div class="calendarFilters">${[['all','All'],['me','Me'],['wife','Wife'],['shared','Shared']].map(([id,label])=>`<button type="button" data-month-filter="${id}" class="${filter===id?'active':''}">${label}</button>`).join('')}</div>`;
  const taskLabel=filter==='shared'?'Household tasks':filter==='me'?'My tasks':'Selected day';
  const taskPlan=filter!=='wife'?`<section class="section monthAgenda"><div class="sectionHead"><div><span class="calendarGroupLabel">${taskLabel}</span><h2 class="monthAgendaDate">${fmt(state.selectedDate,{weekday:'long',day:'numeric',month:'long'})}</h2></div><span class="muted">${active.length}</span></div>${active.length?active.map(t=>t.virtualOccurrence?calendarPreviewTaskHtml(t):taskHtml(t)).join(''):'<div class="empty compactEmpty">No active tasks for this date.</div>'}</section>${completedSection(completed,'month:'+filter+':'+state.selectedDate)}`:'';
  const sourceName=external.length?(planlyCalendarSource(external[0].source_id)?.name||'Wife — NHS rota'):'Wife — NHS rota';
  const externalPlan=external.length?`<section class="section externalCalendarSection"><div class="sectionHead"><div><span class="calendarGroupLabel">${esc(sourceName)}</span><h2>Private calendar · read only</h2></div><span class="muted">${external.length}</span></div><div class="externalEventList">${external.map(e=>externalEventHtml(e,state.selectedDate)).join('')}</div></section>`:'';
  const empty=planlyCalendarDataError?'<div class="empty"><strong>Calendar data could not be loaded.</strong><br><span class="muted">'+esc(planlyCalendarDataError)+'</span></div>':(!active.length&&!completed.length&&!external.length?'<div class="empty">No calendar items for this filter and date.</div>':'');
  $('#view').innerHTML=`<div class="monthShell"><div class="monthControls"><button id="prevMonth" aria-label="Previous month">‹</button><button id="todayMonth" class="monthToday">Jump to today</button><button id="nextMonth" aria-label="Next month">›</button></div>${filters}${cal}</div>${taskPlan}${externalPlan}${empty}`;
  $('#prevMonth').onclick=()=>{state.monthAnchor=shiftMonth(first,-1);state.selectedDate=state.monthAnchor;render()};$('#nextMonth').onclick=()=>{state.monthAnchor=shiftMonth(first,1);state.selectedDate=state.monthAnchor;render()};$('#todayMonth').onclick=()=>{state.monthAnchor=localKey(new Date());state.selectedDate=localKey(new Date());render()};
  $$('.day[data-date]').forEach(b=>b.onclick=()=>{state.selectedDate=b.dataset.date;render()});$$('[data-month-filter]').forEach(b=>b.onclick=()=>{monthCalendarFilter=b.dataset.monthFilter||'all';render()});
};
