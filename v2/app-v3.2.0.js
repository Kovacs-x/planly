(()=>{
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const STORE='planly-data-v1';
const PLANLY_CLOUD_PREVIEW=true;
const PLANLY_CLOUD_MIGRATION_VERSION=1;
const PLANLY_CLOUD_BACKUP_PREFIX='planly-cloud-migration-backup-v1:';
const PLANLY_CLOUD_STATUS_PREFIX='planly-cloud-migration-status-v1:';
const GOOGLE_CLIENT_ID_KEY='planly-google-client-id-v1';
const GOOGLE_AUTH_KEY='planly-google-auth-v1';
const GOOGLE_DELETE_QUEUE_KEY='planly-google-delete-queue-v1';
const GOOGLE_SCOPE='https://www.googleapis.com/auth/calendar.events.owned';
const PLANLY_CALENDAR_ID='95b035b05d2f967eb609d34cb4d79348bfdb21e3b1fe06e0bd076fa450577989@group.calendar.google.com';
const PLANLY_TIMEZONE='Europe/London';
let googleTokenClient=null;
let planlyCloudReadOnly=false;
let planlyCloudSyncMeta={tasks:new Map(),projects:new Map(),preferences:0};
let planlyCloudWriteQueue=Promise.resolve();
let planlyReconcilePromise=null,planlyLastReconcileAt=0;
let planlyCloudBootstrapPending=PLANLY_CLOUD_PREVIEW;
let planlyOfflineReady=false,planlyOfflineStatus='Preparing offline mode…';
const PLANLY_CLOUD_CACHE_PREFIX='planly-cloud-cache-v1:';
const PLANLY_CLOUD_PENDING_PREFIX='planly-cloud-pending-v1:';
const PLANLY_CLOUD_CONFLICT_PREFIX='planly-cloud-conflicts-v1:';
const PLANLY_CLOUD_BULK_SAFETY_PREFIX='planly-cloud-bulk-safety-v1:';
const PLANLY_CLOUD_LAST_ACCOUNT_KEY='planly-cloud-last-account-v1';
const PLANLY_DEVICE_SETTINGS_KEY='planly-device-settings-v1';
const PLANLY_OFFLINE_CACHE='planly-v2-ui3';
const PLANLY_SW_PROBE='planly-v2-sw-ui3';
const PLANLY_CONFLICT_TEST_ID_KEY='planly-cloud-conflict-test-id-v1';
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
function persistPlanlyDeviceSettings(){localStorage.setItem(PLANLY_DEVICE_SETTINGS_KEY,JSON.stringify({version:1,theme:state.theme,showCompleted:!!state.showCompleted,autoCalendarTimed:!!state.autoCalendarTimed}))}
function restorePlanlyDeviceSettings(){try{const d=JSON.parse(localStorage.getItem(PLANLY_DEVICE_SETTINGS_KEY)||'null');if(!d||Number(d.version)!==1)return false;state.theme=d.theme||state.theme||'system';state.showCompleted=d.showCompleted!==false;state.autoCalendarTimed=!!d.autoCalendarTimed;return true}catch{return false}}
function save(){if(PLANLY_CLOUD_PREVIEW&&(planlySession?.user||planlyLastAccountId())){persistPlanlyDeviceSettings();persistPlanlyCloudCache();return}localStorage.setItem(STORE,JSON.stringify({tasks:state.tasks,projects:state.projects,theme:state.theme,showCompleted:state.showCompleted,defaultCategory:state.defaultCategory,defaultDuration:state.defaultDuration,autoCalendarTimed:state.autoCalendarTimed,autoCompleteParentSubtasks:state.autoCompleteParentSubtasks,planningStart:state.planningStart,planningEnd:state.planningEnd}))}
function load(){try{const d=JSON.parse(localStorage.getItem(STORE)||'{}');state.tasks=Array.isArray(d.tasks)?d.tasks:[];state.projects=Array.isArray(d.projects)?d.projects:[];state.theme=d.theme||'system';state.showCompleted=d.showCompleted!==false;state.defaultCategory=d.defaultCategory||'Personal';state.defaultDuration=Number(d.defaultDuration||30);state.autoCalendarTimed=!!d.autoCalendarTimed;state.autoCompleteParentSubtasks=!!d.autoCompleteParentSubtasks;state.planningStart=d.planningStart||'08:00';state.planningEnd=d.planningEnd||'23:00';if(PLANLY_CLOUD_PREVIEW&&!restorePlanlyDeviceSettings())persistPlanlyDeviceSettings();if(timeToMinutes(state.planningEnd)<=timeToMinutes(state.planningStart)){state.planningStart='08:00';state.planningEnd='23:00'}const recurrenceChanged=migrateRecurringCalendarState();if(recurrenceChanged&&!PLANLY_CLOUD_PREVIEW)save()}catch{}}
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
  const before=cloneTasks();t.time=time;t.updatedAt=Date.now();if(t.addToCalendar)t.calendarSync='pending';const pendingIds=stageChangedTasksFromSnapshot(before);save();render();
  showUndoToast(message,()=>{clearPendingTaskIds(pendingIds);restoreTaskSnapshot(before)},()=>{queuePlanlyPendingReplay('Task synced');finishCalendarChange(state.tasks.find(x=>x.id===id))});
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
  t.time=minutesToTime(g.candidate);t.updatedAt=Date.now();if(t.addToCalendar)t.calendarSync='pending';const pendingIds=stageChangedTasksFromSnapshot(g.before);save();render();
  showUndoToast('Task moved to '+t.time,()=>{clearPendingTaskIds(pendingIds);restoreTaskSnapshot(g.before)},()=>{queuePlanlyPendingReplay('Task synced');finishCalendarChange(state.tasks.find(x=>x.id===g.id))});
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
  const wasExisting=!!projectById(editingProjectId);
  const name=($('#projectName')?.value||'').trim();if(!name)return;
  const now=Date.now();let p=projectById(editingProjectId);
  if(p){p.name=name;p.dueDate=$('#projectDueDate').value||'';p.notes=$('#projectNotes').value.trim();p.updatedAt=now}
  else{p={id:uid(),name,dueDate:$('#projectDueDate').value||'',notes:$('#projectNotes').value.trim(),archived:false,createdAt:now,updatedAt:now};state.projects.push(p)}
  stageProjectMutation(p);save();queuePlanlyPendingReplay('Project synced');activeProjectId=p.id;editingProjectId='';projectPanelMode='detail';renderProjectsPanel();render();
}
function handleProjectsClick(e){
  const open=e.target.closest('[data-project-open]');if(open){activeProjectId=open.dataset.projectOpen;editingProjectId='';projectPanelMode='detail';renderProjectsPanel();return}
  const action=e.target.closest('[data-project-action]')?.dataset.projectAction;if(!action)return;
  if(action==='new'){editingProjectId='';activeProjectId='';projectPanelMode='editor';renderProjectsPanel();return}
  const p=projectById(activeProjectId||editingProjectId);
  if(action==='edit'&&p){editingProjectId=p.id;projectPanelMode='editor';renderProjectsPanel();return}
  if(action==='add-task'&&p&&!p.archived){openSheet(null,p.id);return}
  if(action==='archive'&&p&&confirm('Archive this project? Its tasks will stay in Planly.')){p.archived=true;p.updatedAt=Date.now();stageProjectMutation(p);save();queuePlanlyPendingReplay('Project synced');activeProjectId=p.id;editingProjectId='';projectPanelMode='detail';renderProjectsPanel();render();return}
  if(action==='restore'&&p){p.archived=false;p.updatedAt=Date.now();stageProjectMutation(p);save();queuePlanlyPendingReplay('Project synced');activeProjectId=p.id;editingProjectId='';projectPanelMode='detail';renderProjectsPanel();render();return}
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
  if(action==='reopen'){t.completed=false;t.updatedAt=Date.now();stageTaskMutation(t);save();queuePlanlyPendingReplay('Task synced');closeTaskActions();render();return}
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
  stageTaskMutation(t);save();queuePlanlyPendingReplay('Task synced');render();refreshTaskActionsIfOpen();
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
  const before=cloneTasks();
  if(t.pinned){
    t.pinned=false;
    delete t.top3Order;
    normalizeTop3Orders(t.date);
  }else{
    t.pinned=true;
    t.top3Order=nextTop3Order(t.date);
  }
  t.updatedAt=Date.now();
  stageChangedTasksFromSnapshot(before);save();queuePlanlyPendingReplay('Top 3 synced');
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

function getGoogleClientId(){return String(window.PLANLY_GOOGLE_CLIENT_ID||localStorage.getItem(GOOGLE_CLIENT_ID_KEY)||'').trim()}
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
  const before=cloneTasks();t.completed=true;t.updatedAt=Date.now();createNextRecurring(t);const pendingIds=stageChangedTasksFromSnapshot(before);save();render();
  showUndoToast('Task completed',()=>{clearPendingTaskIds(pendingIds);restoreTaskSnapshot(before)},()=>{queuePlanlyPendingReplay('Task completion synced');if(googleConnected())syncPendingGoogle().then(()=>render()).catch(()=>{})});
}
function rescheduleTaskWithUndo(t,newDate,message){
  if(!t||!newDate||t.date===newDate)return;
  const before=cloneTasks(),id=t.id;t.date=newDate;t.updatedAt=Date.now();if(t.addToCalendar)t.calendarSync='pending';const pendingIds=stageChangedTasksFromSnapshot(before);save();render();
  showUndoToast(message,()=>{clearPendingTaskIds(pendingIds);restoreTaskSnapshot(before);finishCalendarChange(state.tasks.find(x=>x.id===id))},()=>{queuePlanlyPendingReplay('Task synced');finishCalendarChange(state.tasks.find(x=>x.id===id))});
}
function deleteTaskWithUndo(t){
  if(!t)return;
  const before=cloneTasks(),isRecurringGoogle=!!(t.googleEventId&&t.recurrence&&t.recurrence!=='none'),eventId=isRecurringGoogle?'':(t.googleEventId||'');
  state.tasks=state.tasks.filter(x=>x.id!==t.id);const baseVersion=Number(planlyCloudSyncMeta.tasks.get(String(t.id))||0);if(planlyCloudWritesEnabled())stagePlanlyPendingWrite('task','delete',t.id,baseVersion);save();render();
  showUndoToast(isRecurringGoogle?'Task removed from Planly · Google series unchanged':'Task deleted',()=>{clearPlanlyPendingWrite('task',t.id);restoreTaskSnapshot(before)},()=>{queuePlanlyPendingReplay('Task deletion synced');if(eventId)queueGoogleDelete(eventId);if(googleConnected())processPendingDeletes().catch(()=>{})});
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
  if(!googleConnected()){t.calendarSync='pending';t.updatedAt=Date.now();stageTaskMutation(t);save();queuePlanlyPendingReplay('');return {pending:true}}
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
    stageTaskMutation(t);save();queuePlanlyPendingReplay('');
    return {synced:true,event};
  }catch(err){
    t.calendarSync=googleConnected()?'error':'pending';
    stageTaskMutation(t);save();queuePlanlyPendingReplay('');
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
  const before=cloneTasks();state.tasks=dayPlanDraft;
  normalizeTop3Orders(localKey(new Date()));
  stageChangedTasksFromSnapshot(before);save();queuePlanlyPendingReplay('Day plan synced');closePlanDay();state.tab='today';state.selectedDate=localKey(new Date());render();showToast('Day plan saved');
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
  const top3=activeToday.length?`<section class="section prioritySection"><div class="sectionHead"><div><span class="calendarGroupLabel">Priorities</span><h2>Top 3</h2></div><span class="muted">${pins.length}/3</span></div>${pins.length?`<div class="top3List">${pins.map(t=>taskHtml(t,true)).join('')}</div>`:'<div class="empty compactEmpty">Star the tasks that matter most today.</div>'}</section>`:'';
  const schedule=scheduled.length?`<section class="section"><div class="sectionHead"><div><span class="calendarGroupLabel">Time blocked</span><h2>Schedule</h2></div><span class="muted">${scheduled.length}</span></div>${scheduled.map(taskHtml).join('')}</section>`:'';
  const anytimeSection=anytime.length?`<section class="section"><div class="sectionHead"><div><span class="calendarGroupLabel">Flexible</span><h2>Anytime</h2></div><span class="muted">${anytime.length}</span></div>${anytime.map(taskHtml).join('')}</section>`:'';
  const overdueSection=overdue.length?`<section class="section overdueSection"><div class="sectionHead"><div><span class="calendarGroupLabel">Needs attention</span><h2>Overdue</h2></div><span class="muted">${overdue.length}</span></div>${overdue.map(taskHtml).join('')}</section>`:'';
  $('#view').innerHTML=`${dashboard}${statusCard}${top3}${schedule}${anytimeSection}${overdueSection}${household}${completedSection(completed,'today:'+key)}`
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
    const isToday=k===localKey(new Date());
    cal+=`<button class="day ${hasAnything?'has':''} ${!hasAnything&&completedCount?'doneDay':''} ${isToday?'isToday':''} ${state.selectedDate===k?'selected':''}" data-date="${k}" aria-label="${esc(fmt(k,{weekday:'long',day:'numeric',month:'long'}))}"><span>${day}</span>${calendarMark}</button>`;
  }
  cal+='</div>';
  const dayTasks=showMe?calendarTasksForDate(state.selectedDate):[],active=sortTasks(dayTasks.filter(t=>!t.completed)),completed=sortTasks(dayTasks.filter(t=>!t.virtualOccurrence&&t.completed)),external=showWife?externalEventsForDate(state.selectedDate,'month'):[];
  const filters=`<div class="calendarFilters">${[['all','All'],['me','Me'],['wife','Wife'],['shared','Shared']].map(([id,label])=>`<button type="button" data-month-filter="${id}" class="${monthCalendarFilter===id?'active':''}">${label}</button>`).join('')}</div>`;
  const yourPlan=showMe?`<section class="section monthAgenda"><div class="sectionHead"><div><span class="calendarGroupLabel">Selected day</span><h2 class="monthAgendaDate">${fmt(state.selectedDate,{weekday:'long',day:'numeric',month:'long'})}</h2></div><span class="muted">${active.length}</span></div>${active.length?active.map(t=>t.virtualOccurrence?calendarPreviewTaskHtml(t):taskHtml(t)).join(''):'<div class="empty compactEmpty">No active tasks for this date.</div>'}</section>${completedSection(completed,'month:'+state.selectedDate)}`:'';
  const wifeSourceName=external.length?(planlyCalendarSource(external[0].source_id)?.name||'Wife — NHS rota'):'Wife — NHS rota';
  const wifePlan=showWife&&external.length?`<section class="section externalCalendarSection"><div class="sectionHead"><div><span class="calendarGroupLabel">${esc(wifeSourceName)}</span><h2>Read only</h2></div><span class="muted">${external.length}</span></div><div class="externalEventList">${external.map(e=>externalEventHtml(e,state.selectedDate)).join('')}</div></section>`:'';
  const empty=planlyCalendarDataError?'<div class="empty"><strong>Calendar data could not be loaded.</strong><br><span class="muted">'+esc(planlyCalendarDataError)+'</span></div>':(!showMe&&!external.length?'<div class="empty">No calendar items for this filter and date.</div>':'');
  $('#view').innerHTML=`<div class="monthShell"><div class="monthControls"><button id="prevMonth" aria-label="Previous month">‹</button><button id="todayMonth" class="monthToday">Jump to today</button><button id="nextMonth" aria-label="Next month">›</button></div>${filters}${cal}</div>${yourPlan}${wifePlan}${empty}`;
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
function planlyLastAccountId(){return String(planlySession?.user?.id||localStorage.getItem(PLANLY_CLOUD_LAST_ACCOUNT_KEY)||'')}
function rememberPlanlyAccount(session){const id=session?.user?.id;if(id)localStorage.setItem(PLANLY_CLOUD_LAST_ACCOUNT_KEY,String(id))}
function resetPlanlyCloudRuntimeState(){
  state.tasks=[];state.projects=[];
  state.defaultCategory='Personal';state.defaultDuration=30;state.autoCompleteParentSubtasks=false;state.planningStart='08:00';state.planningEnd='23:00';
  planlyCloudSyncMeta={tasks:new Map(),projects:new Map(),preferences:0};planlyCloudReadOnly=true;planlyCloudBootstrapPending=PLANLY_CLOUD_PREVIEW;planlyReconcilePromise=null;planlyLastReconcileAt=0;
  editingSubtasks=[];activeSearchFilter='all';projectPanelMode='list';activeProjectId='';editingProjectId='';dayPlanDraft=null;dayPlanStep=0;dayPlanGroups={overdue:[],inbox:[],today:[]};timelineDrag=null;taskActionId='';
  clearInterval(focusTicker);focusTicker=null;focusTaskId='';focusElapsedMs=0;focusStartedAt=0;expandedTaskChecklists.clear();
  planlyCalendarSources=[];planlyExternalEvents=[];planlyCalendarDataError='';
  for(const id of ['sheetWrap','taskActionWrap','timelineWrap','planDayWrap','focusWrap','searchWrap','projectsWrap']){const el=$('#'+id);if(el){el.classList.remove('open');el.setAttribute('aria-hidden','true')}}
}
function adoptPlanlySession(session,{explicitSignOut=false}={}){
  const previousOwner=String(planlySession?.user?.id||localStorage.getItem(PLANLY_CLOUD_LAST_ACCOUNT_KEY)||''),nextOwner=String(session?.user?.id||''),ownerChanged=!!previousOwner&&!!nextOwner&&previousOwner!==nextOwner;
  planlySession=session||null;
  if(ownerChanged||explicitSignOut)resetPlanlyCloudRuntimeState();
  if(nextOwner)localStorage.setItem(PLANLY_CLOUD_LAST_ACCOUNT_KEY,nextOwner);
  else if(explicitSignOut)localStorage.removeItem(PLANLY_CLOUD_LAST_ACCOUNT_KEY);
  return {previousOwner,nextOwner,ownerChanged,explicitSignOut};
}
async function refreshPlanlySession(){
  if(!initPlanlySupabase())return null;
  const {data}=await planlySupabase.auth.getSession();adoptPlanlySession(data?.session||null);return planlySession;
}
function planlyAccountHtml(){
  if(!initPlanlySupabase())return '<div class="muted settingsHelp">Cloud account service unavailable. Your local Planly data is unaffected.</div>';
  if(planlySession?.user){const email=planlySession.user.email||'Planly account';return '<div class="calendarStatusRow"><span class="statusDot connected"></span><strong>Signed in</strong></div><div class="muted settingsHelp">'+esc(email)+'<br>Your existing tasks are still stored locally. Cloud task sync is not enabled yet.</div><button id="planlySignOutBtn" class="secondaryBtn">Sign out</button>'}
  return '<div class="muted settingsHelp">Create a Planly account to prepare for secure calendar sources and future household sync. Your existing tasks stay on this iPhone.</div><div class="field"><label>Email</label><input id="planlyAuthEmail" class="input" type="email" autocomplete="email" placeholder="you@example.com"></div><div class="field"><label>Password</label><input id="planlyAuthPassword" class="input" type="password" autocomplete="current-password" minlength="8" placeholder="At least 8 characters"></div><button id="planlySignInBtn" class="primary">Sign in</button><button id="planlySignUpBtn" class="secondaryBtn">Create account</button>';
}
function planlyCloudStatusKey(){return PLANLY_CLOUD_STATUS_PREFIX+(planlyLastAccountId()||'anonymous')}
function planlyCloudBackupKey(){return PLANLY_CLOUD_BACKUP_PREFIX+(planlyLastAccountId()||'anonymous')}
function planlyCloudLocalStatus(){try{return JSON.parse(localStorage.getItem(planlyCloudStatusKey())||'{}')}catch{return {}}}
function setPlanlyCloudLocalStatus(patch){const next={...planlyCloudLocalStatus(),...patch,updatedAt:new Date().toISOString()};localStorage.setItem(planlyCloudStatusKey(),JSON.stringify(next));return next}
function canonicalJson(value){if(Array.isArray(value))return '['+value.map(canonicalJson).join(',')+']';if(value&&typeof value==='object'){return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonicalJson(value[k])).join(',')+'}'}return JSON.stringify(value)}
async function sha256Text(text){const bytes=new TextEncoder().encode(text),hash=await crypto.subtle.digest('SHA-256',bytes);return [...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,'0')).join('')}
function migrationPayloadFromRaw(raw){let parsed={};try{parsed=JSON.parse(raw)||{}}catch{throw new Error('The Planly migration data is not valid JSON.')}const tasks=Array.isArray(parsed.tasks)?parsed.tasks:[],projects=Array.isArray(parsed.projects)?parsed.projects:[];return {raw,parsed,tasks,projects,preferences:{defaultCategory:parsed.defaultCategory||'Personal',defaultDuration:Number(parsed.defaultDuration||30),autoCompleteParentSubtasks:!!parsed.autoCompleteParentSubtasks,planningStart:parsed.planningStart||'08:00',planningEnd:parsed.planningEnd||'23:00'}}}
function planlyMigrationPayload(){return migrationPayloadFromRaw(localStorage.getItem(STORE)||'{}')}
function validateMigrationBackupFile(d){if(!d||d.kind!=='planly-cloud-migration-backup'||Number(d.version)!==1||d.storeKey!==STORE||typeof d.raw!=='string')throw new Error('This is not a Planly 3.2 migration backup.');const snapshot=migrationPayloadFromRaw(d.raw);assertUniqueLocalIds(snapshot.projects,'Projects');assertUniqueLocalIds(snapshot.tasks,'Tasks');if(!snapshot.tasks.length&&!snapshot.projects.length)throw new Error('The migration backup contains no tasks or projects.');if(Number(d.taskCount)!==snapshot.tasks.length||Number(d.projectCount)!==snapshot.projects.length)throw new Error('Migration backup counts do not match its embedded Planly data.');return snapshot}
function taskCloudRow(t,ownerId){return {owner_id:ownerId,client_id:String(t.id),data:t,series_client_id:t.seriesId?String(t.seriesId):null,title:String(t.title||''),task_date:t.date||null,task_time:t.time||null,duration_minutes:Number(t.durationMinutes||30),priority:String(t.priority||'normal'),category:String(t.category||'Personal'),project_client_id:t.projectId?String(t.projectId):null,recurrence:String(t.recurrence||'none'),recurrence_config:t.recurrenceConfig??null,occurrence_number:Number.isFinite(Number(t.occurrenceNumber))?Number(t.occurrenceNumber):null,reminder:String(t.reminder||'none'),notes:String(t.notes||''),subtasks:Array.isArray(t.subtasks)?t.subtasks:[],completed:!!t.completed,pinned:!!t.pinned,top3_order:Number.isFinite(Number(t.top3Order))?Number(t.top3Order):null,add_to_calendar:!!t.addToCalendar,google_event_id:t.googleEventId||null,google_recurrence_start_date:t.googleRecurrenceStartDate||null,google_recurrence_version:Number.isFinite(Number(t.googleRecurrenceVersion))?Number(t.googleRecurrenceVersion):null,calendar_sync:String(t.calendarSync||''),calendar_synced_at:Number.isFinite(Number(t.calendarSyncedAt))?Number(t.calendarSyncedAt):null,client_created_at:Number.isFinite(Number(t.createdAt))?Number(t.createdAt):null,client_updated_at:Number.isFinite(Number(t.updatedAt))?Number(t.updatedAt):Number(t.createdAt)||Date.now(),deleted_at:null}}
function projectCloudRow(p,ownerId){return {owner_id:ownerId,client_id:String(p.id),data:p,name:String(p.name||''),due_date:p.dueDate||null,notes:String(p.notes||''),archived:!!p.archived,client_created_at:Number.isFinite(Number(p.createdAt))?Number(p.createdAt):null,client_updated_at:Number.isFinite(Number(p.updatedAt))?Number(p.updatedAt):Number(p.createdAt)||Date.now(),deleted_at:null}}
function migrationEntityMap(rows){return new Map((rows||[]).map(r=>[String(r.client_id),r]))}
function assertUniqueLocalIds(items,label){const ids=items.map(x=>String(x?.id||''));if(ids.some(id=>!id))throw new Error(label+' contains an item without an ID.');if(new Set(ids).size!==ids.length)throw new Error(label+' contains duplicate IDs. Migration stopped.')}
async function inspectPlanlyCloud(ownerId){const [projects,tasks,prefs,sync]=await Promise.all([planlySupabase.from('planly_projects').select('client_id,data,deleted_at,cloud_version'),planlySupabase.from('planly_tasks').select('client_id,data,deleted_at,cloud_version'),planlySupabase.from('planly_preferences').select('*').eq('owner_id',ownerId).maybeSingle(),planlySupabase.from('planly_sync_state').select('*').eq('owner_id',ownerId).maybeSingle()]);for(const r of [projects,tasks,prefs,sync])if(r.error)throw r.error;return {projects:projects.data||[],tasks:tasks.data||[],preferences:prefs.data||null,sync:sync.data||null}}
function existingCloudMatchesLocal(existing,local,label){for(const row of existing){const item=local.find(x=>String(x.id)===String(row.client_id));if(!item)throw new Error('Cloud '+label+' contains data not present in this migration snapshot. Automatic migration stopped.');if(row.deleted_at||canonicalJson(row.data)!==canonicalJson(item))throw new Error('Cloud '+label+' differs from this migration snapshot. Automatic migration stopped.')}return migrationEntityMap(existing)}
async function upsertInChunks(table,rows,size=100){for(let i=0;i<rows.length;i+=size){const {error}=await planlySupabase.from(table).upsert(rows.slice(i,i+size),{onConflict:'owner_id,client_id'});if(error)throw error}}
async function verifyPlanlyMigration(snapshot,ownerId,digest){const cloud=await inspectPlanlyCloud(ownerId),projects=migrationEntityMap(cloud.projects),tasks=migrationEntityMap(cloud.tasks);if(cloud.projects.length!==snapshot.projects.length)throw new Error('Cloud project count verification failed.');if(cloud.tasks.length!==snapshot.tasks.length)throw new Error('Cloud task count verification failed.');for(const p of snapshot.projects){const row=projects.get(String(p.id));if(!row||row.deleted_at||canonicalJson(row.data)!==canonicalJson(p))throw new Error('Project verification failed for '+p.id)}for(const t of snapshot.tasks){const row=tasks.get(String(t.id));if(!row||row.deleted_at||canonicalJson(row.data)!==canonicalJson(t))throw new Error('Task verification failed for '+t.id)}const cloudDigest=await sha256Text(canonicalJson({projects:snapshot.projects,tasks:snapshot.tasks,preferences:snapshot.preferences}));if(cloudDigest!==digest)throw new Error('Migration digest verification failed.');return cloud}
async function migratePlanlySnapshotToCloud(snapshot){if(!PLANLY_CLOUD_PREVIEW)throw new Error('Cloud migration is disabled in this build.');if(!planlySession?.user||!initPlanlySupabase())throw new Error('Sign in to Planly first.');const ownerId=planlySession.user.id;assertUniqueLocalIds(snapshot.projects,'Projects');assertUniqueLocalIds(snapshot.tasks,'Tasks');if(!snapshot.tasks.length&&!snapshot.projects.length)throw new Error('No local tasks or projects were found. Migration stopped to protect against an empty snapshot.');const backupKey=planlyCloudBackupKey();if(!localStorage.getItem(backupKey))localStorage.setItem(backupKey,JSON.stringify({version:PLANLY_CLOUD_MIGRATION_VERSION,createdAt:new Date().toISOString(),ownerId,storeKey:STORE,raw:snapshot.raw}));const digest=await sha256Text(canonicalJson({projects:snapshot.projects,tasks:snapshot.tasks,preferences:snapshot.preferences}));setPlanlyCloudLocalStatus({state:'checking',digest,projectCount:snapshot.projects.length,taskCount:snapshot.tasks.length});const before=await inspectPlanlyCloud(ownerId);if(before.sync?.initial_migration_completed_at){if(before.sync.migration_digest&&before.sync.migration_digest!==digest)throw new Error('This account already completed migration from a different local snapshot. No data was overwritten.');setPlanlyCloudLocalStatus({state:'complete',digest,completedAt:before.sync.initial_migration_completed_at});return {alreadyComplete:true,taskCount:snapshot.tasks.length,projectCount:snapshot.projects.length}}existingCloudMatchesLocal(before.projects,snapshot.projects,'projects');existingCloudMatchesLocal(before.tasks,snapshot.tasks,'tasks');setPlanlyCloudLocalStatus({state:'uploading'});await upsertInChunks('planly_projects',snapshot.projects.map(p=>projectCloudRow(p,ownerId)));await upsertInChunks('planly_tasks',snapshot.tasks.map(t=>taskCloudRow(t,ownerId)));const now=Date.now();const {error:prefError}=await planlySupabase.from('planly_preferences').upsert({owner_id:ownerId,default_category:snapshot.preferences.defaultCategory,default_duration:snapshot.preferences.defaultDuration,auto_complete_parent_subtasks:snapshot.preferences.autoCompleteParentSubtasks,planning_start:snapshot.preferences.planningStart,planning_end:snapshot.preferences.planningEnd,client_updated_at:now},{onConflict:'owner_id'});if(prefError)throw prefError;setPlanlyCloudLocalStatus({state:'verifying'});await verifyPlanlyMigration(snapshot,ownerId,digest);const completedAt=new Date().toISOString();const {error:syncError}=await planlySupabase.from('planly_sync_state').upsert({owner_id:ownerId,schema_version:PLANLY_CLOUD_MIGRATION_VERSION,initial_migration_completed_at:completedAt,migration_project_count:snapshot.projects.length,migration_task_count:snapshot.tasks.length,migration_digest:digest,last_successful_sync_at:completedAt},{onConflict:'owner_id'});if(syncError)throw syncError;setPlanlyCloudLocalStatus({state:'complete',digest,completedAt});return {alreadyComplete:false,taskCount:snapshot.tasks.length,projectCount:snapshot.projects.length}}
function planlyCloudPreviewHtml(){if(!PLANLY_CLOUD_PREVIEW)return '';const cachedOwner=planlyLastAccountId(),hasCachedOwner=!!cachedOwner;if(!planlySession?.user&&!hasCachedOwner)return '<div class="muted settingsHelp">Sign in above to use Planly Cloud Sync.</div>';const s=planlyCloudLocalStatus(),pending=readPlanlyPendingWrites().length,conflicts=readPlanlyConflicts(),offlineCached=!planlySession?.user&&hasCachedOwner,label=pending?(pending+' change'+(pending===1?'':'s')+' pending sync'):offlineCached?'Offline cache loaded':s.state==='cloud-write-test'||s.state==='complete'?'Cloud sync active':s.state==='cloud-loaded'?'Cloud copy loaded · read only':s.state==='uploading'?'Uploading…':s.state==='verifying'?'Verifying…':s.state==='checking'?'Checking…':s.state==='error'?'Sync needs attention':'Setup required';const counts=(Number.isFinite(s.taskCount)&&Number.isFinite(s.projectCount))?'<br>'+s.taskCount+' tasks · '+s.projectCount+' projects':'';const freshness=s.lastPullAt?'<br>Last cloud check '+esc(new Date(s.lastPullAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})):'';const pendingHelp=pending?'<br><strong>'+pending+' queued change'+(pending===1?'':'s')+' waiting to sync.</strong>':'';const pendingRows=readPlanlyPendingWrites(),journalErrors=pendingRows.filter(x=>x.status==='error').length,journalConflicts=pendingRows.filter(x=>x.status==='conflict').length,journalHelp=(journalErrors||journalConflicts)?'<br>'+journalErrors+' retry error'+(journalErrors===1?'':'s')+' · '+journalConflicts+' blocked by conflict':'';const help=offlineCached?'Using the last verified local cloud snapshot while Planly is offline.':planlyCloudReadOnly?'Your verified cloud copy is loaded read-only.':'Your Planly data is synced to your account and remains available offline.';const offlineReadyHtml='<div class="muted settingsHelp" style="margin-top:10px"><strong>Offline mode:</strong> '+esc(planlyOfflineStatus)+'</div>'+(!planlyOfflineReady&&navigator.onLine?'<button id="planlyPrepareOfflineBtn" class="secondaryBtn">Prepare offline mode</button>':'');const conflictHtml=conflicts.length?'<div class="settingsHelp" style="margin-top:12px"><strong>'+conflicts.length+' sync conflict'+(conflicts.length===1?'':'s')+' need review</strong>'+conflicts.map(c=>{const name=c.kind==='preference'?'Account preferences':String(c.localData?.title||c.serverData?.title||c.id);const serverDeleted=!!c.serverDeleted;return '<div style="margin-top:10px;padding:12px;border:1px solid var(--line);border-radius:14px"><div><strong>'+esc(name)+'</strong></div><div class="muted" style="margin-top:4px">'+esc(serverDeleted?'Cloud copy was deleted':'Cloud and this device both changed')+'</div><button class="secondaryBtn" data-planly-conflict-cloud="'+esc(c.kind)+'|'+esc(c.id)+'">Use cloud version</button>'+(!serverDeleted?'<button class="secondaryBtn" data-planly-conflict-local="'+esc(c.kind)+'|'+esc(c.id)+'">Keep my version</button>':'')+'</div>'}).join('')+'</div>':'';const setupButton=!offlineCached&&!['cloud-write-test','complete'].includes(s.state)?'<input id="planlyMigrationFile" type="file" accept="application/json,.json" hidden><button id="planlyCloudMigrateBtn" class="secondaryBtn" '+(['checking','uploading','verifying'].includes(s.state)?'disabled':'')+'>'+(s.state==='cloud-loaded'?'Enable cloud sync':'Verify with migration backup')+'</button>':'';return offlineReadyHtml+'<div class="calendarStatusRow"><span class="statusDot '+((!pending&&!offlineCached&&['complete','cloud-loaded','cloud-write-test'].includes(s.state))?'connected':'offline')+'"></span><strong>'+esc(label)+'</strong></div><div class="muted settingsHelp">'+help+pendingHelp+journalHelp+counts+freshness+'</div>'+conflictHtml+setupButton}
async function runPlanlyCloudMigrationFile(file,btn){const original=btn?.textContent||'Choose migration backup';if(btn){btn.disabled=true;btn.textContent='Validating backup…'}try{const d=JSON.parse(await file.text()),snapshot=validateMigrationBackupFile(d);if(btn)btn.textContent='Preparing cloud copy…';const r=await migratePlanlySnapshotToCloud(snapshot);showToast((r.alreadyComplete?'Cloud migration already verified · ':'Cloud copy verified · ')+r.taskCount+' tasks · '+r.projectCount+' projects');render()}catch(err){setPlanlyCloudLocalStatus({state:'error',error:String(err?.message||err)});showToast('Cloud migration stopped safely');render();alert(err?.message||'Cloud migration failed. Your installed Planly data was not changed.')}finally{if(btn){btn.disabled=false;btn.textContent=original}}}

function planlyCloudAccountKey(prefix,ownerId=planlyLastAccountId()){const id=String(ownerId||'');return id?prefix+id:''}
function readPlanlyCloudCache(){const key=planlyCloudAccountKey(PLANLY_CLOUD_CACHE_PREFIX);if(!key)return null;try{const d=JSON.parse(localStorage.getItem(key)||'null');return d&&d.version===1?d:null}catch{return null}}
function readPlanlyPendingWrites(){const key=planlyCloudAccountKey(PLANLY_CLOUD_PENDING_PREFIX);if(!key)return [];try{const d=JSON.parse(localStorage.getItem(key)||'[]');return Array.isArray(d)?d:[]}catch{return []}}
function writePlanlyPendingWrites(items){const key=planlyCloudAccountKey(PLANLY_CLOUD_PENDING_PREFIX);if(key)localStorage.setItem(key,JSON.stringify(items))}
function readPlanlyConflicts(){const key=planlyCloudAccountKey(PLANLY_CLOUD_CONFLICT_PREFIX);if(!key)return [];try{const d=JSON.parse(localStorage.getItem(key)||'[]');return Array.isArray(d)?d:[]}catch{return []}}
function writePlanlyConflicts(items){const key=planlyCloudAccountKey(PLANLY_CLOUD_CONFLICT_PREFIX);if(key)localStorage.setItem(key,JSON.stringify(items))}
function upsertPlanlyConflict(conflict){const list=readPlanlyConflicts().filter(x=>!(x.kind===conflict.kind&&x.id===conflict.id));list.push({...conflict,recordedAt:new Date().toISOString()});writePlanlyConflicts(list);setPlanlyCloudLocalStatus({state:'conflict',conflictCount:list.length,pendingWrites:readPlanlyPendingWrites().length});return conflict}
function clearPlanlyConflict(kind,id){const list=readPlanlyConflicts().filter(x=>!(x.kind===kind&&x.id===String(id)));writePlanlyConflicts(list);setPlanlyCloudLocalStatus({conflictCount:list.length});return list}
function pendingPlanlyWrite(kind,id){return readPlanlyPendingWrites().find(x=>x.kind===kind&&x.id===String(id))||null}
function persistPlanlyCloudCache(){const key=planlyCloudAccountKey(PLANLY_CLOUD_CACHE_PREFIX);if(!key)return;localStorage.setItem(key,JSON.stringify({version:1,savedAt:new Date().toISOString(),tasks:state.tasks,projects:state.projects,preferences:{defaultCategory:state.defaultCategory,defaultDuration:state.defaultDuration,autoCompleteParentSubtasks:state.autoCompleteParentSubtasks,planningStart:state.planningStart,planningEnd:state.planningEnd},taskVersions:Object.fromEntries(planlyCloudSyncMeta.tasks),projectVersions:Object.fromEntries(planlyCloudSyncMeta.projects),preferenceVersion:Number(planlyCloudSyncMeta.preferences||0)}))}
function restorePlanlyCloudCache(){const c=readPlanlyCloudCache();if(!c)return false;state.tasks=Array.isArray(c.tasks)?c.tasks:[];state.projects=Array.isArray(c.projects)?c.projects:[];const p=c.preferences||{};state.defaultCategory=p.defaultCategory||state.defaultCategory;state.defaultDuration=Number(p.defaultDuration||state.defaultDuration);state.autoCompleteParentSubtasks=!!p.autoCompleteParentSubtasks;state.planningStart=p.planningStart||state.planningStart;state.planningEnd=p.planningEnd||state.planningEnd;planlyCloudSyncMeta.tasks=new Map(Object.entries(c.taskVersions||{}).map(([k,v])=>[k,Number(v)]));planlyCloudSyncMeta.projects=new Map(Object.entries(c.projectVersions||{}).map(([k,v])=>[k,Number(v)]));planlyCloudSyncMeta.preferences=Number(c.preferenceVersion||0);planlyCloudBootstrapPending=false;return true}
function applyPlanlyPendingToState(){for(const op of readPlanlyPendingWrites()){if(op.kind==='task'){if(op.action==='delete')state.tasks=state.tasks.filter(x=>String(x.id)!==op.id);else if(op.data){const i=state.tasks.findIndex(x=>String(x.id)===op.id);if(i>=0)state.tasks[i]=op.data;else state.tasks.push(op.data)}}else if(op.kind==='project'){if(op.action==='delete')state.projects=state.projects.filter(x=>String(x.id)!==op.id);else if(op.data){const i=state.projects.findIndex(x=>String(x.id)===op.id);if(i>=0)state.projects[i]=op.data;else state.projects.push(op.data)}}else if(op.kind==='preference'&&op.data){const p=op.data;state.defaultCategory=p.defaultCategory||state.defaultCategory;state.defaultDuration=Number(p.defaultDuration||state.defaultDuration);state.autoCompleteParentSubtasks=!!p.autoCompleteParentSubtasks;state.planningStart=p.planningStart||state.planningStart;state.planningEnd=p.planningEnd||state.planningEnd}}}
function stagePlanlyPendingWrite(kind,action,item,baseVersion){const id=kind==='preference'?'preferences':String(item?.id||item||'');if(!id)return;const current=readPlanlyPendingWrites(),existing=current.find(x=>x.kind===kind&&x.id===id),list=current.filter(x=>!(x.kind===kind&&x.id===id)),stableBase=existing?Number(existing.baseVersion||0):Number(baseVersion||0),now=new Date().toISOString();list.push({kind,action,id,data:action==='delete'?null:item,baseVersion:stableBase,operationId:existing?.operationId||uid(),stagedAt:existing?.stagedAt||now,lastEditedAt:now,attempts:Number(existing?.attempts||0),lastAttemptAt:existing?.lastAttemptAt||'',lastError:'',status:'queued'});writePlanlyPendingWrites(list);persistPlanlyCloudCache()}
function clearPlanlyPendingWrite(kind,id){writePlanlyPendingWrites(readPlanlyPendingWrites().filter(x=>!(x.kind===kind&&x.id===String(id))));persistPlanlyCloudCache()}
function updatePlanlyPendingWrite(kind,id,patch){const list=readPlanlyPendingWrites(),i=list.findIndex(x=>x.kind===kind&&x.id===String(id));if(i<0)return null;list[i]={...list[i],...patch};writePlanlyPendingWrites(list);persistPlanlyCloudCache();return list[i]}
function markPlanlyPendingAttempt(op,patch={}){return updatePlanlyPendingWrite(op.kind,op.id,{attempts:Number(op.attempts||0)+1,lastAttemptAt:new Date().toISOString(),status:'syncing',...patch})}
async function repairDisposableConflictTestPending(){
  if(!planlySession?.user||!navigator.onLine)return false;
  const ownerId=planlySession.user.id,pending=readPlanlyPendingWrites();let changed=false;
  for(const op of pending){
    if(op.kind!=='task'||op.action==='delete'||Number(op.baseVersion||0)!==0||!String(op.id).startsWith('planly-cloud-conflict-test'))continue;
    const {data:row,error}=await planlySupabase.from('planly_tasks').select('client_id,cloud_version,deleted_at').eq('owner_id',ownerId).eq('client_id',op.id).maybeSingle();
    if(error)throw error;if(!row)continue;
    if(row.deleted_at){
      const oldId=String(op.id),newId='planly-cloud-conflict-test-'+Date.now();
      op.id=newId;op.data={...(op.data||{}),id:newId,updatedAt:Date.now()};op.baseVersion=0;setPlanlyConflictTestId(newId);
      const local=state.tasks.find(t=>String(t.id)===oldId);if(local)local.id=newId;
      planlyCloudSyncMeta.tasks.delete(oldId);changed=true;
    }else{
      op.baseVersion=Number(row.cloud_version||0);planlyCloudSyncMeta.tasks.set(String(op.id),Number(row.cloud_version||0));changed=true;
    }
  }
  if(changed){writePlanlyPendingWrites(pending);persistPlanlyCloudCache()}
  return changed;
}
async function replayPlanlyPendingWrites(){
  if(!PLANLY_CLOUD_PREVIEW||planlyCloudReadOnly||!planlySession?.user)return {replayed:0,deferred:true};
  if(!navigator.onLine){setPlanlyCloudLocalStatus({state:'offline-retry-needed',pendingWrites:readPlanlyPendingWrites().length});render();return {replayed:0,deferred:true}}
  await repairDisposableConflictTestPending();
  const snapshot=readPlanlyPendingWrites(),blocked=new Set(readPlanlyConflicts().map(c=>c.kind+'|'+c.id));
  let replayed=0,conflicts=0,errors=0,deferred=false;
  for(const original of snapshot){
    const key=original.kind+'|'+original.id;
    if(blocked.has(key)){updatePlanlyPendingWrite(original.kind,original.id,{status:'conflict'});conflicts++;continue}
    const op=markPlanlyPendingAttempt(original)||original;
    try{
      if(op.kind==='task'){
        if(op.action==='delete')await cloudDeleteTaskById(op.id,true,op.baseVersion);
        else if(op.baseVersion)await cloudUpdateTask(op.data,true,op.baseVersion);
        else await cloudInsertTask(op.data,true);
      }else if(op.kind==='project'){
        if(op.action==='delete')await cloudDeleteProjectById(op.id,true,op.baseVersion);
        else if(op.baseVersion)await cloudUpdateProject(op.data,true,op.baseVersion);
        else await cloudInsertProject(op.data,true);
      }else if(op.kind==='preference'){
        await cloudUpdatePreferences(op.data,true,op.baseVersion);
      }
      replayed++;
    }catch(err){
      if(err?.planlyConflictRecord){
        upsertPlanlyConflict(err.planlyConflictRecord);
        updatePlanlyPendingWrite(op.kind,op.id,{status:'conflict',lastError:String(err?.message||err)});
        blocked.add(key);conflicts++;continue;
      }
      if(isOfflineCloudError(err)){
        updatePlanlyPendingWrite(op.kind,op.id,{status:'queued',lastError:String(err?.message||err)});
        deferred=true;break;
      }
      updatePlanlyPendingWrite(op.kind,op.id,{status:'error',lastError:String(err?.message||err)});
      errors++;
    }
  }
  const pendingCount=readPlanlyPendingWrites().length,conflictCount=readPlanlyConflicts().length;
  if(replayed)await touchPlanlyLastSuccessfulSync().catch(()=>{});
  const stateName=conflictCount?'conflict':deferred?'offline-retry-needed':errors?'error':pendingCount?'offline-retry-needed':'cloud-write-test';
  setPlanlyCloudLocalStatus({state:stateName,lastReplayAt:new Date().toISOString(),replayed,pendingWrites:pendingCount,conflictCount,replayErrors:errors});
  render();
  return {replayed,conflicts:conflictCount,errors,deferred,pending:pendingCount};
}
function planlyCloudWritesEnabled(){return PLANLY_CLOUD_PREVIEW&&!planlyCloudReadOnly&&!!planlyLastAccountId()}
function currentPlanlyCloudPreferences(){return {defaultCategory:state.defaultCategory,defaultDuration:Number(state.defaultDuration||30),autoCompleteParentSubtasks:!!state.autoCompleteParentSubtasks,planningStart:state.planningStart||'08:00',planningEnd:state.planningEnd||'23:00'}}
function stageTaskMutation(t){if(!planlyCloudWritesEnabled()||!t?.id)return '';const id=String(t.id),baseVersion=Number(planlyCloudSyncMeta.tasks.get(id)||0);stagePlanlyPendingWrite('task','upsert',t,baseVersion);return id}
function stageProjectMutation(p){if(!planlyCloudWritesEnabled()||!p?.id)return '';const id=String(p.id),baseVersion=Number(planlyCloudSyncMeta.projects.get(id)||0);stagePlanlyPendingWrite('project','upsert',p,baseVersion);return id}
function stagePreferenceMutation(){if(!planlyCloudWritesEnabled())return false;stagePlanlyPendingWrite('preference','upsert',currentPlanlyCloudPreferences(),Number(planlyCloudSyncMeta.preferences||0));return true}
function stageChangedTasksFromSnapshot(before=[]){if(!planlyCloudWritesEnabled())return [];const prior=new Map((before||[]).map(t=>[String(t.id),t])),ids=[];for(const t of state.tasks){const old=prior.get(String(t.id));if(!old||canonicalJson(old)!==canonicalJson(t)){stageTaskMutation(t);ids.push(String(t.id))}}return ids}
function clearPendingTaskIds(ids=[]){for(const id of ids)clearPlanlyPendingWrite('task',id)}
function queuePlanlyPendingReplay(success='Planly Cloud synced'){if(!planlyCloudWritesEnabled())return Promise.resolve({replayed:0,deferred:true});return queueCloudWrite(()=>replayPlanlyPendingWrites(),success)}
async function touchPlanlyLastSuccessfulSync(){if(!planlySession?.user)return;const {error}=await planlySupabase.from('planly_sync_state').update({last_successful_sync_at:new Date().toISOString()}).eq('owner_id',planlySession.user.id);if(error)throw error}
function rememberCloudVersions(taskRows=[],projectRows=[],prefRow=null){planlyCloudSyncMeta.tasks=new Map(taskRows.map(r=>[String(r.client_id),Number(r.cloud_version||1)]));planlyCloudSyncMeta.projects=new Map(projectRows.map(r=>[String(r.client_id),Number(r.cloud_version||1)]));planlyCloudSyncMeta.preferences=Number(prefRow?.cloud_version||planlyCloudSyncMeta.preferences||0)}
async function fetchPlanlyServerConflict(kind,id){
  const ownerId=planlySession.user.id;
  if(kind==='task'){
    const {data,error}=await planlySupabase.from('planly_tasks').select('client_id,data,cloud_version,deleted_at').eq('owner_id',ownerId).eq('client_id',String(id)).maybeSingle();
    if(error)throw error;return data?{serverData:data.data||null,serverVersion:Number(data.cloud_version||0),serverDeleted:!!data.deleted_at}:null;
  }
  if(kind==='project'){
    const {data,error}=await planlySupabase.from('planly_projects').select('client_id,data,cloud_version,deleted_at').eq('owner_id',ownerId).eq('client_id',String(id)).maybeSingle();
    if(error)throw error;return data?{serverData:data.data||null,serverVersion:Number(data.cloud_version||0),serverDeleted:!!data.deleted_at}:null;
  }
  if(kind==='preference'){
    const {data,error}=await planlySupabase.from('planly_preferences').select('default_category,default_duration,auto_complete_parent_subtasks,planning_start,planning_end,cloud_version').eq('owner_id',ownerId).maybeSingle();
    if(error)throw error;return data?{serverData:{defaultCategory:data.default_category||'Personal',defaultDuration:Number(data.default_duration||30),autoCompleteParentSubtasks:!!data.auto_complete_parent_subtasks,planningStart:data.planning_start||'08:00',planningEnd:data.planning_end||'23:00'},serverVersion:Number(data.cloud_version||0),serverDeleted:false}:null;
  }
  return null;
}
async function makePlanlyConflictError(kind,id,action,localData,baseVersion,message){
  const server=await fetchPlanlyServerConflict(kind,id);
  const err=new Error(message||'Planly Cloud conflict');
  err.planlyConflict=true;err.planlyConflictRecord={kind,id:String(id),action,localData:localData||null,baseVersion:Number(baseVersion||0),serverData:server?.serverData||null,serverVersion:Number(server?.serverVersion||0),serverDeleted:!!server?.serverDeleted,message:err.message};
  return err;
}
async function cloudInsertTask(t,replay=false){const ownerId=planlySession.user.id,id=String(t.id);if(!replay)stagePlanlyPendingWrite('task','upsert',t,0);const row=taskCloudRow(t,ownerId);const {data,error}=await planlySupabase.from('planly_tasks').insert(row).select('client_id,cloud_version').single();if(error){const server=await fetchPlanlyServerConflict('task',id).catch(()=>null);if(server)throw await makePlanlyConflictError('task',id,'upsert',t,0,'This task was created or deleted in another Planly client before this insert.');throw error}planlyCloudSyncMeta.tasks.set(String(data.client_id),Number(data.cloud_version));clearPlanlyPendingWrite('task',id);clearPlanlyConflict('task',id);return data}
async function cloudUpdateTask(t,replay=false,forcedVersion=null){const ownerId=planlySession.user.id,id=String(t.id),version=forcedVersion||planlyCloudSyncMeta.tasks.get(id);if(!version)return cloudInsertTask(t,replay);if(!replay)stagePlanlyPendingWrite('task','upsert',t,version);const row=taskCloudRow(t,ownerId);delete row.owner_id;delete row.client_id;const {data,error}=await planlySupabase.from('planly_tasks').update(row).eq('owner_id',ownerId).eq('client_id',id).eq('cloud_version',version).select('client_id,cloud_version').maybeSingle();if(error)throw error;if(!data)throw await makePlanlyConflictError('task',id,'upsert',t,version,'This task changed in another Planly client.');planlyCloudSyncMeta.tasks.set(id,Number(data.cloud_version));clearPlanlyPendingWrite('task',id);return data}
async function cloudDeleteTaskById(id,replay=false,forcedVersion=null){const ownerId=planlySession.user.id,key=String(id),version=forcedVersion||planlyCloudSyncMeta.tasks.get(key);if(!version)throw await makePlanlyConflictError('task',key,'delete',null,0,'This task no longer has a valid cloud version.');if(!replay)stagePlanlyPendingWrite('task','delete',key,version);const {data,error}=await planlySupabase.from('planly_tasks').update({deleted_at:new Date().toISOString(),client_updated_at:Date.now()}).eq('owner_id',ownerId).eq('client_id',key).eq('cloud_version',version).select('client_id,cloud_version').maybeSingle();if(error)throw error;if(!data)throw await makePlanlyConflictError('task',key,'delete',null,version,'This task changed in another Planly client before deletion.');planlyCloudSyncMeta.tasks.set(key,Number(data.cloud_version));clearPlanlyPendingWrite('task',key);clearPlanlyConflict('task',key);return data}
async function cloudInsertProject(p,replay=false){const ownerId=planlySession.user.id,id=String(p.id);if(!replay)stagePlanlyPendingWrite('project','upsert',p,0);const row=projectCloudRow(p,ownerId);const {data,error}=await planlySupabase.from('planly_projects').insert(row).select('client_id,cloud_version').single();if(error){const server=await fetchPlanlyServerConflict('project',id).catch(()=>null);if(server)throw await makePlanlyConflictError('project',id,'upsert',p,0,'This project was created or deleted in another Planly client before this insert.');throw error}planlyCloudSyncMeta.projects.set(String(data.client_id),Number(data.cloud_version));clearPlanlyPendingWrite('project',id);clearPlanlyConflict('project',id);return data}
async function cloudUpdateProject(p,replay=false,forcedVersion=null){const ownerId=planlySession.user.id,id=String(p.id),version=forcedVersion||planlyCloudSyncMeta.projects.get(id);if(!version)return cloudInsertProject(p,replay);if(!replay)stagePlanlyPendingWrite('project','upsert',p,version);const row=projectCloudRow(p,ownerId);delete row.owner_id;delete row.client_id;const {data,error}=await planlySupabase.from('planly_projects').update(row).eq('owner_id',ownerId).eq('client_id',id).eq('cloud_version',version).select('client_id,cloud_version').maybeSingle();if(error)throw error;if(!data)throw await makePlanlyConflictError('project',id,'upsert',p,version,'This project changed in another Planly client.');planlyCloudSyncMeta.projects.set(id,Number(data.cloud_version));clearPlanlyPendingWrite('project',id);return data}
async function cloudDeleteProjectById(id,replay=false,forcedVersion=null){const ownerId=planlySession.user.id,key=String(id),version=forcedVersion||planlyCloudSyncMeta.projects.get(key);if(!version)throw await makePlanlyConflictError('project',key,'delete',null,0,'This project no longer has a valid cloud version.');if(!replay)stagePlanlyPendingWrite('project','delete',key,version);const {data,error}=await planlySupabase.from('planly_projects').update({deleted_at:new Date().toISOString(),client_updated_at:Date.now()}).eq('owner_id',ownerId).eq('client_id',key).eq('cloud_version',version).select('client_id,cloud_version').maybeSingle();if(error)throw error;if(!data)throw await makePlanlyConflictError('project',key,'delete',null,version,'This project changed in another Planly client before deletion.');planlyCloudSyncMeta.projects.set(key,Number(data.cloud_version));clearPlanlyPendingWrite('project',key);clearPlanlyConflict('project',key);return data}
async function cloudUpdatePreferences(p,replay=false,forcedVersion=null){const ownerId=planlySession.user.id,version=Number(forcedVersion||planlyCloudSyncMeta.preferences||0),row={owner_id:ownerId,default_category:p.defaultCategory||'Personal',default_duration:Number(p.defaultDuration||30),auto_complete_parent_subtasks:!!p.autoCompleteParentSubtasks,planning_start:p.planningStart||'08:00',planning_end:p.planningEnd||'23:00',client_updated_at:Date.now()};if(!replay)stagePlanlyPendingWrite('preference','upsert',p,version);let result;if(version){delete row.owner_id;result=await planlySupabase.from('planly_preferences').update(row).eq('owner_id',ownerId).eq('cloud_version',version).select('cloud_version').maybeSingle();if(result.error)throw result.error;if(!result.data)throw await makePlanlyConflictError('preference','preferences','upsert',p,version,'Planly preferences changed in another client.')}else{result=await planlySupabase.from('planly_preferences').insert(row).select('cloud_version').single();if(result.error){const server=await fetchPlanlyServerConflict('preference','preferences').catch(()=>null);if(server)throw await makePlanlyConflictError('preference','preferences','upsert',p,0,'Planly preferences were created in another client before this insert.');throw result.error}}planlyCloudSyncMeta.preferences=Number(result.data.cloud_version);clearPlanlyPendingWrite('preference','preferences');clearPlanlyConflict('preference','preferences');return result.data}
function isOfflineCloudError(err){const m=String(err?.message||err||'').toLowerCase();return !navigator.onLine||m.includes('failed to fetch')||m.includes('network')||m.includes('load failed')}
function queueCloudWrite(work,success='Synced to Planly Cloud'){if(!PLANLY_CLOUD_PREVIEW||planlyCloudReadOnly)return Promise.resolve();planlyCloudWriteQueue=planlyCloudWriteQueue.catch(()=>{}).then(work).then(v=>{if(v?.deferred||v?.replayed===0)return v;if(success)showToast(success);return v}).catch(err=>{const offline=isOfflineCloudError(err);if(err?.planlyConflictRecord)upsertPlanlyConflict(err.planlyConflictRecord);else setPlanlyCloudLocalStatus({state:offline?'offline-retry-needed':'conflict',error:String(err?.message||err)});showToast(offline?'Offline · changes remain queued':err?.planlyConflictRecord?'Cloud conflict · review in Settings':'Cloud sync failed');if(!offline&&!err?.planlyConflictRecord)alert(err?.message||'Cloud sync failed.');render();return null});return planlyCloudWriteQueue}
function applyPlanlyPreferenceData(p){if(!p)return;state.defaultCategory=p.defaultCategory||'Personal';state.defaultDuration=Number(p.defaultDuration||30);state.autoCompleteParentSubtasks=!!p.autoCompleteParentSubtasks;state.planningStart=p.planningStart||'08:00';state.planningEnd=p.planningEnd||'23:00'}
async function resolvePlanlyConflictUseCloud(kind,id){
  const conflict=readPlanlyConflicts().find(x=>x.kind===kind&&x.id===String(id));if(!conflict)return;
  const server=await fetchPlanlyServerConflict(kind,id);
  if(kind==='task'){
    if(!server||server.serverDeleted){state.tasks=state.tasks.filter(x=>String(x.id)!==String(id));planlyCloudSyncMeta.tasks.delete(String(id))}
    else{const i=state.tasks.findIndex(x=>String(x.id)===String(id));if(i>=0)state.tasks[i]=server.serverData;else state.tasks.push(server.serverData);planlyCloudSyncMeta.tasks.set(String(id),server.serverVersion)}
  }else if(kind==='project'){
    if(!server||server.serverDeleted){state.projects=state.projects.filter(x=>String(x.id)!==String(id));planlyCloudSyncMeta.projects.delete(String(id))}
    else{const i=state.projects.findIndex(x=>String(x.id)===String(id));if(i>=0)state.projects[i]=server.serverData;else state.projects.push(server.serverData);planlyCloudSyncMeta.projects.set(String(id),server.serverVersion)}
  }else if(kind==='preference'){
    if(server){applyPlanlyPreferenceData(server.serverData);planlyCloudSyncMeta.preferences=server.serverVersion}
  }
  clearPlanlyPendingWrite(kind,id);clearPlanlyConflict(kind,id);persistPlanlyCloudCache();setPlanlyCloudLocalStatus({state:readPlanlyConflicts().length?'conflict':'cloud-write-test',pendingWrites:readPlanlyPendingWrites().length});render();showToast('Cloud version accepted');
}
async function resolvePlanlyConflictKeepLocal(kind,id){
  const conflict=readPlanlyConflicts().find(x=>x.kind===kind&&x.id===String(id));if(!conflict)return;
  const server=await fetchPlanlyServerConflict(kind,id);
  if(!server||server.serverDeleted)throw new Error('The cloud copy was deleted. Accept the cloud version, then duplicate/recreate your local copy if needed.');
  if(kind==='task'){
    if(conflict.action==='delete')await cloudDeleteTaskById(id,true,server.serverVersion);
    else await cloudUpdateTask(conflict.localData,true,server.serverVersion);
  }else if(kind==='project'){
    if(conflict.action==='delete')await cloudDeleteProjectById(id,true,server.serverVersion);
    else await cloudUpdateProject(conflict.localData,true,server.serverVersion);
  }else if(kind==='preference'){
    await cloudUpdatePreferences(conflict.localData,true,server.serverVersion);
  }
  clearPlanlyConflict(kind,id);persistPlanlyCloudCache();setPlanlyCloudLocalStatus({state:readPlanlyConflicts().length?'conflict':'cloud-write-test',pendingWrites:readPlanlyPendingWrites().length});render();showToast('Your version synced');
}
function enableCloudWritePreview(){if(!PLANLY_CLOUD_PREVIEW||!planlySession?.user)return;planlyCloudReadOnly=false;setPlanlyCloudLocalStatus({state:'cloud-write-test'});render()}
function currentPlanlyConflictTestId(){return String(localStorage.getItem(PLANLY_CONFLICT_TEST_ID_KEY)||'planly-cloud-conflict-test')}
function setPlanlyConflictTestId(id){localStorage.setItem(PLANLY_CONFLICT_TEST_ID_KEY,String(id))}
async function openCloudConflictTestTask(btn){
  if(!PLANLY_CLOUD_PREVIEW||planlyCloudReadOnly||!planlySession?.user)throw new Error('Enable the controlled write test first.');
  let id=currentPlanlyConflictTestId(),existing=state.tasks.find(t=>String(t.id)===id);
  const ownerId=planlySession.user.id;
  if(existing&&planlyCloudSyncMeta.tasks.get(id)){state.tab='today';state.selectedDate=existing.date||localKey(new Date());render();setTimeout(()=>openSheet(existing),0);return}
  if(btn){btn.disabled=true;btn.textContent='Creating test task…'}
  try{
    const {data:row,error:lookupError}=await planlySupabase.from('planly_tasks').select('client_id,deleted_at').eq('owner_id',ownerId).eq('client_id',id).maybeSingle();
    if(lookupError)throw lookupError;
    if(row&&!row.deleted_at){
      await loadVerifiedCloudPreview();
      const cloudTask=state.tasks.find(x=>String(x.id)===id);
      render();if(cloudTask){setTimeout(()=>openSheet(cloudTask),0);return}
      throw new Error('Conflict-test task exists in cloud but could not be loaded.');
    }
    if(row?.deleted_at){const oldId=id;id='planly-cloud-conflict-test-'+Date.now();setPlanlyConflictTestId(id);clearPlanlyPendingWrite('task',oldId);state.tasks=state.tasks.filter(x=>String(x.id)!==oldId);existing=null}
    const now=Date.now(),t={id,title:'Cloud Conflict Test',date:localKey(new Date()),time:'',durationMinutes:30,priority:'normal',category:'Personal',projectId:'',recurrence:'none',recurrenceConfig:null,reminder:'none',notes:'Disposable 3.2 multi-client conflict test task',subtasks:[],addToCalendar:false,updatedAt:now,completed:false,pinned:false,googleEventId:'',calendarSync:'',createdAt:now};
    setPlanlyConflictTestId(id);await cloudInsertTask(t,true);clearPlanlyPendingWrite('task',id);state.tasks=state.tasks.filter(x=>String(x.id)!==id);state.tasks.push(t);persistPlanlyCloudCache();
    state.tab='today';state.selectedDate=t.date;setPlanlyCloudLocalStatus({state:'cloud-write-test',taskCount:state.tasks.length,projectCount:state.projects.length});render();showToast('Conflict-test task ready');setTimeout(()=>openSheet(t),0);
  }finally{
    if(btn){btn.disabled=false;btn.textContent='Create / open conflict-test task'}
  }
}
async function runDeterministicConflictTest(btn){
  if(!PLANLY_CLOUD_PREVIEW||planlyCloudReadOnly||!planlySession?.user)throw new Error('Enable the controlled write test first.');
  const id=currentPlanlyConflictTestId(),ownerId=planlySession.user.id;
  let t=state.tasks.find(x=>String(x.id)===id);if(!t)throw new Error('Create the conflict-test task first.');
  const originalTitle=String(t.title||'Cloud Conflict Test');
  const {data:before,error:beforeError}=await planlySupabase.from('planly_tasks').select('client_id,data,cloud_version').eq('owner_id',ownerId).eq('client_id',id).is('deleted_at',null).single();if(beforeError)throw beforeError;
  const staleVersion=Number(before.cloud_version);if(!Number.isFinite(staleVersion))throw new Error('Conflict test could not read the server version.');
  const serverData={...(before.data||t),title:'Cloud Conflict Test — Server '+Date.now(),updatedAt:Date.now()};
  if(btn){btn.disabled=true;btn.textContent='Creating stale version…'}
  try{
    const serverRow=taskCloudRow(serverData,ownerId);delete serverRow.owner_id;delete serverRow.client_id;
    const {data:advanced,error:advanceError}=await planlySupabase.from('planly_tasks').update(serverRow).eq('owner_id',ownerId).eq('client_id',id).eq('cloud_version',staleVersion).select('client_id,data,cloud_version').maybeSingle();if(advanceError)throw advanceError;if(!advanced)throw new Error('Conflict test could not advance the server record.');
    const advancedVersion=Number(advanced.cloud_version);if(advancedVersion<=staleVersion)throw new Error('Conflict test failed: server version did not advance.');
    const staleData={...(before.data||t),title:'Cloud Conflict Test — Stale Write',updatedAt:Date.now()};const staleRow=taskCloudRow(staleData,ownerId);delete staleRow.owner_id;delete staleRow.client_id;
    const {data:staleResult,error:staleError}=await planlySupabase.from('planly_tasks').update(staleRow).eq('owner_id',ownerId).eq('client_id',id).eq('cloud_version',staleVersion).select('client_id,cloud_version').maybeSingle();if(staleError)throw staleError;if(staleResult)throw new Error('CONCURRENCY FAILURE: stale write was accepted.');
    const {data:verify,error:verifyError}=await planlySupabase.from('planly_tasks').select('data,cloud_version').eq('owner_id',ownerId).eq('client_id',id).single();if(verifyError)throw verifyError;
    if(Number(verify.cloud_version)!==advancedVersion||String(verify.data?.title||'')!==serverData.title)throw new Error('CONCURRENCY FAILURE: server record changed after stale write rejection.');
    planlyCloudSyncMeta.tasks.set(id,advancedVersion);Object.assign(t,verify.data);setPlanlyCloudLocalStatus({state:'cloud-write-test',lastConflictTestAt:new Date().toISOString(),lastConflictTest:'passed'});render();showToast('Conflict protection passed');alert('Conflict protection passed. The stale write was rejected and the newer server version was preserved.');return true;
  }catch(err){setPlanlyCloudLocalStatus({state:'conflict-test-failed',error:String(err?.message||err)});throw err}finally{if(btn){btn.disabled=false;btn.textContent='Run deterministic conflict test'}}
}

async function loadVerifiedCloudPreview(){
  if(!PLANLY_CLOUD_PREVIEW||!planlySession?.user||!initPlanlySupabase()){planlyCloudBootstrapPending=false;return false;}
  const ownerId=planlySession.user.id;
  const {data:sync,error:syncError}=await planlySupabase.from('planly_sync_state').select('initial_migration_completed_at,migration_project_count,migration_task_count,migration_digest').eq('owner_id',ownerId).maybeSingle();
  if(syncError)throw syncError;if(!sync?.initial_migration_completed_at)return false;
  const [tasksRes,projectsRes,prefsRes]=await Promise.all([
    planlySupabase.from('planly_tasks').select('client_id,data,cloud_version,deleted_at').eq('owner_id',ownerId).is('deleted_at',null),
    planlySupabase.from('planly_projects').select('client_id,data,cloud_version,deleted_at').eq('owner_id',ownerId).is('deleted_at',null),
    planlySupabase.from('planly_preferences').select('default_category,default_duration,auto_complete_parent_subtasks,planning_start,planning_end,cloud_version').eq('owner_id',ownerId).maybeSingle()
  ]);
  for(const r of [tasksRes,projectsRes,prefsRes])if(r.error)throw r.error;
  const taskRows=tasksRes.data||[],projectRows=projectsRes.data||[];
  const tasks=taskRows.map(r=>{if(!r.data||String(r.data.id)!==String(r.client_id))throw new Error('Cloud bootstrap stopped: task identity mismatch.');return r.data});
  const projects=projectRows.map(r=>{if(!r.data||String(r.data.id)!==String(r.client_id))throw new Error('Cloud bootstrap stopped: project identity mismatch.');return r.data});
  assertUniqueLocalIds(tasks,'Cloud tasks');assertUniqueLocalIds(projects,'Cloud projects');rememberCloudVersions(taskRows,projectRows,prefsRes.data||null);
  state.tasks=tasks;state.projects=projects;
  const p=prefsRes.data;if(p){state.defaultCategory=p.default_category||'Personal';state.defaultDuration=Number(p.default_duration||30);state.autoCompleteParentSubtasks=!!p.auto_complete_parent_subtasks;state.planningStart=p.planning_start||'08:00';state.planningEnd=p.planning_end||'23:00'}
  const previousStatus=planlyCloudLocalStatus(),pendingBeforeOverlay=readPlanlyPendingWrites();planlyCloudReadOnly=pendingBeforeOverlay.length?false:!['cloud-write-test','offline-retry-needed'].includes(previousStatus.state);planlyCloudBootstrapPending=false;applyPlanlyPendingToState();persistPlanlyCloudCache();planlyLastReconcileAt=Date.now();setPlanlyCloudLocalStatus({state:planlyCloudReadOnly?'cloud-loaded':'cloud-write-test',taskCount:tasks.length,projectCount:projects.length,loadedAt:new Date().toISOString(),pendingWrites:readPlanlyPendingWrites().length});if(!planlyCloudReadOnly&&readPlanlyPendingWrites().length)queueCloudWrite(()=>replayPlanlyPendingWrites(),'Offline changes synced');return true;
}
async function planlySignIn(){
  if(!initPlanlySupabase())throw new Error('Planly cloud service is unavailable.');
  const email=$('#planlyAuthEmail')?.value.trim(),password=$('#planlyAuthPassword')?.value||'';if(!email||!password)throw new Error('Enter your email and password.');
  const {data,error}=await planlySupabase.auth.signInWithPassword({email,password});if(error)throw error;adoptPlanlySession(data.session);showToast('Signed in to Planly');render();
}
async function planlySignUp(){
  if(!initPlanlySupabase())throw new Error('Planly cloud service is unavailable.');
  const email=$('#planlyAuthEmail')?.value.trim(),password=$('#planlyAuthPassword')?.value||'';if(!email||password.length<8)throw new Error('Enter your email and a password of at least 8 characters.');
  const {data,error}=await planlySupabase.auth.signUp({email,password,options:{emailRedirectTo:'https://kovacs-x.github.io/planly/v2/'}});if(error)throw error;adoptPlanlySession(data.session||null);showToast(data.session?'Planly account created':'Check your email to confirm your Planly account');render();
}
async function planlySignOut(){if(!initPlanlySupabase())return;await planlySupabase.auth.signOut();adoptPlanlySession(null,{explicitSignOut:true});showToast('Signed out of Planly');render()}
async function verifyPlanlyOfflineCache(){
  if(!('caches'in window))return {ok:false,missing:['Cache Storage unavailable']};
  try{
    const cache=await caches.open(PLANLY_OFFLINE_CACHE),assets=['./index.html','./app-v3.2.0.js?v=324ui3','./supabase-config.js','./manifest.webmanifest'],missing=[];
    for(const asset of assets){if(!await cache.match(asset))missing.push(asset)}
    return {ok:missing.length===0,missing};
  }catch(err){return {ok:false,missing:[String(err?.message||err)]}}
}
function planlyWait(ms){return new Promise(resolve=>setTimeout(resolve,ms))}
async function planlyWithTimeout(promise,ms,label){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(label+' timed out')),ms)})])}finally{clearTimeout(timer)}}
async function probePlanlyServiceWorker(){
  if(!navigator.serviceWorker?.controller)return {ok:false,reason:'no-controller'};
  try{
    const res=await planlyWithTimeout(fetch('./__planly_sw_probe__?v=p49',{cache:'no-store'}),3000,'Service worker probe');
    const text=(await res.text()).trim();
    return {ok:res.ok&&text===PLANLY_SW_PROBE,reason:text||('HTTP '+res.status)};
  }catch(err){return {ok:false,reason:String(err?.message||err)}}
}
async function finishPlanlyOfflineReadiness(force=false){
  const probe=await probePlanlyServiceWorker(),cacheCheck=await verifyPlanlyOfflineCache();
  planlyOfflineReady=probe.ok&&cacheCheck.ok;
  const reg=await navigator.serviceWorker.getRegistration('./').catch(()=>null),workerState=reg?.active?.state||reg?.waiting?.state||reg?.installing?.state||'none',boot=window.__planlySwBoot||{};planlyOfflineStatus=planlyOfflineReady?'Ready for offline reload':!reg&&boot.status==='error'?'Registration failed: '+String(boot.message||boot.name||'unknown error'):!navigator.serviceWorker.controller?'Worker '+workerState+' · not controlling this tab':!probe.ok?'Wrong worker controls tab · '+String(probe.reason||'probe failed'):cacheCheck.missing.length?'Missing cache: '+cacheCheck.missing.join(', '):'Offline cache not ready';
  setPlanlyCloudLocalStatus({offlineReady:planlyOfflineReady,offlineStatus:planlyOfflineStatus,offlineMissing:cacheCheck.missing||[],offlineProbe:probe.reason||''});
  render();if(force)showToast(planlyOfflineReady?'Offline mode ready':planlyOfflineStatus);
  return planlyOfflineReady;
}
async function updateLegacyRootPlanlyWorker(){
  try{
    const regs=await navigator.serviceWorker.getRegistrations();
    const root=regs.find(reg=>{try{return new URL(reg.scope).pathname.endsWith('/planly/')}catch{return false}});
    if(root)await planlyWithTimeout(root.update(),3500,'Root worker update').catch(()=>{});
  }catch{}
}
async function preparePlanlyOfflineMode(force=false){
  if(!PLANLY_CLOUD_PREVIEW||!('serviceWorker'in navigator)){planlyOfflineReady=false;planlyOfflineStatus='Service workers unavailable in this browser';if(force)render();return false}
  try{
    planlyOfflineStatus='Checking isolated preview worker…';if(force)render();
    let reg=await navigator.serviceWorker.getRegistration('./').catch(()=>null);
    if(reg&&!reg.installing&&!reg.waiting&&!reg.active){
      await reg.unregister().catch(()=>{});
      await planlyWait(250);
      reg=null;
    }
    if(!reg){
      try{
        reg=await planlyWithTimeout(navigator.serviceWorker.register('./sw.js',{scope:'./'}),6000,'Preview worker registration');
      }catch(err){
        const boot=window.__planlySwBoot||{};
        planlyOfflineReady=false;
        planlyOfflineStatus='Registration failed: '+String(boot.message||err?.message||err);
        setPlanlyCloudLocalStatus({offlineReady:false,offlineStatus:planlyOfflineStatus,offlineError:String(err?.name||'')});
        render();if(force)showToast('Preview worker registration failed');return false;
      }
    }
    if(reg.waiting)reg.waiting.postMessage({type:'SKIP_WAITING'});
    await Promise.race([
      new Promise(resolve=>navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true})),
      planlyWait(2500)
    ]);
    return finishPlanlyOfflineReadiness(force);
  }catch(err){
    const boot=window.__planlySwBoot||{};
    planlyOfflineReady=false;
    planlyOfflineStatus='Worker check failed: '+String(boot.message||err?.message||err);
    setPlanlyCloudLocalStatus({offlineReady:false,offlineStatus:planlyOfflineStatus,offlineError:String(err?.name||'')});
    render();if(force)showToast('Preview worker check failed');return false;
  }
}

async function runPlanlySyncSelfTest(btn){
  if(!PLANLY_CLOUD_PREVIEW||planlyCloudReadOnly||!planlySession?.user)throw new Error('Enable controlled cloud writes first.');
  const ownerId=planlySession.user.id,id='planly-selftest-'+Date.now(),now=Date.now(),results=[];
  const t={id,title:'Planly Sync Self-Test',date:localKey(new Date()),time:'',durationMinutes:30,priority:'normal',category:'Personal',projectId:'',recurrence:'none',recurrenceConfig:null,reminder:'none',notes:'Temporary automated sync QA',subtasks:[{id:uid(),title:'Self-test subtask',done:false}],addToCalendar:false,updatedAt:now,completed:false,pinned:false,googleEventId:'',calendarSync:'',createdAt:now};
  if(btn){btn.disabled=true;btn.textContent='Running sync self-test…'}
  try{
    await cloudInsertTask(t,true);results.push('create');
    const v1=Number(planlyCloudSyncMeta.tasks.get(id)||0);if(!v1)throw new Error('Self-test could not read initial cloud version.');
    t.title='Planly Sync Self-Test — edited';t.subtasks[0].done=true;t.updatedAt=Date.now();
    await cloudUpdateTask(t,true,v1);results.push('update');
    const v2=Number(planlyCloudSyncMeta.tasks.get(id)||0);if(!(v2>v1))throw new Error('Self-test cloud version did not advance.');
    const {data:verify,error:verifyError}=await planlySupabase.from('planly_tasks').select('data,cloud_version').eq('owner_id',ownerId).eq('client_id',id).is('deleted_at',null).single();
    if(verifyError)throw verifyError;if(String(verify?.data?.title)!==t.title||verify?.data?.subtasks?.[0]?.done!==true)throw new Error('Self-test cloud verification mismatch.');results.push('verify');
    await cloudDeleteTaskById(id,true,v2);results.push('tombstone');
    const {data:deleted,error:deletedError}=await planlySupabase.from('planly_tasks').select('deleted_at').eq('owner_id',ownerId).eq('client_id',id).single();
    if(deletedError)throw deletedError;if(!deleted?.deleted_at)throw new Error('Self-test tombstone verification failed.');results.push('delete');
    setPlanlyCloudLocalStatus({selfTest:'passed',selfTestAt:new Date().toISOString(),selfTestSteps:results});
    render();showToast('Sync self-test passed');
    return true;
  }finally{
    if(btn){btn.disabled=false;btn.textContent='Run sync self-test'}
  }
}

function planlyMutationCoverageAudit(){
  const checks=[
    ['complete + recurrence',completeTaskWithUndo,'stageChangedTasksFromSnapshot'],
    ['reschedule',rescheduleTaskWithUndo,'stageChangedTasksFromSnapshot'],
    ['delete tombstone',deleteTaskWithUndo,"stagePlanlyPendingWrite('task','delete'"],
    ['Top 3 pin',toggleTaskPin,'stageChangedTasksFromSnapshot'],
    ['checklist',toggleTaskSubtask,'stageTaskMutation'],
    ['Plan My Day',commitPlanDay,'stageChangedTasksFromSnapshot'],
    ['timeline move',endTimelineDrag,'stageChangedTasksFromSnapshot'],
    ['project create/edit',saveProjectEditor,'stageProjectMutation'],
    ['project archive/restore',handleProjectsClick,'stageProjectMutation'],
    ['task quick actions',handleTaskActionClick,'stageTaskMutation'],
    ['task project assignment',handleTaskActionChange,'stageTaskMutation'],
    ['Top 3 reorder',endTop3Drag,'stageTaskMutation'],
    ['Google metadata',syncTaskToGoogle,'stageTaskMutation'],
    ['account preferences',settingsView,'stagePreferenceMutation']
  ].map(([name,fn,needle])=>({name,ok:typeof fn==='function'&&Function.prototype.toString.call(fn).includes(needle)}));
  const deviceText=Function.prototype.toString.call(settingsView);
  checks.push({name:'theme is device-local',ok:deviceText.includes("state.theme=e.target.value;save();applyTheme()")&&!deviceText.includes("state.theme=e.target.value;stagePreferenceMutation")});
  checks.push({name:'show completed is device-local',ok:deviceText.includes("state.showCompleted=e.target.checked;save()")&&!deviceText.includes("state.showCompleted=e.target.checked;stagePreferenceMutation")});
  checks.push({name:'auto calendar is device-local',ok:deviceText.includes("state.autoCalendarTimed=e.target.checked;save()")&&!deviceText.includes("state.autoCalendarTimed=e.target.checked;stagePreferenceMutation")});
  return {passed:checks.every(x=>x.ok),checks};
}
function planlyRecoveryCoverageAudit(){
  const signOutText=Function.prototype.toString.call(planlySignOut),startAuthText=Function.prototype.toString.call(startPlanlyAuth),bootstrapText=Function.prototype.toString.call(loadVerifiedCloudPreview),resetText=Function.prototype.toString.call(resetPlanlyCloudRuntimeState);
  const checks=[
    {name:'sign-out clears account runtime state',ok:signOutText.includes("explicitSignOut:true")&&signOutText.includes('adoptPlanlySession')},
    {name:'auth account changes use context adoption',ok:startAuthText.includes('adoptPlanlySession')&&startAuthText.includes("explicitSignOut:_event==='SIGNED_OUT'")},
    {name:'bootstrap explicitly owner-scoped',ok:(bootstrapText.match(/\.eq\('owner_id',ownerId\)/g)||[]).length>=3},
    {name:'runtime reset preserves device-local storage',ok:!resetText.includes('PLANLY_DEVICE_SETTINGS_KEY')&&!resetText.includes('GOOGLE_AUTH_KEY')&&!resetText.includes('GOOGLE_DELETE_QUEUE_KEY')},
    {name:'startup overlays durable pending journal',ok:Function.prototype.toString.call(applyPlanlyPendingToState).includes("op.action==='delete'")}
  ];
  return {passed:checks.every(x=>x.ok),checks};
}
function planlyBulkSafetyCoverageAudit(){
  const restoreText=Function.prototype.toString.call(restorePlanlyBackupToCloud),clearText=Function.prototype.toString.call(clearAllPlanlyCloudData),projectDeleteText=Function.prototype.toString.call(cloudDeleteProjectById),replayText=Function.prototype.toString.call(replayPlanlyPendingWrites);
  const checks=[
    {name:'restore stages durable journal before local replacement',ok:restoreText.indexOf('stagePlanlyBulkJournal')>=0&&restoreText.indexOf('stagePlanlyBulkJournal')<restoreText.indexOf('state.tasks=JSON.parse(JSON.stringify(snapshot.tasks))')},
    {name:'restore retains safety snapshot',ok:restoreText.includes("retainPlanlyBulkSafetySnapshot('restore')")},
    {name:'restore blocks tombstone resurrection',ok:restoreText.includes('planlyTombstoneRestoreConflict')},
    {name:'restore verifies final cloud snapshot',ok:restoreText.includes('verifyPlanlyBulkSnapshot')},
    {name:'clear stages durable journal before local clear',ok:clearText.indexOf('stagePlanlyBulkJournal')>=0&&clearText.indexOf('stagePlanlyBulkJournal')<clearText.indexOf('state.tasks=[]')},
    {name:'clear retains safety snapshot',ok:clearText.includes("retainPlanlyBulkSafetySnapshot('clear-all')")},
    {name:'clear uses optimistic tombstones not hard deletes',ok:!restoreText.includes('.delete(')&&!clearText.includes('.delete(')&&projectDeleteText.includes('deleted_at')&&projectDeleteText.includes(".eq('cloud_version',version)")},
    {name:'clear preserves device-local settings',ok:!clearText.includes('persistPlanlyDeviceSettings')&&!clearText.includes('state.theme=')&&!clearText.includes('state.showCompleted=')&&!clearText.includes('state.autoCalendarTimed=')},
    {name:'bulk operations do not invoke Google deletion',ok:!restoreText.includes('deleteGoogle')&&!restoreText.includes('queueGoogle')&&!clearText.includes('deleteGoogle')&&!clearText.includes('queueGoogle')},
    {name:'bulk operations do not mutate Calendar Sources',ok:!restoreText.includes('calendar_sources')&&!clearText.includes('calendar_sources')},
    {name:'conflicted replay does not block unrelated writes',ok:replayText.includes('blocked.has(key)')&&replayText.includes('conflicts++;continue')}
  ];
  return {passed:checks.every(x=>x.ok),checks};
}
function planlyBackupValidatorAudit(){
  const sample={version:2,exportedAt:new Date().toISOString(),tasks:[{id:'release-gate-task',title:'Release gate sample',subtasks:[],unknownField:{nested:['preserved',2]}}],projects:[{id:'release-gate-project',name:'Release gate project',unknownProjectField:{keep:true}}],settings:{theme:'dark',showCompleted:false,defaultCategory:'Work',defaultDuration:45,autoCalendarTimed:true,autoCompleteParentSubtasks:true,planningStart:'07:30',planningEnd:'22:15'}};
  const normalized=normalizePlanlyBackupFile(sample);
  let duplicateRejected=false,versionRejected=false,invalidHoursRejected=false;
  try{normalizePlanlyBackupFile({...sample,tasks:[sample.tasks[0],{...sample.tasks[0]}]})}catch{duplicateRejected=true}
  try{normalizePlanlyBackupFile({...sample,version:1})}catch{versionRejected=true}
  try{normalizePlanlyBackupFile({...sample,settings:{...sample.settings,planningStart:'23:00',planningEnd:'08:00'}})}catch{invalidHoursRejected=true}
  const checks=[
    {name:'backup v2 accepted',ok:normalized.version===2},
    {name:'unknown task fields preserved',ok:canonicalJson(normalized.tasks[0].unknownField)===canonicalJson(sample.tasks[0].unknownField)},
    {name:'unknown project fields preserved',ok:canonicalJson(normalized.projects[0].unknownProjectField)===canonicalJson(sample.projects[0].unknownProjectField)},
    {name:'account settings normalized',ok:normalized.preferences.defaultCategory==='Work'&&normalized.preferences.defaultDuration===45&&normalized.preferences.autoCompleteParentSubtasks===true&&normalized.preferences.planningStart==='07:30'&&normalized.preferences.planningEnd==='22:15'},
    {name:'device settings split',ok:normalized.device.theme==='dark'&&normalized.device.showCompleted===false&&normalized.device.autoCalendarTimed===true},
    {name:'duplicate IDs rejected',ok:duplicateRejected},
    {name:'non-v2 backup rejected',ok:versionRejected},
    {name:'invalid planning hours rejected',ok:invalidHoursRejected}
  ];
  return {passed:checks.every(x=>x.ok),checks};
}
function planlyRuntimeBindingAudit(){
  const nav=$$('.nav button'),quick=$$('#quickDates .chip'),refresh=$$('[data-planly-calendar-refresh]'),remove=$$('[data-planly-calendar-remove]'),toggle=$$('[data-planly-calendar-toggle]'),colour=$$('[data-planly-calendar-colour]');
  const checks=[
    {name:'navigation handlers bound',ok:nav.length>0&&nav.every(x=>typeof x.onclick==='function')},
    {name:'Quick Dates handlers bound',ok:quick.length>0&&quick.every(x=>typeof x.onclick==='function')},
    {name:'Calendar Sources refresh handlers bound',ok:refresh.every(x=>typeof x.onclick==='function')},
    {name:'Calendar Sources remove handlers bound',ok:remove.every(x=>typeof x.onclick==='function')},
    {name:'Calendar Sources toggle handlers bound',ok:toggle.every(x=>typeof x.onchange==='function')},
    {name:'Calendar Sources colour handlers bound',ok:colour.every(x=>typeof x.onchange==='function')}
  ];
  return {passed:checks.every(x=>x.ok),checks};
}
function planlyReleaseGateAudit(){
  const fn=x=>Function.prototype.toString.call(x),bulk=planlyBulkSafetyCoverageAudit(),backup=planlyBackupValidatorAudit(),runtime=planlyRuntimeBindingAudit();
  const checks=[
    {name:'primary views available',ok:[todayView,upcomingView,monthView,inboxView,settingsView].every(x=>typeof x==='function')},
    {name:'task CRUD and undo available',ok:[openSheet,completeTaskWithUndo,rescheduleTaskWithUndo,deleteTaskWithUndo].every(x=>typeof x==='function')},
    {name:'planning surfaces available',ok:[commitPlanDay,renderTimeline,openFocus,toggleTaskPin,endTop3Drag].every(x=>typeof x==='function')},
    {name:'projects and checklist available',ok:[saveProjectEditor,toggleTaskSubtask].every(x=>typeof x==='function')},
    {name:'recurrence generation guarded',ok:typeof createNextRecurring==='function'&&fn(completeTaskWithUndo).includes('createNextRecurring')&&fn(createNextRecurring).includes('recurrence')},
    {name:'Google calendar ownership safety present',ok:typeof calendarBase==='function'&&fn(calendarBase).includes('PLANLY_CALENDAR_ID')&&fn(syncTaskToGoogle).includes('calendarBase()')&&fn(queueGoogleDelete).includes('eventId')&&fn(deleteTaskWithUndo).includes("isRecurringGoogle?'':(t.googleEventId||'')")},
    {name:'cloud journal and conflict resolution present',ok:[stagePlanlyPendingWrite,replayPlanlyPendingWrites,resolvePlanlyConflictUseCloud,resolvePlanlyConflictKeepLocal].every(x=>typeof x==='function')},
    {name:'device settings remain separate',ok:fn(resetPlanlyCloudRuntimeState).includes("state.defaultCategory='Personal'")&&!fn(resetPlanlyCloudRuntimeState).includes('persistPlanlyDeviceSettings')},
    {name:'foreground reconciliation enabled',ok:typeof reconcilePlanlyCloud==='function'},
    {name:'calendar source bindings use collection selectors',ok:['data-planly-calendar-refresh','data-planly-calendar-remove','data-planly-calendar-toggle','data-planly-calendar-colour'].every(x=>fn(settingsView).includes(x))},
    {name:'backup export/import available',ok:typeof exportData==='function'&&typeof normalizePlanlyBackupFile==='function'},
    {name:'bulk safety audit',ok:bulk.passed},
    {name:'backup validator audit',ok:backup.passed},
    {name:'runtime binding audit',ok:runtime.passed}
  ];
  return {passed:checks.every(x=>x.ok),checks,bulk,backup,runtime};
}
async function planlyReleaseCloudReadAudit(){
  const cloud=await fetchPlanlyBulkCloudState(),taskIds=cloud.tasks.map(r=>String(r.client_id)),projectIds=cloud.projects.map(r=>String(r.client_id));
  if(new Set(taskIds).size!==taskIds.length)throw new Error('Release gate found duplicate cloud task client IDs.');
  if(new Set(projectIds).size!==projectIds.length)throw new Error('Release gate found duplicate cloud project client IDs.');
  for(const row of cloud.tasks){if(!Number(row.cloud_version||0))throw new Error('Release gate found a task without a cloud version.');if(!row.deleted_at&&(!row.data||String(row.data.id)!==String(row.client_id)))throw new Error('Release gate found an active task identity mismatch.')}
  for(const row of cloud.projects){if(!Number(row.cloud_version||0))throw new Error('Release gate found a project without a cloud version.');if(!row.deleted_at&&(!row.data||String(row.data.id)!==String(row.client_id)))throw new Error('Release gate found an active project identity mismatch.')}
  if(cloud.preferences&&!Number(cloud.preferenceVersion||0))throw new Error('Release gate found preferences without a cloud version.');
  return {tasks:cloud.tasks.filter(x=>!x.deleted_at).length,taskTombstones:cloud.tasks.filter(x=>!!x.deleted_at).length,projects:cloud.projects.filter(x=>!x.deleted_at).length,projectTombstones:cloud.projects.filter(x=>!!x.deleted_at).length,preferenceVersion:Number(cloud.preferenceVersion||0)};
}
async function planlyFetchTaskRow(id){
  const {data,error}=await planlySupabase.from('planly_tasks').select('client_id,data,cloud_version,deleted_at').eq('owner_id',planlySession.user.id).eq('client_id',String(id)).maybeSingle();
  if(error)throw error;return data||null;
}
async function planlyFetchProjectRow(id){
  const {data,error}=await planlySupabase.from('planly_projects').select('client_id,data,cloud_version,deleted_at').eq('owner_id',planlySession.user.id).eq('client_id',String(id)).maybeSingle();
  if(error)throw error;return data||null;
}
async function planlyCleanupIntegrityRow(table,id){
  const ownerId=planlySession.user.id;
  const {data,error}=await planlySupabase.from(table).select('cloud_version,deleted_at').eq('owner_id',ownerId).eq('client_id',String(id)).maybeSingle();
  if(error||!data||data.deleted_at)return;
  await planlySupabase.from(table).update({deleted_at:new Date().toISOString(),client_updated_at:Date.now()}).eq('owner_id',ownerId).eq('client_id',String(id)).eq('cloud_version',Number(data.cloud_version||0));
}
function planlyUpsertAuditTask(t){const id=String(t.id),i=state.tasks.findIndex(x=>String(x.id)===id);if(i>=0)state.tasks[i]=t;else state.tasks.push(t)}
function planlyRecoveryAuditTask(id,title){
  const now=Date.now();
  return {id,title,date:localKey(new Date()),time:'',durationMinutes:30,priority:'normal',category:'Personal',projectId:'',recurrence:'none',recurrenceConfig:null,reminder:'none',notes:'Disposable 3.2 recovery-state QA',subtasks:[],addToCalendar:false,updatedAt:now,completed:false,pinned:false,googleEventId:'',calendarSync:'',createdAt:now};
}
async function runPlanlyRecoveryStateAudit(stamp,steps){
  const ownerId=planlySession.user.id,prefix='planly-integrity-task-'+stamp+'-recovery-',restartId=prefix+'restart',conflictId=prefix+'conflict',parallelId=prefix+'parallel',remoteDeleteId=prefix+'remote-delete',ids=[restartId,conflictId,parallelId,remoteDeleteId];
  const cleanup=async()=>{
    for(const id of ids){try{await planlyCleanupIntegrityRow('planly_tasks',id)}catch{}clearPlanlyPendingWrite('task',id);clearPlanlyConflict('task',id);planlyCloudSyncMeta.tasks.delete(id)}
    state.tasks=state.tasks.filter(x=>!ids.includes(String(x.id)));persistPlanlyCloudCache();
  };
  try{
    // Pending write + restart simulation: cache reload plus journal overlay must preserve the dirty local copy and original baseVersion.
    let restartTask=planlyRecoveryAuditTask(restartId,'Recovery Restart — server');
    await cloudInsertTask(restartTask,true);
    const restartVersion=Number(planlyCloudSyncMeta.tasks.get(restartId)||0);if(!restartVersion)throw new Error('Recovery audit could not establish restart task version.');
    planlyUpsertAuditTask(restartTask);persistPlanlyCloudCache();
    restartTask={...restartTask,title:'Recovery Restart — pending local',updatedAt:Date.now()};planlyUpsertAuditTask(restartTask);stageTaskMutation(restartTask);
    const restartPending=pendingPlanlyWrite('task',restartId),restartOperationId=restartPending?.operationId;
    if(!restartPending||Number(restartPending.baseVersion)!==restartVersion||!restartOperationId)throw new Error('Pending restart journal setup failed.');
    state.tasks=state.tasks.filter(x=>String(x.id)!==restartId);planlyCloudSyncMeta.tasks.delete(restartId);
    if(!restorePlanlyCloudCache())throw new Error('Pending restart cache could not be restored.');
    applyPlanlyPendingToState();
    const recoveredRestart=state.tasks.find(x=>String(x.id)===restartId),recoveredPending=pendingPlanlyWrite('task',restartId);
    if(recoveredRestart?.title!==restartTask.title||recoveredPending?.operationId!==restartOperationId||Number(recoveredPending?.baseVersion)!==restartVersion)throw new Error('Pending write did not survive restart simulation.');
    let replay=await replayPlanlyPendingWrites();if(replay.errors||replay.conflicts||pendingPlanlyWrite('task',restartId))throw new Error('Restart-recovered pending write did not replay cleanly.');
    let row=await planlyFetchTaskRow(restartId);if(row?.data?.title!==restartTask.title)throw new Error('Restart-recovered write cloud verification failed.');
    steps.push('pending-write-restart');

    // Stale second client + multiple queued writes: one conflict must not prevent an unrelated queued update from succeeding.
    let conflictTask=planlyRecoveryAuditTask(conflictId,'Recovery Conflict — base'),parallelTask=planlyRecoveryAuditTask(parallelId,'Recovery Parallel — base');
    await cloudInsertTask(conflictTask,true);await cloudInsertTask(parallelTask,true);
    const conflictBase=Number(planlyCloudSyncMeta.tasks.get(conflictId)||0),parallelBase=Number(planlyCloudSyncMeta.tasks.get(parallelId)||0);
    planlyUpsertAuditTask(conflictTask);planlyUpsertAuditTask(parallelTask);persistPlanlyCloudCache();
    conflictTask={...conflictTask,title:'Recovery Conflict — local pending',updatedAt:Date.now()};
    parallelTask={...parallelTask,title:'Recovery Parallel — local pending',updatedAt:Date.now()};
    planlyUpsertAuditTask(conflictTask);planlyUpsertAuditTask(parallelTask);stageTaskMutation(conflictTask);stageTaskMutation(parallelTask);
    const originalConflictOperation=pendingPlanlyWrite('task',conflictId)?.operationId;
    const serverConflict={...conflictTask,title:'Recovery Conflict — remote newer',updatedAt:Date.now()},serverRow=taskCloudRow(serverConflict,ownerId);delete serverRow.owner_id;delete serverRow.client_id;
    const {data:advanced,error:advanceError}=await planlySupabase.from('planly_tasks').update(serverRow).eq('owner_id',ownerId).eq('client_id',conflictId).eq('cloud_version',conflictBase).select('client_id,data,cloud_version').maybeSingle();
    if(advanceError)throw advanceError;if(!advanced||Number(advanced.cloud_version)<=conflictBase)throw new Error('Stale-client setup did not advance the remote version.');
    replay=await replayPlanlyPendingWrites();
    const conflictRecord=readPlanlyConflicts().find(x=>x.kind==='task'&&x.id===conflictId),blockedPending=pendingPlanlyWrite('task',conflictId),parallelPending=pendingPlanlyWrite('task',parallelId);
    row=await planlyFetchTaskRow(parallelId);
    if(!conflictRecord||blockedPending?.status!=='conflict'||blockedPending?.operationId!==originalConflictOperation)throw new Error('Stale second-client conflict was not persisted correctly.');
    if(parallelPending||row?.data?.title!==parallelTask.title)throw new Error('Unrelated queued write was blocked by another task conflict.');
    state.tasks=state.tasks.filter(x=>String(x.id)!==conflictId);planlyCloudSyncMeta.tasks.delete(conflictId);
    if(!restorePlanlyCloudCache())throw new Error('Conflict restart cache could not be restored.');
    applyPlanlyPendingToState();
    const recoveredConflict=state.tasks.find(x=>String(x.id)===conflictId);
    if(recoveredConflict?.title!==conflictTask.title||!readPlanlyConflicts().some(x=>x.kind==='task'&&x.id===conflictId)||pendingPlanlyWrite('task',conflictId)?.operationId!==originalConflictOperation)throw new Error('Conflict state did not survive restart simulation.');
    await resolvePlanlyConflictUseCloud('task',conflictId);
    const accepted=state.tasks.find(x=>String(x.id)===conflictId);
    if(accepted?.title!==serverConflict.title||pendingPlanlyWrite('task',conflictId)||readPlanlyConflicts().some(x=>x.kind==='task'&&x.id===conflictId))throw new Error('Conflict resolution did not cleanly accept the remote copy.');
    steps.push('conflict-restart-multi-queue-stale-client');

    // Remote deletion must remove a clean local copy during reconciliation.
    const remoteDeleteTask=planlyRecoveryAuditTask(remoteDeleteId,'Recovery Remote Delete');
    await cloudInsertTask(remoteDeleteTask,true);
    const remoteDeleteVersion=Number(planlyCloudSyncMeta.tasks.get(remoteDeleteId)||0);planlyUpsertAuditTask(remoteDeleteTask);persistPlanlyCloudCache();
    const {data:deleted,error:deleteError}=await planlySupabase.from('planly_tasks').update({deleted_at:new Date().toISOString(),client_updated_at:Date.now()}).eq('owner_id',ownerId).eq('client_id',remoteDeleteId).eq('cloud_version',remoteDeleteVersion).select('client_id,cloud_version,deleted_at').maybeSingle();
    if(deleteError)throw deleteError;if(!deleted?.deleted_at)throw new Error('Remote-deletion setup failed.');
    await reconcilePlanlyCloud({render:false,replay:false});
    if(state.tasks.some(x=>String(x.id)===remoteDeleteId))throw new Error('Remote tombstone did not remove a clean local task.');
    steps.push('remote-deletion-reconcile');
    return true;
  }finally{await cleanup()}
}

async function runPlanlySyncIntegritySuite(btn){
  if(!PLANLY_CLOUD_PREVIEW||planlyCloudReadOnly||!planlySession?.user)throw new Error('Enable controlled cloud writes first.');
  if(!navigator.onLine)throw new Error('The integrity suite needs an online connection.');
  if(readPlanlyPendingWrites().length||readPlanlyConflicts().length)throw new Error('Resolve or sync existing pending changes before running the integrity suite.');
  const audit=planlyMutationCoverageAudit(),recoveryCoverage=planlyRecoveryCoverageAudit(),releaseGate=planlyReleaseGateAudit();
  if(!audit.passed)throw new Error('Mutation coverage audit failed: '+audit.checks.filter(x=>!x.ok).map(x=>x.name).join(', '));
  if(!recoveryCoverage.passed)throw new Error('Recovery coverage audit failed: '+recoveryCoverage.checks.filter(x=>!x.ok).map(x=>x.name).join(', '));
  if(!releaseGate.passed)throw new Error('Release gate failed: '+releaseGate.checks.filter(x=>!x.ok).map(x=>x.name).join(', '));
  const stamp=Date.now(),taskId='planly-integrity-task-'+stamp,projectId='planly-integrity-project-'+stamp,ownerId=planlySession.user.id,steps=['mutation-audit','recovery-coverage-audit','release-gate-static-audit'];
  let childId='',projectVersion=0,taskVersion=0,preferenceVersionBefore=0;
  const removeLocalTestRows=()=>{
    state.tasks=state.tasks.filter(x=>!String(x.id).startsWith('planly-integrity-task-'+stamp));
    state.projects=state.projects.filter(x=>String(x.id)!==projectId);
    for(const id of [taskId,childId].filter(Boolean)){planlyCloudSyncMeta.tasks.delete(id);clearPlanlyPendingWrite('task',id);clearPlanlyConflict('task',id)}
    planlyCloudSyncMeta.projects.delete(projectId);clearPlanlyPendingWrite('project',projectId);clearPlanlyConflict('project',projectId);
  };
  if(btn){btn.disabled=true;btn.textContent='Running 3.2 integrity suite…'}
  try{
    const now=Date.now(),project={id:projectId,name:'Planly Integrity Project',dueDate:'',notes:'Disposable automated 3.2 QA',archived:false,createdAt:now,updatedAt:now};
    stageProjectMutation(project);
    let pending=pendingPlanlyWrite('project',projectId);
    if(!pending||pending.status!=='queued'||Number(pending.baseVersion)!==0)throw new Error('Project journal staging failed.');
    let replay=await replayPlanlyPendingWrites();if(replay.errors||replay.conflicts)throw new Error('Project create replay failed.');
    let projectRow=await planlyFetchProjectRow(projectId);
    if(!projectRow||projectRow.deleted_at||projectRow.data?.name!==project.name)throw new Error('Project create verification failed.');
    projectVersion=Number(projectRow.cloud_version||0);if(!projectVersion||pendingPlanlyWrite('project',projectId))throw new Error('Project create journal cleanup failed.');
    steps.push('project-create');

    project.name='Planly Integrity Project — edited';project.archived=true;project.updatedAt=Date.now();
    stageProjectMutation(project);const firstBase=Number(pendingPlanlyWrite('project',projectId)?.baseVersion||0);
    project.notes='Repeated local edit before replay';project.updatedAt=Date.now();stageProjectMutation(project);
    pending=pendingPlanlyWrite('project',projectId);
    if(firstBase!==projectVersion||Number(pending?.baseVersion||0)!==projectVersion)throw new Error('Dirty project base version was rebased.');
    replay=await replayPlanlyPendingWrites();if(replay.errors||replay.conflicts)throw new Error('Project update replay failed.');
    projectRow=await planlyFetchProjectRow(projectId);
    if(projectRow?.data?.archived!==true||projectRow?.data?.notes!==project.notes||Number(projectRow.cloud_version)<=projectVersion)throw new Error('Project update verification failed.');
    projectVersion=Number(projectRow.cloud_version);steps.push('project-update-stable-base');

    const task={id:taskId,title:'Planly Integrity Task',date:localKey(new Date()),time:'09:15',durationMinutes:45,priority:'high',category:'Personal',projectId,recurrence:'daily',recurrenceConfig:{unit:'days',interval:1,weekdays:[],monthlyMode:'day',monthDay:parseKey(localKey(new Date())).getDate(),ordinal:1,weekday:parseKey(localKey(new Date())).getDay(),endMode:'count',endDate:'',maxOccurrences:3,anchorDate:localKey(new Date())},reminder:'none',notes:'Disposable automated 3.2 QA',subtasks:[{id:uid(),title:'Integrity checklist',done:false}],addToCalendar:false,updatedAt:Date.now(),occurrenceNumber:1,completed:false,pinned:false,googleEventId:'',calendarSync:'',createdAt:Date.now()};
    stageTaskMutation(task);
    pending=pendingPlanlyWrite('task',taskId);
    if(!pending||Number(pending.baseVersion)!==0||!pending.operationId)throw new Error('Task journal staging failed.');
    replay=await replayPlanlyPendingWrites();if(replay.errors||replay.conflicts)throw new Error('Task create replay failed.');
    let taskRow=await planlyFetchTaskRow(taskId);
    if(!taskRow||taskRow.deleted_at||taskRow.data?.projectId!==projectId)throw new Error('Task create verification failed.');
    taskVersion=Number(taskRow.cloud_version||0);steps.push('task-create');

    task.title='Planly Integrity Task — edited';task.subtasks[0].done=true;task.pinned=true;task.top3Order=0;task.notes='First local edit';task.updatedAt=Date.now();
    stageTaskMutation(task);const taskBase=Number(pendingPlanlyWrite('task',taskId)?.baseVersion||0);
    task.notes='Second local edit before replay';task.durationMinutes=60;task.updatedAt=Date.now();stageTaskMutation(task);
    pending=pendingPlanlyWrite('task',taskId);
    if(taskBase!==taskVersion||Number(pending?.baseVersion||0)!==taskVersion||Number(pending?.attempts||0)!==0)throw new Error('Dirty task journal/base version failed.');
    replay=await replayPlanlyPendingWrites();if(replay.errors||replay.conflicts)throw new Error('Task update replay failed.');
    taskRow=await planlyFetchTaskRow(taskId);
    if(taskRow?.data?.title!==task.title||taskRow?.data?.subtasks?.[0]?.done!==true||taskRow?.data?.pinned!==true||Number(taskRow?.data?.durationMinutes)!==60||Number(taskRow.cloud_version)<=taskVersion)throw new Error('Task field mutation verification failed.');
    taskVersion=Number(taskRow.cloud_version);steps.push('task-edit-checklist-top3-stable-base');

    task.completed=true;task.updatedAt=Date.now();createNextRecurring(task);
    const child=state.tasks.find(x=>String(x.seriesId)===taskId&&String(x.id)!==taskId);
    if(!child||Number(child.occurrenceNumber)!==2||child.completed||child.subtasks?.[0]?.done!==false||child.projectId!==projectId)throw new Error('Recurring child generation failed.');
    childId=String(child.id);stageTaskMutation(task);stageTaskMutation(child);
    replay=await replayPlanlyPendingWrites();if(replay.errors||replay.conflicts)throw new Error('Recurrence replay failed.');
    const [parentRow,childRow]=await Promise.all([planlyFetchTaskRow(taskId),planlyFetchTaskRow(childId)]);
    if(parentRow?.data?.completed!==true||!childRow||childRow.deleted_at||Number(childRow.data?.occurrenceNumber)!==2||childRow.data?.seriesId!==taskId)throw new Error('Recurrence cloud verification failed.');
    taskVersion=Number(parentRow.cloud_version||0);const childVersion=Number(childRow.cloud_version||0);steps.push('completion-recurrence-child');

    task.completed=false;task.pinned=false;delete task.top3Order;task.updatedAt=Date.now();stageTaskMutation(task);
    replay=await replayPlanlyPendingWrites();if(replay.errors||replay.conflicts)throw new Error('Task reopen replay failed.');
    taskRow=await planlyFetchTaskRow(taskId);
    if(taskRow?.data?.completed!==false||Number(taskRow.cloud_version)<=taskVersion)throw new Error('Task reopen verification failed.');
    taskVersion=Number(taskRow.cloud_version);steps.push('task-reopen');

    const {data:prefRow,error:prefError}=await planlySupabase.from('planly_preferences').select('default_category,default_duration,auto_complete_parent_subtasks,planning_start,planning_end,cloud_version').eq('owner_id',ownerId).maybeSingle();
    if(prefError)throw prefError;
    if(prefRow){
      preferenceVersionBefore=Number(prefRow.cloud_version||0);
      const samePrefs={defaultCategory:prefRow.default_category||'Personal',defaultDuration:Number(prefRow.default_duration||30),autoCompleteParentSubtasks:!!prefRow.auto_complete_parent_subtasks,planningStart:prefRow.planning_start||'08:00',planningEnd:prefRow.planning_end||'23:00'};
      const prefResult=await cloudUpdatePreferences(samePrefs,true,preferenceVersionBefore);
      if(Number(prefResult?.cloud_version)<=preferenceVersionBefore)throw new Error('Preference optimistic write verification failed.');
      steps.push('preferences-write');
    }else steps.push('preferences-not-initialized');

    stagePlanlyPendingWrite('task','delete',taskId,taskVersion);
    stagePlanlyPendingWrite('task','delete',childId,childVersion);
    replay=await replayPlanlyPendingWrites();if(replay.errors||replay.conflicts)throw new Error('Task tombstone replay failed.');
    const [parentDeleted,childDeleted]=await Promise.all([planlyFetchTaskRow(taskId),planlyFetchTaskRow(childId)]);
    if(!parentDeleted?.deleted_at||!childDeleted?.deleted_at)throw new Error('Task tombstone verification failed.');
    steps.push('task-tombstones');

    await cloudDeleteProjectById(projectId,true,projectVersion);
    projectRow=await planlyFetchProjectRow(projectId);
    if(!projectRow?.deleted_at)throw new Error('Project tombstone verification failed.');
    steps.push('project-tombstone');

    await runPlanlyRecoveryStateAudit(stamp,steps);

    if(readPlanlyPendingWrites().some(x=>[taskId,childId,projectId].includes(x.id)))throw new Error('Integrity test left pending writes behind.');
    if(readPlanlyConflicts().some(x=>[taskId,childId,projectId].includes(x.id)))throw new Error('Integrity test left conflicts behind.');
    await reconcilePlanlyCloud({render:false,replay:false});
    if(readPlanlyPendingWrites().length||readPlanlyConflicts().length)throw new Error('Release gate finished with pending writes or unresolved conflicts.');
    const cloudRead=await planlyReleaseCloudReadAudit();steps.push('cloud-read-consistency');
    const gateAt=new Date().toISOString();
    setPlanlyCloudLocalStatus({integritySuite:'passed',integritySuiteAt:gateAt,integritySuiteSteps:steps,mutationAuditCount:audit.checks.length,recoveryAuditCount:recoveryCoverage.checks.length,releaseGateCount:releaseGate.checks.length,releaseGate:'passed',releaseGateAt:gateAt,releaseGateSteps:steps,releaseGateCloudCounts:cloudRead,releaseGateOfflineShell:'ready-final-check'});
    removeLocalTestRows();persistPlanlyCloudCache();render();showToast('3.2 release gate passed');
    return {passed:true,steps,audit,recoveryCoverage,releaseGate,cloudRead,offlineShell:'pending-final-integration'};
  }catch(err){
    const failedAt=new Date().toISOString();
    setPlanlyCloudLocalStatus({integritySuite:'failed',integritySuiteAt:failedAt,integritySuiteError:String(err?.message||err),integritySuiteSteps:steps,releaseGate:'failed',releaseGateAt:failedAt,releaseGateError:String(err?.message||err),releaseGateOfflineShell:'ready-final-check'});
    throw err;
  }finally{
    try{await planlyCleanupIntegrityRow('planly_tasks',taskId)}catch{}
    if(childId){try{await planlyCleanupIntegrityRow('planly_tasks',childId)}catch{}}
    try{await planlyCleanupIntegrityRow('planly_projects',projectId)}catch{}
    removeLocalTestRows();persistPlanlyCloudCache();render();
    if(btn){btn.disabled=false;btn.textContent='Run 3.2 release gate'}
  }
}

async function reconcilePlanlyCloud(options={}){
  if(!PLANLY_CLOUD_PREVIEW||!planlySession?.user||!navigator.onLine)return {pulled:false,deferred:true};
  if(planlyReconcilePromise)return planlyReconcilePromise;
  const minGap=Number(options.minGapMs||0),now=Date.now();
  if(minGap&&now-planlyLastReconcileAt<minGap)return {pulled:false,throttled:true};
  planlyReconcilePromise=(async()=>{
    const ownerId=planlySession.user.id;
    const [tasksRes,projectsRes,prefsRes]=await Promise.all([
      planlySupabase.from('planly_tasks').select('client_id,data,cloud_version,deleted_at').eq('owner_id',ownerId),
      planlySupabase.from('planly_projects').select('client_id,data,cloud_version,deleted_at').eq('owner_id',ownerId),
      planlySupabase.from('planly_preferences').select('default_category,default_duration,auto_complete_parent_subtasks,planning_start,planning_end,cloud_version').eq('owner_id',ownerId).maybeSingle()
    ]);
    for(const r of [tasksRes,projectsRes,prefsRes])if(r.error)throw r.error;
    const pending=readPlanlyPendingWrites(),conflicts=readPlanlyConflicts();
    const dirtyTasks=new Set(pending.filter(x=>x.kind==='task').map(x=>x.id)),dirtyProjects=new Set(pending.filter(x=>x.kind==='project').map(x=>x.id)),dirtyPrefs=pending.some(x=>x.kind==='preference');
    const conflictTasks=new Set(conflicts.filter(x=>x.kind==='task').map(x=>x.id)),conflictProjects=new Set(conflicts.filter(x=>x.kind==='project').map(x=>x.id)),conflictPrefs=conflicts.some(x=>x.kind==='preference');
    const taskRows=tasksRes.data||[],projectRows=projectsRes.data||[],serverTaskIds=new Set(taskRows.map(r=>String(r.client_id))),serverProjectIds=new Set(projectRows.map(r=>String(r.client_id)));
    for(const row of taskRows){
      const id=String(row.client_id),blocked=dirtyTasks.has(id)||conflictTasks.has(id);
      if(!blocked){
        if(row.deleted_at)state.tasks=state.tasks.filter(x=>String(x.id)!==id);
        else if(row.data&&String(row.data.id)===id){const i=state.tasks.findIndex(x=>String(x.id)===id);if(i>=0)state.tasks[i]=row.data;else state.tasks.push(row.data)}
      }
      planlyCloudSyncMeta.tasks.set(id,Number(row.cloud_version||1));
    }
    state.tasks=state.tasks.filter(t=>{const id=String(t.id);if(dirtyTasks.has(id)||conflictTasks.has(id))return true;if(!planlyCloudSyncMeta.tasks.has(id))return true;return serverTaskIds.has(id)});
    for(const row of projectRows){
      const id=String(row.client_id),blocked=dirtyProjects.has(id)||conflictProjects.has(id);
      if(!blocked){
        if(row.deleted_at)state.projects=state.projects.filter(x=>String(x.id)!==id);
        else if(row.data&&String(row.data.id)===id){const i=state.projects.findIndex(x=>String(x.id)===id);if(i>=0)state.projects[i]=row.data;else state.projects.push(row.data)}
      }
      planlyCloudSyncMeta.projects.set(id,Number(row.cloud_version||1));
    }
    state.projects=state.projects.filter(p=>{const id=String(p.id);if(dirtyProjects.has(id)||conflictProjects.has(id))return true;if(!planlyCloudSyncMeta.projects.has(id))return true;return serverProjectIds.has(id)});
    if(prefsRes.data){
      if(!dirtyPrefs&&!conflictPrefs)applyPlanlyPreferenceData({defaultCategory:prefsRes.data.default_category||'Personal',defaultDuration:Number(prefsRes.data.default_duration||30),autoCompleteParentSubtasks:!!prefsRes.data.auto_complete_parent_subtasks,planningStart:prefsRes.data.planning_start||'08:00',planningEnd:prefsRes.data.planning_end||'23:00'});
      planlyCloudSyncMeta.preferences=Number(prefsRes.data.cloud_version||planlyCloudSyncMeta.preferences||0);
    }
    planlyLastReconcileAt=Date.now();persistPlanlyCloudCache();await touchPlanlyLastSuccessfulSync().catch(()=>{});
    const pendingCount=readPlanlyPendingWrites().length,conflictCount=readPlanlyConflicts().length;
    setPlanlyCloudLocalStatus({state:conflictCount?'conflict':pendingCount?'offline-retry-needed':planlyCloudReadOnly?'cloud-loaded':'cloud-write-test',lastPullAt:new Date().toISOString(),pendingWrites:pendingCount,conflictCount});
    if(options.render!==false)render();
    if(options.replay!==false&&!planlyCloudReadOnly&&pendingCount)queuePlanlyPendingReplay(options.replayToast||'Planly Cloud synced');
    return {pulled:true,pendingCount,conflictCount};
  })().finally(()=>{planlyReconcilePromise=null});
  return planlyReconcilePromise;
}
async function startPlanlyAuth(){
  if(!initPlanlySupabase())return;
  try{
    await refreshPlanlySession();
    if(PLANLY_CLOUD_PREVIEW&&planlySession?.user){
      const pending=readPlanlyPendingWrites(),cached=readPlanlyCloudCache();
      if(pending.length&&cached){restorePlanlyCloudCache();applyPlanlyPendingToState();planlyCloudReadOnly=false;setPlanlyCloudLocalStatus({state:'offline-retry-needed',cacheRestored:true,pendingWrites:pending.length});render()}
    }
    await loadPlanlyCalendarData();await loadVerifiedCloudPreview()
  }catch(err){planlyCloudBootstrapPending=false;if(PLANLY_CLOUD_PREVIEW){const offline=isOfflineCloudError(err),pending=readPlanlyPendingWrites(),restored=(offline||pending.length>0)&&restorePlanlyCloudCache();if(restored){applyPlanlyPendingToState();planlyCloudReadOnly=pending.length?false:planlyCloudReadOnly}console.warn('Planly cloud bootstrap stopped safely',err);setPlanlyCloudLocalStatus({state:pending.length?'offline-retry-needed':offline?'offline-retry-needed':'error',error:String(err?.message||err),cacheRestored:restored,pendingWrites:pending.length});if(restored)render()}}
  planlySupabase.auth.onAuthStateChange((_event,session)=>{adoptPlanlySession(session,{explicitSignOut:_event==='SIGNED_OUT'});if(session){const pending=readPlanlyPendingWrites();if(PLANLY_CLOUD_PREVIEW&&pending.length){restorePlanlyCloudCache();applyPlanlyPendingToState();planlyCloudReadOnly=false;setPlanlyCloudLocalStatus({state:'offline-retry-needed',pendingWrites:pending.length});render()}Promise.all([loadPlanlyCalendarData(),loadVerifiedCloudPreview()]).then(()=>render()).catch(()=>{})}else{render()}});
}
window.addEventListener('online',()=>{if(PLANLY_CLOUD_PREVIEW&&planlySession?.user)reconcilePlanlyCloud({replay:true,replayToast:'Offline changes synced'}).catch(err=>{if(!isOfflineCloudError(err))console.warn('Planly reconcile failed',err)})});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&PLANLY_CLOUD_PREVIEW&&planlySession?.user&&navigator.onLine)reconcilePlanlyCloud({minGapMs:15000,replay:true,replayToast:''}).catch(()=>{})});
window.addEventListener('focus',()=>{if(PLANLY_CLOUD_PREVIEW&&planlySession?.user&&navigator.onLine)reconcilePlanlyCloud({minGapMs:15000,replay:true,replayToast:''}).catch(()=>{})});
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
  <div class="settingsCard"><h3>Cloud Sync</h3>${planlyCloudPreviewHtml()}</div>
  <div class="settingsCard"><h3>Calendars</h3>${planlyCalendarDataError?'<div class="empty compactEmpty"><strong>Calendar data error</strong><br><span class="muted">'+esc(planlyCalendarDataError)+'</span></div>':''}${planlyCalendarSourcesHtml()}</div>
  <div class="settingsCard"><h3>Appearance</h3><select id="themeSetting" class="select"><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></div>
  <div class="settingsCard"><h3>Task defaults</h3><label class="muted" style="font-size:13px">Default category</label><select id="defaultCat" class="select" style="margin-top:6px"><option>Personal</option><option>Work</option><option>Home</option><option>Health</option><option>Finance</option><option>Errands</option></select><label class="muted smallLabel">Default duration for timed tasks</label><select id="defaultDuration" class="select"><option value="15">15 minutes</option><option value="30">30 minutes</option><option value="45">45 minutes</option><option value="60">1 hour</option><option value="90">1 hour 30 minutes</option><option value="120">2 hours</option></select><label class="settingToggle"><input id="showCompleted" type="checkbox"><span>Show completed tasks</span></label><label class="settingToggle"><input id="autoCompleteParentSubtasks" type="checkbox"><span><strong>Complete task when checklist finishes</strong><small>When the final subtask is checked, complete the parent task automatically. You can still Undo it.</small></span></label></div>
  <div class="settingsCard"><h3>Time planning</h3><div class="row2"><div class="field"><label>Planning day starts</label><input id="planningStart" type="time" step="900" class="input"></div><div class="field"><label>Planning day ends</label><input id="planningEnd" type="time" step="900" class="input"></div></div><div class="muted settingsHelp">The Timeline uses these hours to calculate free time. Tasks outside the range are still shown.</div></div>
  <div class="settingsCard"><h3>Google Calendar</h3><div class="calendarStatusRow"><span class="statusDot ${googleConnected()?'connected':'offline'}"></span><strong>${esc(googleStatus)}</strong>${pendingCount?`<span class="muted">${pendingCount} pending</span>`:''}</div><div class="muted settingsHelp">Sync destination: your private <strong>Planly</strong> Google calendar. Planly refreshes Google access when you save a Calendar task when possible. Outlook is never modified.</div><label class="settingToggle"><input id="autoCalendarTimed" type="checkbox"><span><strong>Automatically sync timed tasks</strong><small>When a new task has a time, turn on “Add to Google Calendar” automatically.</small></span></label><details class="advancedSettings"><summary>Connection settings</summary><label class="muted smallLabel">Google OAuth client ID</label><input id="googleClientId" class="input" value="${esc(googleId)}" placeholder="...apps.googleusercontent.com" autocomplete="off"></details><button id="googleConnectBtn" class="primary">${googleConnected()?'Reconnect Google':'Connect Google Calendar'}</button><button id="googleSyncBtn" class="secondaryBtn">Sync pending items${pendingCount?` (${pendingCount})`:''}</button>${googleConnected()?'<button id="googleDisconnectBtn" class="dangerBtn">Disconnect Google</button>':''}</div>
  <div class="settingsCard"><h3>Data</h3><button id="exportBtn" class="primary">Export backup</button><button id="importBtn" class="secondaryBtn">Import backup</button><button id="clearBtn" class="dangerBtn">Clear all data</button></div>
  ${isStandalone()?'':'<div class="settingsCard"><h3>Install on iPhone</h3><div class="muted settingsHelp">Open Planly in Safari, tap Share, then Add to Home Screen.</div></div>'}
  <div class="settingsCard"><h3>About Planly</h3><div class="muted settingsHelp">Private local-first planner. Your tasks stay on this device unless you export or sync them.</div><div class="muted" style="font-size:12px;margin-top:8px">Planly 3.2</div></div>`;
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
  $('#defaultCat').onchange=e=>{state.defaultCategory=e.target.value;stagePreferenceMutation();save();queuePlanlyPendingReplay('Preferences synced')};
  $('#defaultDuration').onchange=e=>{state.defaultDuration=Number(e.target.value||30);stagePreferenceMutation();save();queuePlanlyPendingReplay('Preferences synced')};
  $('#showCompleted').onchange=e=>{state.showCompleted=e.target.checked;save()};
  $('#autoCalendarTimed').onchange=e=>{state.autoCalendarTimed=e.target.checked;save()};
  $('#autoCompleteParentSubtasks').onchange=e=>{state.autoCompleteParentSubtasks=e.target.checked;stagePreferenceMutation();save();queuePlanlyPendingReplay('Preferences synced')};
  const savePlanningHours=()=>{const start=$('#planningStart').value||'08:00',end=$('#planningEnd').value||'23:00';if(timeToMinutes(end)<=timeToMinutes(start)){alert('Planning day end must be after the start time.');$('#planningStart').value=state.planningStart;$('#planningEnd').value=state.planningEnd;return}state.planningStart=start;state.planningEnd=end;stagePreferenceMutation();save();queuePlanlyPendingReplay('Preferences synced')};
  $('#planningStart').onchange=savePlanningHours;$('#planningEnd').onchange=savePlanningHours;
  $('#googleClientId').onchange=e=>setGoogleClientId(e.target.value);
  $('#googleConnectBtn').onclick=async()=>{setGoogleClientId($('#googleClientId').value);try{await connectGoogle();render()}catch(err){alert(err.message)}};
  $('#googleSyncBtn').onclick=async()=>{setGoogleClientId($('#googleClientId').value);try{if(!googleConnected())await requestGoogleAccess('consent');await syncPendingGoogle();showToast('Google Calendar sync complete');render()}catch(err){alert(err.message)}};
  if($('#googleDisconnectBtn'))$('#googleDisconnectBtn').onclick=()=>{disconnectGoogle();render()};
  $('#exportBtn').onclick=exportData;
  $('#importBtn').onclick=()=>$('#importFile').click();
  $('#clearBtn').onclick=async()=>{
  if(PLANLY_CLOUD_PREVIEW&&(planlySession?.user||planlyLastAccountId())){
    if(!planlySession?.user){alert('Reconnect to your Planly account before clearing cloud data.');return}
    if(!confirm('Clear all Planly account tasks and projects?\n\nThis creates cloud tombstones so other devices also remove them. Account planning defaults reset to Planly defaults. This device\'s theme/display/Google settings, Google Calendar events, and external calendar sources are not deleted.'))return;
    try{showToast('Preparing cloud-safe Clear All…');await clearAllPlanlyCloudData()}catch(err){alert(err?.message||'Clear All failed safely.')}
    return;
  }
  if(confirm('Delete all Planly tasks and settings?')){localStorage.removeItem(STORE);location.reload()}
}
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
  stageTaskMutation(t);save();queuePlanlyPendingReplay('Checklist synced');
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
    if(t.completed){t.completed=false;t.updatedAt=Date.now();stageTaskMutation(t);save();queuePlanlyPendingReplay('Task synced');render()}else completeTaskWithUndo(t);
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
    t.calendarSync='pending';t.updatedAt=Date.now();stageTaskMutation(t);save();queuePlanlyPendingReplay('');render();
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
function validatePlanlyBackupEntity(item,label,index){
  if(!item||typeof item!=='object'||Array.isArray(item))throw new Error(label+' item '+(index+1)+' is not a valid object.');
  if(!String(item.id||'').trim())throw new Error(label+' item '+(index+1)+' has no ID.');
}
function normalizePlanlyBackupFile(d){
  if(!d||typeof d!=='object'||Array.isArray(d)||Number(d.version)!==2)throw new Error('This is not a supported Planly backup version 2 file.');
  if(!Array.isArray(d.tasks)||!Array.isArray(d.projects)||!d.settings||typeof d.settings!=='object'||Array.isArray(d.settings))throw new Error('That Planly backup is missing tasks, projects, or settings.');
  const tasks=JSON.parse(JSON.stringify(d.tasks)),projects=JSON.parse(JSON.stringify(d.projects)),s={...d.settings};
  tasks.forEach((t,i)=>{validatePlanlyBackupEntity(t,'Backup task',i);if(typeof t.title!=='string')throw new Error('Backup task '+(i+1)+' has an invalid title.');if(t.subtasks!==undefined&&!Array.isArray(t.subtasks))throw new Error('Backup task '+(i+1)+' has invalid subtasks.')});
  projects.forEach((p,i)=>{validatePlanlyBackupEntity(p,'Backup project',i);if(typeof p.name!=='string')throw new Error('Backup project '+(i+1)+' has an invalid name.')});
  assertUniqueLocalIds(tasks,'Backup tasks');assertUniqueLocalIds(projects,'Backup projects');
  if(s.theme!==undefined&&!['system','light','dark'].includes(s.theme))throw new Error('Backup theme setting is invalid.');
  for(const key of ['showCompleted','autoCalendarTimed','autoCompleteParentSubtasks'])if(s[key]!==undefined&&typeof s[key]!=='boolean')throw new Error('Backup '+key+' setting is invalid.');
  if(s.defaultCategory!==undefined&&typeof s.defaultCategory!=='string')throw new Error('Backup defaultCategory setting is invalid.');
  if(s.defaultDuration!==undefined&&(!Number.isFinite(Number(s.defaultDuration))||Number(s.defaultDuration)<=0))throw new Error('Backup defaultDuration setting is invalid.');
  const validClock=v=>typeof v==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(v);
  if(s.planningStart!==undefined&&!validClock(s.planningStart))throw new Error('Backup planningStart setting is invalid.');
  if(s.planningEnd!==undefined&&!validClock(s.planningEnd))throw new Error('Backup planningEnd setting is invalid.');
  const preferences={defaultCategory:s.defaultCategory||'Personal',defaultDuration:Number(s.defaultDuration||30),autoCompleteParentSubtasks:!!s.autoCompleteParentSubtasks,planningStart:s.planningStart||'08:00',planningEnd:s.planningEnd||'23:00'};
  if(timeToMinutes(preferences.planningEnd)<=timeToMinutes(preferences.planningStart))throw new Error('Backup planning hours are invalid.');
  const device={theme:s.theme||'system',showCompleted:s.showCompleted!==false,autoCalendarTimed:!!s.autoCalendarTimed};
  return {tasks,projects,preferences,device,version:2};
}
function currentPlanlyBackupObject(){
  return {version:2,exportedAt:new Date().toISOString(),tasks:JSON.parse(JSON.stringify(state.tasks)),projects:JSON.parse(JSON.stringify(state.projects)),settings:{theme:state.theme,showCompleted:!!state.showCompleted,defaultCategory:state.defaultCategory,defaultDuration:Number(state.defaultDuration||30),autoCalendarTimed:!!state.autoCalendarTimed,autoCompleteParentSubtasks:!!state.autoCompleteParentSubtasks,planningStart:state.planningStart||'08:00',planningEnd:state.planningEnd||'23:00'}};
}
function retainPlanlyBulkSafetySnapshot(action){
  const key=planlyCloudAccountKey(PLANLY_CLOUD_BULK_SAFETY_PREFIX);if(!key)throw new Error('Cannot create a safety snapshot without an account.');
  const snapshot={version:1,createdAt:new Date().toISOString(),action:String(action||'bulk-change'),ownerId:planlySession?.user?.id||planlyLastAccountId(),backup:currentPlanlyBackupObject()};
  localStorage.setItem(key,JSON.stringify(snapshot));
  const check=JSON.parse(localStorage.getItem(key)||'null');if(!check||check.version!==1||!check.backup||Number(check.backup.version)!==2)throw new Error('Could not persist the pre-change Planly safety snapshot.');
  return snapshot;
}
async function fetchPlanlyBulkCloudState(){
  if(!planlySession?.user)throw new Error('Sign in to Planly before changing cloud data.');
  const ownerId=planlySession.user.id;
  const [tasksRes,projectsRes,prefsRes]=await Promise.all([
    planlySupabase.from('planly_tasks').select('client_id,data,cloud_version,deleted_at').eq('owner_id',ownerId),
    planlySupabase.from('planly_projects').select('client_id,data,cloud_version,deleted_at').eq('owner_id',ownerId),
    planlySupabase.from('planly_preferences').select('default_category,default_duration,auto_complete_parent_subtasks,planning_start,planning_end,cloud_version').eq('owner_id',ownerId).maybeSingle()
  ]);
  for(const r of [tasksRes,projectsRes,prefsRes])if(r.error)throw r.error;
  return {tasks:tasksRes.data||[],projects:projectsRes.data||[],preferences:prefsRes.data||null,preferenceVersion:Number(prefsRes.data?.cloud_version||0)};
}
function assertPlanlyBulkActionReady(){
  if(!PLANLY_CLOUD_PREVIEW||!planlySession?.user||planlyCloudReadOnly)throw new Error('Enable Planly Cloud writes before using this action.');
  if(!navigator.onLine)throw new Error('This bulk cloud action requires an online connection.');
  const pending=readPlanlyPendingWrites(),conflicts=readPlanlyConflicts();
  if(pending.length||conflicts.length)throw new Error('Sync or resolve existing pending changes before using backup restore or Clear All.');
}
function planlyBulkPendingRecord(kind,action,item,baseVersion,status='queued'){
  const id=kind==='preference'?'preferences':String(item?.id||item||'');if(!id)throw new Error('Bulk journal item is missing an ID.');
  const now=new Date().toISOString();
  return {kind,action,id,data:action==='delete'?null:item,baseVersion:Number(baseVersion||0),operationId:uid(),stagedAt:now,lastEditedAt:now,attempts:0,lastAttemptAt:'',lastError:'',status};
}
function planlyTombstoneRestoreConflict(kind,item,row){
  return {kind,id:String(item.id),action:'upsert',localData:item,baseVersion:Number(row.cloud_version||0),serverData:row.data||null,serverVersion:Number(row.cloud_version||0),serverDeleted:true,message:'This backup contains an ID that is already deleted in Planly Cloud. It will not be resurrected automatically.'};
}
function stagePlanlyBulkJournal(ops,conflicts=[]){
  if(readPlanlyPendingWrites().length||readPlanlyConflicts().length)throw new Error('Bulk journal can only start from a clean sync state.');
  const pending=ops.map(op=>({...op})),conflictRows=conflicts.map(c=>({...c,recordedAt:new Date().toISOString()}));
  const keys=pending.map(op=>op.kind+'|'+op.id);if(new Set(keys).size!==keys.length)throw new Error('Bulk journal contains duplicate entity operations.');
  try{
    writePlanlyPendingWrites(pending);writePlanlyConflicts(conflictRows);
    const storedPending=readPlanlyPendingWrites(),storedConflicts=readPlanlyConflicts();
    if(canonicalJson(storedPending)!==canonicalJson(pending)||canonicalJson(storedConflicts)!==canonicalJson(conflictRows))throw new Error('Bulk journal persistence verification failed.');
  }catch(err){
    try{writePlanlyPendingWrites([])}catch{}
    try{writePlanlyConflicts([])}catch{}
    throw err;
  }
  setPlanlyCloudLocalStatus({state:conflictRows.length?'conflict':'offline-retry-needed',pendingWrites:pending.length,conflictCount:conflictRows.length,bulkJournalStagedAt:new Date().toISOString()});
  return {pending,conflicts:conflictRows};
}
function cloudPreferencesToPlanly(p){
  if(!p)return null;
  return {defaultCategory:p.default_category||'Personal',defaultDuration:Number(p.default_duration||30),autoCompleteParentSubtasks:!!p.auto_complete_parent_subtasks,planningStart:p.planning_start||'08:00',planningEnd:p.planning_end||'23:00'};
}
async function verifyPlanlyBulkSnapshot(snapshot){
  const ownerId=planlySession.user.id;
  const [tasksRes,projectsRes,prefsRes]=await Promise.all([
    planlySupabase.from('planly_tasks').select('client_id,data,deleted_at').eq('owner_id',ownerId),
    planlySupabase.from('planly_projects').select('client_id,data,deleted_at').eq('owner_id',ownerId),
    planlySupabase.from('planly_preferences').select('default_category,default_duration,auto_complete_parent_subtasks,planning_start,planning_end').eq('owner_id',ownerId).maybeSingle()
  ]);
  for(const r of [tasksRes,projectsRes,prefsRes])if(r.error)throw r.error;
  const activeTasks=(tasksRes.data||[]).filter(r=>!r.deleted_at),activeProjects=(projectsRes.data||[]).filter(r=>!r.deleted_at);
  if(activeTasks.length!==snapshot.tasks.length||activeProjects.length!==snapshot.projects.length)throw new Error('Cloud verification counts do not match the requested bulk state.');
  const taskMap=new Map(activeTasks.map(r=>[String(r.client_id),r])),projectMap=new Map(activeProjects.map(r=>[String(r.client_id),r]));
  for(const t of snapshot.tasks){const r=taskMap.get(String(t.id));if(!r||canonicalJson(r.data)!==canonicalJson(t))throw new Error('Cloud task verification failed for '+String(t.title||t.id))}
  for(const p of snapshot.projects){const r=projectMap.get(String(p.id));if(!r||canonicalJson(r.data)!==canonicalJson(p))throw new Error('Cloud project verification failed for '+String(p.name||p.id))}
  if(snapshot.preferences&&canonicalJson(cloudPreferencesToPlanly(prefsRes.data))!==canonicalJson(snapshot.preferences))throw new Error('Cloud preference verification failed.');
  return true;
}
async function restorePlanlyBackupToCloud(snapshot){
  assertPlanlyBulkActionReady();
  const cloud=await fetchPlanlyBulkCloudState(),taskRows=new Map(cloud.tasks.map(r=>[String(r.client_id),r])),projectRows=new Map(cloud.projects.map(r=>[String(r.client_id),r]));
  const wantedTasks=new Set(snapshot.tasks.map(t=>String(t.id))),wantedProjects=new Set(snapshot.projects.map(p=>String(p.id))),ops=[],conflicts=[];
  planlyCloudSyncMeta.tasks=new Map(cloud.tasks.map(r=>[String(r.client_id),Number(r.cloud_version||0)]));
  planlyCloudSyncMeta.projects=new Map(cloud.projects.map(r=>[String(r.client_id),Number(r.cloud_version||0)]));
  planlyCloudSyncMeta.preferences=Number(cloud.preferenceVersion||0);

  for(const t of snapshot.tasks){const row=taskRows.get(String(t.id));if(row?.deleted_at){ops.push(planlyBulkPendingRecord('task','upsert',t,Number(row.cloud_version||0),'conflict'));conflicts.push(planlyTombstoneRestoreConflict('task',t,row))}else ops.push(planlyBulkPendingRecord('task','upsert',t,Number(row?.cloud_version||0)))}
  for(const row of cloud.tasks){if(!row.deleted_at&&!wantedTasks.has(String(row.client_id)))ops.push(planlyBulkPendingRecord('task','delete',String(row.client_id),Number(row.cloud_version||0)))}
  for(const p of snapshot.projects){const row=projectRows.get(String(p.id));if(row?.deleted_at){ops.push(planlyBulkPendingRecord('project','upsert',p,Number(row.cloud_version||0),'conflict'));conflicts.push(planlyTombstoneRestoreConflict('project',p,row))}else ops.push(planlyBulkPendingRecord('project','upsert',p,Number(row?.cloud_version||0)))}
  for(const row of cloud.projects){if(!row.deleted_at&&!wantedProjects.has(String(row.client_id)))ops.push(planlyBulkPendingRecord('project','delete',String(row.client_id),Number(row.cloud_version||0)))}
  ops.push(planlyBulkPendingRecord('preference','upsert',snapshot.preferences,Number(cloud.preferenceVersion||0)));

  const safety=retainPlanlyBulkSafetySnapshot('restore');
  stagePlanlyBulkJournal(ops,conflicts);

  state.tasks=JSON.parse(JSON.stringify(snapshot.tasks));state.projects=JSON.parse(JSON.stringify(snapshot.projects));
  applyPlanlyPreferenceData(snapshot.preferences);
  state.theme=snapshot.device.theme;state.showCompleted=snapshot.device.showCompleted;state.autoCalendarTimed=snapshot.device.autoCalendarTimed;
  persistPlanlyDeviceSettings();persistPlanlyCloudCache();applyTheme();render();

  const result=await replayPlanlyPendingWrites();
  if(result.deferred||result.errors||result.conflicts||readPlanlyPendingWrites().length||readPlanlyConflicts().length){
    setPlanlyCloudLocalStatus({bulkAction:'restore-paused',bulkActionAt:new Date().toISOString(),safetySnapshotAt:safety.createdAt});
    throw new Error('Restore is safely paused because some cloud changes need attention. Review Planly Cloud status in Settings.');
  }
  await verifyPlanlyBulkSnapshot(snapshot);
  setPlanlyCloudLocalStatus({state:'cloud-write-test',bulkAction:'restore',bulkActionAt:new Date().toISOString(),safetySnapshotAt:safety.createdAt,taskCount:snapshot.tasks.length,projectCount:snapshot.projects.length,pendingWrites:0,conflictCount:0});
  persistPlanlyCloudCache();render();showToast('Backup restored to Planly Cloud');
  return true;
}
async function clearAllPlanlyCloudData(){
  assertPlanlyBulkActionReady();
  const cloud=await fetchPlanlyBulkCloudState(),ops=[],defaults={defaultCategory:'Personal',defaultDuration:30,autoCompleteParentSubtasks:false,planningStart:'08:00',planningEnd:'23:00'};
  planlyCloudSyncMeta.tasks=new Map(cloud.tasks.map(r=>[String(r.client_id),Number(r.cloud_version||0)]));
  planlyCloudSyncMeta.projects=new Map(cloud.projects.map(r=>[String(r.client_id),Number(r.cloud_version||0)]));
  planlyCloudSyncMeta.preferences=Number(cloud.preferenceVersion||0);

  for(const row of cloud.tasks){if(!row.deleted_at)ops.push(planlyBulkPendingRecord('task','delete',String(row.client_id),Number(row.cloud_version||0)))}
  for(const row of cloud.projects){if(!row.deleted_at)ops.push(planlyBulkPendingRecord('project','delete',String(row.client_id),Number(row.cloud_version||0)))}
  ops.push(planlyBulkPendingRecord('preference','upsert',defaults,Number(cloud.preferenceVersion||0)));

  const safety=retainPlanlyBulkSafetySnapshot('clear-all');
  stagePlanlyBulkJournal(ops,[]);

  state.tasks=[];state.projects=[];applyPlanlyPreferenceData(defaults);
  persistPlanlyCloudCache();render();

  const result=await replayPlanlyPendingWrites();
  if(result.deferred||result.errors||result.conflicts||readPlanlyPendingWrites().length||readPlanlyConflicts().length){
    setPlanlyCloudLocalStatus({bulkAction:'clear-all-paused',bulkActionAt:new Date().toISOString(),safetySnapshotAt:safety.createdAt});
    throw new Error('Clear All is safely paused because some cloud changes need attention. Review Planly Cloud status in Settings.');
  }
  await verifyPlanlyBulkSnapshot({tasks:[],projects:[],preferences:defaults});
  setPlanlyCloudLocalStatus({state:'cloud-write-test',bulkAction:'clear-all',bulkActionAt:new Date().toISOString(),safetySnapshotAt:safety.createdAt,taskCount:0,projectCount:0,pendingWrites:0,conflictCount:0});
  persistPlanlyCloudCache();render();showToast('Planly account tasks and projects cleared');
  return true;
}
function exportData(){const blob=new Blob([JSON.stringify({version:2,exportedAt:new Date().toISOString(),tasks:state.tasks,projects:state.projects,settings:{theme:state.theme,showCompleted:state.showCompleted,defaultCategory:state.defaultCategory,defaultDuration:state.defaultDuration,autoCalendarTimed:state.autoCalendarTimed,autoCompleteParentSubtasks:state.autoCompleteParentSubtasks,planningStart:state.planningStart,planningEnd:state.planningEnd}},null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`planly-backup-${localKey(new Date())}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
$('#importFile').addEventListener('change',async e=>{
  const f=e.target.files?.[0];if(!f)return;
  try{
    const d=JSON.parse(await f.text()),snapshot=normalizePlanlyBackupFile(d);
    if(PLANLY_CLOUD_PREVIEW&&(planlySession?.user||planlyLastAccountId())){
      if(!planlySession?.user)throw new Error('Reconnect to your Planly account before restoring a backup.');
      const message='Restore this backup as the authoritative Planly copy?\n\n'+snapshot.tasks.length+' tasks · '+snapshot.projects.length+' projects\n\nCloud tasks/projects not present in the backup will be tombstoned. Google Calendar events and external calendar sources are not deleted.';
      if(confirm(message)){showToast('Preparing cloud-safe restore…');await restorePlanlyBackupToCloud(snapshot)}
    }else if(confirm('Import '+snapshot.tasks.length+' tasks and replace current data?')){
      state.tasks=snapshot.tasks;state.projects=snapshot.projects;applyPlanlyPreferenceData(snapshot.preferences);state.theme=snapshot.device.theme;state.showCompleted=snapshot.device.showCompleted;state.autoCalendarTimed=snapshot.device.autoCalendarTimed;save();applyTheme();render()
    }
  }catch(err){alert(err?.message||'That backup file is not valid.')}
  e.target.value='';
})
$('#taskForm').addEventListener('submit',async e=>{
  e.preventDefault();
  const id=$('#taskId').value,now=Date.now(),wasExisting=!!id;
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
  let checklistAutoSnapshot=null,checklistAutoPendingIds=[];
  if(state.autoCompleteParentSubtasks&&!t.completed&&Array.isArray(t.subtasks)&&t.subtasks.length&&t.subtasks.every(s=>s.done)){
    checklistAutoSnapshot=cloneTasks();
    t.completed=true;
    t.updatedAt=Date.now();
    createNextRecurring(t);
    checklistAutoPendingIds=stageChangedTasksFromSnapshot(checklistAutoSnapshot);
  }else stageTaskMutation(t);
  save();queuePlanlyPendingReplay('Task synced');closeSheet();render();
  if(checklistAutoSnapshot){
    const finalizeChecklistCompletion=()=>{if(googleConnected())syncPendingGoogle().then(()=>render()).catch(()=>{})};
    showUndoToast('Checklist finished — task completed',()=>{clearPendingTaskIds(checklistAutoPendingIds);restoreTaskSnapshot(checklistAutoSnapshot);finalizeChecklistCompletion()},finalizeChecklistCompletion);
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
      t.calendarSync='pending';t.updatedAt=Date.now();stageTaskMutation(t);save();queuePlanlyPendingReplay('');render();
      showToast('Saved in Planly. Google needs reconnecting.');
    }
  }else if(oldEventId&&googleConnected()){
    await processPendingDeletes();render();
  }
})
document.addEventListener('click',e=>{const b=e.target.closest('#planlyCloudMigrateBtn');if(!b)return;const s=planlyCloudLocalStatus();if(s.state==='cloud-loaded'){if(confirm('Enable Planly Cloud Sync for this account?'))enableCloudWritePreview();return}if(s.state==='cloud-write-test')return;$('#planlyMigrationFile')?.click()});
document.addEventListener('click',e=>{const b=e.target.closest('#planlyConflictTestBtn');if(!b)return;openCloudConflictTestTask(b).catch(err=>{showToast('Conflict-test setup failed');alert(err?.message||'Could not prepare conflict-test task.')})});
document.addEventListener('click',e=>{const b=e.target.closest('#planlyDeterministicConflictBtn');if(!b)return;runDeterministicConflictTest(b).catch(err=>{showToast('Conflict protection test failed');alert(err?.message||'Conflict protection test failed.')})});
document.addEventListener('click',e=>{const b=e.target.closest('#planlyPrepareOfflineBtn');if(!b)return;preparePlanlyOfflineMode(true)});
document.addEventListener('click',e=>{const b=e.target.closest('#planlySyncSelfTestBtn');if(!b)return;runPlanlySyncSelfTest(b).catch(err=>{showToast('Sync self-test failed');alert(err?.message||'Sync self-test failed.')})});
document.addEventListener('click',e=>{const b=e.target.closest('#planlyIntegritySuiteBtn');if(!b)return;runPlanlySyncIntegritySuite(b).catch(err=>{showToast('3.2 release gate failed');alert(err?.message||'3.2 release gate failed.')})});
document.addEventListener('click',e=>{const b=e.target.closest('[data-planly-conflict-cloud]');if(!b)return;const [kind,...rest]=String(b.dataset.planlyConflictCloud||'').split('|'),id=rest.join('|');resolvePlanlyConflictUseCloud(kind,id).catch(err=>{showToast('Conflict resolution failed');alert(err?.message||'Conflict resolution failed.')})});
document.addEventListener('click',e=>{const b=e.target.closest('[data-planly-conflict-local]');if(!b)return;const [kind,...rest]=String(b.dataset.planlyConflictLocal||'').split('|'),id=rest.join('|');resolvePlanlyConflictKeepLocal(kind,id).catch(err=>{showToast('Conflict resolution failed');alert(err?.message||'Conflict resolution failed.')})});
document.addEventListener('change',e=>{if(e.target.id!=='planlyMigrationFile')return;const file=e.target.files?.[0],btn=$('#planlyCloudMigrateBtn');if(file)runPlanlyCloudMigrationFile(file,btn);e.target.value=''});
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
    if(t){t.top3Order=index;t.updatedAt=Date.now();stageTaskMutation(t)}
  });
  save();queuePlanlyPendingReplay('Top 3 order synced');
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
load();applyTheme();if(PLANLY_CLOUD_PREVIEW){const restored=restorePlanlyCloudCache();if(restored){applyPlanlyPendingToState();const pending=readPlanlyPendingWrites();planlyCloudReadOnly=pending.length?false:!['cloud-write-test','offline-retry-needed'].includes(planlyCloudLocalStatus().state);planlyCloudBootstrapPending=false;setPlanlyCloudLocalStatus({state:pending.length?'offline-retry-needed':planlyCloudLocalStatus().state||'cloud-loaded',cacheRestored:true,pendingWrites:pending.length});render()}else{state.tasks=[];state.projects=[];planlyCloudBootstrapPending=true}}else render();startPlanlyAuth().then(()=>render()).catch(()=>{planlyCloudBootstrapPending=false;render()});if(!isStandalone())$('#installHelp').hidden=false;if('serviceWorker'in navigator){if(PLANLY_CLOUD_PREVIEW)preparePlanlyOfflineMode(false).then(()=>render());else navigator.serviceWorker.register('./sw.js').catch(()=>{})};if(googleConnected()&&!PLANLY_CLOUD_PREVIEW)syncPendingGoogle().then(()=>render()).catch(()=>{});
})();
