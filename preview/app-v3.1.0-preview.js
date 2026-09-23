(()=>{
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const STORE='planly-data-v1';
const GOOGLE_CLIENT_ID_KEY='planly-google-client-id-v1';
const GOOGLE_AUTH_KEY='planly-google-auth-v1';
const GOOGLE_DELETE_QUEUE_KEY='planly-google-delete-queue-v1';
const GOOGLE_SCOPE='https://www.googleapis.com/auth/calendar.events.owned';
const PLANLY_CALENDAR_ID='95b035b05d2f967eb609d34cb4d79348bfdb21e3b1fe06e0bd076fa450577989@group.calendar.google.com';
const PLANLY_TIMEZONE='Europe/London';
let googleTokenClient=null;
let editingSubtasks=[];
let activeSearchFilter='all';
let projectPanelMode='list',activeProjectId='',editingProjectId='';
let dayPlanDraft=null,dayPlanStep=0,dayPlanGroups={overdue:[],inbox:[],today:[]};
let timelineDate=localKey(new Date()),timelineDrag=null;
let focusTaskId='',focusElapsedMs=0,focusStartedAt=0,focusTicker=null;
let taskActionId='';
let state={tasks:[],projects:[],tab:'today',theme:'system',showCompleted:true,defaultCategory:'Personal',defaultDuration:30,autoCalendarTimed:false,autoCompleteParentSubtasks:false,planningStart:'08:00',planningEnd:'23:00',selectedDate:localKey(new Date()),weekAnchor:localKey(new Date()),monthAnchor:localKey(new Date())};
const completedOpen={};
const expandedTaskChecklists=new Set();
function localKey(d){const x=new Date(d);return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`}
function parseKey(s){const [y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d,12)}
function addDays(s,n){const d=parseKey(s);d.setDate(d.getDate()+n);return localKey(d)}
function thisWeekendKey(baseKey=localKey(new Date())){const d=parseKey(baseKey),day=d.getDay();if(day===6||day===0)return baseKey;return addDays(baseKey,6-day)}
function fmt(s,o={weekday:'short',day:'numeric',month:'short'}){return new Intl.DateTimeFormat(undefined,o).format(parseKey(s))}
function uid(){return `${Date.now()}-${Math.random().toString(16).slice(2)}`}
function esc(v=''){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function save(){localStorage.setItem(STORE,JSON.stringify({tasks:state.tasks,projects:state.projects,theme:state.theme,showCompleted:state.showCompleted,defaultCategory:state.defaultCategory,defaultDuration:state.defaultDuration,autoCalendarTimed:state.autoCalendarTimed,autoCompleteParentSubtasks:state.autoCompleteParentSubtasks,planningStart:state.planningStart,planningEnd:state.planningEnd}))}
function load(){try{const d=JSON.parse(localStorage.getItem(STORE)||'{}');state.tasks=Array.isArray(d.tasks)?d.tasks:[];state.projects=Array.isArray(d.projects)?d.projects:[];state.theme=d.theme||'system';state.showCompleted=d.showCompleted!==false;state.defaultCategory=d.defaultCategory||'Personal';state.defaultDuration=Number(d.defaultDuration||30);state.autoCalendarTimed=!!d.autoCalendarTimed;state.autoCompleteParentSubtasks=!!d.autoCompleteParentSubtasks;state.planningStart=d.planningStart||'08:00';state.planningEnd=d.planningEnd||'23:00';if(timeToMinutes(state.planningEnd)<=timeToMinutes(state.planningStart)){state.planningStart='08:00';state.planningEnd='23:00'}if(migrateRecurringCalendarState())save()}catch{}}
function applyTheme(){let t=state.theme;if(t==='system')t=matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light';document.documentElement.dataset.theme=t}
function isStandalone(){return matchMedia('(display-mode: standalone)').matches||navigator.standalone===true}
function setHeader(title,dateText=''){ $('#pageTitle').textContent=title; $('#eyebrow').textContent=dateText }
function calendarSyncHtml(t){
  if(!t.addToCalendar||t.calendarSync==='synced')return '';
  const label=t.calendarSync==='error'?'Calendar error':'Calendar pending';
  return `<span class="pill syncPill ${t.calendarSync==='error'?'error':'pending'}">${label}</span><button class="syncRetry" data-action="retry-sync">Retry</button>`;
}
function durationLabel(minutes){
  const n=Number(minutes===undefined||minutes===null?30:minutes);
  if(n<60)return n+'m';
  if(n%60===0)return (n/60)+'h';
  return Math.floor(n/60)+'h '+(n%60)+'m';
}
function reminderLabel(value){
  return ({'at-time':'At time','5-min':'5m reminder','15-min':'15m reminder','30-min':'30m reminder','60-min':'1h reminder','1440-min':'1d reminder'})[value]||'';
}


function timeToMinutes(value){
  const m=String(value||'').match(/^(\d{1,2}):(\d{2})$/);
  if(!m)return 0;
  return Math.max(0,Math.min(1439,Number(m[1])*60+Number(m[2])));
}
function minutesToTime(value){
  const n=Math.max(0,Math.min(1439,Math.round(Number(value)||0)));
  return String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');
}
function planningBounds(){
  let start=timeToMinutes(state.planningStart||'08:00'),end=timeToMinutes(state.planningEnd||'23:00');
  if(end<=start){start=480;end=1380}
  return {start,end};
}
function taskTimeInterval(t){
  const start=timeToMinutes(t.time),duration=Math.max(5,Number(t.durationMinutes||state.defaultDuration||30));
  return {start,end:start+duration,duration};
}
function timelineAnalysis(tasks,startMin,endMin,extraBusy=[]){
  const timed=tasks.filter(t=>t.time).map(t=>({t,...taskTimeInterval(t)})).sort((a,b)=>a.start-b.start||a.end-b.end);
  const conflictIds=new Set(),conflictPairs=[];
  for(let i=0;i<timed.length;i++){
    for(let j=i+1;j<timed.length;j++){
      if(timed[j].start>=timed[i].end)break;
      if(timed[j].start<timed[i].end&&timed[j].end>timed[i].start){
        conflictIds.add(timed[i].t.id);conflictIds.add(timed[j].t.id);
        conflictPairs.push([timed[i].t.id,timed[j].t.id]);
      }
    }
  }
  const clipped=[...timed.map(x=>({start:Math.max(startMin,x.start),end:Math.min(endMin,x.end)})),...extraBusy.map(x=>({start:Math.max(startMin,x.start),end:Math.min(endMin,x.end)}))].filter(x=>x.end>x.start).sort((a,b)=>a.start-b.start);
  const merged=[];
  for(const item of clipped){
    const last=merged[merged.length-1];
    if(last&&item.start<=last.end)last.end=Math.max(last.end,item.end);
    else merged.push({...item});
  }
  const freeGaps=[];let cursor=startMin;
  for(const item of merged){
    if(item.start>cursor)freeGaps.push({start:cursor,end:item.start,minutes:item.start-cursor});
    cursor=Math.max(cursor,item.end);
  }
  if(cursor<endMin)freeGaps.push({start:cursor,end:endMin,minutes:endMin-cursor});
  return {timed,conflictIds,conflictPairs,freeGaps,freeMinutes:freeGaps.reduce((s,g)=>s+g.minutes,0)};
}
function timelineLayout(tasks){
  const items=tasks.filter(t=>t.time).map(t=>({t,...taskTimeInterval(t),col:0,cols:1})).sort((a,b)=>a.start-b.start||a.end-b.end);
  const clusters=[];let cluster=[],clusterEnd=-1;
  const flush=()=>{if(cluster.length){clusters.push(cluster);cluster=[];clusterEnd=-1}};
  for(const item of items){
    if(cluster.length&&item.start>=clusterEnd)flush();
    cluster.push(item);clusterEnd=Math.max(clusterEnd,item.end);
  }
  flush();
  for(const group of clusters){
    const ends=[];
    for(const item of group){
      let col=ends.findIndex(end=>end<=item.start);
      if(col<0){col=ends.length;ends.push(item.end)}else ends[col]=item.end;
      item.col=col;
    }
    const cols=Math.max(1,ends.length);group.forEach(item=>item.cols=cols);
  }
  return items;
}
function freeGapLabel(g){return minutesToTime(g.start)+'–'+minutesToTime(g.end)+' · '+durationLabel(g.minutes)}
function planTimelinePreviewHtml(tasks){
  const {start,end}=planningBounds(),analysis=timelineAnalysis(tasks,start,end);
  const timed=analysis.timed;
  if(!timed.length)return '<div class="muted planTimelineEmpty">No timed tasks yet.</div>';
  return `<div class="planTimelineStats"><span>${durationLabel(analysis.freeMinutes)} free within ${esc(state.planningStart)}–${esc(state.planningEnd)}</span>${analysis.conflictPairs.length?`<strong>${analysis.conflictPairs.length} overlap${analysis.conflictPairs.length===1?'':'s'}</strong>`:'<strong>No overlaps</strong>'}</div><div class="planTimelinePreview">${timed.map(x=>`<div class="${analysis.conflictIds.has(x.t.id)?'conflict':''}"><span>${esc(minutesToTime(x.start))}<small>${esc(minutesToTime(Math.min(1439,x.end)))}</small></span><strong>${esc(x.t.title)}</strong>${analysis.conflictIds.has(x.t.id)?'<em>Overlap</em>':''}</div>`).join('')}</div>`;
}
function renderTimeline(){
  if(!$('#timelineWrap')?.classList.contains('open'))return;$('#timelineDate').value=timelineDate;$('#timelineTitle').textContent=timelineDate===localKey(new Date())?'Today':fmt(timelineDate,{weekday:'long',day:'numeric',month:'long'});
  const tasks=state.tasks.filter(t=>!t.completed&&t.date===timelineDate),timed=tasks.filter(t=>t.time),anytime=sortTasks(tasks.filter(t=>!t.time));
  const external=externalEventsForDate(timelineDate,'timeline'),externalTimed=externalTimelineIntervals(timelineDate),externalAllDay=external.filter(e=>e.is_all_day),{start:planStart,end:planEnd}=planningBounds(),analysis=timelineAnalysis(tasks,planStart,planEnd,externalTimed),layout=timelineLayout(tasks);
  const busyStarts=[...layout.map(x=>x.start),...externalTimed.map(x=>x.start)],busyEnds=[...layout.map(x=>x.end),...externalTimed.map(x=>x.end)],earliest=busyStarts.length?Math.min(...busyStarts):planStart,latest=busyEnds.length?Math.max(...busyEnds):planEnd;
  const displayStart=Math.max(0,Math.floor(Math.min(planStart,earliest)/60)*60),displayEnd=Math.min(1440,Math.ceil(Math.max(planEnd,latest)/60)*60),scale=1.05,stageHeight=Math.max(360,(displayEnd-displayStart)*scale),hours=[];
  for(let m=displayStart;m<=displayEnd;m+=60){const top=(m-displayStart)*scale;hours.push(`<div class="timelineHour" style="top:${top}px"><span>${esc(minutesToTime(m===1440?1439:m).replace('23:59','24:00'))}</span><i></i></div>`)}
  const freeBands=analysis.freeGaps.map(g=>{const a=Math.max(displayStart,g.start),b=Math.min(displayEnd,g.end);if(b<=a)return '';return `<div class="timelineFreeBand" style="top:${(a-displayStart)*scale}px;height:${Math.max(2,(b-a)*scale)}px"></div>`}).join('');
  const externalBlocks=externalTimed.map(x=>{const top=(x.start-displayStart)*scale,height=Math.max(28,Math.min((x.end-x.start)*scale,stageHeight-top));return `<div class="timelineExternalBlock" style="--calendar-source:${x.colour};top:${top}px;height:${height}px"><strong>${esc(x.event.title||'Busy')}</strong><span>${esc(externalEventTimeLabel(x.event,timelineDate))}</span><small>Read only</small></div>`}).join('');
  const blocks=layout.map(x=>{const top=(x.start-displayStart)*scale,height=Math.max(34,Math.min((x.end-x.start)*scale,stageHeight-top)),left=(x.col/x.cols)*100,width=100/x.cols,conflict=analysis.conflictIds.has(x.t.id),project=projectNameForTask(x.t);return `<div class="timelineBlock ${conflict?'conflict':''}" data-timeline-id="${esc(x.t.id)}" style="top:${top}px;height:${height}px;left:${left}%;width:calc(${width}% - 4px)"><button type="button" class="timelineDragHandle" data-timeline-drag="${esc(x.t.id)}" aria-label="Drag to reschedule">↕</button><div class="timelineBlockText"><strong>${esc(x.t.title)}</strong><span>${esc(x.t.time)}–${esc(minutesToTime(Math.min(1439,x.end)))} · ${durationLabel(x.duration)}${project?' · '+esc(project):''}</span></div><button type="button" class="timelineFocusBtn" data-timeline-focus="${esc(x.t.id)}">Focus</button>${conflict?'<em>Overlap</em>':''}</div>`}).join('');
  const nowMinutes=new Date().getHours()*60+new Date().getMinutes(),nowLine=timelineDate===localKey(new Date())&&nowMinutes>=displayStart&&nowMinutes<=displayEnd?`<div class="timelineNow" style="top:${(nowMinutes-displayStart)*scale}px"><span>Now</span></div>`:'';
  const gaps=analysis.freeGaps.length?analysis.freeGaps.map(g=>`<span class="timelineGapChip">${esc(freeGapLabel(g))}</span>`).join(''):'<span class="timelineGapChip">No free gaps inside planning hours</span>';
  const summary=`<div class="timelineMetrics"><div><strong>${timed.length}</strong><span>Timed tasks</span></div><div><strong>${external.length}</strong><span>Rota items</span></div><div><strong>${durationLabel(analysis.freeMinutes)}</strong><span>Free time</span></div><div class="${analysis.conflictPairs.length?'warningMetric':''}"><strong>${analysis.conflictPairs.length}</strong><span>Task overlaps</span></div></div><div class="timelineGapList">${gaps}</div>`;
  const allDayHtml=externalAllDay.length?`<section class="timelineExternalAllDay"><div class="sectionHead"><h2>Rota / all day</h2><span class="muted">${externalAllDay.length}</span></div>${externalAllDay.map(e=>externalEventHtml(e,timelineDate)).join('')}</section>`:'';
  const anytimeHtml=`<section class="timelineAnytime"><div class="sectionHead"><h2>Anytime</h2><span class="muted">${anytime.length}</span></div>${anytime.length?anytime.map(t=>`<div class="timelineAnytimeRow"><div><strong>${esc(t.title)}</strong><span>${durationLabel(t.durationMinutes)}${projectNameForTask(t)?' · '+esc(projectNameForTask(t)):''}</span></div><div class="timelineQuickTimes"><button type="button" data-timeline-set="${esc(t.id)}" data-time="09:00">Morning</button><button type="button" data-timeline-set="${esc(t.id)}" data-time="14:00">Afternoon</button><button type="button" data-timeline-set="${esc(t.id)}" data-time="18:00">Evening</button><input type="time" data-timeline-time="${esc(t.id)}" aria-label="Choose time"></div><button type="button" class="timelineAnyFocus" data-timeline-focus="${esc(t.id)}">Focus</button></div>`).join(''):'<div class="empty compactEmpty">No Anytime tasks for this day.</div>'}</section>`;
  $('#timelineContent').innerHTML=summary+allDayHtml+`<div class="timelineStage" data-start="${displayStart}" data-end="${displayEnd}" data-scale="${scale}" style="height:${stageHeight}px">${hours.join('')}${nowLine}<div class="timelineLane">${freeBands}${externalBlocks}${blocks}</div></div>`+anytimeHtml;
}
function openTimeline(date=localKey(new Date())){
  if($('#taskActionWrap')?.classList.contains('open'))closeTaskActions();
  if($('#planDayWrap')?.classList.contains('open'))closePlanDay();
  if($('#projectsWrap')?.classList.contains('open'))closeProjects();
  closeOpenTaskSwipes();timelineDate=date||localKey(new Date());
  $('#timelineWrap').classList.add('open');$('#timelineWrap').setAttribute('aria-hidden','false');renderTimeline();
}
function closeTimeline(){$('#timelineWrap').classList.remove('open');$('#timelineWrap').setAttribute('aria-hidden','true');timelineDrag=null}
function refreshTimelineIfOpen(){if($('#timelineWrap')?.classList.contains('open'))renderTimeline()}
function setTimelineTaskTime(id,time,message='Time updated'){
  const t=state.tasks.find(x=>x.id===id);if(!t||!time||t.time===time)return;
  const before=cloneTasks();t.time=time;t.updatedAt=Date.now();if(t.addToCalendar)t.calendarSync='pending';save();render();
  showUndoToast(message,()=>{restoreTaskSnapshot(before)},()=>finishCalendarChange(state.tasks.find(x=>x.id===id)));
}
function beginTimelineDrag(e){
  const handle=e.target.closest('[data-timeline-drag]');if(!handle)return;
  const t=state.tasks.find(x=>x.id===handle.dataset.timelineDrag),stage=handle.closest('.timelineStage'),touch=e.touches?.[0];
  if(!t||!stage||!touch)return;
  const block=handle.closest('.timelineBlock'),scale=Number(stage.dataset.scale||1),displayStart=Number(stage.dataset.start||0),displayEnd=Number(stage.dataset.end||1440);
  timelineDrag={id:t.id,block,startY:touch.clientY,originalStart:timeToMinutes(t.time),candidate:timeToMinutes(t.time),scale,displayStart,displayEnd,duration:Math.max(5,Number(t.durationMinutes||state.defaultDuration||30)),before:cloneTasks(),moved:false};
  block?.classList.add('dragging');
}
function moveTimelineDrag(e){
  if(!timelineDrag)return;const touch=e.touches?.[0];if(!touch)return;e.preventDefault();
  const g=timelineDrag,dy=touch.clientY-g.startY;
  let candidate=Math.round((g.originalStart+dy/g.scale)/15)*15;
  candidate=Math.max(g.displayStart,Math.min(g.displayEnd-g.duration,candidate));
  g.candidate=candidate;g.moved=Math.abs(candidate-g.originalStart)>=15;
  if(g.block){
    g.block.style.top=((candidate-g.displayStart)*g.scale)+'px';
    const label=g.block.querySelector('.timelineBlockText span');
    if(label)label.textContent=minutesToTime(candidate)+'–'+minutesToTime(Math.min(1439,candidate+g.duration))+' · '+durationLabel(g.duration);
  }
}
function endTimelineDrag(){
  if(!timelineDrag)return;const g=timelineDrag;timelineDrag=null;g.block?.classList.remove('dragging');
  if(!g.moved||g.candidate===g.originalStart){renderTimeline();return}
  const t=state.tasks.find(x=>x.id===g.id);if(!t){renderTimeline();return}
  t.time=minutesToTime(g.candidate);t.updatedAt=Date.now();if(t.addToCalendar)t.calendarSync='pending';save();render();
  showUndoToast('Task moved to '+t.time,()=>restoreTaskSnapshot(g.before),()=>finishCalendarChange(state.tasks.find(x=>x.id===g.id)));
}
function handleTimelineClick(e){
  const focus=e.target.closest('[data-timeline-focus]');if(focus){openFocus(focus.dataset.timelineFocus);return}
  const set=e.target.closest('[data-timeline-set]');if(set){setTimelineTaskTime(set.dataset.timelineSet,set.dataset.time,'Task scheduled for '+set.dataset.time);return}
}
function handleTimelineChange(e){
  const time=e.target.closest('[data-timeline-time]');if(time&&time.value)setTimelineTaskTime(time.dataset.timelineTime,time.value,'Task scheduled for '+time.value);
}
function focusElapsed(){return focusElapsedMs+(focusStartedAt?Date.now()-focusStartedAt:0)}
function focusClock(ms){
  const total=Math.floor(ms/1000),h=Math.floor(total/3600),m=Math.floor((total%3600)/60),s=total%60;
  return h?String(h).padStart(2,'0')+':'+String(m).padStart(2,'0')+':'+String(s).padStart(2,'0'):String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');
}
function startFocusTicker(){
  clearInterval(focusTicker);focusTicker=null;
  if(!focusStartedAt)return;
  focusTicker=setInterval(()=>{const el=$('#focusClock');if(el)el.textContent=focusClock(focusElapsed())},1000);
}
function renderFocus(){
  if(!$('#focusWrap')?.classList.contains('open'))return;
  const t=state.tasks.find(x=>x.id===focusTaskId);
  if(!t||t.completed){closeFocus();return}
  $('#focusTitle').textContent=t.title;
  const project=projectNameForTask(t),subtasks=Array.isArray(t.subtasks)?t.subtasks:[];
  $('#focusContent').innerHTML=`<div class="focusMeta">${t.time?`<span>${esc(t.time)} · ${durationLabel(t.durationMinutes)}</span>`:''}<span>${esc(t.category)}</span>${project?`<span>▦ ${esc(project)}</span>`:''}</div><div class="focusTimerCard"><span>Elapsed</span><strong id="focusClock">${focusClock(focusElapsed())}</strong><small>${t.durationMinutes?'Planned duration · '+durationLabel(t.durationMinutes):''}</small><div class="focusTimerActions"><button type="button" data-focus-action="timer">${focusStartedAt?'Pause':'Start timer'}</button><button type="button" data-focus-action="reset">Reset</button></div></div>${subtasks.length?`<section class="focusChecklist"><h3>Checklist</h3>${subtasks.map(s=>`<button type="button" class="${s.done?'done':''}" data-focus-subtask="${esc(s.id)}"><span>${s.done?'✓':''}</span><strong>${esc(s.title)}</strong></button>`).join('')}</section>`:''}${t.notes?`<div class="focusNotes">${esc(t.notes).replace(/\n/g,'<br>')}</div>`:''}<div class="focusBottomActions"><button type="button" class="secondaryBtn" data-focus-action="edit">Edit task</button><button type="button" class="primary" data-focus-action="complete">Complete</button></div>`;
  startFocusTicker();
}
function openFocus(id){
  const t=state.tasks.find(x=>x.id===id);if(!t||t.completed)return;
  focusTaskId=id;focusElapsedMs=0;focusStartedAt=0;clearInterval(focusTicker);focusTicker=null;
  $('#focusWrap').classList.add('open');$('#focusWrap').setAttribute('aria-hidden','false');renderFocus();
}
function closeFocus(){
  if(focusStartedAt){focusElapsedMs+=Date.now()-focusStartedAt;focusStartedAt=0}
  clearInterval(focusTicker);focusTicker=null;
  $('#focusWrap').classList.remove('open');$('#focusWrap').setAttribute('aria-hidden','true');
  focusTaskId='';focusElapsedMs=0;
}
function refreshFocusIfOpen(){if($('#focusWrap')?.classList.contains('open'))renderFocus()}
function handleFocusClick(e){
  const sub=e.target.closest('[data-focus-subtask]');
  if(sub){const t=state.tasks.find(x=>x.id===focusTaskId);if(t)toggleTaskSubtask(t,sub.dataset.focusSubtask);return}
  const action=e.target.closest('[data-focus-action]')?.dataset.focusAction;if(!action)return;
  if(action==='timer'){
    if(focusStartedAt){focusElapsedMs+=Date.now()-focusStartedAt;focusStartedAt=0}else focusStartedAt=Date.now();
    renderFocus();return;
  }
  if(action==='reset'){focusElapsedMs=0;focusStartedAt=focusStartedAt?Date.now():0;renderFocus();return}
  const t=state.tasks.find(x=>x.id===focusTaskId);if(!t)return;
  if(action==='complete'){completeTaskWithUndo(t);closeFocus();return}
  if(action==='edit'){closeFocus();closeTimeline();setTimeout(()=>openSheet(t),0);return}
}

function projectById(id){return id?state.projects.find(p=>p.id===id):null}
function projectNameForTask(t){return projectById(t?.projectId)?.name||''}
function projectTasks(projectId){return state.tasks.filter(t=>t.projectId===projectId)}
function projectStats(projectId){
  const tasks=projectTasks(projectId),done=tasks.filter(t=>t.completed).length,total=tasks.length;
  return {tasks,done,total,pct:total?Math.round(done/total*100):0,active:tasks.filter(t=>!t.completed),completed:tasks.filter(t=>t.completed)};
}
function projectOptionsHtml(selectedId=''){
  const projects=state.projects.filter(p=>!p.archived||p.id===selectedId).sort((a,b)=>(a.name||'').localeCompare(b.name||''));
  return '<option value="">No project</option>'+projects.map(p=>`<option value="${esc(p.id)}" ${p.id===selectedId?'selected':''}>${esc(p.name)}${p.archived?' (Archived)':''}</option>`).join('');
}
function refreshProjectSelect(selectedId=''){
  const select=$('#taskProject');if(!select)return;
  select.innerHTML=projectOptionsHtml(selectedId);
  select.value=selectedId&&state.projects.some(p=>p.id===selectedId)?selectedId:'';
}
function projectCardHtml(p){
  const stats=projectStats(p.id);
  const due=p.dueDate?`<span class="${!p.archived&&p.dueDate<localKey(new Date())?'projectDue overdueProject':'projectDue'}">Due ${esc(fmt(p.dueDate,{day:'numeric',month:'short'}))}</span>`:'';
  return `<button type="button" class="projectCard ${p.archived?'archived':''}" data-project-open="${esc(p.id)}"><span class="projectCardTop"><strong>${esc(p.name)}</strong>${p.archived?'<span class="projectArchivedPill">Archived</span>':due}</span><span class="projectCardMeta">${stats.total?`${stats.done} of ${stats.total} tasks complete`:'No tasks yet'}</span><span class="projectMiniBar"><span style="width:${stats.pct}%"></span></span></button>`;
}
function renderProjectsPanel(){
  const content=$('#projectsContent'),title=$('#projectsTitle'),eyebrow=$('#projectsEyebrow'),back=$('#projectsBack');
  if(!content||!title||!eyebrow||!back)return;
  if(projectPanelMode==='list'){
    title.textContent='Projects';eyebrow.textContent='Outcomes & task groups';back.hidden=true;
    const active=state.projects.filter(p=>!p.archived).sort((a,b)=>(a.dueDate||'9999-99-99').localeCompare(b.dueDate||'9999-99-99')||(a.name||'').localeCompare(b.name||''));
    const archived=state.projects.filter(p=>p.archived).sort((a,b)=>(a.name||'').localeCompare(b.name||''));
    content.innerHTML=`<div class="projectsToolbar"><button type="button" class="primary projectCreateBtn" data-project-action="new">+ New project</button></div><div class="projectList">${active.length?active.map(projectCardHtml).join(''):'<div class="empty compactEmpty">No projects yet. Create one to group tasks around a larger outcome.</div>'}</div>${archived.length?`<details class="archivedProjects"><summary>Archived projects · ${archived.length}</summary><div class="projectList">${archived.map(projectCardHtml).join('')}</div></details>`:''}`;
    return;
  }
  const p=projectById(activeProjectId||editingProjectId);
  if(projectPanelMode==='editor'){
    title.textContent=p?'Edit project':'New project';eyebrow.textContent=p?'Project settings':'Create an outcome';back.hidden=false;
    content.innerHTML=`<form id="projectForm" class="projectEditor"><div class="field"><label>Project name</label><input id="projectName" class="input" maxlength="100" required value="${esc(p?.name||'')}" placeholder="e.g. Dubai trip"></div><div class="field"><label>Due date</label><input id="projectDueDate" type="date" class="input" value="${esc(p?.dueDate||'')}"></div><div class="field"><label>Notes</label><textarea id="projectNotes" class="textarea" maxlength="800" placeholder="Optional project context">${esc(p?.notes||'')}</textarea></div><button type="submit" class="primary">${p?'Save project':'Create project'}</button>${p?`<button type="button" class="${p.archived?'secondaryBtn':'dangerBtn'}" data-project-action="${p.archived?'restore':'archive'}">${p.archived?'Restore project':'Archive project'}</button>`:''}</form>`;
    return;
  }
  if(!p){projectPanelMode='list';activeProjectId='';renderProjectsPanel();return}
  title.textContent=p.name;eyebrow.textContent=p.archived?'Archived project':'Project';back.hidden=false;
  const stats=projectStats(p.id);
  const due=p.dueDate?`<span class="projectDetailDue ${!p.archived&&p.dueDate<localKey(new Date())?'overdueProject':''}">Due ${esc(fmt(p.dueDate,{weekday:'short',day:'numeric',month:'short'}))}</span>`:'';
  const notes=p.notes?`<div class="projectNotes">${esc(p.notes).replace(/\n/g,'<br>')}</div>`:'';
  content.innerHTML=`<div class="projectHero"><div class="projectHeroTop"><div><strong>${stats.done} of ${stats.total} complete</strong><span class="muted">${stats.pct}%</span></div>${due}</div><div class="bar"><span style="width:${stats.pct}%"></span></div>${notes}<div class="projectHeroActions">${p.archived?'':`<button type="button" class="primary" data-project-action="add-task">+ Add task</button>`}<button type="button" class="secondaryBtn" data-project-action="edit">Edit project</button></div></div><section class="section projectTasksSection"><div class="sectionHead"><h2>Active tasks</h2><span class="muted">${stats.active.length}</span></div><div class="projectTaskList">${stats.active.length?sortTasks(stats.active).map(taskHtml).join(''):'<div class="empty compactEmpty">No active tasks in this project.</div>'}</div></section>${stats.completed.length?`<section class="section projectTasksSection"><div class="sectionHead"><h2>Completed</h2><span class="muted">${stats.completed.length}</span></div><div class="projectTaskList">${sortTasks(stats.completed).map(taskHtml).join('')}</div></section>`:''}`;
}
function openProjects(projectId=''){
  if($('#taskActionWrap')?.classList.contains('open'))closeTaskActions();
  if($('#searchWrap')?.classList.contains('open'))closeSearch();
  closeOpenTaskSwipes();$('#projectsWrap').classList.add('open');$('#projectsWrap').setAttribute('aria-hidden','false');
  if(projectId&&projectById(projectId)){activeProjectId=projectId;editingProjectId='';projectPanelMode='detail'}else{activeProjectId='';editingProjectId='';projectPanelMode='list'}
  renderProjectsPanel();
}
function closeProjects(){$('#projectsWrap').classList.remove('open');$('#projectsWrap').setAttribute('aria-hidden','true');projectPanelMode='list';activeProjectId='';editingProjectId=''}
function refreshProjectsIfOpen(){if($('#projectsWrap')?.classList.contains('open'))renderProjectsPanel()}
function saveProjectEditor(){
  const name=($('#projectName')?.value||'').trim();if(!name)return;
  const now=Date.now();let p=projectById(editingProjectId);
  if(p){p.name=name;p.dueDate=$('#projectDueDate').value||'';p.notes=$('#projectNotes').value.trim();p.updatedAt=now}
  else{p={id:uid(),name,dueDate:$('#projectDueDate').value||'',notes:$('#projectNotes').value.trim(),archived:false,createdAt:now,updatedAt:now};state.projects.push(p)}
  save();activeProjectId=p.id;editingProjectId='';projectPanelMode='detail';renderProjectsPanel();render();
}
function handleProjectsClick(e){
  const open=e.target.closest('[data-project-open]');if(open){activeProjectId=open.dataset.projectOpen;editingProjectId='';projectPanelMode='detail';renderProjectsPanel();return}
  const action=e.target.closest('[data-project-action]')?.dataset.projectAction;if(!action)return;
  if(action==='new'){editingProjectId='';activeProjectId='';projectPanelMode='editor';renderProjectsPanel();return}
  const p=projectById(activeProjectId||editingProjectId);
  if(action==='edit'&&p){editingProjectId=p.id;projectPanelMode='editor';renderProjectsPanel();return}
  if(action==='add-task'&&p&&!p.archived){openSheet(null,p.id);return}
  if(action==='archive'&&p&&confirm('Archive this project? Its tasks will stay in Planly.')){p.archived=true;p.updatedAt=Date.now();save();activeProjectId=p.id;editingProjectId='';projectPanelMode='detail';renderProjectsPanel();render();return}
  if(action==='restore'&&p){p.archived=false;p.updatedAt=Date.now();save();activeProjectId=p.id;editingProjectId='';projectPanelMode='detail';renderProjectsPanel();render();return}
}


function renderTaskActions(){
  const wrap=$('#taskActionWrap'),content=$('#taskActionContent'),title=$('#taskActionTitle');
  if(!wrap||!content||!title)return;
  const t=state.tasks.find(x=>x.id===taskActionId);
  if(!t){closeTaskActions();return}
  title.textContent=t.title;
  const today=localKey(new Date());
  const projectName=projectNameForTask(t);
  const dateText=t.date?fmt(t.date,{weekday:'short',day:'numeric',month:'short'}):'Inbox';
  const top3Eligible=!t.completed&&t.date===today;
  content.innerHTML=`<div class="taskActionMeta"><span>${esc(dateText)}</span>${t.time?`<span>${esc(t.time)} · ${durationLabel(t.durationMinutes)}</span>`:''}<span>${esc(t.category)}</span>${projectName?`<span>▦ ${esc(projectName)}</span>`:''}</div>
  <div class="taskActionPrimary">${!t.completed?`<button type="button" data-task-menu="complete"><strong>✓</strong><span>Complete</span></button><button type="button" data-task-menu="focus"><strong>◎</strong><span>Focus</span></button>`:`<button type="button" data-task-menu="reopen"><strong>↶</strong><span>Mark incomplete</span></button>`}<button type="button" data-task-menu="edit"><strong>✎</strong><span>Edit</span></button><button type="button" data-task-menu="duplicate"><strong>⧉</strong><span>Duplicate</span></button></div>
  ${!t.completed?`<div class="taskActionSection"><h3>Schedule</h3><div class="taskActionQuickGrid"><button type="button" data-task-menu="today">Today</button><button type="button" data-task-menu="tomorrow">Tomorrow</button><button type="button" data-task-menu="weekend">This weekend</button><button type="button" data-task-menu="nextweek">Next week</button></div></div>`:''}
  ${top3Eligible?`<button type="button" class="taskActionWide" data-task-menu="pin">${t.pinned?'★ Remove from Top 3':'☆ Add to Top 3'}</button>`:''}
  <div class="taskActionSection"><label for="taskActionProject">Project</label><select id="taskActionProject" class="select">${projectOptionsHtml(t.projectId||'')}</select></div>
  <div class="taskActionUtility"><button type="button" data-task-menu="delete">Delete task</button></div>`;
}
function openTaskActions(t){
  if(!t)return;
  closeOpenTaskSwipes();taskActionId=t.id;
  $('#taskActionWrap').classList.add('open');$('#taskActionWrap').setAttribute('aria-hidden','false');
  renderTaskActions();
}
function closeTaskActions(){
  $('#taskActionWrap')?.classList.remove('open');$('#taskActionWrap')?.setAttribute('aria-hidden','true');taskActionId='';
}
function refreshTaskActionsIfOpen(){if($('#taskActionWrap')?.classList.contains('open'))renderTaskActions()}
function handleTaskActionClick(e){
  const action=e.target.closest('[data-task-menu]')?.dataset.taskMenu;if(!action)return;
  const t=state.tasks.find(x=>x.id===taskActionId);if(!t){closeTaskActions();return}
  const today=localKey(new Date());
  if(action==='complete'){closeTaskActions();completeTaskWithUndo(t);return}
  if(action==='reopen'){t.completed=false;t.updatedAt=Date.now();save();closeTaskActions();render();return}
  if(action==='focus'){closeTaskActions();openFocus(t.id);return}
  if(action==='edit'){closeTaskActions();setTimeout(()=>openSheet(t),0);return}
  if(action==='duplicate'){closeTaskActions();setTimeout(()=>{openSheet(t);prepareDuplicateTask()},0);return}
  if(action==='pin'){toggleTaskPin(t);refreshTaskActionsIfOpen();return}
  if(action==='today'){closeTaskActions();rescheduleTaskWithUndo(t,today,'Moved to today');return}
  if(action==='tomorrow'){closeTaskActions();rescheduleTaskWithUndo(t,addDays(today,1),'Moved to tomorrow');return}
  if(action==='weekend'){closeTaskActions();rescheduleTaskWithUndo(t,thisWeekendKey(today),'Moved to this weekend');return}
  if(action==='nextweek'){closeTaskActions();rescheduleTaskWithUndo(t,addDays(startMonday(today),7),'Moved to next week');return}
  if(action==='delete'){if(confirm('Delete this task?')){closeTaskActions();deleteTaskWithUndo(t)}return}
}
function handleTaskActionChange(e){
  const select=e.target.closest('#taskActionProject');if(!select)return;
  const t=state.tasks.find(x=>x.id===taskActionId);if(!t)return;
  if((t.projectId||'')===select.value)return;
  t.projectId=select.value||'';t.updatedAt=Date.now();if(t.addToCalendar)t.calendarSync='pending';
  save();render();refreshTaskActionsIfOpen();
  if(t.addToCalendar&&googleConnected())syncTaskToGoogle(t).then(()=>render()).catch(()=>render());
}

function taskHtml(t,top3Mode=false){
  const subtasks=Array.isArray(t.subtasks)?t.subtasks:[];
  const subtaskDone=subtasks.filter(s=>s.done).length;
  const checklistExpanded=subtasks.length&&expandedTaskChecklists.has(t.id);
  const subtaskMeta=subtasks.length?`<button type="button" class="subtaskMeta ${subtaskDone===subtasks.length?'allDone':''}" data-action="expand-checklist" aria-expanded="${checklistExpanded?'true':'false'}" aria-label="${checklistExpanded?'Collapse':'Expand'} checklist">☑ ${subtaskDone}/${subtasks.length}<span class="subtaskChevron">${checklistExpanded?'⌃':'⌄'}</span></button>`:'';
  const inlineChecklist=checklistExpanded?`<div class="inlineChecklist">${subtasks.map(s=>`<button type="button" class="inlineSubtask ${s.done?'done':''}" data-action="toggle-subtask" data-subtask-id="${esc(s.id)}" aria-pressed="${s.done?'true':'false'}"><span class="inlineSubtaskCheck">${s.done?'✓':''}</span><span class="inlineSubtaskTitle">${esc(s.title)}</span></button>`).join('')}</div>`:'';
  const priority=t.priority&&t.priority!=='normal'?`<span class="pill priorityPill ${t.priority==='high'?'priorityHigh':''}">${esc(t.priority)}</span>`:'';
  const reminder=reminderLabel(t.reminder);
  const projectName=projectNameForTask(t);
  const projectMeta=projectName?`<button type="button" class="projectTaskPill" data-action="project" data-project-id="${esc(t.projectId)}">▦ ${esc(projectName)}</button>`:'';
  const surface=`<div class="taskSurface"><button class="check" data-action="toggle" aria-label="Toggle complete">${t.completed?'✓':''}</button><div class="taskBody ${subtasks.length?'checklistTap':''}" ${subtasks.length?'data-action="checklist" aria-label="Open checklist"':''}><div class="taskTitle">${esc(t.title)}</div><div class="meta">${t.time?`<span class="taskTimeBadge">${esc(t.time)} · ${durationLabel(t.durationMinutes)}</span>`:''}${isOverdue(t)?`<span class="pill" style="color:var(--danger)">Overdue · ${esc(fmt(t.date,{day:'numeric',month:'short'}))}</span>`:''}<span class="categoryText">${esc(t.category)}</span>${projectMeta}${priority}${t.recurrence&&t.recurrence!=='none'?`<span class="pill">↻ ${esc(recurrenceLabel(t))}</span>`:''}${reminder?`<span class="pill">◷ ${esc(reminder)}</span>`:''}${subtaskMeta}${calendarSyncHtml(t)}</div>${t.notes?`<div class="taskNotes muted">${esc(t.notes)}</div>`:''}${inlineChecklist}${isOverdue(t)?`<button class="chip" data-action="today" style="margin-top:10px;padding:7px 10px">Move to Today</button>`:''}</div><div class="taskActions">${top3Mode&&!t.completed?'<button type="button" class="top3DragHandle" aria-label="Drag to reorder Top 3">≡</button>':''}${t.completed?'':`<button class="smallbtn" data-action="pin" aria-label="Pin">${t.pinned?'★':'☆'}</button>`}<button class="smallbtn" data-action="actions" aria-label="Task actions">•••</button></div></div>`;
  return `<div class="task taskSwipe ${t.completed?'done':''}" data-id="${t.id}"><div class="swipeUnderlay"><div class="swipeCompleteCue">✓ Complete</div><div class="swipeQuickActions"><button data-action="tomorrow">Tomorrow</button><button data-action="edit">Edit</button><button data-action="delete">Delete</button></div></div>${surface}</div>`
}
function visibleTasks(arr){return state.showCompleted?arr:arr.filter(t=>!t.completed)}
function completedSection(tasks,key){
  if(!state.showCompleted||!tasks.length)return '';
  const open=!!completedOpen[key];
  return `<section class="section completedSection"><button class="completedToggle" data-completed-key="${esc(key)}" aria-expanded="${open}"><span>Completed</span><span class="muted">${tasks.length} ${open?'⌃':'⌄'}</span></button>${open?`<div class="completedList">${sortTasks(tasks).map(taskHtml).join('')}</div>`:''}</section>`
}
function isOverdue(t){return !!t.date && !t.completed && t.date<localKey(new Date())}
function priorityRank(p){return p==='high'?0:p==='normal'?1:2}
function sortTasks(arr){return [...arr].sort((a,b)=>{
  if(a.completed!==b.completed)return a.completed?1:-1;
  const at=a.time||'99:99', bt=b.time||'99:99';
  if(at!==bt)return at.localeCompare(bt);
  const pr=priorityRank(a.priority)-priorityRank(b.priority);
  if(pr)return pr;
  return (a.createdAt||0)-(b.createdAt||0);
})}

function sortTop3(arr){
  const fallback=sortTasks(arr);
  const fallbackRank=new Map(fallback.map((t,i)=>[t.id,i]));
  return [...arr].sort((a,b)=>{
    const ao=typeof a.top3Order==='number'&&Number.isFinite(a.top3Order)?a.top3Order:1000+(fallbackRank.get(a.id)||0);
    const bo=typeof b.top3Order==='number'&&Number.isFinite(b.top3Order)?b.top3Order:1000+(fallbackRank.get(b.id)||0);
    return ao-bo;
  });
}

function toggleTaskPin(t){
  if(!t||t.completed)return false;
  if(!t.pinned&&state.tasks.filter(x=>x.date===t.date&&x.pinned&&!x.completed).length>=3){
    alert('Top 3 is full for that day.');
    return false;
  }
  if(t.pinned){
    t.pinned=false;
    delete t.top3Order;
    normalizeTop3Orders(t.date);
  }else{
    t.pinned=true;
    t.top3Order=nextTop3Order(t.date);
  }
  t.updatedAt=Date.now();
  save();
  render();
  return true;
}

function nextTop3Order(date){
  const pinned=state.tasks.filter(t=>t.date===date&&t.pinned&&!t.completed);
  if(!pinned.length)return 0;
  const values=pinned.map(t=>typeof t.top3Order==='number'&&Number.isFinite(t.top3Order)?t.top3Order:-1);
  return Math.max(...values)+1;
}
function normalizeTop3Orders(date){
  sortTop3(state.tasks.filter(t=>t.date===date&&t.pinned&&!t.completed)).forEach((t,i)=>{t.top3Order=i});
}

function sortUpcoming(arr){return [...arr].sort((a,b)=>{
  if((a.date||'')!==(b.date||''))return (a.date||'').localeCompare(b.date||'');
  const at=a.time||'99:99',bt=b.time||'99:99';
  if(at!==bt)return at.localeCompare(bt);
  return priorityRank(a.priority)-priorityRank(b.priority);
})}
const WEEKDAY_NAMES=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
function clampInt(value,min,max,fallback){
  const n=Math.round(Number(value));
  return Number.isFinite(n)?Math.min(max,Math.max(min,n)):fallback;
}
function defaultRecurrenceConfig(type='none',date=''){
  const weekday=date?parseKey(date).getDay():new Date().getDay();
  const day=date?parseKey(date).getDate():new Date().getDate();
  if(type==='weekdays')return {unit:'weeks',interval:1,weekdays:[1,2,3,4,5],monthlyMode:'day',monthDay:day,ordinal:1,weekday,endMode:'never',endDate:'',maxOccurrences:10,anchorDate:date||''};
  if(type==='weekly')return {unit:'weeks',interval:1,weekdays:[weekday],monthlyMode:'day',monthDay:day,ordinal:1,weekday,endMode:'never',endDate:'',maxOccurrences:10,anchorDate:date||''};
  if(type==='monthly')return {unit:'months',interval:1,weekdays:[],monthlyMode:'day',monthDay:day,ordinal:1,weekday,endMode:'never',endDate:'',maxOccurrences:10,anchorDate:date||''};
  return {unit:'days',interval:1,weekdays:[],monthlyMode:'day',monthDay:day,ordinal:1,weekday,endMode:'never',endDate:'',maxOccurrences:10,anchorDate:date||''};
}
function recurrenceConfigForTask(t){
  const type=t?.recurrence||'none';
  if(type==='none')return null;
  const base=defaultRecurrenceConfig(type,t.date||'');
  const saved=t.recurrenceConfig&&typeof t.recurrenceConfig==='object'?t.recurrenceConfig:{};
  const cfg={...base,...saved};
  cfg.interval=clampInt(cfg.interval,1,99,1);
  cfg.weekdays=Array.isArray(cfg.weekdays)?[...new Set(cfg.weekdays.map(Number).filter(n=>n>=0&&n<=6))]:base.weekdays;
  cfg.monthDay=clampInt(cfg.monthDay,1,31,base.monthDay);
  cfg.ordinal=[1,2,3,4,5,-1].includes(Number(cfg.ordinal))?Number(cfg.ordinal):1;
  cfg.weekday=clampInt(cfg.weekday,0,6,base.weekday);
  cfg.maxOccurrences=clampInt(cfg.maxOccurrences,2,999,10);
  cfg.anchorDate=cfg.anchorDate||t.date||'';
  return cfg;
}
function weekStartKey(key){
  const d=parseKey(key),diff=d.getDay();
  d.setDate(d.getDate()-diff);
  return localKey(d);
}
function daysBetween(a,b){return Math.round((parseKey(b)-parseKey(a))/86400000)}
function nthWeekdayOfMonth(year,month,weekday,ordinal){
  if(ordinal===-1){
    const d=new Date(year,month+1,0,12);
    d.setDate(d.getDate()-((d.getDay()-weekday+7)%7));
    return localKey(d);
  }
  const d=new Date(year,month,1,12);
  d.setDate(1+((weekday-d.getDay()+7)%7)+(ordinal-1)*7);
  if(d.getMonth()!==month)return '';
  return localKey(d);
}
function nextOccurrence(date,recurrence,config){
  if(!date||recurrence==='none')return '';
  const cfg=config||defaultRecurrenceConfig(recurrence,date);
  const interval=clampInt(cfg.interval,1,99,1);
  if(cfg.unit==='days'){
    return addDays(date,interval);
  }
  if(cfg.unit==='weeks'){
    const weekdays=(cfg.weekdays?.length?cfg.weekdays:[parseKey(date).getDay()]).slice().sort((a,b)=>a-b);
    const anchor=cfg.anchorDate||date;
    const anchorWeek=weekStartKey(anchor);
    for(let n=1;n<=3700;n++){
      const candidate=addDays(date,n);
      const cd=parseKey(candidate);
      if(!weekdays.includes(cd.getDay()))continue;
      const weeks=Math.floor(daysBetween(anchorWeek,weekStartKey(candidate))/7);
      if(weeks>=0&&weeks%interval===0)return candidate;
    }
    return '';
  }
  if(cfg.unit==='months'){
    const current=parseKey(date);
    const target=new Date(current.getFullYear(),current.getMonth()+interval,1,12);
    if(cfg.monthlyMode==='ordinal'){
      return nthWeekdayOfMonth(target.getFullYear(),target.getMonth(),clampInt(cfg.weekday,0,6,current.getDay()),Number(cfg.ordinal)||1);
    }
    const wanted=clampInt(cfg.monthDay,1,31,current.getDate());
    const last=new Date(target.getFullYear(),target.getMonth()+1,0,12).getDate();
    target.setDate(Math.min(wanted,last));
    return localKey(target);
  }
  return '';
}
function recurrenceLabel(t){
  if(!t?.recurrence||t.recurrence==='none')return '';
  const cfg=recurrenceConfigForTask(t);
  if(!cfg)return '';
  let label='Repeats';
  if(cfg.unit==='days')label=cfg.interval===1?'Daily':`Every ${cfg.interval} days`;
  else if(cfg.unit==='weeks'){
    const days=(cfg.weekdays||[]).slice().sort((a,b)=>a-b);
    if(cfg.interval===1&&days.join(',')==='1,2,3,4,5')label='Weekdays';
    else if(days.length)label=(cfg.interval===1?'Every week':'Every '+cfg.interval+' weeks')+' · '+days.map(d=>WEEKDAY_NAMES[d]).join(', ');
    else label=cfg.interval===1?'Weekly':`Every ${cfg.interval} weeks`;
  }else if(cfg.unit==='months'){
    if(cfg.monthlyMode==='ordinal'){
      const ord={1:'1st',2:'2nd',3:'3rd',4:'4th',5:'5th','-1':'Last'}[cfg.ordinal]||'1st';
      label=(cfg.interval===1?'Monthly':'Every '+cfg.interval+' months')+' · '+ord+' '+WEEKDAY_NAMES[cfg.weekday];
    }else{
      label=(cfg.interval===1?'Monthly':'Every '+cfg.interval+' months')+' · day '+cfg.monthDay;
    }
  }
  if(cfg.endMode==='date'&&cfg.endDate)label+=' · until '+fmt(cfg.endDate,{day:'numeric',month:'short'});
  if(cfg.endMode==='count')label+=' · '+cfg.maxOccurrences+' times';
  return label;
}

function recurrenceSeriesKey(t){return t?.seriesId||t?.id||''}
function recurrenceOccurrenceNumberOnDate(t,date){
  if(!t||!date||!t.recurrence||t.recurrence==='none')return 0;
  const cfg=recurrenceConfigForTask(t);if(!cfg)return 0;
  const anchor=cfg.anchorDate||t.date;if(!anchor||date<anchor)return 0;
  if(cfg.endMode==='date'&&cfg.endDate&&date>cfg.endDate)return 0;
  let current=anchor,occurrence=1;
  if(current===date)return cfg.endMode==='count'&&occurrence>cfg.maxOccurrences?0:occurrence;
  for(let guard=0;guard<5000;guard++){
    if(cfg.endMode==='count'&&occurrence>=cfg.maxOccurrences)return 0;
    const next=nextOccurrence(current,t.recurrence,cfg);
    if(!next||next<=current)return 0;
    occurrence++;
    if(cfg.endMode==='date'&&cfg.endDate&&next>cfg.endDate)return 0;
    if(next===date)return occurrence;
    if(next>date)return 0;
    current=next;
  }
  return 0;
}
function recurringSeriesSeeds(){
  const groups=new Map();
  state.tasks.filter(t=>t.recurrence&&t.recurrence!=='none'&&t.date).forEach(t=>{
    const key=recurrenceSeriesKey(t),current=groups.get(key);
    const rank=Number(t.occurrenceNumber||1),currentRank=Number(current?.occurrenceNumber||1);
    if(!current||rank>currentRank||(rank===currentRank&&(t.date||'')>(current.date||'')))groups.set(key,t);
  });
  return [...groups.values()];
}
function calendarTasksForDate(date){
  const actual=state.tasks.filter(t=>t.date===date);
  const actualSeries=new Set(actual.map(recurrenceSeriesKey));
  const virtual=[];
  recurringSeriesSeeds().forEach(seed=>{
    const key=recurrenceSeriesKey(seed);
    if(actualSeries.has(key))return;
    const occurrenceNumber=recurrenceOccurrenceNumberOnDate(seed,date);
    if(!occurrenceNumber)return;
    virtual.push({...seed,id:'virtual:'+key+':'+date,date,completed:false,pinned:false,virtualOccurrence:true,sourceTaskId:seed.id,occurrenceNumber});
  });
  return [...actual,...virtual];
}
function calendarPreviewTaskHtml(t){
  const project=projectNameForTask(t),repeat=recurrenceLabel(t);
  return `<button type="button" class="calendarPreviewTask" data-calendar-series="${esc(t.sourceTaskId||'')}"><span class="calendarPreviewIcon">↻</span><span class="calendarPreviewMain"><strong>${esc(t.title)}</strong><small>${t.time?esc(t.time)+' · ':''}${esc(t.category)}${project?' · '+esc(project):''}</small></span><span class="calendarPreviewRepeat">${esc(repeat||'Recurring')}</span></button>`;
}
function migrateRecurringCalendarState(){
  const groups=new Map();
  state.tasks.filter(t=>t.addToCalendar&&t.recurrence&&t.recurrence!=='none'&&t.date).forEach(t=>{
    const key=recurrenceSeriesKey(t),arr=groups.get(key)||[];arr.push(t);groups.set(key,arr);
  });
  let changed=false;
  groups.forEach(arr=>{
    arr.sort((a,b)=>Number(a.occurrenceNumber||1)-Number(b.occurrenceNumber||1)||(a.date||'').localeCompare(b.date||''));
    const latest=[...arr].reverse().find(t=>!t.completed)||arr[arr.length-1];
    if(latest&&latest.googleRecurrenceVersion!==1){
      if(latest.googleEventId)latest.googleRecurrenceStartDate=latest.googleRecurrenceStartDate||latest.date;
      latest.calendarSync='pending';changed=true;
    }
  });
  return changed;
}
const RRULE_WEEKDAYS=['SU','MO','TU','WE','TH','FR','SA'];
function googleUntilValue(date){
  if(!date)return '';
  const d=new Date(date+'T23:59:59');
  return d.toISOString().replace(/[-:]/g,'').replace(/\.000Z$/,'Z');
}
function googleRecurrenceRule(t){
  if(!t?.recurrence||t.recurrence==='none')return '';
  const cfg=recurrenceConfigForTask(t);if(!cfg)return '';
  const interval=clampInt(cfg.interval,1,99,1);
  const parts=[];
  if(cfg.unit==='days')parts.push('FREQ=DAILY');
  else if(cfg.unit==='weeks'){
    parts.push('FREQ=WEEKLY');
    const days=(cfg.weekdays?.length?cfg.weekdays:[parseKey(t.date).getDay()]).slice().sort((a,b)=>a-b);
    if(days.length)parts.push('BYDAY='+days.map(d=>RRULE_WEEKDAYS[d]).join(','));
    parts.push('WKST=SU');
  }else if(cfg.unit==='months'){
    parts.push('FREQ=MONTHLY');
    if(cfg.monthlyMode==='ordinal'){
      const ord=Number(cfg.ordinal)||1;
      parts.push('BYDAY='+ord+RRULE_WEEKDAYS[clampInt(cfg.weekday,0,6,parseKey(t.date).getDay())]);
    }else parts.push('BYMONTHDAY='+clampInt(cfg.monthDay,1,31,parseKey(t.date).getDate()));
  }else return '';
  if(interval>1)parts.push('INTERVAL='+interval);
  if(cfg.endMode==='date'&&cfg.endDate)parts.push('UNTIL='+googleUntilValue(cfg.endDate));
  if(cfg.endMode==='count'){
    const current=Math.max(1,Number(t.occurrenceNumber||1));
    parts.push('COUNT='+Math.max(1,cfg.maxOccurrences-current+1));
  }
  return 'RRULE:'+parts.join(';');
}

function createNextRecurring(t){
  if(!t||!t.completed||!t.date||!t.recurrence||t.recurrence==='none')return;
  const cfg=recurrenceConfigForTask(t);
  if(!cfg)return;
  const currentOccurrence=clampInt(t.occurrenceNumber,1,999999,1);
  if(cfg.endMode==='count'&&currentOccurrence>=cfg.maxOccurrences)return;
  const nextDate=nextOccurrence(t.date,t.recurrence,cfg);
  if(!nextDate)return;
  if(cfg.endMode==='date'&&cfg.endDate&&nextDate>cfg.endDate)return;
  const seriesId=t.seriesId||t.id;
  t.seriesId=seriesId;
  if(!cfg.anchorDate)cfg.anchorDate=t.date;
  t.recurrenceConfig={...cfg};
  const exists=state.tasks.some(x=>x.seriesId===seriesId&&x.date===nextDate);
  if(exists)return;
  const now=Date.now();
  state.tasks.push({
    ...t,
    id:uid(),
    seriesId,
    occurrenceNumber:currentOccurrence+1,
    recurrenceConfig:{...cfg},
    date:nextDate,
    completed:false,
    pinned:false,
    subtasks:Array.isArray(t.subtasks)?t.subtasks.map(s=>({...s,id:uid(),done:false})):[],
    googleEventId:t.addToCalendar&&t.recurrence!=='none'?(t.googleEventId||''):'',
    calendarSync:t.addToCalendar?(t.recurrence!=='none'&&t.googleEventId?'synced':'pending'):'',
    createdAt:now,
    updatedAt:now
  });
}

function getGoogleClientId(){return localStorage.getItem(GOOGLE_CLIENT_ID_KEY)||''}
function setGoogleClientId(v){const id=(v||'').trim();if(id)localStorage.setItem(GOOGLE_CLIENT_ID_KEY,id);else localStorage.removeItem(GOOGLE_CLIENT_ID_KEY)}
function getGoogleAuth(){try{return JSON.parse(localStorage.getItem(GOOGLE_AUTH_KEY)||'{}')}catch{return {}}}
function saveGoogleAuth(auth){localStorage.setItem(GOOGLE_AUTH_KEY,JSON.stringify(auth))}
function clearGoogleAuth(){localStorage.removeItem(GOOGLE_AUTH_KEY);googleTokenClient=null}
function googleConnected(){const a=getGoogleAuth();return !!a.accessToken&&Number(a.expiresAt||0)>Date.now()}
function googleStatusText(){
  const a=getGoogleAuth();
  if(googleConnected())return 'Connected';
  if(a.accessToken)return 'Connection expired — reconnect to sync';
  return 'Not connected';
}
function getDeleteQueue(){try{const q=JSON.parse(localStorage.getItem(GOOGLE_DELETE_QUEUE_KEY)||'[]');return Array.isArray(q)?q:[]}catch{return []}}
function setDeleteQueue(q){localStorage.setItem(GOOGLE_DELETE_QUEUE_KEY,JSON.stringify([...new Set(q.filter(Boolean))]))}
function queueGoogleDelete(eventId){if(!eventId)return;const q=getDeleteQueue();q.push(eventId);setDeleteQueue(q)}
function showToast(message){
  let el=document.getElementById('planlyToast');
  if(!el){el=document.createElement('div');el.id='planlyToast';el.style.cssText='position:fixed;left:50%;bottom:calc(150px + env(safe-area-inset-bottom));transform:translateX(-50%);z-index:80;max-width:calc(100% - 32px);background:var(--text);color:var(--bg);padding:11px 14px;border-radius:999px;font-size:13px;font-weight:650;box-shadow:0 8px 24px rgba(0,0,0,.2);opacity:0;transition:.2s;pointer-events:none';document.body.appendChild(el)}
  el.textContent=message;el.style.opacity='1';clearTimeout(showToast._t);showToast._t=setTimeout(()=>el.style.opacity='0',2600)
}
function cloneTasks(){return JSON.parse(JSON.stringify(state.tasks))}
function finishPendingUndo(){const p=showUndoToast._pending;if(!p)return;clearTimeout(p.timer);showUndoToast._pending=null;try{p.finalize?.()}catch{}}
function showUndoToast(message,undo,finalize){
  finishPendingUndo();
  let el=document.getElementById('planlyUndoToast');
  if(!el){el=document.createElement('div');el.id='planlyUndoToast';el.className='undoToast';const label=document.createElement('span');label.className='undoLabel';const button=document.createElement('button');button.type='button';button.className='undoButton';button.textContent='Undo';el.append(label,button);document.body.appendChild(el)}
  el.querySelector('.undoLabel').textContent=message;const button=el.querySelector('.undoButton');el.classList.add('show');
  const p={undo,finalize,timer:null};
  p.timer=setTimeout(()=>{if(showUndoToast._pending!==p)return;showUndoToast._pending=null;el.classList.remove('show');try{finalize?.()}catch{}},5000);
  showUndoToast._pending=p;
  button.onclick=()=>{if(showUndoToast._pending!==p)return;clearTimeout(p.timer);showUndoToast._pending=null;el.classList.remove('show');try{undo?.()}catch{}};
}
function restoreTaskSnapshot(snapshot){state.tasks=snapshot;save();render()}
function finishCalendarChange(t){if(!t?.addToCalendar||!t.date||!googleConnected())return;syncTaskToGoogle(t).then(()=>render()).catch(()=>{})}
function completeTaskWithUndo(t){
  if(!t||t.completed)return;
  const before=cloneTasks();t.completed=true;t.updatedAt=Date.now();createNextRecurring(t);save();render();
  showUndoToast('Task completed',()=>restoreTaskSnapshot(before),()=>{if(googleConnected())syncPendingGoogle().then(()=>render()).catch(()=>{})});
}
function rescheduleTaskWithUndo(t,newDate,message){
  if(!t||!newDate||t.date===newDate)return;
  const before=cloneTasks(),id=t.id;t.date=newDate;t.updatedAt=Date.now();if(t.addToCalendar)t.calendarSync='pending';save();render();
  showUndoToast(message,()=>{restoreTaskSnapshot(before);finishCalendarChange(state.tasks.find(x=>x.id===id))},()=>finishCalendarChange(state.tasks.find(x=>x.id===id)));
}
function deleteTaskWithUndo(t){
  if(!t)return;
  const before=cloneTasks(),isRecurringGoogle=!!(t.googleEventId&&t.recurrence&&t.recurrence!=='none'),eventId=isRecurringGoogle?'':(t.googleEventId||'');
  state.tasks=state.tasks.filter(x=>x.id!==t.id);save();render();
  showUndoToast(isRecurringGoogle?'Task removed from Planly · Google series unchanged':'Task deleted',()=>restoreTaskSnapshot(before),()=>{if(eventId)queueGoogleDelete(eventId);if(googleConnected())processPendingDeletes().catch(()=>{})});
}
function waitForGoogleIdentity(timeout=8000){
  return new Promise((resolve,reject)=>{
    const start=Date.now();
    const tick=()=>{
      if(window.google?.accounts?.oauth2)return resolve();
      if(Date.now()-start>timeout)return reject(new Error('Google sign-in library did not load.'));
      setTimeout(tick,100);
    };
    tick();
  });
}
async function requestGoogleAccess(prompt='consent'){
  const clientId=getGoogleClientId();
  if(!clientId)throw new Error('Add your Google OAuth client ID in Planly Settings first.');
  await waitForGoogleIdentity();
  return new Promise((resolve,reject)=>{
    googleTokenClient=google.accounts.oauth2.initTokenClient({
      client_id:clientId,
      scope:GOOGLE_SCOPE,
      callback:(resp)=>{
        if(resp?.error)return reject(new Error(resp.error_description||resp.error));
        const expiresIn=Number(resp.expires_in||3600);
        saveGoogleAuth({accessToken:resp.access_token,expiresAt:Date.now()+Math.max(60,expiresIn-60)*1000});
        resolve(resp);
      },
      error_callback:(err)=>reject(new Error(err?.message||'Google sign-in was cancelled.'))
    });
    googleTokenClient.requestAccessToken({prompt});
  });
}

async function ensureGoogleForTaskSync(){
  if(googleConnected())return true;
  if(!getGoogleClientId())return false;
  try{
    await requestGoogleAccess('');
    return googleConnected();
  }catch{
    return false;
  }
}

async function googleRequest(path,{method='GET',body}={}){
  const auth=getGoogleAuth();
  if(!googleConnected()){clearGoogleAuth();throw new Error('Google connection expired. Reconnect in Settings.')}
  const res=await fetch('https://www.googleapis.com/calendar/v3'+path,{
    method,
    headers:{Authorization:'Bearer '+auth.accessToken,'Content-Type':'application/json'},
    body:body===undefined?undefined:JSON.stringify(body)
  });
  if(res.status===401){clearGoogleAuth();throw new Error('Google connection expired. Reconnect in Settings.')}
  if(res.status===204)return null;
  const data=await res.json().catch(()=>({}));
  if(!res.ok){const err=new Error(data?.error?.message||('Google Calendar error '+res.status));err.status=res.status;throw err}
  return data;
}
function calendarBase(){return '/calendars/'+encodeURIComponent(PLANLY_CALENDAR_ID)+'/events'}
function taskEventResource(t){
  const checklist=Array.isArray(t.subtasks)&&t.subtasks.length
    ?'Checklist:\n'+t.subtasks.map(s=>(s.done?'☑ ':'☐ ')+s.title).join('\n')
    :'';
  const descriptionParts=[];
  if(t.notes)descriptionParts.push(t.notes);
  const projectName=projectNameForTask(t);if(projectName)descriptionParts.push('Project: '+projectName);
  if(checklist)descriptionParts.push(checklist);
  descriptionParts.push('Created by Planly');
  const recurrenceRule=googleRecurrenceRule(t);
  const eventDate=recurrenceRule?(t.googleRecurrenceStartDate||t.date):t.date;
  const resource={
    summary:t.title,
    description:descriptionParts.join('\n\n'),
    visibility:'private',
    recurrence:recurrenceRule?[recurrenceRule]:[]
  };
  if(t.time){
    const start=new Date(eventDate+'T'+t.time+':00');
    const duration=Math.max(5,Number(t.durationMinutes||30));
    const end=new Date(start.getTime()+duration*60*1000);
    resource.start={dateTime:start.toISOString(),timeZone:PLANLY_TIMEZONE};
    resource.end={dateTime:end.toISOString(),timeZone:PLANLY_TIMEZONE};
  }else{
    resource.start={date:eventDate};
    resource.end={date:addDays(eventDate,1)};
  }
  const reminderMinutes={'at-time':0,'5-min':5,'15-min':15,'30-min':30,'60-min':60,'1440-min':1440};
  if(t.reminder&&t.reminder!=='none'&&reminderMinutes[t.reminder]!==undefined){
    resource.reminders={useDefault:false,overrides:[{method:'popup',minutes:reminderMinutes[t.reminder]}]};
  }else{
    resource.reminders={useDefault:false,overrides:[]};
  }
  return resource;
}
async function syncTaskToGoogle(t){
  if(!t?.addToCalendar||!t.date)return {skipped:true};
  if(!googleConnected()){t.calendarSync='pending';save();return {pending:true}}
  if(t.recurrence&&t.recurrence!=='none'&&!t.googleRecurrenceStartDate)t.googleRecurrenceStartDate=t.date;
  try{
    let event;
    if(t.googleEventId){
      try{
        event=await googleRequest(calendarBase()+'/'+encodeURIComponent(t.googleEventId),{method:'PATCH',body:taskEventResource(t)});
      }catch(err){
        if(err.status!==404)throw err;
        t.googleEventId='';
        event=await googleRequest(calendarBase(),{method:'POST',body:taskEventResource(t)});
        t.googleEventId=event.id;
      }
    }else{
      event=await googleRequest(calendarBase(),{method:'POST',body:taskEventResource(t)});
      t.googleEventId=event.id;
    }
    t.calendarSync='synced';
    t.calendarSyncedAt=Date.now();
    t.googleRecurrenceVersion=t.recurrence&&t.recurrence!=='none'?1:0;
    save();
    return {synced:true,event};
  }catch(err){
    t.calendarSync=googleConnected()?'error':'pending';
    save();
    throw err;
  }
}
async function processPendingDeletes(){
  if(!googleConnected())return;
  const queue=getDeleteQueue(),remaining=[];
  for(const id of queue){
    try{await googleRequest(calendarBase()+'/'+encodeURIComponent(id),{method:'DELETE'})}
    catch(err){remaining.push(id);if(!googleConnected())break}
  }
  setDeleteQueue(remaining);
}
async function syncPendingGoogle(){
  if(!googleConnected())return;
  await processPendingDeletes();
  for(const t of state.tasks.filter(x=>x.addToCalendar&&x.date&&x.calendarSync!=='synced')){
    try{await syncTaskToGoogle(t)}catch{}
  }
  save();
}
async function connectGoogle(){
  await requestGoogleAccess('consent');
  await syncPendingGoogle();
  showToast('Google Calendar connected');
}
function disconnectGoogle(){
  const token=getGoogleAuth().accessToken;
  clearGoogleAuth();
  if(token&&window.google?.accounts?.oauth2?.revoke){try{google.accounts.oauth2.revoke(token,()=>{})}catch{}}
  showToast('Google Calendar disconnected');
}


function dayPlanTask(id){return dayPlanDraft?.find(t=>t.id===id)||null}
function dayPlanOriginalTask(id){return state.tasks.find(t=>t.id===id)||null}
function planDayDateLabel(t){
  const today=localKey(new Date()),tomorrow=addDays(today,1),weekend=thisWeekendKey(today);
  if(!t.date)return 'Inbox';
  if(t.date===today)return 'Today';
  if(t.date===tomorrow)return 'Tomorrow';
  if(t.date===weekend)return 'This weekend';
  if(t.date<today)return 'Still overdue · '+fmt(t.date,{day:'numeric',month:'short'});
  return fmt(t.date,{weekday:'short',day:'numeric',month:'short'});
}
function plannerTaskRow(t,source){
  const project=projectNameForTask(t);
  const original=dayPlanOriginalTask(t.id);
  const keepLabel=source==='overdue'?'Keep overdue':source==='inbox'?'Leave in Inbox':'Keep today';
  return `<div class="planDayTask" data-plan-id="${esc(t.id)}"><div class="planDayTaskMain"><strong>${esc(t.title)}</strong><span>${t.time?esc(t.time)+' · ':''}${esc(t.category)}${project?' · '+esc(project):''}</span></div><div class="planDayChoiceRow"><button type="button" data-plan-move="original" data-plan-id="${esc(t.id)}">${keepLabel}</button><button type="button" data-plan-move="today" data-plan-id="${esc(t.id)}">Today</button><button type="button" data-plan-move="tomorrow" data-plan-id="${esc(t.id)}">Tomorrow</button><button type="button" data-plan-move="weekend" data-plan-id="${esc(t.id)}">This weekend</button></div><label class="planDayPickDate"><span>Pick date</span><input type="date" class="input" data-plan-date="${esc(t.id)}" value="${esc(t.date||'')}"></label><div class="planDayStatus">Planned: <strong>${esc(planDayDateLabel(t))}</strong>${original?.date!==t.date?' · changed':''}</div></div>`;
}
function planTop3Card(t){
  const project=projectNameForTask(t),selected=!!t.pinned;
  return `<button type="button" class="planTop3Card ${selected?'selected':''}" data-plan-top3="${esc(t.id)}" aria-pressed="${selected?'true':'false'}"><span class="planTop3Star">${selected?'★':'☆'}</span><span class="planTop3Text"><strong>${esc(t.title)}</strong><small>${t.time?esc(t.time)+' · ':''}${esc(t.category)}${project?' · '+esc(project):''}</small></span></button>`;
}
function planDaySummaryHtml(){
  const today=localKey(new Date());
  const active=dayPlanDraft.filter(t=>!t.completed&&t.date===today);
  const pins=sortTop3(active.filter(t=>t.pinned)).slice(0,3);
  const timed=active.filter(t=>t.time);
  const anytime=active.filter(t=>!t.time);
  const minutes=timed.reduce((sum,t)=>sum+Number(t.durationMinutes||state.defaultDuration||30),0);
  const topList=pins.length?`<div class="planSummaryList">${pins.map((t,i)=>`<div><span>${i+1}</span><strong>${esc(t.title)}</strong></div>`).join('')}</div>`:'<div class="muted planSummaryEmpty">No Top 3 selected.</div>';
  return `<div class="planSummaryHero"><strong>Your day is ready to review</strong><span>Nothing changes in Planly until you tap Start my day.</span></div><div class="planSummaryGrid"><div><strong>${pins.length}/3</strong><span>Top priorities</span></div><div><strong>${timed.length}</strong><span>Timed tasks</span></div><div><strong>${anytime.length}</strong><span>Anytime tasks</span></div><div><strong>${minutes?durationLabel(minutes):'0m'}</strong><span>Timed workload</span></div></div><section class="planSummarySection"><h3>Top 3</h3>${topList}</section><section class="planSummarySection"><h3>Timeline</h3>${planTimelinePreviewHtml(active)}</section><section class="planSummarySection"><h3>Today</h3><div class="planSummaryTasks">${active.length?sortTasks(active).map(t=>`<div><strong>${esc(t.title)}</strong><span>${t.time?esc(t.time)+' · '+durationLabel(t.durationMinutes):'Anytime'}${projectNameForTask(t)?' · '+esc(projectNameForTask(t)):''}</span></div>`).join(''):'<div class="muted">Nothing scheduled for today.</div>'}</div></section>`;
}
function renderPlanDay(){
  if(!dayPlanDraft)return;
  const titles=['Overdue','Inbox','Today','Choose your Top 3','Summary'];
  $('#planDayEyebrow').textContent=`Step ${dayPlanStep+1} of 5`;
  $('#planDayTitle').textContent=titles[dayPlanStep];
  $('#planDayPrev').disabled=dayPlanStep===0;
  $('#planDayNext').textContent=dayPlanStep===4?'Start my day':'Next';
  const content=$('#planDayContent');
  if(dayPlanStep<=2){
    const key=['overdue','inbox','today'][dayPlanStep];
    const ids=dayPlanGroups[key]||[];
    const tasks=ids.map(dayPlanTask).filter(Boolean);
    const intro=key==='overdue'?'Decide what to do with tasks that are already past due.':key==='inbox'?'Give undated Inbox tasks a home, or leave them there for later.':'Keep today realistic by moving anything you are not doing today.';
    content.innerHTML=`<div class="planDayIntro">${intro}</div><div class="planDayTaskList">${tasks.length?tasks.map(t=>plannerTaskRow(t,key)).join(''):`<div class="empty compactEmpty">Nothing to review here.</div>`}</div>`;
  }else if(dayPlanStep===3){
    const today=localKey(new Date());
    const candidates=dayPlanDraft.filter(t=>!t.completed&&t.date===today);
    const selected=candidates.filter(t=>t.pinned).length;
    content.innerHTML=`<div class="planDayIntro">Choose up to three tasks that matter most today. You can reorder them later from Today.</div><div class="planTop3Count">${selected}/3 selected</div><div class="planTop3List">${candidates.length?sortTasks(candidates).map(planTop3Card).join(''):'<div class="empty compactEmpty">You have no active tasks planned for today.</div>'}</div>`;
  }else{
    content.innerHTML=planDaySummaryHtml();
  }
  $('#planDayContent').scrollTop=0;
}
function openPlanDay(){
  if($('#taskActionWrap')?.classList.contains('open'))closeTaskActions();
  if($('#projectsWrap')?.classList.contains('open'))closeProjects();
  closeOpenTaskSwipes();
  dayPlanDraft=cloneTasks();
  const today=localKey(new Date());
  dayPlanGroups={
    overdue:state.tasks.filter(t=>!t.completed&&t.date&&t.date<today).map(t=>t.id),
    inbox:state.tasks.filter(t=>!t.completed&&!t.date).map(t=>t.id),
    today:state.tasks.filter(t=>!t.completed&&t.date===today).map(t=>t.id)
  };
  dayPlanStep=0;
  $('#planDayWrap').classList.add('open');
  $('#planDayWrap').setAttribute('aria-hidden','false');
  renderPlanDay();
}
function closePlanDay(){
  $('#planDayWrap').classList.remove('open');
  $('#planDayWrap').setAttribute('aria-hidden','true');
  dayPlanDraft=null;dayPlanStep=0;dayPlanGroups={overdue:[],inbox:[],today:[]};
}
function moveDayPlanTask(id,target){
  const t=dayPlanTask(id);if(!t)return;
  const today=localKey(new Date());
  let next=t.date;
  if(target==='original')next=dayPlanOriginalTask(id)?.date||'';
  else if(target==='today')next=today;
  else if(target==='tomorrow')next=addDays(today,1);
  else if(target==='weekend')next=thisWeekendKey(today);
  else next=target||'';
  if(next!==t.date&&t.addToCalendar)t.calendarSync='pending';
  t.date=next;t.updatedAt=Date.now();
  if(next!==today){t.pinned=false;delete t.top3Order}
  renderPlanDay();
}
function toggleDayPlanTop3(id){
  const t=dayPlanTask(id);if(!t||t.completed||t.date!==localKey(new Date()))return;
  if(t.pinned){t.pinned=false;delete t.top3Order}
  else{
    const current=dayPlanDraft.filter(x=>!x.completed&&x.date===t.date&&x.pinned);
    if(current.length>=3){showToast('Top 3 already has three tasks');return}
    t.pinned=true;
    const orders=current.map(x=>Number.isFinite(x.top3Order)?x.top3Order:-1);
    t.top3Order=(orders.length?Math.max(...orders):-1)+1;
  }
  renderPlanDay();
}
function commitPlanDay(){
  if(!dayPlanDraft)return;
  state.tasks=dayPlanDraft;
  normalizeTop3Orders(localKey(new Date()));
  save();closePlanDay();state.tab='today';state.selectedDate=localKey(new Date());render();showToast('Day plan saved');
  if(googleConnected())syncPendingGoogle().then(()=>render()).catch(()=>{});
}
function handlePlanDayClick(e){
  const move=e.target.closest('[data-plan-move]');
  if(move){moveDayPlanTask(move.dataset.planId,move.dataset.planMove);return}
  const top=e.target.closest('[data-plan-top3]');
  if(top){toggleDayPlanTop3(top.dataset.planTop3);return}
}
function handlePlanDayChange(e){
  const input=e.target.closest('[data-plan-date]');if(!input)return;
  moveDayPlanTask(input.dataset.planDate,input.value||'');
}


function minutesFromNowLabel(targetMinutes){
  const now=new Date(),current=now.getHours()*60+now.getMinutes(),diff=Math.max(0,targetMinutes-current);
  if(diff<1)return 'Starts now';
  if(diff<60)return 'Starts in '+diff+'m';
  const h=Math.floor(diff/60),m=diff%60;
  return 'Starts in '+h+'h'+(m?' '+m+'m':'');
}
function projectDueLabel(date){
  const today=localKey(new Date());
  const diff=Math.round((parseKey(date)-parseKey(today))/86400000);
  if(diff<0)return Math.abs(diff)+'d overdue';
  if(diff===0)return 'Due today';
  if(diff===1)return 'Due tomorrow';
  return 'Due in '+diff+'d';
}
function todayDashboardHtml(activeToday,todayAll,overdue){
  const completed=todayAll.filter(t=>t.completed).length;
  const pct=todayAll.length?Math.round(completed/todayAll.length*100):0;
  const timed=activeToday.filter(t=>t.time);
  const timedMinutes=timed.reduce((sum,t)=>sum+Number(t.durationMinutes||state.defaultDuration||30),0);
  const now=new Date(),nowMin=now.getHours()*60+now.getMinutes();
  const intervals=timed.map(t=>({t,...taskTimeInterval(t)})).sort((a,b)=>a.start-b.start);
  const current=intervals.find(x=>nowMin>=x.start&&nowMin<x.end);
  const next=current||intervals.find(x=>x.start>=nowMin);
  let nextHtml='';
  if(next){
    const t=next.t,project=projectNameForTask(t);
    const status=current?'In progress · ends '+minutesToTime(Math.min(1439,next.end)):minutesFromNowLabel(next.start);
    nextHtml=`<button type="button" class="dashboardNextCard ${current?'current':''}" data-dashboard-focus="${esc(t.id)}"><span class="dashboardNextEyebrow">${current?'Now':'Next'} · ${esc(status)}</span><strong>${esc(t.title)}</strong><span>${esc(t.time)} · ${durationLabel(t.durationMinutes)}${project?' · '+esc(project):''}</span><em>Focus ›</em></button>`;
  }
  const deadlines=state.projects.filter(p=>!p.archived&&p.dueDate&&projectStats(p.id).active.length).sort((a,b)=>a.dueDate.localeCompare(b.dueDate)).slice(0,3);
  const deadlinesHtml=deadlines.length?`<section class="dashboardDeadlines"><div class="dashboardSectionHead"><strong>Project deadlines</strong><span>${deadlines.length}</span></div><div class="dashboardDeadlineList">${deadlines.map(p=>`<button type="button" data-dashboard-project="${esc(p.id)}"><span><strong>${esc(p.name)}</strong><small>${projectStats(p.id).active.length} active task${projectStats(p.id).active.length===1?'':'s'}</small></span><em class="${p.dueDate<localKey(new Date())?'late':''}">${esc(projectDueLabel(p.dueDate))}</em></button>`).join('')}</div></section>`:'';
  return `<section class="todayDashboard"><div class="dashboardHero"><div class="dashboardHeroTop"><div><span class="dashboardLabel">Today</span><strong>${activeToday.length} active task${activeToday.length===1?'':'s'}</strong></div><span class="dashboardPercent">${pct}%</span></div><div class="dashboardProgress"><span style="width:${pct}%"></span></div><div class="dashboardMetrics"><div><strong>${timed.length}</strong><span>Timed</span></div><div><strong>${durationLabel(timedMinutes)}</strong><span>Scheduled</span></div><div><strong>${overdue.length}</strong><span>Overdue</span></div></div><div class="dashboardActions"><button id="timelineBtn" type="button">Timeline</button><button id="planMyDayBtn" type="button" class="primaryDash">Plan my day</button></div></div>${nextHtml}${deadlinesHtml}</section>`;
}

function todayView(){
  const key=localKey(new Date());
  const todayAll=state.tasks.filter(t=>t.date===key),completed=sortTasks(todayAll.filter(t=>t.completed)),activeToday=todayAll.filter(t=>!t.completed);
  const overdue=sortTasks(state.tasks.filter(isOverdue)),pins=sortTop3(activeToday.filter(t=>t.pinned)).slice(0,3),remaining=activeToday.filter(t=>!t.pinned);
  const scheduled=sortTasks(remaining.filter(t=>t.time)),anytime=sortTasks(remaining.filter(t=>!t.time)),householdEvents=externalEventsForDate(key,'today');
  setHeader('Today',new Intl.DateTimeFormat(undefined,{weekday:'long',day:'numeric',month:'long'}).format(new Date()));
  const pct=todayAll.length?Math.round(completed.length/todayAll.length*100):0,dashboard=todayDashboardHtml(activeToday,todayAll,overdue);
  const allDone=!activeToday.length&&!overdue.length&&todayAll.length>0,nothingPlanned=!todayAll.length&&!overdue.length;
  const statusCard=allDone?'<div class="dayStatus doneStatus"><strong>All done for today</strong><span>✓</span></div>':nothingPlanned?'<div class="dayStatus"><strong>Nothing planned yet</strong><span class="muted">Tap + to add something.</span></div>':'';
  const household=householdEvents.length?`<section class="householdCard"><div class="sectionHead"><div><span class="householdEyebrow">Household</span><h2>Wife’s schedule</h2></div><span class="muted">${householdEvents.length}</span></div><div class="externalEventList">${householdEvents.map(e=>externalEventHtml(e,key)).join('')}</div></section>`:'';
  const top3=activeToday.length?`<section class="section"><div class="sectionHead"><h2>Top 3</h2><span class="muted">${pins.length}/3</span></div>${pins.length?`<div class="top3List">${pins.map(t=>taskHtml(t,true)).join('')}</div>`:'<div class="empty compactEmpty">Star up to three priorities for today.</div>'}</section>`:'';
  const schedule=scheduled.length?`<section class="section"><div class="sectionHead"><h2>Schedule</h2><span class="muted">${scheduled.length}</span></div>${scheduled.map(taskHtml).join('')}</section>`:'';
  const anytimeSection=anytime.length?`<section class="section"><div class="sectionHead"><h2>Anytime</h2><span class="muted">${anytime.length}</span></div>${anytime.map(taskHtml).join('')}</section>`:'';
  $('#view').innerHTML=`${dashboard}${household}${overdue.length?`<section class="section"><div class="sectionHead"><h2>Overdue</h2><span class="muted">${overdue.length}</span></div>${overdue.map(taskHtml).join('')}</section>`:''}${statusCard}${top3}${schedule}${anytimeSection}${completedSection(completed,'today:'+key)}`
}
function startMonday(key){const d=parseKey(key);const diff=(d.getDay()+6)%7;d.setDate(d.getDate()-diff);return localKey(d)}
function upcomingGroup(title,tasks){
  if(!tasks.length)return '';
  const byDate=new Map();
  sortUpcoming(tasks).forEach(t=>{if(!byDate.has(t.date))byDate.set(t.date,[]);byDate.get(t.date).push(t)});
  return `<section class="section upcomingSection"><div class="sectionHead"><h2>${title}</h2><span class="muted">${tasks.length}</span></div>${[...byDate.entries()].map(([date,items])=>`<div class="upcomingDateGroup"><div class="upcomingDateLabel">${fmt(date,{weekday:'long',day:'numeric',month:'short'})}</div>${items.map(taskHtml).join('')}</div>`).join('')}</section>`;
}
function upcomingView(){
  const today=localKey(new Date()),tomorrow=addDays(today,1),weekEnd=addDays(today,7);
  const future=state.tasks.filter(t=>!t.completed&&t.date&&t.date>today);
  const tomorrowTasks=future.filter(t=>t.date===tomorrow);
  const nextSeven=future.filter(t=>t.date>tomorrow&&t.date<=weekEnd);
  const later=future.filter(t=>t.date>weekEnd);
  setHeader('Upcoming','Your next 7 days and beyond');
  const total=future.length;
  $('#view').innerHTML=`<div class="upcomingSummary"><strong>${total} upcoming</strong><span class="muted">${tomorrowTasks.length} tomorrow</span></div>
  ${upcomingGroup('Tomorrow',tomorrowTasks)}
  ${upcomingGroup('Next 7 days',nextSeven)}
  ${upcomingGroup('Later',later)}
  ${!total?'<div class="empty upcomingEmpty">Nothing scheduled ahead yet.<br><span class="muted">Tap + to plan tomorrow.</span></div>':''}`
}
function monthStart(key){const d=parseKey(key);d.setDate(1);return localKey(d)}
function shiftMonth(key,n){const d=parseKey(key);d.setDate(1);d.setMonth(d.getMonth()+n);return localKey(d)}
function monthView(){
  const first=monthStart(state.monthAnchor),d=parseKey(first),year=d.getFullYear(),month=d.getMonth();
  setHeader(new Intl.DateTimeFormat(undefined,{month:'long'}).format(d),String(year));
  const showMe=monthCalendarFilter==='all'||monthCalendarFilter==='me',showWife=monthCalendarFilter==='all'||monthCalendarFilter==='wife';
  const offset=(d.getDay()+6)%7,days=new Date(year,month+1,0).getDate();
  let cal='<div class="calendar">'+['M','T','W','T','F','S','S'].map(x=>`<div class="dow">${x}</div>`).join('');
  for(let i=0;i<offset;i++)cal+='<div></div>';
  for(let day=1;day<=days;day++){
    const k=localKey(new Date(year,month,day,12)),items=showMe?calendarTasksForDate(k):[],external=showWife?externalEventsForDate(k,'month'):[];
    const activeCount=items.filter(t=>!t.completed).length,completedCount=items.filter(t=>!t.virtualOccurrence&&t.completed).length,dots=(activeCount?'<i class="calendarDot meDot"></i>':'')+(external.length?'<i class="calendarDot wifeDot"></i>':'');
    const hasAnything=activeCount||external.length,wifeLabel=external.length?externalEventShortLabel(external[0]):'';
    const calendarMark=showWife&&external.length?'<small class="calendarShiftLabel">'+esc(wifeLabel)+(external.length>1?' +'+(external.length-1):'')+'</small>':dots?'<small class="calendarDots">'+dots+'</small>':completedCount?'<small>✓</small>':'';
    cal+=`<button class="day ${hasAnything?'has':''} ${!hasAnything&&completedCount?'doneDay':''} ${state.selectedDate===k?'selected':''}" data-date="${k}"><span>${day}</span>${calendarMark}</button>`;
  }
  cal+='</div>';
  const dayTasks=showMe?calendarTasksForDate(state.selectedDate):[],active=sortTasks(dayTasks.filter(t=>!t.completed)),completed=sortTasks(dayTasks.filter(t=>!t.virtualOccurrence&&t.completed)),external=showWife?externalEventsForDate(state.selectedDate,'month'):[];
  const filters=`<div class="calendarFilters">${[['all','All'],['me','Me'],['wife','Wife'],['shared','Shared']].map(([id,label])=>`<button type="button" data-month-filter="${id}" class="${monthCalendarFilter===id?'active':''}">${label}</button>`).join('')}</div>`;
  const yourPlan=showMe?`<section class="section"><div class="sectionHead"><div><span class="calendarGroupLabel">Your plan</span><h2>${fmt(state.selectedDate,{weekday:'long',day:'numeric',month:'long'})}</h2></div></div>${active.length?active.map(t=>t.virtualOccurrence?calendarPreviewTaskHtml(t):taskHtml(t)).join(''):'<div class="empty compactEmpty">No active tasks for this date.</div>'}</section>${completedSection(completed,'month:'+state.selectedDate)}`:'';
  const wifeSourceName=external.length?(planlyCalendarSource(external[0].source_id)?.name||'Wife — NHS rota'):'Wife — NHS rota';
  const wifePlan=showWife&&external.length?`<section class="section externalCalendarSection"><div class="sectionHead"><div><span class="calendarGroupLabel">${esc(wifeSourceName)}</span><h2>Read only</h2></div><span class="muted">${external.length}</span></div><div class="externalEventList">${external.map(e=>externalEventHtml(e,state.selectedDate)).join('')}</div></section>`:'';
  const empty=planlyCalendarDataError?'<div class="empty"><strong>Calendar data could not be loaded.</strong><br><span class="muted">'+esc(planlyCalendarDataError)+'</span></div>':(!showMe&&!external.length?'<div class="empty">No calendar items for this filter and date.</div>':'');
  $('#view').innerHTML=`<div class="toolbar"><button id="prevMonth">‹</button><button id="todayMonth">Today</button><button id="nextMonth">›</button></div>${filters}${cal}${yourPlan}${wifePlan}${empty}`;
  $('#prevMonth').onclick=()=>{state.monthAnchor=shiftMonth(first,-1);state.selectedDate=state.monthAnchor;render()};$('#nextMonth').onclick=()=>{state.monthAnchor=shiftMonth(first,1);state.selectedDate=state.monthAnchor;render()};$('#todayMonth').onclick=()=>{state.monthAnchor=localKey(new Date());state.selectedDate=localKey(new Date());render()};
  $$('.day[data-date]').forEach(b=>b.onclick=()=>{state.selectedDate=b.dataset.date;render()});$$('[data-month-filter]').forEach(b=>b.onclick=()=>{monthCalendarFilter=b.dataset.monthFilter||'all';render()})
}
function inboxView(){setHeader('Inbox','Undated tasks');const arr=visibleTasks(state.tasks.filter(t=>!t.date));$('#view').innerHTML=`<section class="section">${arr.length?arr.map(taskHtml).join(''):`<div class="empty">Quick thoughts and undated tasks will appear here.</div>`}</section>`}

// Planly 3.1 cloud account foundation
let planlySupabase=null,planlySession=null;
function initPlanlySupabase(){
  const c=window.PLANLY_SUPABASE_CONFIG;
  if(!c?.url||!c?.publishableKey||!window.supabase?.createClient)return false;
  if(!planlySupabase)planlySupabase=window.supabase.createClient(c.url,c.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
  return true;
}
async function refreshPlanlySession(){
  if(!initPlanlySupabase())return null;
  const {data}=await planlySupabase.auth.getSession();planlySession=data?.session||null;return planlySession;
}
function planlyAccountHtml(){
  if(!initPlanlySupabase())return '<div class="muted settingsHelp">Cloud account service unavailable. Your local Planly data is unaffected.</div>';
  if(planlySession?.user){const email=planlySession.user.email||'Planly account';return '<div class="calendarStatusRow"><span class="statusDot connected"></span><strong>Signed in</strong></div><div class="muted settingsHelp">'+esc(email)+'<br>Your existing tasks are still stored locally. Cloud task sync is not enabled yet.</div><button id="planlySignOutBtn" class="secondaryBtn">Sign out</button>'}
  return '<div class="muted settingsHelp">Create a Planly account to prepare for secure calendar sources and future household sync. Your existing tasks stay on this iPhone.</div><div class="field"><label>Email</label><input id="planlyAuthEmail" class="input" type="email" autocomplete="email" placeholder="you@example.com"></div><div class="field"><label>Password</label><input id="planlyAuthPassword" class="input" type="password" autocomplete="current-password" minlength="8" placeholder="At least 8 characters"></div><button id="planlySignInBtn" class="primary">Sign in</button><button id="planlySignUpBtn" class="secondaryBtn">Create account</button>';
}
async function planlySignIn(){
  if(!initPlanlySupabase())throw new Error('Planly cloud service is unavailable.');
  const email=$('#planlyAuthEmail')?.value.trim(),password=$('#planlyAuthPassword')?.value||'';if(!email||!password)throw new Error('Enter your email and password.');
  const {data,error}=await planlySupabase.auth.signInWithPassword({email,password});if(error)throw error;planlySession=data.session;showToast('Signed in to Planly');render();
}
async function planlySignUp(){
  if(!initPlanlySupabase())throw new Error('Planly cloud service is unavailable.');
  const email=$('#planlyAuthEmail')?.value.trim(),password=$('#planlyAuthPassword')?.value||'';if(!email||password.length<8)throw new Error('Enter your email and a password of at least 8 characters.');
  const {data,error}=await planlySupabase.auth.signUp({email,password,options:{emailRedirectTo:'https://kovacs-x.github.io/planly/preview/'}});if(error)throw error;planlySession=data.session||null;showToast(data.session?'Planly account created':'Check your email to confirm your Planly account');render();
}
async function planlySignOut(){if(!initPlanlySupabase())return;await planlySupabase.auth.signOut();planlySession=null;planlyCalendarSources=[];planlyExternalEvents=[];showToast('Signed out of Planly');render()}
async function startPlanlyAuth(){
  if(!initPlanlySupabase())return;
  try{await refreshPlanlySession();await loadPlanlyCalendarData()}catch{}
  planlySupabase.auth.onAuthStateChange((_event,session)=>{planlySession=session;if(session)loadPlanlyCalendarData().then(()=>render()).catch(()=>{});else{planlyCalendarSources=[];planlyExternalEvents=[];render()}});
}
let planlyCalendarSources=[],planlyExternalEvents=[],monthCalendarFilter='all',planlyCalendarDataError='';
function calendarColour(value){return /^#[0-9a-f]{6}$/i.test(String(value||''))?String(value):'#E78AA7'}
function planlyCalendarSource(sourceId){return planlyCalendarSources.find(s=>String(s.id)===String(sourceId))||null}
async function loadPlanlyCalendarSources(){if(!planlySession?.user||!initPlanlySupabase()){planlyCalendarSources=[];return []}const {data,error}=await planlySupabase.from('calendar_sources').select('id,name,source_type,colour,is_read_only,show_today,show_month,show_timeline,enabled,status,last_synced_at').order('created_at',{ascending:true});if(error)throw error;planlyCalendarSources=data||[];return planlyCalendarSources}
async function loadPlanlyExternalEvents(){if(!planlySession?.user||!initPlanlySupabase()){planlyExternalEvents=[];planlyCalendarDataError='';return []}const {data,error}=await planlySupabase.from('external_calendar_events').select('id,source_id,external_uid,title,description,location,starts_at,ends_at,is_all_day,start_date,end_date,source_updated_at').order('start_date',{ascending:true});if(error){planlyExternalEvents=[];planlyCalendarDataError=error.message||'Calendar events could not be loaded.';throw error}planlyCalendarDataError='';planlyExternalEvents=data||[];return planlyExternalEvents}
async function loadPlanlyCalendarData(){if(!planlySession?.user){planlyCalendarSources=[];planlyExternalEvents=[];return []}await loadPlanlyCalendarSources();await loadPlanlyExternalEvents();return planlyExternalEvents}
function sourceVisibleFor(surface,sourceId){const s=planlyCalendarSource(sourceId);if(!s||s.enabled===false)return false;if(surface==='today')return s.show_today!==false;if(surface==='month')return s.show_month!==false;if(surface==='timeline')return s.show_timeline!==false;return true}
function externalEventOccursOnDate(e,key){const start=String(e.start_date||''),end=String(e.end_date||start);if(!start)return false;if(e.is_all_day)return end>start?key>=start&&key<end:key===start;return key>=start&&key<=end}
function externalEventsForDate(key,surface){return planlyExternalEvents.filter(e=>sourceVisibleFor(surface,e.source_id)&&externalEventOccursOnDate(e,key)).sort((a,b)=>{if(a.is_all_day!==b.is_all_day)return a.is_all_day?-1:1;return String(a.starts_at||'').localeCompare(String(b.starts_at||''))||String(a.title||'').localeCompare(String(b.title||''))})}
function planlyZonedParts(iso){if(!iso)return null;const d=new Date(iso);if(Number.isNaN(d.getTime()))return null;const p={};new Intl.DateTimeFormat('en-GB',{timeZone:PLANLY_TIMEZONE,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(d).forEach(x=>{if(x.type!=='literal')p[x.type]=x.value});const hour=Number(p.hour||0),minute=Number(p.minute||0);return {key:`${p.year}-${p.month}-${p.day}`,time:`${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}`,minutes:hour*60+minute}}
function externalEventShortLabel(e){
  const title=String(e?.title||'').trim(),head=title.split(/\s+-\s+/)[0].trim(),upper=head.toUpperCase();
  if(/^LATE\b/.test(upper)||upper==='L')return 'L';
  if(/^EARLY\b/.test(upper)||upper==='E')return 'E';
  if(/^LONG\s*DAY\b/.test(upper)||upper==='LD')return 'LD';
  if(/12\s*[-–]\s*8/.test(upper)||upper==='12-8'||upper==='12–8')return '12–8';
  if(/^DAY\s*OFF\b/.test(upper)||upper==='DO')return 'DO';
  if(/^COLDS?\b/.test(upper))return head;
  return head.length<=8?head:'•';
}
function externalEventTimeLabel(e,key){if(e.is_all_day)return 'All day';const s=planlyZonedParts(e.starts_at),end=planlyZonedParts(e.ends_at);if(!s)return 'Scheduled';if(s.key<key&&end)return 'Continues · until '+end.time;if(end&&end.key>key)return s.time+' → '+end.time+' next day';return s.time+(end?'–'+end.time:'')}
function externalEventHtml(e,key){const source=planlyCalendarSource(e.source_id),colour=calendarColour(source?.colour),sourceName=source?.name||'External calendar';return `<div class="externalEventCard" style="--calendar-source:${colour}"><div class="externalEventStripe"></div><div class="externalEventBody"><strong>${esc(e.title||'Busy')}</strong><span>${esc(externalEventTimeLabel(e,key))}${e.location?' · '+esc(e.location):''}</span><small>${esc(sourceName)} · Read only</small></div><span class="externalReadOnly">↗</span></div>`}
function externalEventBlocksTime(e){return externalEventShortLabel(e)!=='DO'}
function externalTimelineInterval(e,key){if(e.is_all_day||!externalEventBlocksTime(e))return null;const s=planlyZonedParts(e.starts_at),end=planlyZonedParts(e.ends_at);if(!s||s.key>key||(end&&end.key<key))return null;const start=s.key<key?0:s.minutes;let finish=end?(end.key>key?1440:end.minutes):Math.min(1440,start+30);if(finish<=start)finish=Math.min(1440,start+30);return {id:e.id,event:e,start,end:finish,colour:calendarColour(planlyCalendarSource(e.source_id)?.colour)}}
function externalTimelineIntervals(key){return externalEventsForDate(key,'timeline').map(e=>externalTimelineInterval(e,key)).filter(Boolean)}
function planlyCalendarSourcesHtml(){
  if(!planlySession?.user)return '<div class="muted settingsHelp">Sign in to Planly to add secure external calendars.</div>';
  const rows=planlyCalendarSources.length?planlyCalendarSources.map(s=>{
    const synced=s.last_synced_at?'Updated '+new Intl.DateTimeFormat(undefined,{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(s.last_synced_at)):'Not imported yet';
    const count=planlyExternalEvents.filter(e=>String(e.source_id)===String(s.id)).length;
    return `<details class="calendarSourceDetails" data-source-id="${esc(s.id)}"><summary><span class="statusDot ${s.enabled?'connected':'offline'}"></span><span class="calendarSourceSummaryText"><strong>${esc(s.name)}</strong><small>${esc((s.source_type==='ical'?'iCalendar · Read only':s.source_type)+' · '+synced+(count?' · '+count+' events':''))}</small></span><span class="calendarSourceChevron">›</span></summary><div class="calendarSourceBody"><div class="calendarSourceActions"><button type="button" class="secondaryBtn" data-planly-calendar-refresh="${esc(s.id)}">Refresh now</button><label class="calendarColourControl">Colour <input type="color" value="${esc(calendarColour(s.colour))}" data-planly-calendar-colour="${esc(s.id)}"></label></div><label class="settingToggle"><input type="checkbox" data-planly-calendar-toggle="show_today" data-source-id="${esc(s.id)}" ${s.show_today!==false?'checked':''}><span><strong>Show in Today</strong><small>Include this calendar in the Household card.</small></span></label><label class="settingToggle"><input type="checkbox" data-planly-calendar-toggle="show_month" data-source-id="${esc(s.id)}" ${s.show_month!==false?'checked':''}><span><strong>Show in Month</strong><small>Show shift labels and date details.</small></span></label><label class="settingToggle"><input type="checkbox" data-planly-calendar-toggle="show_timeline" data-source-id="${esc(s.id)}" ${s.show_timeline!==false?'checked':''}><span><strong>Show in Timeline</strong><small>Treat imported shifts as occupied time.</small></span></label><button type="button" class="dangerBtn calendarRemoveBtn" data-planly-calendar-remove="${esc(s.id)}" data-event-count="${count}">Remove calendar</button></div></details>`;
  }).join(''):'<div class="muted settingsHelp">No external calendars connected yet.</div>';
  return rows+'<details class="advancedSettings" id="addCalendarDetails"><summary>+ Add calendar</summary><div class="field"><label>Calendar name</label><input id="planlyCalendarName" class="input" value="Wife — NHS Rota" autocomplete="off"></div><div class="field"><label>iCalendar subscription link</label><input id="planlyCalendarUrl" class="input" type="url" inputmode="url" placeholder="webcal://… or https://…" autocomplete="off"></div><div class="muted settingsHelp">The private subscription link is sent directly to Planly’s authenticated server function and encrypted in Supabase Vault. It is not saved in localStorage.</div><button id="planlyAddCalendarBtn" class="primary">Add calendar</button></details>';
}
async function updatePlanlyCalendarSource(sourceId,patch){
  if(!planlySession?.user||!initPlanlySupabase())throw new Error('Sign in to Planly first.');
  const allowed={};
  if(Object.prototype.hasOwnProperty.call(patch,'show_today'))allowed.show_today=!!patch.show_today;
  if(Object.prototype.hasOwnProperty.call(patch,'show_month'))allowed.show_month=!!patch.show_month;
  if(Object.prototype.hasOwnProperty.call(patch,'show_timeline'))allowed.show_timeline=!!patch.show_timeline;
  if(Object.prototype.hasOwnProperty.call(patch,'colour'))allowed.colour=calendarColour(patch.colour);
  if(!Object.keys(allowed).length)return;
  const {error}=await planlySupabase.from('calendar_sources').update(allowed).eq('id',sourceId);
  if(error)throw error;
  const source=planlyCalendarSource(sourceId);if(source)Object.assign(source,allowed);
  showToast('Calendar settings updated');render();
}
async function removePlanlyCalendarSource(sourceId,eventCount=0){
  if(!planlySession?.user||!initPlanlySupabase())throw new Error('Sign in to Planly first.');
  const source=planlyCalendarSource(sourceId);if(!source)throw new Error('Calendar source not found.');
  const warning=eventCount>0?' This will also remove '+eventCount+' imported event'+(eventCount===1?'':'s')+'.':'';
  if(!confirm('Remove “'+source.name+'”?'+warning+' The private subscription credential will also be deleted.'))return;
  const {error:credentialError}=await planlySupabase.rpc('delete_calendar_source_credential',{p_source_id:sourceId});
  if(credentialError)throw new Error('Could not remove the private calendar credential.');
  const {error:sourceError}=await planlySupabase.from('calendar_sources').delete().eq('id',sourceId);
  if(sourceError)throw sourceError;
  await loadPlanlyCalendarData();showToast('Calendar removed');render();
}
async function refreshPlanlyCalendarSource(sourceId,btn){if(!planlySession?.access_token)throw new Error('Sign in to Planly first.');const original=btn?.textContent||'Refresh';if(btn){btn.disabled=true;btn.textContent='Refreshing…'}try{const c=window.PLANLY_SUPABASE_CONFIG,res=await fetch(c.url+'/functions/v1/calendar-source-create',{method:'POST',headers:{Authorization:'Bearer '+planlySession.access_token,apikey:c.publishableKey,'Content-Type':'application/json'},body:JSON.stringify({action:'refresh',sourceId})});const body=await res.json().catch(()=>({}));if(!res.ok)throw new Error(body.error||'Calendar could not be refreshed.');await loadPlanlyCalendarData();showToast('Imported '+Number(body.eventCount||0)+' calendar events');render();return body}finally{if(btn){btn.disabled=false;btn.textContent=original}}}
async function addPlanlyCalendarSource(){if(!planlySession?.access_token)throw new Error('Sign in to Planly first.');const name=$('#planlyCalendarName')?.value.trim(),feedUrl=$('#planlyCalendarUrl')?.value.trim();if(!name||!feedUrl)throw new Error('Enter a calendar name and iCalendar subscription link.');const btn=$('#planlyAddCalendarBtn');if(btn){btn.disabled=true;btn.textContent='Connecting…'}try{const c=window.PLANLY_SUPABASE_CONFIG,res=await fetch(c.url+'/functions/v1/calendar-source-create',{method:'POST',headers:{Authorization:'Bearer '+planlySession.access_token,apikey:c.publishableKey,'Content-Type':'application/json'},body:JSON.stringify({name,feedUrl,colour:'#E78AA7',showToday:true,showMonth:true,showTimeline:true})});const body=await res.json().catch(()=>({}));if(!res.ok)throw new Error(body.error||'Calendar could not be connected.');if($('#planlyCalendarUrl'))$('#planlyCalendarUrl').value='';await loadPlanlyCalendarData();showToast('Calendar connected securely');render()}finally{if(btn){btn.disabled=false;btn.textContent='Add calendar'}}}
function settingsView(){
  setHeader('Settings','Planly preferences');
  const googleStatus=googleStatusText(),googleId=getGoogleClientId();
  const pendingCount=state.tasks.filter(t=>t.addToCalendar&&t.date&&t.calendarSync!=='synced').length+getDeleteQueue().length;
  $('#view').innerHTML=`
  <div class="settingsCard"><h3>Planly Account</h3>${planlyAccountHtml()}</div>
  <div class="settingsCard"><h3>Calendars</h3>${planlyCalendarDataError?'<div class="empty compactEmpty"><strong>Calendar data error</strong><br><span class="muted">'+esc(planlyCalendarDataError)+'</span></div>':''}${planlyCalendarSourcesHtml()}</div>
  <div class="settingsCard"><h3>Appearance</h3><select id="themeSetting" class="select"><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></div>
  <div class="settingsCard"><h3>Task defaults</h3><label class="muted" style="font-size:13px">Default category</label><select id="defaultCat" class="select" style="margin-top:6px"><option>Personal</option><option>Work</option><option>Home</option><option>Health</option><option>Finance</option><option>Errands</option></select><label class="muted smallLabel">Default duration for timed tasks</label><select id="defaultDuration" class="select"><option value="15">15 minutes</option><option value="30">30 minutes</option><option value="45">45 minutes</option><option value="60">1 hour</option><option value="90">1 hour 30 minutes</option><option value="120">2 hours</option></select><label class="settingToggle"><input id="showCompleted" type="checkbox"><span>Show completed tasks</span></label><label class="settingToggle"><input id="autoCompleteParentSubtasks" type="checkbox"><span><strong>Complete task when checklist finishes</strong><small>When the final subtask is checked, complete the parent task automatically. You can still Undo it.</small></span></label></div>
  <div class="settingsCard"><h3>Time planning</h3><div class="row2"><div class="field"><label>Planning day starts</label><input id="planningStart" type="time" step="900" class="input"></div><div class="field"><label>Planning day ends</label><input id="planningEnd" type="time" step="900" class="input"></div></div><div class="muted settingsHelp">The Timeline uses these hours to calculate free time. Tasks outside the range are still shown.</div></div>
  <div class="settingsCard"><h3>Google Calendar</h3><div class="calendarStatusRow"><span class="statusDot ${googleConnected()?'connected':'offline'}"></span><strong>${esc(googleStatus)}</strong>${pendingCount?`<span class="muted">${pendingCount} pending</span>`:''}</div><div class="muted settingsHelp">Sync destination: your private <strong>Planly</strong> Google calendar. Planly refreshes Google access when you save a Calendar task when possible. Outlook is never modified.</div><label class="settingToggle"><input id="autoCalendarTimed" type="checkbox"><span><strong>Automatically sync timed tasks</strong><small>When a new task has a time, turn on “Add to Google Calendar” automatically.</small></span></label><details class="advancedSettings"><summary>Connection settings</summary><label class="muted smallLabel">Google OAuth client ID</label><input id="googleClientId" class="input" value="${esc(googleId)}" placeholder="...apps.googleusercontent.com" autocomplete="off"></details><button id="googleConnectBtn" class="primary">${googleConnected()?'Reconnect Google':'Connect Google Calendar'}</button><button id="googleSyncBtn" class="secondaryBtn">Sync pending items${pendingCount?` (${pendingCount})`:''}</button>${googleConnected()?'<button id="googleDisconnectBtn" class="dangerBtn">Disconnect Google</button>':''}</div>
  <div class="settingsCard"><h3>Data</h3><button id="exportBtn" class="primary">Export backup</button><button id="importBtn" class="secondaryBtn">Import backup</button><button id="clearBtn" class="dangerBtn">Clear all data</button></div>
  ${isStandalone()?'':'<div class="settingsCard"><h3>Install on iPhone</h3><div class="muted settingsHelp">Open Planly in Safari, tap Share, then Add to Home Screen.</div></div>'}
  <div class="settingsCard"><h3>About Planly</h3><div class="muted settingsHelp">Private local-first planner. Your tasks stay on this device unless you export or sync them.</div><div class="muted" style="font-size:12px;margin-top:8px">Planly 3.1.0 Preview</div></div>`;
  if($('#planlySignInBtn'))$('#planlySignInBtn').onclick=()=>planlySignIn().then(()=>loadPlanlyCalendarData()).catch(err=>alert(err.message));
  if($('#planlyAddCalendarBtn'))$('#planlyAddCalendarBtn').onclick=()=>addPlanlyCalendarSource().catch(err=>{alert(err.message);render()});
  $$('[data-planly-calendar-refresh]').forEach(btn=>btn.onclick=()=>refreshPlanlyCalendarSource(btn.dataset.planlyCalendarRefresh,btn).catch(err=>alert(err.message)));
  $$('[data-planly-calendar-toggle]').forEach(input=>input.onchange=()=>updatePlanlyCalendarSource(input.dataset.sourceId,{[input.dataset.planlyCalendarToggle]:input.checked}).catch(err=>{alert(err.message);render()}));
  $$('[data-planly-calendar-colour]').forEach(input=>input.onchange=()=>updatePlanlyCalendarSource(input.dataset.planlyCalendarColour,{colour:input.value}).catch(err=>{alert(err.message);render()}));
  $$('[data-planly-calendar-remove]').forEach(btn=>btn.onclick=()=>removePlanlyCalendarSource(btn.dataset.planlyCalendarRemove,Number(btn.dataset.eventCount||0)).catch(err=>alert(err.message)));
  if($('#planlySignUpBtn'))$('#planlySignUpBtn').onclick=()=>planlySignUp().catch(err=>alert(err.message));
  if($('#planlySignOutBtn'))$('#planlySignOutBtn').onclick=()=>planlySignOut().catch(err=>alert(err.message));
  $('#themeSetting').value=state.theme;
  $('#defaultCat').value=state.defaultCategory;
  $('#defaultDuration').value=String(state.defaultDuration||30);
  $('#showCompleted').checked=state.showCompleted;
  $('#autoCalendarTimed').checked=state.autoCalendarTimed;
  $('#autoCompleteParentSubtasks').checked=state.autoCompleteParentSubtasks;
  $('#planningStart').value=state.planningStart||'08:00';
  $('#planningEnd').value=state.planningEnd||'23:00';
  $('#themeSetting').onchange=e=>{state.theme=e.target.value;save();applyTheme()};
  $('#defaultCat').onchange=e=>{state.defaultCategory=e.target.value;save()};
  $('#defaultDuration').onchange=e=>{state.defaultDuration=Number(e.target.value||30);save()};
  $('#showCompleted').onchange=e=>{state.showCompleted=e.target.checked;save()};
  $('#autoCalendarTimed').onchange=e=>{state.autoCalendarTimed=e.target.checked;save()};
  $('#autoCompleteParentSubtasks').onchange=e=>{state.autoCompleteParentSubtasks=e.target.checked;save()};
  const savePlanningHours=()=>{const start=$('#planningStart').value||'08:00',end=$('#planningEnd').value||'23:00';if(timeToMinutes(end)<=timeToMinutes(start)){alert('Planning day end must be after the start time.');$('#planningStart').value=state.planningStart;$('#planningEnd').value=state.planningEnd;return}state.planningStart=start;state.planningEnd=end;save()};
  $('#planningStart').onchange=savePlanningHours;$('#planningEnd').onchange=savePlanningHours;
  $('#googleClientId').onchange=e=>setGoogleClientId(e.target.value);
  $('#googleConnectBtn').onclick=async()=>{setGoogleClientId($('#googleClientId').value);try{await connectGoogle();render()}catch(err){alert(err.message)}};
  $('#googleSyncBtn').onclick=async()=>{setGoogleClientId($('#googleClientId').value);try{if(!googleConnected())await requestGoogleAccess('consent');await syncPendingGoogle();showToast('Google Calendar sync complete');render()}catch(err){alert(err.message)}};
  if($('#googleDisconnectBtn'))$('#googleDisconnectBtn').onclick=()=>{disconnectGoogle();render()};
  $('#exportBtn').onclick=exportData;
  $('#importBtn').onclick=()=>$('#importFile').click();
  $('#clearBtn').onclick=()=>{if(confirm('Delete all Planly tasks and settings?')){localStorage.removeItem(STORE);location.reload()}}
}
function searchTaskHaystack(t){
  const subtaskText=Array.isArray(t.subtasks)?t.subtasks.map(s=>s.title).join(' '):'';
  return [t.title,t.notes,t.category,t.priority,projectNameForTask(t),subtaskText].filter(Boolean).join(' ').toLowerCase();
}
function searchResultHtml(t){
  const subtasks=Array.isArray(t.subtasks)?t.subtasks:[];
  const done=subtasks.filter(s=>s.done).length;
  const dateLabel=t.date?fmt(t.date,{day:'numeric',month:'short',year:'numeric'}):'Inbox';
  const projectName=projectNameForTask(t);
  return `<button class="searchResult" type="button" data-search-id="${t.id}"><span class="searchResultMain"><strong>${esc(t.title)}</strong><span class="searchResultMeta">${t.completed?'✓ Completed · ':''}${esc(dateLabel)}${t.time?' · '+esc(t.time):''} · ${esc(t.category)}${projectName?' · '+esc(projectName):''}${subtasks.length?' · '+done+'/'+subtasks.length+' subtasks':''}</span></span><span class="searchChevron">›</span></button>`;
}
function taskMatchesSearchFilters(t){
  const today=localKey(new Date());
  if(activeSearchFilter==='today'&&t.date!==today)return false;
  if(activeSearchFilter==='upcoming'&&(t.completed||!t.date||t.date<=today))return false;
  if(activeSearchFilter==='completed'&&!t.completed)return false;
  if(activeSearchFilter==='inbox'&&(t.completed||t.date))return false;
  const category=$('#searchCategory')?.value||'';
  const priority=$('#searchPriority')?.value||'';
  const project=$('#searchProject')?.value||'';
  if(category&&t.category!==category)return false;
  if(priority&&t.priority!==priority)return false;
  if(project&&t.projectId!==project)return false;
  return true;
}
function renderSearchResults(){
  const input=$('#searchInput'),results=$('#searchResults');
  if(!input||!results)return;
  const query=input.value.trim().toLowerCase();
  const hasFilter=activeSearchFilter!=='all'||!!($('#searchCategory')?.value)||!!($('#searchPriority')?.value)||!!($('#searchProject')?.value);
  if(!query&&!hasFilter){
    results.innerHTML='<div class="searchHint">Type to search, or use the filters to browse your tasks.</div>';
    return;
  }
  const matches=state.tasks.filter(t=>(!query||searchTaskHaystack(t).includes(query))&&taskMatchesSearchFilters(t)).sort((a,b)=>{
    if(a.completed!==b.completed)return a.completed?1:-1;
    const ad=a.date||'9999-99-99',bd=b.date||'9999-99-99';
    if(ad!==bd)return ad.localeCompare(bd);
    return (a.time||'99:99').localeCompare(b.time||'99:99');
  });
  const label=query?` for “${esc(input.value.trim())}”`:'';
  results.innerHTML=matches.length?matches.slice(0,100).map(searchResultHtml).join(''):`<div class="searchHint">No tasks found${label} with these filters.</div>`;
}
function openSearch(){
  closeOpenTaskSwipes();
  lockSheetBackground();
  $('#searchWrap').classList.add('open');
  $('#searchWrap').setAttribute('aria-hidden','false');
  $('#searchInput').value='';
  activeSearchFilter='all';
  document.querySelectorAll('[data-search-filter]').forEach(b=>b.classList.toggle('active',b.dataset.searchFilter==='all'));
  $('#searchCategory').value='';
  $('#searchPriority').value='';
  $('#searchProject').innerHTML='<option value="">All projects</option>'+state.projects.slice().sort((a,b)=>(a.name||'').localeCompare(b.name||'')).map(p=>`<option value="${esc(p.id)}">${esc(p.name)}${p.archived?' (Archived)':''}</option>`).join('');
  $('#searchProject').value='';
  renderSearchResults();
  setTimeout(()=>$('#searchInput').focus(),50);
}
function closeSearch(){
  const active=document.activeElement;if(active&&typeof active.blur==='function')active.blur();
  $('#searchWrap').classList.remove('open');
  $('#searchWrap').setAttribute('aria-hidden','true');
  unlockSheetBackground();
}

function render(){ $$('.nav button').forEach(b=>b.classList.toggle('active',b.dataset.tab===state.tab)); $('#addBtn').style.display=state.tab==='settings'?'none':'block'; if(state.tab==='today')todayView();else if(state.tab==='upcoming')upcomingView();else if(state.tab==='month')monthView();else if(state.tab==='inbox')inboxView();else settingsView(); refreshProjectsIfOpen(); refreshTimelineIfOpen(); refreshFocusIfOpen(); refreshTaskActionsIfOpen() }

function toggleTaskSubtask(t,subtaskId){
  if(!t||!Array.isArray(t.subtasks))return;
  const subtask=t.subtasks.find(s=>String(s.id)===String(subtaskId));
  if(!subtask)return;
  subtask.done=!subtask.done;
  t.updatedAt=Date.now();
  const recurringCalendar=!!(t.addToCalendar&&t.recurrence&&t.recurrence!=='none'&&t.googleEventId);
  if(t.addToCalendar&&!recurringCalendar)t.calendarSync='pending';
  const allDone=t.subtasks.length>0&&t.subtasks.every(s=>s.done);
  if(state.autoCompleteParentSubtasks&&subtask.done&&allDone&&!t.completed){
    save();
    completeTaskWithUndo(t);
    return;
  }
  save();
  render();
  if(t.addToCalendar&&!recurringCalendar&&googleConnected()){
    syncTaskToGoogle(t).then(()=>render()).catch(()=>render());
  }
}
function toggleInlineChecklist(t){
  if(!t||!Array.isArray(t.subtasks)||!t.subtasks.length)return;
  if(expandedTaskChecklists.has(t.id))expandedTaskChecklists.delete(t.id);
  else expandedTaskChecklists.add(t.id);
  render();
}

function openChecklist(t){
  openSheet(t);
  setTimeout(()=>{
    const field=$('.subtaskField');
    if(!field)return;
    field.scrollIntoView({block:'center',behavior:'smooth'});
    field.classList.remove('checklistFocus');
    void field.offsetWidth;
    field.classList.add('checklistFocus');
    setTimeout(()=>field.classList.remove('checklistFocus'),900);
  },60);
}

function handleViewClick(e){
  const calendarSeries=e.target.closest('[data-calendar-series]');if(calendarSeries){const source=state.tasks.find(x=>x.id===calendarSeries.dataset.calendarSeries);if(source)openSheet(source);return}
  const dashboardFocus=e.target.closest('[data-dashboard-focus]');if(dashboardFocus){openFocus(dashboardFocus.dataset.dashboardFocus);return}
  const dashboardProject=e.target.closest('[data-dashboard-project]');if(dashboardProject){openProjects(dashboardProject.dataset.dashboardProject);return}
  const timelineBtn=e.target.closest('#timelineBtn');if(timelineBtn){openTimeline(localKey(new Date()));return}
  const planBtn=e.target.closest('#planMyDayBtn');if(planBtn){openPlanDay();return}
  if(Date.now()<swipeSuppressClickUntil&&!e.target.closest('.swipeQuickActions'))return;
  const completedToggle=e.target.closest('.completedToggle');
  if(completedToggle){
    const key=completedToggle.dataset.completedKey;
    completedOpen[key]=!completedOpen[key];
    render();
    return;
  }

  const taskEl=e.target.closest('.task');
  if(!taskEl)return;
  const actionEl=e.target.closest('[data-action]');
  if(!actionEl)return;

  const t=state.tasks.find(x=>x.id===taskEl.dataset.id);
  if(!t)return;

  const action=actionEl.dataset.action;
  if(action!=='pin'&&action!=='expand-checklist'&&action!=='toggle-subtask')closeOpenTaskSwipes();
  if(action==='toggle'){
    if(t.completed){t.completed=false;t.updatedAt=Date.now();save();render()}else completeTaskWithUndo(t);
    return;
  }

  if(action==='pin'){toggleTaskPin(t);return}

  if(action==='today'){rescheduleTaskWithUndo(t,localKey(new Date()),'Moved to today');return}
  if(action==='tomorrow'){rescheduleTaskWithUndo(t,addDays(localKey(new Date()),1),'Moved to tomorrow');return}
  if(action==='delete'){deleteTaskWithUndo(t);return}
  if(action==='expand-checklist'){toggleInlineChecklist(t);return}
  if(action==='toggle-subtask'){toggleTaskSubtask(t,actionEl.dataset.subtaskId);return}
  if(action==='checklist'){openChecklist(t);return}
  if(action==='project'){openProjects(actionEl.dataset.projectId||t.projectId);return}
  if(action==='actions'){openTaskActions(t);return}

  if(action==='retry-sync'){
    if(!t.addToCalendar||!t.date)return;
    t.calendarSync='pending';save();render();
    if(!googleConnected()){showToast('Reconnect Google in Settings first');return}
    syncTaskToGoogle(t).then(()=>{showToast('Calendar sync complete');render()}).catch(()=>{showToast('Calendar sync failed');render()});
    return;
  }

  if(action==='edit'){
    openSheet(t);
  }
}


function recurrencePreset(type,date){
  const cfg=defaultRecurrenceConfig(type,date);
  if(type==='daily')cfg.unit='days';
  if(type==='weekly')cfg.unit='weeks';
  if(type==='weekdays'){cfg.unit='weeks';cfg.weekdays=[1,2,3,4,5]}
  if(type==='monthly')cfg.unit='months';
  return cfg;
}
function setWeekdayButtons(days){
  const set=new Set((days||[]).map(Number));
  document.querySelectorAll('#repeatWeekdays [data-weekday]').forEach(b=>b.classList.toggle('active',set.has(Number(b.dataset.weekday))));
}
function selectedWeekdays(){
  return [...document.querySelectorAll('#repeatWeekdays [data-weekday].active')].map(b=>Number(b.dataset.weekday)).sort((a,b)=>a-b);
}
function refreshRecurrenceAdvancedUI(){
  const repeat=$('#taskRepeat').value;
  const advanced=$('#repeatAdvanced');
  if(!advanced)return;
  advanced.hidden=repeat==='none';
  const unit=$('#repeatUnit').value;
  $('#repeatWeekdayWrap').hidden=unit!=='weeks';
  $('#repeatMonthlyWrap').hidden=unit!=='months';
  const mode=$('#repeatMonthMode').value;
  $('#repeatMonthDayWrap').hidden=unit!=='months'||mode!=='day';
  $('#repeatOrdinalWrap').hidden=unit!=='months'||mode!=='ordinal';
  const end=$('#repeatEndMode').value;
  $('#repeatEndDateWrap').hidden=end!=='date';
  $('#repeatCountWrap').hidden=end!=='count';
}
function writeRecurrenceForm(taskOrType,dateOverride=''){
  const type=typeof taskOrType==='string'?taskOrType:(taskOrType?.recurrence||'none');
  const date=dateOverride||(typeof taskOrType==='object'?taskOrType?.date:'')||$('#taskDate')?.value||localKey(new Date());
  let cfg=typeof taskOrType==='object'?recurrenceConfigForTask(taskOrType):null;
  if(!cfg&&type!=='none')cfg=recurrencePreset(type,date);
  $('#taskRepeat').value=type==='none'?'none':(type==='daily'||type==='weekly'||type==='weekdays'||type==='monthly'?type:'custom');
  if(!cfg)cfg=defaultRecurrenceConfig('daily',date);
  $('#repeatInterval').value=String(cfg.interval||1);
  $('#repeatUnit').value=cfg.unit||'days';
  setWeekdayButtons(cfg.weekdays||[]);
  $('#repeatMonthMode').value=cfg.monthlyMode||'day';
  $('#repeatMonthDay').value=String(cfg.monthDay||parseKey(date).getDate());
  $('#repeatOrdinal').value=String(cfg.ordinal||1);
  $('#repeatOrdinalWeekday').value=String(cfg.weekday??parseKey(date).getDay());
  $('#repeatEndMode').value=cfg.endMode||'never';
  $('#repeatEndDate').value=cfg.endDate||'';
  $('#repeatCount').value=String(cfg.maxOccurrences||10);
  refreshRecurrenceAdvancedUI();
}
function applyRepeatPreset(){
  const type=$('#taskRepeat').value;
  if(type==='none'){refreshRecurrenceAdvancedUI();return}
  if(type==='custom'){refreshRecurrenceAdvancedUI();return}
  const cfg=recurrencePreset(type,$('#taskDate').value||localKey(new Date()));
  $('#repeatInterval').value=String(cfg.interval);
  $('#repeatUnit').value=cfg.unit;
  setWeekdayButtons(cfg.weekdays);
  $('#repeatMonthMode').value=cfg.monthlyMode;
  $('#repeatMonthDay').value=String(cfg.monthDay);
  $('#repeatOrdinal').value=String(cfg.ordinal);
  $('#repeatOrdinalWeekday').value=String(cfg.weekday);
  refreshRecurrenceAdvancedUI();
}
function markRepeatCustom(){
  if($('#taskRepeat').value!=='none')$('#taskRepeat').value='custom';
  refreshRecurrenceAdvancedUI();
}
function readRecurrenceForm(){
  const type=$('#taskRepeat').value;
  if(type==='none')return {recurrence:'none',recurrenceConfig:null};
  const unit=$('#repeatUnit').value;
  let weekdays=selectedWeekdays();
  if(unit==='weeks'&&!weekdays.length)weekdays=[parseKey($('#taskDate').value||localKey(new Date())).getDay()];
  const cfg={
    unit,
    interval:clampInt($('#repeatInterval').value,1,99,1),
    weekdays,
    monthlyMode:$('#repeatMonthMode').value,
    monthDay:clampInt($('#repeatMonthDay').value,1,31,parseKey($('#taskDate').value||localKey(new Date())).getDate()),
    ordinal:Number($('#repeatOrdinal').value)||1,
    weekday:clampInt($('#repeatOrdinalWeekday').value,0,6,parseKey($('#taskDate').value||localKey(new Date())).getDay()),
    endMode:$('#repeatEndMode').value,
    endDate:$('#repeatEndDate').value||'',
    maxOccurrences:clampInt($('#repeatCount').value,2,999,10),
    anchorDate:$('#taskDate').value||''
  };
  let recurrence='custom';
  if(unit==='days'&&cfg.interval===1)recurrence='daily';
  if(unit==='weeks'&&cfg.interval===1&&cfg.weekdays.length===1)recurrence='weekly';
  if(unit==='weeks'&&cfg.interval===1&&cfg.weekdays.join(',')==='1,2,3,4,5')recurrence='weekdays';
  if(unit==='months'&&cfg.interval===1&&cfg.monthlyMode==='day')recurrence='monthly';
  return {recurrence,recurrenceConfig:cfg};
}
function nextWeekdayDate(weekday,fromKey=localKey(new Date())){
  const d=parseKey(fromKey);
  let diff=(weekday-d.getDay()+7)%7;
  if(diff===0)diff=7;
  d.setDate(d.getDate()+diff);
  return localKey(d);
}
function parseTimeToken(text){
  let match=text.match(/\b(1[0-2]|0?[1-9])(?::([0-5]\d))?\s*(am|pm)\b/i);
  if(match){
    let h=Number(match[1])%12;if(match[3].toLowerCase()==='pm')h+=12;
    return {time:String(h).padStart(2,'0')+':'+String(Number(match[2]||0)).padStart(2,'0'),token:match[0]};
  }
  match=text.match(/\b([01]?\d|2[0-3])[:.]([0-5]\d)\b/);
  if(match)return {time:String(Number(match[1])).padStart(2,'0')+':'+match[2],token:match[0]};
  return null;
}
function parseNaturalTaskInput(){
  const input=$('#taskTitle');
  const original=input.value.trim();
  if(!original)return;
  let text=original;
  let date='',time='',priority='',category='',repeatType='',repeatCfg=null;
  const today=localKey(new Date());
  const categories=['Personal','Work','Home','Health','Finance','Errands'];

  const categoryMatch=text.match(/#(personal|work|home|health|finance|errands)\b/i);
  if(categoryMatch){category=categories.find(c=>c.toLowerCase()===categoryMatch[1].toLowerCase())||'';text=text.replace(categoryMatch[0],' ')}

  const priorityMatch=text.match(/(?:!|\bpriority\s+)(high|low)\b|\b(high|low)\s*$/i);
  if(priorityMatch){priority=(priorityMatch[1]||priorityMatch[2]).toLowerCase();text=text.replace(priorityMatch[0],' ')}

  const timeParsed=parseTimeToken(text);
  if(timeParsed){time=timeParsed.time;text=text.replace(timeParsed.token,' ')}

  if(/\btomorrow\b/i.test(text)){date=addDays(today,1);text=text.replace(/\btomorrow\b/i,' ')}
  else if(/\btoday\b/i.test(text)){date=today;text=text.replace(/\btoday\b/i,' ')}
  else if(/\bnext\s+week\b/i.test(text)){date=addDays(today,7);text=text.replace(/\bnext\s+week\b/i,' ')}

  const weekdayMap={sunday:0,sun:0,monday:1,mon:1,tuesday:2,tue:2,tues:2,wednesday:3,wed:3,thursday:4,thu:4,thur:4,thurs:4,friday:5,fri:5,saturday:6,sat:6};
  const monthlyOrdinal=text.match(/\b(?:every\s+month\s+on\s+the\s+|on\s+the\s+)?(first|second|third|fourth|fifth|last)\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)(?:\s+every\s+month|\s+monthly)?\b/i);
  if(monthlyOrdinal&&(/every\s+month|monthly/i.test(monthlyOrdinal[0]))){
    const ordMap={first:1,second:2,third:3,fourth:4,fifth:5,last:-1};
    repeatType='custom';repeatCfg=defaultRecurrenceConfig('monthly',date||today);
    repeatCfg.unit='months';repeatCfg.monthlyMode='ordinal';repeatCfg.ordinal=ordMap[monthlyOrdinal[1].toLowerCase()];repeatCfg.weekday=weekdayMap[monthlyOrdinal[2].toLowerCase()];
    text=text.replace(monthlyOrdinal[0],' ');
  }

  const monthlyDay=text.match(/\b(?:on\s+the\s+)?(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?every\s+month\b|\bevery\s+month\s+(?:on\s+the\s+)?(\d{1,2})(?:st|nd|rd|th)?\b/i);
  if(monthlyDay){
    repeatType='monthly';repeatCfg=defaultRecurrenceConfig('monthly',date||today);
    repeatCfg.monthDay=clampInt(monthlyDay[1]||monthlyDay[2],1,31,1);
    text=text.replace(monthlyDay[0],' ');
  }

  const everyInterval=text.match(/\bevery\s+(\d+)\s+(day|days|week|weeks|month|months)\b/i);
  if(everyInterval){
    const unitWord=everyInterval[2].toLowerCase();
    repeatType='custom';repeatCfg=defaultRecurrenceConfig('daily',date||today);
    repeatCfg.interval=clampInt(everyInterval[1],1,99,1);
    repeatCfg.unit=unitWord.startsWith('day')?'days':unitWord.startsWith('week')?'weeks':'months';
    if(repeatCfg.unit==='weeks')repeatCfg.weekdays=[date?parseKey(date).getDay():new Date().getDay()];
    if(repeatCfg.unit==='months')repeatCfg.monthDay=(date?parseKey(date):new Date()).getDate();
    text=text.replace(everyInterval[0],' ');
  }

  if(!repeatCfg&&/\bevery\s+weekday(?:s)?\b|\bweekdays\b/i.test(text)){
    repeatType='weekdays';repeatCfg=defaultRecurrenceConfig('weekdays',date||today);text=text.replace(/\bevery\s+weekday(?:s)?\b|\bweekdays\b/i,' ');
  }

  if(!repeatCfg&&/\b(daily|every\s+day)\b/i.test(text)){repeatType='daily';repeatCfg=defaultRecurrenceConfig('daily',date||today);text=text.replace(/\b(daily|every\s+day)\b/i,' ')}
  if(!repeatCfg&&/\bweekly\b/i.test(text)){repeatType='weekly';repeatCfg=defaultRecurrenceConfig('weekly',date||today);text=text.replace(/\bweekly\b/i,' ')}
  if(!repeatCfg&&/\bmonthly\b/i.test(text)){repeatType='monthly';repeatCfg=defaultRecurrenceConfig('monthly',date||today);text=text.replace(/\bmonthly\b/i,' ')}

  if(!repeatCfg&&/\bevery\b/i.test(text)){
    const found=[];
    Object.entries(weekdayMap).forEach(([name,num])=>{if(new RegExp('\\b'+name+'s?\\b','i').test(text))found.push(num)});
    const unique=[...new Set(found)];
    if(unique.length){
      repeatType=unique.length===1?'weekly':'custom';repeatCfg=defaultRecurrenceConfig('weekly',date||today);repeatCfg.weekdays=unique.sort((a,b)=>a-b);
      text=text.replace(/\bevery\b/i,' ');
      Object.keys(weekdayMap).sort((a,b)=>b.length-a.length).forEach(name=>{text=text.replace(new RegExp('\\b'+name+'s?\\b','ig'),' ')});
      text=text.replace(/\b(and|on)\b/ig,' ');
      if(!date&&unique.length===1)date=nextWeekdayDate(unique[0],today);
    }
  }

  if(!date){
    const wd=text.match(/\b(?:next\s+)?(sunday|sun|monday|mon|tuesday|tue|tues|wednesday|wed|thursday|thu|thur|thurs|friday|fri|saturday|sat)\b/i);
    if(wd){date=nextWeekdayDate(weekdayMap[wd[1].toLowerCase()],today);text=text.replace(wd[0],' ')}
  }

  text=text.replace(/\s+/g,' ').replace(/^[,;:\-\s]+|[,;:\-\s]+$/g,'').trim();
  if(text)input.value=text;
  if(date){$('#taskDate').value=date;refreshQuickDateSelection()}
  if(time)$('#taskTime').value=time;
  if(priority)$('#taskPriority').value=priority;
  if(category)$('#taskCategory').value=category;
  if(time&&state.autoCalendarTimed)$('#taskCalendar').checked=true;
  if(repeatCfg){
    if(date&&!repeatCfg.anchorDate)repeatCfg.anchorDate=date;
    const synthetic={recurrence:repeatType||'custom',recurrenceConfig:repeatCfg,date:date||$('#taskDate').value||today};
    writeRecurrenceForm(synthetic);
  }
  const parts=[];
  if(date)parts.push(fmt(date,{day:'numeric',month:'short'}));
  if(time)parts.push(time);
  if(priority)parts.push(priority+' priority');
  if(category)parts.push(category);
  if(repeatCfg)parts.push(recurrenceLabel({recurrence:repeatType||'custom',recurrenceConfig:repeatCfg,date:date||$('#taskDate').value||today}));
  showToast(parts.length?'Filled: '+parts.join(' · '):'No date, time or recurrence detected');
}

function renderSubtaskEditor(){
  const list=$('#subtaskList');
  if(!list)return;
  if(!editingSubtasks.length){
    list.innerHTML='<div class="subtaskEmpty">No subtasks yet.</div>';
    return;
  }
  list.innerHTML=editingSubtasks.map((s,i)=>`<div class="subtaskEditRow" data-subtask-index="${i}"><button type="button" class="subtaskCheck ${s.done?'done':''}" data-subtask-action="toggle" aria-label="Toggle subtask">${s.done?'✓':''}</button><div class="subtaskEditTitle ${s.done?'done':''}">${esc(s.title)}</div><button type="button" class="subtaskRemove" data-subtask-action="remove" aria-label="Remove subtask">×</button></div>`).join('');
}
function addEditingSubtask(){
  const input=$('#subtaskInput');
  const title=(input?.value||'').trim();
  if(!title)return;
  editingSubtasks.push({id:uid(),title,done:false});
  input.value='';
  renderSubtaskEditor();
  input.focus();
}
function handleSubtaskEditorClick(e){
  const row=e.target.closest('[data-subtask-index]');
  const action=e.target.closest('[data-subtask-action]')?.dataset.subtaskAction;
  if(!row||!action)return;
  const index=Number(row.dataset.subtaskIndex);
  if(!Number.isInteger(index)||!editingSubtasks[index])return;
  if(action==='toggle')editingSubtasks[index].done=!editingSubtasks[index].done;
  if(action==='remove')editingSubtasks.splice(index,1);
  renderSubtaskEditor();
}

function refreshQuickDateSelection(){
  const value=$('#taskDate').value,today=localKey(new Date());
  const map={today,tomorrow:addDays(today,1),weekend:thisWeekendKey(today),nextweek:addDays(startMonday(today),7),none:''};
  $$('#quickDates .chip').forEach(c=>c.classList.toggle('active',map[c.dataset.q]===value));
}
function setQuick(q){
  const today=localKey(new Date());
  if(q==='today')$('#taskDate').value=today;
  else if(q==='tomorrow')$('#taskDate').value=addDays(today,1);
  else if(q==='weekend')$('#taskDate').value=thisWeekendKey(today);
  else if(q==='nextweek')$('#taskDate').value=addDays(startMonday(today),7);
  else if(q==='none')$('#taskDate').value='';
  refreshQuickDateSelection();
}
function defaultDateForNewTask(){
  const today=localKey(new Date());
  if(state.tab==='inbox')return '';
  if(state.tab==='month')return state.selectedDate||today;
  if(state.tab==='upcoming')return addDays(today,1);
  return today;
}
function lockSheetBackground(){
  const y=window.scrollY||0;
  document.body.dataset.sheetScroll=String(y);
  document.body.style.top=`-${y}px`;
  document.body.classList.add('sheetOpen');
  document.documentElement.classList.add('sheetOpen');
}
function unlockSheetBackground(){
  const y=Number(document.body.dataset.sheetScroll||0);
  document.body.classList.remove('sheetOpen');
  document.documentElement.classList.remove('sheetOpen');
  document.body.style.top='';
  delete document.body.dataset.sheetScroll;
  window.scrollTo(0,y);
}
function resetSheetPosition(){
  const sheet=$('.sheet'),wrap=$('#sheetWrap');
  if(sheet){sheet.style.transform='';sheet.style.transition=''}
  if(wrap){wrap.style.background='';wrap.classList.remove('dragging')}
}

function taskHasMoreOptions(task){
  if(!task)return false;
  const subtasks=Array.isArray(task.subtasks)?task.subtasks:[];
  return !!(
    (task.category&&task.category!==state.defaultCategory)||
    Number(task.durationMinutes||state.defaultDuration)!==Number(state.defaultDuration)||
    (task.reminder&&task.reminder!=='none')||
    (task.recurrence&&task.recurrence!=='none')||
    task.notes||
    subtasks.length||
    task.addToCalendar||
    task.projectId
  );
}
function setTaskMoreOptions(open){
  const details=$('#taskMoreOptions');
  if(details)details.open=!!open;
}
function prepareDuplicateTask(){
  const id=$('#taskId').value;
  const source=state.tasks.find(t=>t.id===id);
  if(!source)return;
  $('#taskId').value='';
  $('#deleteTask').style.display='none';
  $('#duplicateTask').style.display='none';
  $('#formActions').classList.remove('editing');
  editingSubtasks=editingSubtasks.map(s=>({...s,id:uid(),done:false}));
  renderSubtaskEditor();
  showToast('Duplicate ready — edit if needed, then save');
}

function openSheet(task,projectId=''){
  if($('#taskActionWrap')?.classList.contains('open'))closeTaskActions();
  resetSheetPosition();
  lockSheetBackground();
  $('#sheetWrap').classList.add('open');
  $('#sheetWrap').setAttribute('aria-hidden','false');
  $('#taskId').value=task?.id||'';
  $('#taskTitle').value=task?.title||'';
  $('#taskDate').value=task?.date??defaultDateForNewTask();
  $('#taskTime').value=task?.time||'';
  $('#taskDuration').value=String(task?.durationMinutes||state.defaultDuration||30);
  $('#taskPriority').value=task?.priority||'normal';
  $('#taskCategory').value=task?.category||state.defaultCategory;
  refreshProjectSelect(task?.projectId||projectId||'');
  writeRecurrenceForm(task||'none',task?.date||$('#taskDate').value);
  $('#taskReminder').value=task?.reminder||'none';
  $('#taskNotes').value=task?.notes||'';
  editingSubtasks=Array.isArray(task?.subtasks)?task.subtasks.map(s=>({id:s.id||uid(),title:s.title||'',done:!!s.done})):[];
  renderSubtaskEditor();
  $('#taskCalendar').checked=task?!!task.addToCalendar:false;
  $('#deleteTask').style.display=task?'block':'none';
  $('#duplicateTask').style.display=task?'block':'none';
  $('#formActions').classList.toggle('editing',!!task);
  setTaskMoreOptions(taskHasMoreOptions(task));
  refreshQuickDateSelection();
}
function closeSheet(){
  const active=document.activeElement;
  if(active&&typeof active.blur==='function')active.blur();
  $('#sheetWrap').classList.remove('open');
  $('#sheetWrap').setAttribute('aria-hidden','true');
  resetSheetPosition();
  unlockSheetBackground();
}
let sheetDragging=false,sheetDragStartY=0,sheetDragY=0,sheetDragStartedAt=0;
function beginSheetDrag(e){
  const touch=e.touches?.[0];
  if(!touch)return;
  sheetDragging=true;
  sheetDragStartY=touch.clientY;
  sheetDragY=0;
  sheetDragStartedAt=performance.now();
  $('#sheetWrap').classList.add('dragging');
  const sheet=$('.sheet');
  sheet.style.transition='none';
}
function moveSheetDrag(e){
  if(!sheetDragging)return;
  const touch=e.touches?.[0];
  if(!touch)return;
  const dy=Math.max(0,touch.clientY-sheetDragStartY);
  sheetDragY=dy;
  const sheet=$('.sheet'),wrap=$('#sheetWrap');
  sheet.style.transform=`translateY(${dy}px)`;
  const alpha=Math.max(.08,.35*(1-Math.min(dy,320)/320));
  wrap.style.background=`rgba(0,0,0,${alpha})`;
  if(dy>0)e.preventDefault();
}
function endSheetDrag(){
  if(!sheetDragging)return;
  sheetDragging=false;
  const elapsed=Math.max(1,performance.now()-sheetDragStartedAt);
  const velocity=sheetDragY/elapsed;
  const shouldClose=sheetDragY>90||(sheetDragY>35&&velocity>.55);
  const sheet=$('.sheet'),wrap=$('#sheetWrap');
  wrap.classList.remove('dragging');
  sheet.style.transition='transform .2s cubic-bezier(.22,.61,.36,1)';
  if(shouldClose){
    sheet.style.transform=`translateY(${Math.max(window.innerHeight,sheet.offsetHeight)}px)`;
    wrap.style.background='rgba(0,0,0,0)';
    setTimeout(closeSheet,190);
  }else{
    sheet.style.transform='translateY(0)';
    wrap.style.background='';
    setTimeout(resetSheetPosition,210);
  }
  sheetDragY=0;
}
function exportData(){const blob=new Blob([JSON.stringify({version:2,exportedAt:new Date().toISOString(),tasks:state.tasks,projects:state.projects,settings:{theme:state.theme,showCompleted:state.showCompleted,defaultCategory:state.defaultCategory,defaultDuration:state.defaultDuration,autoCalendarTimed:state.autoCalendarTimed,autoCompleteParentSubtasks:state.autoCompleteParentSubtasks,planningStart:state.planningStart,planningEnd:state.planningEnd}},null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`planly-backup-${localKey(new Date())}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
$('#importFile').addEventListener('change',async e=>{const f=e.target.files?.[0];if(!f)return;try{const d=JSON.parse(await f.text());if(!Array.isArray(d.tasks))throw new Error();if(confirm(`Import ${d.tasks.length} tasks and replace current data?`)){state.tasks=d.tasks;state.projects=Array.isArray(d.projects)?d.projects:[];state.theme=d.settings?.theme||state.theme;state.showCompleted=d.settings?.showCompleted!==false;state.defaultCategory=d.settings?.defaultCategory||state.defaultCategory;state.defaultDuration=Number(d.settings?.defaultDuration||state.defaultDuration||30);state.autoCalendarTimed=!!d.settings?.autoCalendarTimed;state.autoCompleteParentSubtasks=!!d.settings?.autoCompleteParentSubtasks;state.planningStart=d.settings?.planningStart||'08:00';state.planningEnd=d.settings?.planningEnd||'23:00';if(timeToMinutes(state.planningEnd)<=timeToMinutes(state.planningStart)){state.planningStart='08:00';state.planningEnd='23:00'}save();applyTheme();render()}}catch{alert('That backup file is not valid.')}e.target.value=''})
$('#taskForm').addEventListener('submit',async e=>{
  e.preventDefault();
  const id=$('#taskId').value,now=Date.now();
  const repeatData=readRecurrenceForm();
  const timedAutoCalendar=!id&&state.autoCalendarTimed&&!!$('#taskTime').value;
  const data={
    title:$('#taskTitle').value.trim(),
    date:$('#taskDate').value||'',
    time:$('#taskTime').value||'',
    durationMinutes:Number($('#taskDuration').value||state.defaultDuration||30),
    priority:$('#taskPriority').value,
    category:$('#taskCategory').value,
    projectId:$('#taskProject').value||'',
    recurrence:repeatData.recurrence,
    recurrenceConfig:repeatData.recurrenceConfig,
    reminder:$('#taskReminder').value,
    notes:$('#taskNotes').value.trim(),
    subtasks:editingSubtasks.map(s=>({id:s.id||uid(),title:s.title,done:!!s.done})),
    addToCalendar:$('#taskCalendar').checked||timedAutoCalendar,
    updatedAt:now
  };
  if(!data.title)return;
  if(data.addToCalendar&&!data.date){alert('Choose a date before adding this task to Google Calendar.');return}
  let t=id?state.tasks.find(x=>x.id===id):null;
  const oldEventId=t?.googleEventId||'';
  const wasCalendar=!!t?.addToCalendar;
  if(t){
    Object.assign(t,data);
    if(data.addToCalendar)t.calendarSync='pending';
    else{if(wasCalendar&&oldEventId&&(!t.recurrence||t.recurrence==='none'))queueGoogleDelete(oldEventId);t.googleEventId='';t.calendarSync=''}
  }else{
    t={id:uid(),...data,occurrenceNumber:data.recurrence!=='none'?1:undefined,completed:false,pinned:false,googleEventId:'',calendarSync:data.addToCalendar?'pending':'',createdAt:now};
    state.tasks.push(t);
  }
  let checklistAutoSnapshot=null;
  if(state.autoCompleteParentSubtasks&&!t.completed&&Array.isArray(t.subtasks)&&t.subtasks.length&&t.subtasks.every(s=>s.done)){
    checklistAutoSnapshot=cloneTasks();
    t.completed=true;
    t.updatedAt=Date.now();
    createNextRecurring(t);
  }
  save();closeSheet();render();
  if(checklistAutoSnapshot){
    const finalizeChecklistCompletion=()=>{if(googleConnected())syncPendingGoogle().then(()=>render()).catch(()=>{})};
    showUndoToast('Checklist finished — task completed',()=>{restoreTaskSnapshot(checklistAutoSnapshot);finalizeChecklistCompletion()},finalizeChecklistCompletion);
    return;
  }
  if(data.addToCalendar){
    const ready=await ensureGoogleForTaskSync();
    if(ready){
      try{
        await syncTaskToGoogle(t);
        showToast('Saved and synced to Google Calendar');
        render();
      }catch(err){
        showToast('Saved in Planly; Calendar sync needs attention');
      }
    }else{
      t.calendarSync='pending';save();render();
      showToast('Saved in Planly. Google needs reconnecting.');
    }
  }else if(oldEventId&&googleConnected()){
    await processPendingDeletes();render();
  }
})
$('#duplicateTask').onclick=prepareDuplicateTask;
$('#deleteTask').onclick=()=>{const id=$('#taskId').value;const t=state.tasks.find(x=>x.id===id);if(id&&t&&confirm('Delete this task?')){closeSheet();deleteTaskWithUndo(t)}}


let top3Drag=null;
function beginTop3Drag(e){
  const handle=e.target.closest('.top3DragHandle');
  if(!handle)return;
  const task=handle.closest('.task'),list=handle.closest('.top3List');
  const touch=e.touches?.[0];
  if(!task||!list||!touch)return;
  top3Drag={task,list,id:task.dataset.id,startY:touch.clientY,moved:false};
  task.classList.add('top3Dragging');
}
function moveTop3Drag(e){
  if(!top3Drag)return;
  const touch=e.touches?.[0];if(!touch)return;
  top3Drag.moved=true;
  e.preventDefault();
  const {task,list}=top3Drag;
  const others=[...list.querySelectorAll('.task')].filter(el=>el!==task);
  let placed=false;
  for(const target of others){
    const rect=target.getBoundingClientRect();
    if(touch.clientY<rect.top+rect.height/2){
      if(task.nextElementSibling!==target)list.insertBefore(task,target);
      placed=true;
      break;
    }
  }
  if(!placed)list.appendChild(task);
}
function endTop3Drag(){
  if(!top3Drag)return;
  const {task,list}=top3Drag;
  task.classList.remove('top3Dragging');
  const ids=[...list.querySelectorAll('.task')].map(el=>el.dataset.id);
  ids.forEach((id,index)=>{
    const t=state.tasks.find(x=>x.id===id);
    if(t){t.top3Order=index;t.updatedAt=Date.now()}
  });
  save();
  top3Drag=null;
  render();
}

let swipeGesture=null,swipeSuppressClickUntil=0;
function closeOpenTaskSwipes(except=null){
  document.querySelectorAll('.taskSwipe.swipeOpen').forEach(task=>{
    if(task===except)return;
    task.classList.remove('swipeOpen','swipeReadyComplete');
    const surface=task.querySelector('.taskSurface');
    if(surface){surface.style.transition='transform .2s ease';surface.style.transform='translateX(0)'}
  });
}
function beginTaskSwipe(e){
  const task=e.target.closest('.taskSwipe');
  if(!task||e.target.closest('button,input,select,textarea,a'))return;
  const touch=e.touches?.[0];if(!touch)return;
  closeOpenTaskSwipes(task);
  const surface=task.querySelector('.taskSurface'),startOffset=task.classList.contains('swipeOpen')?-216:0;
  swipeGesture={task,surface,startX:touch.clientX,startY:touch.clientY,dx:0,dy:0,axis:null,startOffset};surface.style.transition='none';
}
function moveTaskSwipe(e){
  if(!swipeGesture)return;const touch=e.touches?.[0];if(!touch)return;
  const g=swipeGesture;g.dx=touch.clientX-g.startX;g.dy=touch.clientY-g.startY;
  if(!g.axis){if(Math.max(Math.abs(g.dx),Math.abs(g.dy))<8)return;g.axis=Math.abs(g.dx)>Math.abs(g.dy)*1.15?'x':'y'}
  if(g.axis!=='x')return;e.preventDefault();
  let x=Math.max(-216,Math.min(112,g.startOffset+g.dx));g.surface.style.transform=`translateX(${x}px)`;g.task.classList.toggle('swipeReadyComplete',x>82);
}
function endTaskSwipe(){
  if(!swipeGesture)return;const g=swipeGesture;swipeGesture=null;
  if(g.axis!=='x'){g.surface.style.transition='';return}
  swipeSuppressClickUntil=Date.now()+260;const current=g.startOffset+g.dx;g.surface.style.transition='transform .2s cubic-bezier(.22,.61,.36,1)';
  if(current>82){g.surface.style.transform='translateX(112px)';const t=state.tasks.find(x=>x.id===g.task.dataset.id);setTimeout(()=>completeTaskWithUndo(t),120);return}
  if(current<-48){g.task.classList.add('swipeOpen');g.task.classList.remove('swipeReadyComplete');g.surface.style.transform='translateX(-216px)';return}
  g.task.classList.remove('swipeOpen','swipeReadyComplete');g.surface.style.transform='translateX(0)';
}

const sheetDragZone=$('#sheetDragZone');
sheetDragZone.addEventListener('touchstart',beginSheetDrag,{passive:true});
sheetDragZone.addEventListener('touchmove',moveSheetDrag,{passive:false});
sheetDragZone.addEventListener('touchend',endSheetDrag,{passive:true});
sheetDragZone.addEventListener('touchcancel',endSheetDrag,{passive:true});
$('#taskActionClose').onclick=closeTaskActions;$('#taskActionWrap').addEventListener('click',e=>{if(e.target.classList.contains('taskActionBackdrop'))closeTaskActions();else handleTaskActionClick(e)});$('#taskActionContent').addEventListener('change',handleTaskActionChange);$('#focusClose').onclick=closeFocus;$('#focusContent').addEventListener('click',handleFocusClick);$('#timelineClose').onclick=closeTimeline;$('#timelinePrev').onclick=()=>{timelineDate=addDays(timelineDate,-1);renderTimeline()};$('#timelineNext').onclick=()=>{timelineDate=addDays(timelineDate,1);renderTimeline()};$('#timelineDate').addEventListener('change',e=>{if(e.target.value){timelineDate=e.target.value;renderTimeline()}});$('#timelineContent').addEventListener('click',handleTimelineClick);$('#timelineContent').addEventListener('change',handleTimelineChange);$('#timelineContent').addEventListener('touchstart',beginTimelineDrag,{passive:true});$('#timelineContent').addEventListener('touchmove',moveTimelineDrag,{passive:false});$('#timelineContent').addEventListener('touchend',endTimelineDrag,{passive:true});$('#timelineContent').addEventListener('touchcancel',endTimelineDrag,{passive:true});$('#planDayClose').onclick=closePlanDay;$('#planDayPrev').onclick=()=>{if(dayPlanStep>0){dayPlanStep--;renderPlanDay()}};$('#planDayNext').onclick=()=>{if(dayPlanStep<4){dayPlanStep++;renderPlanDay()}else commitPlanDay()};$('#planDayContent').addEventListener('click',handlePlanDayClick);$('#planDayContent').addEventListener('change',handlePlanDayChange);$('#projectsToggle').onclick=()=>openProjects();$('#projectsClose').onclick=closeProjects;$('#projectsBack').onclick=()=>{if(projectPanelMode==='editor'&&editingProjectId){activeProjectId=editingProjectId;editingProjectId='';projectPanelMode='detail'}else if(projectPanelMode==='editor'){editingProjectId='';projectPanelMode='list'}else{activeProjectId='';projectPanelMode='list'}renderProjectsPanel()};$('#projectsContent').addEventListener('click',e=>{handleProjectsClick(e);handleViewClick(e)});$('#projectsContent').addEventListener('submit',e=>{if(e.target.id==='projectForm'){e.preventDefault();saveProjectEditor()}});$('#projectsContent').addEventListener('touchstart',beginTaskSwipe,{passive:true});$('#projectsContent').addEventListener('touchmove',moveTaskSwipe,{passive:false});$('#projectsContent').addEventListener('touchend',endTaskSwipe,{passive:true});$('#projectsContent').addEventListener('touchcancel',endTaskSwipe,{passive:true});$('#sheetWrap').addEventListener('click',e=>{if(e.target===$('#sheetWrap'))closeSheet()});$('#quickFillBtn').addEventListener('click',parseNaturalTaskInput);$('#subtaskAdd').addEventListener('click',addEditingSubtask);$('#subtaskInput').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();addEditingSubtask()}});$('#subtaskList').addEventListener('click',handleSubtaskEditorClick);$('#taskDate').addEventListener('change',()=>{refreshQuickDateSelection();if($('#taskRepeat').value!=='none'&&$('#taskRepeat').value!=='custom')applyRepeatPreset()});$('#taskTime').addEventListener('change',()=>{if(!$('#taskId').value&&state.autoCalendarTimed&&$('#taskTime').value)$('#taskCalendar').checked=true});$('#taskRepeat').addEventListener('change',applyRepeatPreset);
$('#repeatInterval').addEventListener('input',markRepeatCustom);
$('#repeatUnit').addEventListener('change',()=>{markRepeatCustom();refreshRecurrenceAdvancedUI()});
$('#repeatWeekdays').addEventListener('click',e=>{const b=e.target.closest('[data-weekday]');if(!b)return;b.classList.toggle('active');markRepeatCustom()});
$('#repeatMonthMode').addEventListener('change',()=>{markRepeatCustom();refreshRecurrenceAdvancedUI()});
$('#repeatMonthDay').addEventListener('input',markRepeatCustom);
$('#repeatOrdinal').addEventListener('change',markRepeatCustom);
$('#repeatOrdinalWeekday').addEventListener('change',markRepeatCustom);
$('#repeatEndMode').addEventListener('change',()=>{markRepeatCustom();refreshRecurrenceAdvancedUI()});
$('#repeatEndDate').addEventListener('change',markRepeatCustom);
$('#repeatCount').addEventListener('input',markRepeatCustom);
$('#view').addEventListener('touchstart',beginTop3Drag,{passive:true});$('#view').addEventListener('touchmove',moveTop3Drag,{passive:false});$('#view').addEventListener('touchend',endTop3Drag,{passive:true});$('#view').addEventListener('touchcancel',endTop3Drag,{passive:true});$('#view').addEventListener('touchstart',beginTaskSwipe,{passive:true});$('#view').addEventListener('touchmove',moveTaskSwipe,{passive:false});$('#view').addEventListener('touchend',endTaskSwipe,{passive:true});$('#view').addEventListener('touchcancel',endTaskSwipe,{passive:true});$('#view').addEventListener('click',handleViewClick);$$('#quickDates .chip').forEach(c=>c.onclick=()=>setQuick(c.dataset.q));$('#addBtn').onclick=()=>openSheet();$$('.nav button').forEach(b=>b.onclick=()=>{state.tab=b.dataset.tab;if(state.tab==='today')state.selectedDate=localKey(new Date());render()});$('#searchToggle').onclick=openSearch;$('#searchClose').onclick=closeSearch;$('#searchInput').addEventListener('input',renderSearchResults);document.querySelectorAll('[data-search-filter]').forEach(b=>b.addEventListener('click',()=>{activeSearchFilter=b.dataset.searchFilter;document.querySelectorAll('[data-search-filter]').forEach(x=>x.classList.toggle('active',x===b));renderSearchResults()}));$('#searchCategory').addEventListener('change',renderSearchResults);$('#searchPriority').addEventListener('change',renderSearchResults);$('#searchProject').addEventListener('change',renderSearchResults);$('#searchWrap').addEventListener('click',e=>{if(e.target===$('#searchWrap'))closeSearch()});$('#searchResults').addEventListener('click',e=>{const result=e.target.closest('[data-search-id]');if(!result)return;const t=state.tasks.find(x=>x.id===result.dataset.searchId);if(!t)return;closeSearch();setTimeout(()=>openSheet(t),0)});$('#themeToggle').onclick=()=>{state.theme=(document.documentElement.dataset.theme==='dark')?'light':'dark';save();applyTheme()};
document.addEventListener('keydown',e=>{if(e.key!=='Escape')return;if($('#taskActionWrap').classList.contains('open'))closeTaskActions();else if($('#searchWrap').classList.contains('open'))closeSearch();else if($('#timelineWrap').classList.contains('open'))closeTimeline();else if($('#planDayWrap').classList.contains('open'))closePlanDay();else if($('#focusWrap').classList.contains('open'))closeFocus()});
load();applyTheme();startPlanlyAuth().then(()=>render()).catch(()=>{});if(!isStandalone())$('#installHelp').hidden=false;if('serviceWorker'in navigator)Promise.resolve();render();if(googleConnected())syncPendingGoogle().then(()=>render()).catch(()=>{});
})();
