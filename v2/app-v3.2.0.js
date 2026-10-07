(()=>{
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const STORE='planly-data-v1';
/* Stage 4b: a password-reset link opens the app with #...type=recovery (or #error=... when expired). Read it before Supabase clears the hash. */
const PLANLY_RECOVERY_KEY='planly-recovery-pending';
const PLANLY_AUTH_LINK=(()=>{try{const p=new URLSearchParams(String(location.hash||'').replace(/^#/,''));const recovery=p.get('type')==='recovery'&&!!p.get('access_token');if(recovery)sessionStorage.setItem(PLANLY_RECOVERY_KEY,'1');return {recovery,error:p.get('error')?String(p.get('error_description')||'This link is no longer valid.').replace(/\+/g,' '):''}}catch{return {recovery:false,error:''}}})();
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
/* Which member's project the Projects panel is showing (owned by core-projects; declared here so the project helpers work from the first render). */
let activeProjectOwnerId='';
/* Household chore state (owned by core-assignment; declared here so its functions work from the first render). */
/* Tasks whose last checklist item this device ticked: complete them only once the server confirms every item done. */
const planlyHouseholdAutoCompleteIntent=new Set();
let planlyHouseholdSubtaskRun=null;
let __planlyHouseholdLoadFlight=null,__planlyHouseholdLoadOwner='';
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
const PLANLY_INTELLIGENCE_HISTORY_KEY='planly-intelligence-history-v1';
const PLANLY_OFFLINE_CACHE='planly-v2-330a12';
const PLANLY_SW_PROBE='planly-v2-sw-330a12';
const PLANLY_CONFLICT_TEST_ID_KEY='planly-cloud-conflict-test-id-v1';
let editingSubtasks=[];
let activeSearchFilter='all';
let projectPanelMode='list',activeProjectId='',editingProjectId='';
let timelineDate=localKey(new Date()),timelineDrag=null;
let taskActionId='';
let state={tasks:[],projects:[],tab:'today',theme:'system',showCompleted:true,taskRowDensity:'compact',defaultCategory:'Personal',defaultDuration:30,autoCalendarTimed:false,autoCompleteParentSubtasks:false,intelligenceSuggestions:true,intelligenceChoreBalance:false,intelligenceNightRest:true,intelligenceNightRestHours:8,planningStart:'08:00',planningEnd:'23:00',selectedDate:localKey(new Date()),weekAnchor:localKey(new Date()),monthAnchor:localKey(new Date())};
const PLANLY_DONE_OPEN_KEY='planly-completed-open-v1';
const completedOpen=(()=>{try{const d=JSON.parse(localStorage.getItem(PLANLY_DONE_OPEN_KEY)||'{}');return d&&typeof d==='object'&&!Array.isArray(d)?d:{}}catch{return {}}})();
const expandedTaskChecklists=new Set();
function localKey(d){const x=new Date(d);return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`}
function parseKey(s){const [y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d,12)}
function addDays(s,n){const d=parseKey(s);d.setDate(d.getDate()+n);return localKey(d)}
function thisWeekendKey(baseKey=localKey(new Date())){const d=parseKey(baseKey),day=d.getDay();if(day===6||day===0)return baseKey;return addDays(baseKey,6-day)}
function fmt(s,o={weekday:'short',day:'numeric',month:'short'}){return new Intl.DateTimeFormat(undefined,o).format(parseKey(s))}
function uid(){return `${Date.now()}-${Math.random().toString(16).slice(2)}`}
function esc(v=''){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function loadIntelligenceHistory(){try{const d=JSON.parse(localStorage.getItem(PLANLY_INTELLIGENCE_HISTORY_KEY)||'null');return d&&d.version===1&&Array.isArray(d.samples)?d:{version:1,samples:[],dismissed:{},accepted:{}}}catch{return {version:1,samples:[],dismissed:{},accepted:{}}}}
function saveIntelligenceHistory(d){try{localStorage.setItem(PLANLY_INTELLIGENCE_HISTORY_KEY,JSON.stringify(d))}catch{}}
function intelligenceLearning(){const d=loadIntelligenceHistory(),by={};for(const s of d.samples){const k=String(s.category||'Personal'),g=by[k]||(by[k]={n:0,total:0,timeTotal:0});g.n++;g.total+=Number(s.focusMinutes||0);g.timeTotal+=Number(s.timeMinutes||0)}for(const g of Object.values(by)){g.usualMinutes=Math.max(5,Math.round((g.total/g.n)/5)*5);g.bestTimeMinutes=Math.round((g.timeTotal/g.n)/15)*15}return {history:d,byCategory:by}}
function taskLearningSuggestion(t){const g=intelligenceLearning().byCategory[String(t?.category||'Personal')];if(!g||g.n<3)return null;return {usualMinutes:g.usualMinutes,bestTimeMinutes:g.bestTimeMinutes,samples:g.n}}
function taskLearningReason(t){const s=taskLearningSuggestion(t);if(!s)return '';const bits=['Usually takes you ~'+durationLabel(s.usualMinutes)];if(s.bestTimeMinutes>=0)bits.push('Often done around '+minutesToTime(s.bestTimeMinutes));return bits.join(' · ')}
function recurrenceLearningKey(t){return String(t?.title||'').trim().toLowerCase()}
function recurringLearningCandidate(t){if(!t||t._planlyOwnedByMe===false||t.visibility==='household'||t.recurrence&&t.recurrence!=='none'||!t.completed)return null;const h=loadIntelligenceHistory(),key=recurrenceLearningKey(t);if(h.dismissed?.[key])return null;const same=state.tasks.filter(x=>x!==t&&x._planlyOwnedByMe!==false&&x.visibility!=='household'&&x.completed&&recurrenceLearningKey(x)===key&&x.date).sort((a,b)=>String(b.date).localeCompare(String(a.date)));if(same.length<1||!t.date)return null;const days=Math.abs(Math.round((parseKey(t.date)-parseKey(same[0].date))/86400000));return days>=12&&days<=16?{label:'Make it every 2 weeks?',interval:2,unit:'weeks'}:null}
function dismissRecurringLearning(t){const d=loadIntelligenceHistory(),key=recurrenceLearningKey(t);d.dismissed=d.dismissed||{};d.dismissed[key]=Date.now();saveIntelligenceHistory(d)}
function maybeOfferRecurringLearning(t){const s=recurringLearningCandidate(t);if(!s)return;let el=document.getElementById('recurrenceLearningSheet');if(!el){el=document.createElement('div');el.id='recurrenceLearningSheet';el.className='intelligenceWhySheet';document.body.appendChild(el)}el.innerHTML='<div class="intelligenceWhyCard"><div class="sectionHead"><div><span class="calendarGroupLabel">Suggestion</span><h2>Repeat '+esc(t.title)+'?</h2></div></div><p class="muted">You completed this about two weeks after the previous one. Make a future task every 2 weeks?</p><div class="planDayFooter"><button type="button" data-repeat-no>Not for this task</button><button type="button" class="primary" data-repeat-yes>Make it every 2 weeks</button></div></div>';el.classList.add('open');el.querySelector('[data-repeat-no]').onclick=()=>{dismissRecurringLearning(t);el.classList.remove('open')};el.querySelector('[data-repeat-yes]').onclick=()=>{el.classList.remove('open');const source=state.tasks.find(x=>x.id===t.id);if(!source)return;const before=cloneTasks(),nextDate=addDays(source.date,14),next={...source,id:uid(),date:nextDate,time:source.time||'',completed:false,completedBy:'',completedAt:null,recurrence:'custom',recurrenceConfig:{unit:'weeks',interval:2,weekdays:[parseKey(source.date).getDay()],anchorDate:source.date,endMode:'never'},seriesId:source.seriesId||source.id,occurrenceNumber:2,googleEventId:'',calendarSync:source.addToCalendar?'pending':'',createdAt:Date.now(),updatedAt:Date.now(),_planlyOwnedByMe:true};state.tasks.push(next);const pendingIds=stageChangedTasksFromSnapshot(before);save();render();showUndoToast('Future repeat created',()=>{clearPendingTaskIds(pendingIds);restoreTaskSnapshot(before)},()=>queuePlanlyPendingReplay('Repeat synced'))}}
const PLANLY_TODAY_CARDS=[['summary','Today summary','Progress and the next task. Timeline and Suggest stay as small buttons.'],['deadlines','Project deadlines',''],['suggestions','Suggestions','A short line when Planly has suggestions for today.'],['top3','Top 3 priorities',''],['bills','Bills due',''],['household','Household calendar','Calendar items shared with your household.']];
function planlyTodayHiddenList(){return Array.isArray(state.todayHidden)?state.todayHidden.filter(k=>PLANLY_TODAY_CARDS.some(c=>c[0]===k)):[]}
function todayCardOn(key){return !planlyTodayHiddenList().includes(key)}
/* iOS 26.5+ only gives a haptic when the finger itself toggles a native switch, so tick buttons carry an invisible one under the tap. */let planlyNativeTapAt=0;function planlyTapSwitch(){return '<input type="checkbox" switch class="planlyTapSwitch" tabindex="-1" aria-hidden="true">'}function planlySyncHaptics(){document.documentElement.classList.toggle('planlyNoHaptics',state.haptics===false)}document.addEventListener('click',e=>{if(e.target?.classList?.contains('planlyTapSwitch'))planlyNativeTapAt=Date.now()},true);['change','input'].forEach(type=>document.addEventListener(type,e=>{if(e.target?.classList?.contains('planlyTapSwitch'))e.stopPropagation()},true));function planlyHaptic(){if(state.haptics===false)return;try{if(typeof navigator.vibrate==='function'){navigator.vibrate(10);return}if(Date.now()-planlyNativeTapAt<1000)return;let label=document.getElementById('planlyHapticLabel');if(!label){label=document.createElement('label');label.id='planlyHapticLabel';label.setAttribute('aria-hidden','true');label.style.cssText='position:fixed;left:-9999px;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none';const input=document.createElement('input');input.type='checkbox';input.setAttribute('switch','');input.tabIndex=-1;label.appendChild(input);const stop=e=>e.stopPropagation();label.addEventListener('click',stop);input.addEventListener('click',stop);input.addEventListener('change',stop);document.body.appendChild(label)}label.click()}catch{}}
window.planlyHaptic=planlyHaptic;
function persistPlanlyDeviceSettings(){localStorage.setItem(PLANLY_DEVICE_SETTINGS_KEY,JSON.stringify({version:1,theme:state.theme,showCompleted:!!state.showCompleted,taskRowDensity:state.taskRowDensity==='comfortable'?'comfortable':'compact',autoCalendarTimed:!!state.autoCalendarTimed,intelligenceSuggestions:state.intelligenceSuggestions!==false,intelligenceChoreBalance:!!state.intelligenceChoreBalance,intelligenceNightRest:state.intelligenceNightRest!==false,intelligenceNightRestHours:Number(state.intelligenceNightRestHours||8),todayHidden:planlyTodayHiddenList(),haptics:state.haptics!==false}))}
function restorePlanlyDeviceSettings(){try{const d=JSON.parse(localStorage.getItem(PLANLY_DEVICE_SETTINGS_KEY)||'null');if(!d||Number(d.version)!==1)return false;state.theme=d.theme||state.theme||'system';state.showCompleted=d.showCompleted!==false;state.taskRowDensity=d.taskRowDensity==='comfortable'?'comfortable':'compact';state.autoCalendarTimed=!!d.autoCalendarTimed;state.intelligenceSuggestions=d.intelligenceSuggestions!==false;state.intelligenceChoreBalance=!!d.intelligenceChoreBalance;state.intelligenceNightRest=d.intelligenceNightRest!==false;state.intelligenceNightRestHours=Math.max(4,Math.min(12,Number(d.intelligenceNightRestHours||8)));state.todayHidden=Array.isArray(d.todayHidden)?d.todayHidden.filter(k=>PLANLY_TODAY_CARDS.some(c=>c[0]===k)):[];state.haptics=d.haptics!==false;return true}catch{return false}}
function save(){if(PLANLY_CLOUD_PREVIEW&&(planlySession?.user||planlyLastAccountId())){persistPlanlyDeviceSettings();persistPlanlyCloudCache();return}localStorage.setItem(STORE,JSON.stringify({tasks:state.tasks,projects:state.projects,theme:state.theme,showCompleted:state.showCompleted,defaultCategory:state.defaultCategory,defaultDuration:state.defaultDuration,autoCalendarTimed:state.autoCalendarTimed,autoCompleteParentSubtasks:state.autoCompleteParentSubtasks,planningStart:state.planningStart,planningEnd:state.planningEnd}))}
function load(){try{const d=JSON.parse(localStorage.getItem(STORE)||'{}');state.tasks=Array.isArray(d.tasks)?d.tasks:[];state.projects=Array.isArray(d.projects)?d.projects:[];state.theme=d.theme||'system';state.showCompleted=d.showCompleted!==false;state.defaultCategory=d.defaultCategory||'Personal';state.defaultDuration=Number(d.defaultDuration||30);state.autoCalendarTimed=!!d.autoCalendarTimed;state.autoCompleteParentSubtasks=!!d.autoCompleteParentSubtasks;state.planningStart=d.planningStart||'08:00';state.planningEnd=d.planningEnd||'23:00';if(PLANLY_CLOUD_PREVIEW&&!restorePlanlyDeviceSettings())persistPlanlyDeviceSettings();if(timeToMinutes(state.planningEnd)<=timeToMinutes(state.planningStart)){state.planningStart='08:00';state.planningEnd='23:00'}const recurrenceChanged=migrateRecurringCalendarState();if(recurrenceChanged&&!PLANLY_CLOUD_PREVIEW)save()}catch{}}
function applyTheme(){let t=state.theme;if(t==='system')t=matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light';document.documentElement.dataset.theme=t}
function isStandalone(){return matchMedia('(display-mode: standalone)').matches||navigator.standalone===true}
function setHeader(title,dateText=''){const e=$('#eyebrow');$('#pageTitle').textContent=title;e.textContent=dateText;e.dataset.shortDate=title==='Today'?new Intl.DateTimeFormat(undefined,{day:'numeric',month:'short'}).format(new Date()):dateText}
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
  const m=String(value||'').match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
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
  const external=externalEventsForDate(timelineDate,'timeline'),externalTimed=externalTimelineIntervals(timelineDate),externalAllDay=external.filter(e=>e.is_all_day),{start:planStart,end:planEnd}=planningBounds(),analysis=timelineAnalysis(tasks,planStart,planEnd,externalTimed.filter(x=>planlySourceRepresents(x.event?.source_id)!=='partner')),layout=timelineLayout(tasks),intelligence=intelligenceForDate(timelineDate,timelineDate===localKey(new Date())?new Date().getHours()*60+new Date().getMinutes():0),clashes=Array.isArray(intelligence?.day?.clashes)?intelligence.day.clashes:[],calendarClashes=new Set(clashes.filter(x=>x?.b==='calendar').map(x=>String(x.a||''))).size,taskClashes=new Set(clashes.filter(x=>x?.b&&x.b!=='calendar').map(x=>[String(x.a||''),String(x.b||'')].sort().join('|'))).size;
  const busyStarts=[...layout.map(x=>x.start),...externalTimed.map(x=>x.start)],busyEnds=[...layout.map(x=>x.end),...externalTimed.map(x=>x.end)],earliest=busyStarts.length?Math.min(...busyStarts):planStart,latest=busyEnds.length?Math.max(...busyEnds):planEnd;
  const displayStart=Math.max(0,Math.floor(Math.min(planStart,earliest)/60)*60),displayEnd=Math.min(1440,Math.ceil(Math.max(planEnd,latest)/60)*60),scale=1.05,stageHeight=Math.max(360,(displayEnd-displayStart)*scale),hours=[];
  for(let m=displayStart;m<=displayEnd;m+=60){const top=(m-displayStart)*scale;hours.push(`<div class="timelineHour" style="top:${top}px"><span>${esc(minutesToTime(m===1440?1439:m).replace('23:59','24:00'))}</span><i></i></div>`)}
  const freeBands=analysis.freeGaps.map(g=>{const a=Math.max(displayStart,g.start),b=Math.min(displayEnd,g.end);if(b<=a)return '';return `<div class="timelineFreeBand" style="top:${(a-displayStart)*scale}px;height:${Math.max(2,(b-a)*scale)}px"></div>`}).join('');
  const externalBlocks=externalTimed.map(x=>{const top=(x.start-displayStart)*scale,height=Math.max(28,Math.min((x.end-x.start)*scale,stageHeight-top));return `<div class="timelineExternalBlock" style="--calendar-source:${x.colour};top:${top}px;height:${height}px"><strong>${esc(x.event.title||'Busy')}</strong><span>${esc(externalEventTimeLabel(x.event,timelineDate))}</span><small>Read only</small></div>`}).join('');
  const blocks=layout.map(x=>{const top=(x.start-displayStart)*scale,height=Math.max(34,Math.min((x.end-x.start)*scale,stageHeight-top)),left=(x.col/x.cols)*100,width=100/x.cols,conflict=analysis.conflictIds.has(x.t.id),project=projectNameForTask(x.t);return `<div class="timelineBlock ${conflict?'conflict':''}" data-timeline-id="${esc(x.t.id)}" style="top:${top}px;height:${height}px;left:${left}%;width:calc(${width}% - 4px)"><button type="button" class="timelineDragHandle" data-timeline-drag="${esc(x.t.id)}" aria-label="Drag to reschedule">↕</button><div class="timelineBlockText"><strong>${esc(x.t.title)}</strong><span>${esc(x.t.time)}–${esc(minutesToTime(Math.min(1439,x.end)))} · ${durationLabel(x.duration)}${project?' · '+esc(project):''}</span></div>${conflict?'<em>Overlap</em>':''}</div>`}).join('');
  const nowMinutes=new Date().getHours()*60+new Date().getMinutes(),nowLine=timelineDate===localKey(new Date())&&nowMinutes>=displayStart&&nowMinutes<=displayEnd?`<div class="timelineNow" style="top:${(nowMinutes-displayStart)*scale}px"><span>Now</span></div>`:'';
  const gaps=analysis.freeGaps.length?analysis.freeGaps.map(g=>`<span class="timelineGapChip">${esc(freeGapLabel(g))}</span>`).join(''):'<span class="timelineGapChip">No free gaps inside planning hours</span>';
  const summary=`<div class="timelineMetrics"><div><strong>${timed.length}</strong><span>Timed tasks</span></div><div><strong>${external.length}</strong><span>Calendar items</span></div><div><strong>${durationLabel(analysis.freeMinutes)}</strong><span>Free time</span></div><div class="${taskClashes||calendarClashes?'warningMetric':''}"><strong>${taskClashes+calendarClashes}</strong><span>Clashes</span></div></div><div class="timelineGapList">${gaps}</div>`;
  const allDayHtml=externalAllDay.length?`<section class="timelineExternalAllDay"><div class="sectionHead"><h2>All day</h2><span class="muted">${externalAllDay.length}</span></div>${externalAllDay.map(e=>externalEventHtml(e,timelineDate)).join('')}</section>`:'';
  const anytimeHtml=`<section class="timelineAnytime"><div class="sectionHead"><h2>Anytime</h2><span class="muted">${anytime.length}</span></div>${anytime.length?anytime.map(t=>`<div class="timelineAnytimeRow"><div><strong>${esc(t.title)}</strong><span>${durationLabel(t.durationMinutes)}${projectNameForTask(t)?' · '+esc(projectNameForTask(t)):''}</span></div><div class="timelineQuickTimes"><button type="button" data-timeline-set="${esc(t.id)}" data-time="09:00">Morning</button><button type="button" data-timeline-set="${esc(t.id)}" data-time="14:00">Afternoon</button><button type="button" data-timeline-set="${esc(t.id)}" data-time="18:00">Evening</button><input type="time" data-timeline-time="${esc(t.id)}" aria-label="Choose time"></div></div>`).join(''):'<div class="empty compactEmpty">No Anytime tasks for this day.</div>'}</section>`;
  $('#timelineContent').innerHTML=summary+allDayHtml+`<div class="timelineStage" data-start="${displayStart}" data-end="${displayEnd}" data-scale="${scale}" style="height:${stageHeight}px">${hours.join('')}${nowLine}<div class="timelineLane">${freeBands}${externalBlocks}${blocks}</div></div>`+anytimeHtml;
}
function openTimeline(date=localKey(new Date())){
  if($('#taskActionWrap')?.classList.contains('open'))closeTaskActions();
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
  const set=e.target.closest('[data-timeline-set]');if(set){setTimelineTaskTime(set.dataset.timelineSet,set.dataset.time,'Task scheduled for '+set.dataset.time);return}
}
function handleTimelineChange(e){
  const time=e.target.closest('[data-timeline-time]');if(time&&time.value)setTimelineTaskTime(time.dataset.timelineTime,time.value,'Task scheduled for '+time.value);
}

function intelligenceLearningInput(){const by=intelligenceLearning().byCategory,out={};for(const [category,g] of Object.entries(by))if(g.n>=3)out[category]={usualMinutes:g.usualMinutes,bestTimeMinutes:g.bestTimeMinutes,samples:g.n};return out}
function intelligenceForDate(key,nowMinutes=0){if(state.intelligenceSuggestions===false||!window.PlanlyIntelligence?.analyse)return null;try{return window.PlanlyIntelligence.analyse({today:key,realToday:localKey(new Date()),nowMinutes,planningStart:String(state.planningStart||'08:00').slice(0,5),planningEnd:String(state.planningEnd||'23:00').slice(0,5),currentUserId:String(planlySession?.user?.id||''),defaultDuration:state.defaultDuration,tasks:state.tasks,projects:state.projects,busy:planlyBusyIntervals(key).map(x=>({start:x.start,end:x.end})),learning:intelligenceLearningInput(),prefs:{suggestions:true,nightRest:state.intelligenceNightRest!==false,nightRestHours:Number(state.intelligenceNightRestHours||8)}})}catch{return null}}
function planlyTop3LimitFor(rec){return (rec?.day?.isWorkDay||rec?.day?.overnightRest)?2:3}
function planlyTop3LimitForDate(key){const now=new Date(),isToday=key===localKey(now);return planlyTop3LimitFor(intelligenceForDate(key,isToday?now.getHours()*60+now.getMinutes():timeToMinutes(state.planningStart)))}
function householdChoreIntelligence(){if(!state.intelligenceChoreBalance||!window.PlanlyIntelligence?.analyse)return null;try{const today=localKey(new Date()),weekStart=startMonday(today),weekEnd=addDays(weekStart,6),ctx=window.PlanlyHouseholdContext?.get?.()||window.PlanlyHouseholdContext||{},members=(ctx.members||planlyHouseholdMembers||[]).map(m=>({id:String(m.user_id||m.id||''),name:String(m.display_name||m.displayName||'')})),tasks=state.tasks.map(t=>({...t,completedDate:t.completedAt?localKey(new Date(t.completedAt)):''}));return window.PlanlyIntelligence.analyse({today,realToday:today,nowMinutes:new Date().getHours()*60+new Date().getMinutes(),planningStart:String(state.planningStart||'08:00').slice(0,5),planningEnd:String(state.planningEnd||'23:00').slice(0,5),currentUserId:String(planlySession?.user?.id||''),defaultDuration:state.defaultDuration,tasks,projects:state.projects,busy:[],members,weekStart,weekEnd,prefs:{suggestions:true,nightRest:false}})?.household||null}catch{return null}}
function projectIntelligence(id,analysis=null){return (analysis||intelligenceForDate(localKey(new Date()),new Date().getHours()*60+new Date().getMinutes()))?.projects?.find(x=>String(x.id)===String(id))||null}
function projectStatusHtml(p,analysis=null){const x=projectIntelligence(p.id,analysis);if(!x||(x.status==='empty'&&!p.dueDate))return '';const label=x.status==='behind'?'Behind':x.status==='stalled'?'Stalled':x.status==='done'?'Done':x.status==='not-scheduled'?'Not scheduled':x.status==='empty'?'No tasks yet':'On track';return '<span class="projectIntelStatus '+esc(x.status)+'" title="'+esc((x.reasons||[]).join(' · '))+'">'+esc(label)+'</span>'}
function learnedPlanningDuration(t){const s=taskLearningSuggestion(t);return s?Math.max(5,Number(s.usualMinutes||0)):Math.max(5,Number(t?.durationMinutes||state.defaultDuration||30))}
function firstPlanningGap(key,t,nowMinutes=0){const bounds=planningBounds(),need=learnedPlanningDuration(t),busy=[...planlyBusyIntervals(key),...state.tasks.filter(x=>x!==t&&!x.completed&&x.date===key&&x.time).map(x=>{const s=timeToMinutes(x.time);return {start:s,end:s+Math.max(5,Number(x.durationMinutes||state.defaultDuration||30))}})].sort((x,y)=>x.start-y.start);let at=Math.max(bounds.start,nowMinutes||bounds.start);for(const row of busy){if(row.end<=at)continue;const slot=Math.ceil(at/15)*15;if(row.start-slot>=need)return minutesToTime(slot);at=Math.max(at,row.end)}const slot=Math.ceil(at/15)*15;return bounds.end-slot>=need?minutesToTime(slot):''}
function planProjectBlock(p){const x=projectIntelligence(p.id),t=x?.nextStepId&&state.tasks.find(v=>String(v.id)===String(x.nextStepId));if(!t||t._planlyOwnedByMe===false||t.visibility==='household')return showToast('No personal next step is available to plan.');const today=localKey(new Date()),tomorrow=addDays(today,1),now=new Date().getHours()*60+new Date().getMinutes();if(t.date===today&&t.time){const start=timeToMinutes(t.time),end=start+Math.max(5,Number(t.durationMinutes||state.defaultDuration||30)),clash=[...planlyBusyIntervals(today),...state.tasks.filter(v=>v!==t&&!v.completed&&v.date===today&&v.time).map(v=>({start:timeToMinutes(v.time),end:timeToMinutes(v.time)+Math.max(5,Number(v.durationMinutes||state.defaultDuration||30))}))].some(v=>v.start<end&&v.end>start);if(!clash&&end>now)return showToast('Already planned at '+t.time)}const todayTime=firstPlanningGap(today,t,now),target=todayTime?today:tomorrow,suggested=todayTime||firstPlanningGap(tomorrow,t,0);if(!suggested)return showToast('No free block fits today or tomorrow.');const before=cloneTasks();t.date=target;t.time=suggested;t.updatedAt=Date.now();if(t.addToCalendar)t.calendarSync='pending';const pendingIds=stageChangedTasksFromSnapshot(before);save();renderProjectsPanel();render();showUndoToast('Planned '+t.title,()=>{clearPendingTaskIds(pendingIds);restoreTaskSnapshot(before);renderProjectsPanel()},()=>{queuePlanlyPendingReplay('Project block synced');if(t.addToCalendar&&googleConnected())syncPendingGoogle().then(()=>render()).catch(()=>{})})}










function closeProjectsCore(){$('#projectsWrap').classList.remove('open');$('#projectsWrap').setAttribute('aria-hidden','true');projectPanelMode='list';activeProjectId='';editingProjectId=''}
function refreshProjectsIfOpen(){if($('#projectsWrap')?.classList.contains('open'))renderProjectsPanel()}




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
  <div class="taskActionPrimary">${!t.completed?`<button type="button" data-task-menu="complete"><strong>✓</strong><span>Complete</span></button>`:`<button type="button" data-task-menu="reopen"><strong>↶</strong><span>Mark incomplete</span></button>`}<button type="button" data-task-menu="edit"><strong>✎</strong><span>Edit</span></button><button type="button" data-task-menu="duplicate"><strong>⧉</strong><span>Duplicate</span></button></div>
  ${planlyRotationEligible(t)?`<div class="taskActionSection"><h3>Household</h3><button type="button" class="taskActionRotate${t.rotation?.enabled?' on':''}" data-task-menu="rotate" aria-pressed="${t.rotation?.enabled?'true':'false'}"><span><strong>Rotate weekly</strong><small>${t.rotation?.enabled?'Swaps each week between you':'Take turns each week'}</small></span><span class="taskActionRotateState">${t.rotation?.enabled?'On':'Off'}</span></button></div>`:''}
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
  if(action==='rotate'){planlyToggleRotation(t);refreshTaskActionsIfOpen();render();return}
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

function planlyInlineChecklistHtml(t,readOnly,footer=''){const subtasks=Array.isArray(t.subtasks)?t.subtasks:[];return `<div class="inlineChecklist" data-inline-checklist="${esc(t.id)}">${subtasks.map(s=>readOnly?`<span class="inlineSubtask readOnly ${s.done?'done':''}" aria-disabled="true"><span class="inlineSubtaskCheck">${s.done?'✓':''}</span><span class="inlineSubtaskTitle">${esc(s.title)}</span></span>`:`<button type="button" class="inlineSubtask ${s.done?'done':''}" data-action="toggle-subtask" data-subtask-id="${esc(s.id)}" aria-pressed="${s.done?'true':'false'}"><span class="inlineSubtaskCheck">${s.done?'✓':''}</span><span class="inlineSubtaskTitle">${esc(s.title)}</span></button>`).join('')}${footer}</div>`}
function taskHtmlCore(t,top3Mode=false){
  const readOnly=t._planlyOwnedByMe===false;
  const subtasks=Array.isArray(t.subtasks)?t.subtasks:[];
  const subtaskDone=subtasks.filter(s=>s.done).length;
  const checklistExpanded=subtasks.length&&expandedTaskChecklists.has(t.id);
  const subtaskMeta=subtasks.length?`<button type="button" class="subtaskMeta ${subtaskDone===subtasks.length?'allDone':''}" data-action="expand-checklist" aria-expanded="${checklistExpanded?'true':'false'}" aria-label="${checklistExpanded?'Collapse':'Expand'} checklist"><svg class="pIcon" aria-hidden="true"><use href="#pi-checklist"/></svg>${subtaskDone}/${subtasks.length}<span class="subtaskChevron">${checklistExpanded?'⌃':'⌄'}</span></button>`:'';
  const inlineChecklist=checklistExpanded?planlyInlineChecklistHtml(t,readOnly&&!(typeof planlyHouseholdCompletionEligible==='function'&&planlyHouseholdCompletionEligible(t))):'';
  const priority=t.priority&&t.priority!=='normal'?`<span class="pill priorityPill ${t.priority==='high'?'priorityHigh':''}">${esc(t.priority)}</span>`:'';
  const reminder=reminderLabel(t.reminder);
  const projectName=projectNameForTask(t);
  const projectMeta=projectName?`<button type="button" class="projectTaskPill" data-action="project" data-project-id="${esc(t.projectId)}">${esc(projectName)}</button>`:'';
  const assigneeId=String(t.assigneeId||t.assignee_id||''),completedBy=String(t.completedBy||t.completed_by||''),sharedLabels=t.visibility==='household'?[[(assigneeId?'Assigned to '+planlyHouseholdSentencePersonLabel(assigneeId):'Anyone can complete'),planlyPersonTone(assigneeId)],(t.completed&&completedBy?['Done by '+planlyHouseholdSentencePersonLabel(completedBy),planlyPersonTone(completedBy)]:null)].filter(Boolean):[];
  const sharedMeta=t.visibility==='household'?'<span class="pill householdTaskPill">Household</span>'+sharedLabels.map(([label,tone])=>'<span class="pill householdPersonPill personChip tone-'+tone+'">'+esc(label)+'</span>').join(''):'';
  if(state.taskRowDensity!=='comfortable'){
    const readOnly=t._planlyOwnedByMe===false,subtasks=Array.isArray(t.subtasks)?t.subtasks:[],done=subtasks.filter(s=>s.done).length,projectName=projectNameForTask(t),assigneeId=String(t.assigneeId||t.assignee_id||''),completedBy=String(t.completedBy||t.completed_by||'');
    const meta=[t.time?'<span class="compactFixed">'+esc(t.time)+' · '+esc(durationLabel(t.durationMinutes))+'</span>':'',isOverdue(t)?'<span class="compactOverdue">'+esc(fmt(t.date,{day:'numeric',month:'short'}))+'</span>':'',(t.visibility!=='household'&&String(t.category||'Personal')!==String(state.defaultCategory||'Personal'))?'<span class="compactCategory"><span class="categoryDot"></span>'+esc(t.category||'Personal')+'</span>':'',t.visibility==='household'?'<span class="compactFixed personChip tone-'+planlyPersonTone(assigneeId)+'"><svg class="pIcon" aria-hidden="true"><use href="#pi-home"/></svg> '+esc(assigneeId?planlyHouseholdPersonLabel(assigneeId):'Anyone')+'</span>':'',t.completed&&completedBy?'<span class="compactFixed personChip tone-'+planlyPersonTone(completedBy)+'">Done by '+esc(planlyHouseholdSentencePersonLabel(completedBy))+'</span>':'',t.recurrence&&t.recurrence!=='none'?'<span class="compactRepeat"><svg class="pIcon" aria-hidden="true"><use href="#pi-repeat"/></svg> '+esc(recurrenceLabel(t))+'</span>':'',t.visibility==='household'&&t.rotation?.enabled?'<span class="choreSwap">⇄ Swaps weekly</span>':'',projectName?'<button type="button" class="compactProjectLink" data-action="project" data-project-id="'+esc(t.projectId)+'">'+esc(projectName)+'</button>':'',subtasks.length?'<span class="compactChecklist"><svg class="pIcon" aria-hidden="true"><use href="#pi-checklist"/></svg> '+done+'/'+subtasks.length+' <span class="compactChecklistChevron" aria-hidden="true">›</span></span>':''].filter(Boolean).join('<span aria-hidden="true"> · </span>');const listOpen=subtasks.length>0&&expandedTaskChecklists.has(t.id);
    return '<div class="task taskSwipe compactTask '+(t.completed?'done ':'')+(readOnly?'sharedReadOnlyTask ':'')+(planlyTaskTone(t)?'personEdge tone-'+planlyTaskTone(t)+' ':'')+'" data-id="'+esc(t.id)+'" data-owner="'+esc(t._planlyOwnerId||planlySession?.user?.id||'')+'"><div class="swipeUnderlay"><div class="swipeCompleteCue"><svg class="pIcon" aria-hidden="true"><use href="#pi-check"/></svg>Complete</div><div class="swipeQuickActions"><button data-action="tomorrow">Tomorrow</button><button data-action="edit">Edit</button><button data-action="delete">Delete</button></div></div><div class="taskSurface"><button class="check" '+(readOnly?'disabled aria-label="Shared task status"':'data-action="toggle" aria-label="Toggle complete"')+'>'+(t.completed?'✓':'')+(readOnly?'':planlyTapSwitch())+'</button><div class="taskBody'+(subtasks.length?' checklistTap':'')+'"'+(subtasks.length?' data-action="expand-checklist" role="button" tabindex="0" aria-expanded="'+(listOpen?'true':'false')+'"':'')+'><div class="taskTitle">'+esc(t.title)+'</div><div class="compactTaskMeta">'+meta+'</div></div><div class="taskActions">'+(!readOnly&&top3Mode&&!t.completed?'<button type="button" class="top3DragHandle" aria-label="Drag to reorder Top 3"><svg class="pIcon" aria-hidden="true"><use href="#pi-grip"/></svg></button>':'')+(!readOnly&&t.completed?'<button type="button" class="undoDoneBtn" data-action="toggle" aria-label="Undo: mark '+esc(t.title)+' as not done">Undo</button>':'')+(!readOnly&&!t.completed?'<button class="smallbtn '+(t.pinned?'isPinned':'')+'" data-action="pin" aria-label="'+(t.pinned?'Remove from Top 3':'Add to Top 3')+'"><svg class="pIcon" aria-hidden="true"><use href="#pi-star"/></svg></button>':'')+'<button class="smallbtn" data-action="actions" aria-label="Task actions"><svg class="pIcon" aria-hidden="true"><use href="#pi-more"/></svg></button></div>'+(listOpen?planlyInlineChecklistHtml(t,readOnly&&!(typeof planlyHouseholdCompletionEligible==='function'&&planlyHouseholdCompletionEligible(t))):'')+'</div></div>';
  }
  const surface=`<div class="taskSurface"><button class="check" ${readOnly?'disabled aria-label="Shared task status"':'data-action="toggle" aria-label="Toggle complete"'}>${t.completed?'✓':''}${readOnly?'':planlyTapSwitch()}</button><div class="taskBody ${subtasks.length?'checklistTap':''}" ${subtasks.length?`data-action="expand-checklist" role="button" tabindex="0" aria-expanded="${checklistExpanded?'true':'false'}" aria-label="${checklistExpanded?'Hide':'Show'} checklist"`:''}><div class="taskTitle">${esc(t.title)}</div><div class="meta">${t.time?`<span class="taskTimeBadge">${esc(t.time)} · ${durationLabel(t.durationMinutes)}</span>`:''}${isOverdue(t)?`<span class="pill" style="color:var(--danger)">Overdue · ${esc(fmt(t.date,{day:'numeric',month:'short'}))}</span>`:''}<span class="categoryBadge category-${String(t.category||"personal").toLowerCase().replace(/[^a-z0-9_-]/g,"")}"><span class="categoryDot"></span>${esc(t.category)}</span>${projectMeta}${sharedMeta}${priority}${t.recurrence&&t.recurrence!=='none'?`<span class="pill"><svg class="pIcon" style="width:13px;height:13px" aria-hidden="true"><use href="#pi-repeat"/></svg>${esc(recurrenceLabel(t))}</span>`:''}${reminder?`<span class="pill"><svg class="pIcon" style="width:13px;height:13px" aria-hidden="true"><use href="#pi-clock"/></svg>${esc(reminder)}</span>`:''}${subtaskMeta}${calendarSyncHtml(t)}</div>${t.notes?`<div class="taskNotes muted">${esc(t.notes)}</div>`:''}${inlineChecklist}${isOverdue(t)&&!readOnly?`<button class="chip" data-action="today" style="margin-top:10px;padding:7px 10px">Move to Today</button>`:''}</div><div class="taskActions">${!readOnly&&top3Mode&&!t.completed?'<button type="button" class="top3DragHandle" aria-label="Drag to reorder Top 3"><svg class="pIcon" aria-hidden="true"><use href="#pi-grip"/></svg></button>':''}${!readOnly&&t.completed?`<button type="button" class="undoDoneBtn" data-action="toggle" aria-label="Undo: mark ${esc(t.title)} as not done">Undo</button>`:''}${!readOnly&&!t.completed?`<button class="smallbtn ${t.pinned?'isPinned':''}" data-action="pin" aria-label="${t.pinned?'Remove from Top 3':'Add to Top 3'}" aria-pressed="${t.pinned?'true':'false'}"><svg class="pIcon" aria-hidden="true"><use href="#pi-star"/></svg></button>`:''}${readOnly?'<span class="sharedReadOnlyMark" title="Creator-owned">View only</span>':'<button class="smallbtn" data-action="actions" aria-label="Task actions"><svg class="pIcon" aria-hidden="true"><use href="#pi-more"/></svg></button>'}</div></div>`;
  return `<div class="task taskSwipe ${t.completed?'done':''} ${readOnly?'sharedReadOnlyTask':''} ${planlyTaskTone(t)?'personEdge tone-'+planlyTaskTone(t):''}" data-id="${t.id}" data-owner="${esc(t._planlyOwnerId||planlySession?.user?.id||'')}"><div class="swipeUnderlay"><div class="swipeCompleteCue"><svg class="pIcon" aria-hidden="true"><use href="#pi-check"/></svg>Complete</div><div class="swipeQuickActions"><button data-action="tomorrow">Tomorrow</button><button data-action="edit">Edit</button><button data-action="delete">Delete</button></div></div>${surface}</div>`
}
function visibleTasks(arr){return state.showCompleted?arr:arr.filter(t=>!t.completed)}
function planlyDoneSectionKey(key){return String(key||'').split(':')[0]||'tasks'}
function planlyDoneFold(key,count,inner){
  if(!count)return '';
  const k=planlyDoneSectionKey(key),open=!!completedOpen[k];
  return '<details class="completedSection doneFold" data-done-key="'+esc(k)+'"'+(open?' open':'')+'><summary class="doneFoldToggle"><span>Completed ('+count+')</span><span class="doneFoldChevron" aria-hidden="true"></span></summary><div class="completedList">'+inner+'</div></details>';
}
window.planlyDoneFold=planlyDoneFold;
document.addEventListener('toggle',e=>{const d=e.target;if(!d?.matches?.('details.doneFold'))return;const k=d.dataset.doneKey;if(!!completedOpen[k]===d.open)return;if(d.open)completedOpen[k]=true;else delete completedOpen[k];try{localStorage.setItem(PLANLY_DONE_OPEN_KEY,JSON.stringify(completedOpen))}catch{}document.querySelectorAll('details.doneFold').forEach(x=>{if(x!==d&&x.dataset.doneKey===k&&x.open!==d.open)x.open=d.open})},true);
function completedSection(tasks,key){
  if(!state.showCompleted||!tasks.length)return '';
  return planlyDoneFold(key,tasks.length,sortTasks(tasks).map(t=>taskHtml(t)).join(''));
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
  const top3Limit=t.pinned?3:planlyTop3LimitForDate(t.date);
  if(!t.pinned&&state.tasks.filter(x=>x.date===t.date&&x.pinned&&!x.completed).length>=top3Limit){
    alert(top3Limit===2?'Top 3 is limited to 2 on a work or rest day.':'Top 3 is full for that day.');
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
  sortTop3(state.tasks.filter(t=>t.date===date&&t.pinned&&!t.completed&&t._planlyOwnedByMe!==false)).forEach((t,i)=>{t.top3Order=i});
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

/* Stage 5: weekly chore rotation. t.rotation = {enabled,a,b,anchorWeek}: the anchor week belongs to a, the next to b, and so on (Monday weeks).
   The same rule runs on the server for chores completed by the other member (SQL 046 planly_private.household_rotation_assignee). */
function planlyHouseholdMemberIds(){return new Set((Array.isArray(planlyHouseholdMembers)?planlyHouseholdMembers:[]).map(m=>String(m.user_id||'')).filter(Boolean))}
function planlyRotationOther(id){const ids=[...planlyHouseholdMemberIds()];if(ids.length!==2||!ids.includes(String(id||'')))return '';return ids.find(x=>x!==String(id))||''}
function planlyRotationEligible(t){return !!t&&t.visibility==='household'&&t._planlyOwnedByMe!==false&&!!t.recurrence&&t.recurrence!=='none'&&!!t.date&&!!t.assigneeId&&!!planlyRotationOther(t.assigneeId)}
function planlyRotationNormalize(t){const r=t?.rotation;if(!r||r.enabled!==true)return false;const who=String(t.assigneeId||'');if(t.visibility==='household'&&t.recurrence&&t.recurrence!=='none'&&who&&(who===String(r.a)||who===String(r.b)))return false;t.rotation={enabled:false};return true}
function planlyRotationAssignee(t,dateKey){const r=t?.rotation;if(!r||r.enabled!==true||!r.a||!r.b||!r.anchorWeek||!dateKey||String(r.a)===String(r.b))return null;const ids=planlyHouseholdMemberIds();if(!ids.has(String(r.a))||!ids.has(String(r.b)))return null;const weeks=Math.round((parseKey(startMonday(dateKey))-parseKey(startMonday(r.anchorWeek)))/604800000);return ((weeks%2)+2)%2===0?String(r.a):String(r.b)}
function planlyToggleRotation(t){if(!planlyRotationEligible(t))return false;if(t.rotation?.enabled){t.rotation={enabled:false}}else{const a=String(t.assigneeId||''),b=planlyRotationOther(a);if(!a||!b)return false;t.rotation={enabled:true,a,b,anchorWeek:startMonday(t.date)}}t.updatedAt=Date.now();stageTaskMutation(t);save();queuePlanlyPendingReplay('');return true}
function createNextRecurring(t){
  if(!t||t._planlyOwnedByMe===false||!t.completed||!t.date||!t.recurrence||t.recurrence==='none')return;
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
    assigneeId:planlyRotationAssignee(t,nextDate)||t.assigneeId,
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
/* Google Calendar stays connected: the long-lived refresh token is kept server-side (google-calendar-token Edge Function,
   migration 051). This phone only holds a one-hour access token plus a "linked" flag for the signed-in Planly account. */
function googleTokenFresh(a=getGoogleAuth()){return !!a.accessToken&&Number(a.expiresAt||0)>Date.now()&&(!a.user||a.user===String(planlySession?.user?.id||''))}
function googleLinked(a=getGoogleAuth()){return !!a.linked&&!!planlySession?.user?.id&&a.user===String(planlySession.user.id)}
function googleConnected(){return googleTokenFresh()||googleLinked()}
async function planlyGoogleTokenCall(action,extra={}){
  const sb=initPlanlySupabase()?planlySupabase:null;const session=sb?(await sb.auth.getSession()).data?.session:null;
  if(!session?.access_token)throw new Error('Sign in to Planly first.');
  const c=window.PLANLY_SUPABASE_CONFIG,res=await fetch(c.url+'/functions/v1/google-calendar-token',{method:'POST',headers:{Authorization:'Bearer '+session.access_token,apikey:c.publishableKey,'Content-Type':'application/json'},body:JSON.stringify({action,...extra})});
  const body=await res.json().catch(()=>({}));if(!res.ok){const err=new Error(body.error||'Google Calendar connection failed.');err.status=res.status;throw err}
  return {...body,user:String(session.user?.id||'')};
}
function saveGoogleLinkedToken(r){saveGoogleAuth({accessToken:r.accessToken,expiresAt:Date.now()+Math.max(60,Number(r.expiresIn||3600)-60)*1000,linked:true,user:r.user})}
let planlyGoogleRenewing=null;
/* A fresh access token, renewed through the server when it has run out. Null when not connected (or Google revoked it). */
function planlyGoogleAccessToken(){
  const a=getGoogleAuth();if(googleTokenFresh(a))return Promise.resolve(a.accessToken);
  if(!googleLinked(a))return Promise.resolve(null);
  if(!planlyGoogleRenewing)planlyGoogleRenewing=planlyGoogleTokenCall('token').then(r=>{
    if(r.linked&&r.accessToken){saveGoogleLinkedToken(r);return r.accessToken}
    if(r.reconnect)saveGoogleAuth({accessToken:'expired',expiresAt:0});else clearGoogleAuth();return null;
  }).finally(()=>{planlyGoogleRenewing=null});
  return planlyGoogleRenewing;
}
/* Another phone connected Google for this account: pick that up quietly, once per sign-in. */
let planlyGoogleDiscoveredFor='';
function planlyGoogleDiscover(){
  const uid=String(planlySession?.user?.id||'');if(!uid||planlyGoogleDiscoveredFor===uid||googleConnected())return;
  if(!state.tasks.some(t=>t.addToCalendar)&&!getGoogleAuth().accessToken)return;
  planlyGoogleDiscoveredFor=uid;
  planlyGoogleTokenCall('token').then(r=>{if(r.linked&&r.accessToken&&r.user===String(planlySession?.user?.id||'')){saveGoogleLinkedToken(r);syncPendingGoogle().then(()=>render()).catch(()=>{})}}).catch(()=>{});
}
function googleStatusText(){
  const a=getGoogleAuth();
  if(googleConnected())return 'Connected';
  if(a.accessToken&&(!a.user||a.user===String(planlySession?.user?.id||'')))return 'Connection expired — reconnect to sync';
  return 'Not connected';
}
function getDeleteQueue(){try{const q=JSON.parse(localStorage.getItem(GOOGLE_DELETE_QUEUE_KEY)||'[]');return Array.isArray(q)?q:[]}catch{return []}}
function setDeleteQueue(q){localStorage.setItem(GOOGLE_DELETE_QUEUE_KEY,JSON.stringify([...new Set(q.filter(Boolean))]))}
function queueGoogleDelete(eventId){if(!eventId)return;const q=getDeleteQueue();q.push(eventId);setDeleteQueue(q)}
function showToast(message){
  let el=document.getElementById('planlyToast');
  if(!el){el=document.createElement('div');el.id='planlyToast';el.style.cssText='position:fixed;left:50%;bottom:calc(150px + env(safe-area-inset-bottom));transform:translateX(-50%);z-index:80;max-width:min(420px,calc(100% - 32px));background:var(--text);color:var(--bg);padding:11px 15px;border-radius:15px;font-size:13px;font-weight:650;box-shadow:0 12px 30px rgba(0,0,0,.2);opacity:0;transition:opacity .18s ease;pointer-events:none';document.body.appendChild(el)}
  el.textContent=message;el.style.opacity='1';clearTimeout(showToast._t);showToast._t=setTimeout(()=>el.style.opacity='0',2600)
}
function cloneTasks(){return JSON.parse(JSON.stringify(state.tasks))}
/* Completing or reopening a task shows no pop-up: it is saved straight away, and completed tasks carry their own Undo button. */
const PLANLY_SILENT_UNDO=/^(Task completed|Task reopened|Checklist finished)/;
function finishPendingUndo(){const p=showUndoToast._pending;if(!p)return;clearTimeout(p.timer);showUndoToast._pending=null;try{p.finalize?.()}catch{}}
function showUndoToast(message,undo,finalize){
  finishPendingUndo();
  if(PLANLY_SILENT_UNDO.test(String(message||''))){try{finalize?.()}catch{}return}
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
  planlyHaptic();
  const before=cloneTasks();t.completed=true;if(t.visibility==='household'&&planlySession?.user?.id)t.completedBy=String(planlySession.user.id);t.updatedAt=Date.now();createNextRecurring(t);const pendingIds=stageChangedTasksFromSnapshot(before);save();render();
  const recurrencePrompt=recurringLearningCandidate(t);const next=nextUpSuggestion();showUndoToast('Task completed'+(next?' · Next: '+next:''),()=>{clearPendingTaskIds(pendingIds);restoreTaskSnapshot(before)},()=>{queuePlanlyPendingReplay('Task completion synced');if(googleConnected())syncPendingGoogle().then(()=>render()).catch(()=>{});if(recurrencePrompt)maybeOfferRecurringLearning(t)});
}
function rescheduleTaskWithUndo(t,newDate,message){
  if(!t||!newDate||t.date===newDate)return;
  const before=cloneTasks(),id=t.id;t.date=newDate;t.deferCount=Math.max(0,Number(t.deferCount||t.data?.deferCount||0))+1;t.updatedAt=Date.now();if(t.addToCalendar)t.calendarSync='pending';const pendingIds=stageChangedTasksFromSnapshot(before);save();render();
  showUndoToast(message,()=>{clearPendingTaskIds(pendingIds);restoreTaskSnapshot(before);finishCalendarChange(state.tasks.find(x=>x.id===id))},()=>{queuePlanlyPendingReplay('Task synced');finishCalendarChange(state.tasks.find(x=>x.id===id))});
}
function deleteTaskWithUndo(t){
  if(!t||t._planlyOwnedByMe===false)return;
  const before=cloneTasks(),isRecurringGoogle=!!(t.googleEventId&&t.recurrence&&t.recurrence!=='none'),eventId=isRecurringGoogle?'':(t.googleEventId||'');
  state.tasks=state.tasks.filter(x=>planlyLocalTaskKey(x)!==planlyLocalTaskKey(t));const baseVersion=Number(planlyCloudSyncMeta.tasks.get(String(t.id))||0);if(planlyCloudWritesEnabled())stagePlanlyPendingWrite('task','delete',t.id,baseVersion);save();render();
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
  if(planlySession?.user?.id&&!planlySession.provisional)return requestGoogleLasting(clientId);
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

/* Signed in: Google gives a one-time code, the server swaps it for a lasting connection. */
function requestGoogleLasting(clientId){
  return new Promise((resolve,reject)=>{
    googleTokenClient=google.accounts.oauth2.initCodeClient({
      client_id:clientId,scope:GOOGLE_SCOPE,ux_mode:'popup',
      callback:async(resp)=>{
        if(resp?.error||!resp?.code)return reject(new Error(resp?.error_description||resp?.error||'Google sign-in was cancelled.'));
        try{
          const r=await planlyGoogleTokenCall('exchange',{code:resp.code});
          if(!r.stays){
            /* Google only issues the lasting part on a fresh approval. Clear the old approval so the next tap asks again. */
            try{google.accounts.oauth2.revoke(r.accessToken,()=>{})}catch{}
            clearGoogleAuth();return reject(new Error('Almost there: tap Connect once more and approve Planly again.'));
          }
          saveGoogleLinkedToken(r);resolve(r);
        }catch(err){reject(err)}
      },
      error_callback:(err)=>reject(new Error(err?.message||'Google sign-in was cancelled.'))
    });
    googleTokenClient.requestCode();
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

async function googleRequest(path,{method='GET',body}={},retried=false){
  const token=await planlyGoogleAccessToken().catch(()=>null);
  if(!token){if(!googleLinked())clearGoogleAuth();throw new Error('Google connection expired. Reconnect in Settings.')}
  const res=await fetch('https://www.googleapis.com/calendar/v3'+path,{
    method,
    headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
    body:body===undefined?undefined:JSON.stringify(body)
  });
  if(res.status===401){
    const a=getGoogleAuth();
    if(googleLinked(a)&&!retried){saveGoogleAuth({...a,accessToken:'',expiresAt:0});return googleRequest(path,{method,body},true)}
    clearGoogleAuth();throw new Error('Google connection expired. Reconnect in Settings.')
  }
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
    catch(err){if(err?.status===404||err?.status===410)continue;remaining.push(id);if(!googleConnected())break}
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
  const a=getGoogleAuth(),token=a.accessToken;
  if(a.linked)planlyGoogleTokenCall('disconnect').catch(()=>{});
  clearGoogleAuth();
  if(token&&window.google?.accounts?.oauth2?.revoke){try{google.accounts.oauth2.revoke(token,()=>{})}catch{}}
  showToast('Google Calendar disconnected');
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
function todayDeadlinesHtml(){
  const deadlines=state.projects.filter(p=>!p.archived&&p.dueDate&&projectStats(p.id).active.length).sort((a,b)=>a.dueDate.localeCompare(b.dueDate)).slice(0,3);
  return deadlines.length&&todayCardOn('deadlines')?`<section class="dashboardDeadlines"><div class="dashboardSectionHead"><strong>Project deadlines</strong><span>${deadlines.length}</span></div><div class="dashboardDeadlineList">${deadlines.map(p=>`<button type="button" data-dashboard-project="${esc(p.id)}"><span><strong>${esc(p.name)}</strong><small>${projectStats(p.id).active.length} active task${projectStats(p.id).active.length===1?'':'s'}</small></span><em class="${p.dueDate<localKey(new Date())?'late':''}">${esc(projectDueLabel(p.dueDate))}</em></button>`).join('')}</div></section>`:'';
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
    nextHtml=`<button type="button" class="dashboardNextCard ${current?'current':''}" data-dashboard-open="${esc(t.id)}"><span class="dashboardNextEyebrow">${current?'Now':'Next'} · ${esc(status)}</span><strong>${esc(t.title)}</strong><span>${esc(t.time)} · ${durationLabel(t.durationMinutes)}${project?' · '+esc(project):''}</span><em>Open ›</em></button>`;
  }
  if(!todayCardOn('summary'))return `<section class="todayDashboard"><div class="todayQuickActions dashboardActions"><button id="timelineBtn" type="button">Timeline</button><button id="suggestBtn" type="button" class="primaryDash" data-suggest-open>✨ Suggest</button></div></section>`;
  return `<section class="todayDashboard"><div class="dashboardHero dashboardCompact"><div class="dashboardHeroTop"><strong>${activeToday.length} left today</strong><span class="dashboardPercent">${pct}% done</span></div><div class="dashboardProgress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="Today done"><span style="width:${pct}%"></span></div><p class="dashboardSummaryLine">${timed.length} timed · ${durationLabel(timedMinutes)} scheduled${overdue.length?` · <span class="dashboardOverdue">${overdue.length} overdue</span>`:''}</p><div class="dashboardActions"><button id="timelineBtn" type="button">Timeline</button><button id="suggestBtn" type="button" class="primaryDash" data-suggest-open>✨ Suggest</button></div></div>${nextHtml}</section>`;
}

function planlyBudgetBillsDueHtml(){const api=window.PlanlyBudget,rows=(api?.getTodayBills?.()||[]).filter(e=>{if(!e.entry_date)return false;const today=parseKey(localKey(new Date())),due=parseKey(String(e.entry_date).slice(0,10)),days=Math.round((due-today)/86400000);return days<=Number(e.today_lead_days??2)}).sort((a,b)=>String(a.entry_date).localeCompare(String(b.entry_date)));if(!rows.length)return '';const money=e=>new Intl.NumberFormat(undefined,{style:'currency',currency:'GBP'}).format(Number(e.amount_minor||0)/100);return '<section class="section billsDueSection"><div class="sectionHead"><div><span class="calendarGroupLabel">Budget</span><h2>Bills due</h2></div><span class="muted">'+rows.length+'</span></div>'+rows.map(e=>'<div class="billDueRow" data-budget-bill="'+esc(e.id)+'"><button type="button" class="billDueCheck" data-budget-bill-paid="'+esc(e.id)+'" aria-label="Mark '+esc(e.description||'bill')+' paid"><svg class="pIcon" aria-hidden="true"><use href="#pi-check"/></svg>'+planlyTapSwitch()+'</button><div><strong>'+esc(e.description||'Bill')+'</strong><span>'+esc(fmt(String(e.entry_date).slice(0,10),{day:'numeric',month:'short'}))+'</span></div><strong>'+esc(money(e))+'</strong></div>').join('')+'</section>'}
async function markPlanlyBudgetBillPaid(id){const api=window.PlanlyBudget,actions=window.PlanlyBudgetActions,row=api?.getTodayBills?.().find(e=>String(e.id)===String(id));if(!row||!actions?.mutateTodayEntry)return;planlyHaptic();try{const paid=await actions.mutateTodayEntry(row.id,row.cloud_version,{allocation_status:'paid'});render();showUndoToast('Bill marked paid',()=>actions.mutateTodayEntry(row.id,paid.row.cloud_version,{allocation_status:'planned'}).then(()=>render()).catch(()=>showToast('Undo could not be saved.')),()=>{})}catch(err){void api.refreshTodayBills?.().then(()=>render()).catch(()=>{});showToast(err?.message||'Bill could not be updated.')}}
function nextUpSuggestion(){const rec=todayIntelligence(),x=rec?.top3?.[0],t=x&&state.tasks.find(v=>String(v.id)===String(x.id));if(!t)return '';const timed=(rec.times||[]).find(v=>String(v.id)===String(t.id)&&v.time);return t.title+(timed?' · fits at '+timed.time:'')}
function todayIntelligence(){
  if(state.intelligenceSuggestions===false||!window.PlanlyIntelligence?.analyse)return null;
  const key=localKey(new Date()),now=new Date();
  try{return window.PlanlyIntelligence.analyse({today:key,realToday:key,nowMinutes:now.getHours()*60+now.getMinutes(),planningStart:String(state.planningStart||'08:00').slice(0,5),planningEnd:String(state.planningEnd||'23:00').slice(0,5),currentUserId:String(planlySession?.user?.id||''),defaultDuration:state.defaultDuration,tasks:state.tasks,projects:state.projects,busy:planlyBusyIntervals(key).map(x=>({start:x.start,end:x.end})),prefs:{suggestions:true,nightRest:state.intelligenceNightRest!==false,nightRestHours:Number(state.intelligenceNightRestHours||8)}})}catch{return null}
}
function todayView(){
  const key=localKey(new Date());
  const todayAll=state.tasks.filter(t=>t.date===key),completed=sortTasks(todayAll.filter(t=>t.completed)),activeToday=todayAll.filter(t=>!t.completed);
  const overdue=sortTasks(state.tasks.filter(isOverdue)),pins=sortTop3(activeToday.filter(t=>t.pinned)).slice(0,3),remaining=activeToday.filter(t=>!t.pinned);
  const scheduled=sortTasks(remaining.filter(t=>t.time)),anytime=sortTasks(remaining.filter(t=>!t.time)),householdEvents=externalEventsForDate(key,'today');
  setHeader('Today',new Intl.DateTimeFormat(undefined,{weekday:'long',day:'numeric',month:'long'}).format(new Date()));
  const pct=todayAll.length?Math.round(completed.length/todayAll.length*100):0,dashboard=todayDashboardHtml(activeToday,todayAll,overdue),billsDue=todayCardOn('bills')?planlyBudgetBillsDueHtml():'',intel=todayIntelligence();
  const allDone=!activeToday.length&&!overdue.length&&todayAll.length>0,nothingPlanned=!todayAll.length&&!overdue.length;
  const statusCard=allDone?'<div class="dayStatus doneStatus"><strong>All done for today</strong><span>✓</span></div>':nothingPlanned?'<div class="dayStatus"><strong>Nothing planned yet</strong><span class="muted">Tap + to add something.</span></div>':'';
  const household=householdEvents.length&&todayCardOn('household')?`<section class="householdCard"><div class="sectionHead"><div><span class="householdEyebrow">Calendar</span><h2>${esc(planlyScheduleTitle(householdEvents))}</h2></div><span class="muted">${householdEvents.length}</span></div><div class="externalEventList">${householdEvents.map(e=>externalEventHtml(e,key)).join('')}</div></section>`:'';
  const top3=activeToday.length&&todayCardOn('top3')?`<section class="section prioritySection"><div class="sectionHead"><div><h2>Top 3</h2></div><span class="muted">${pins.length}/${planlyTop3LimitFor(intel)}</span></div>${pins.length?`<div class="top3List">${pins.map(t=>taskHtml(t,true)).join('')}</div>`:'<div class="empty compactEmpty">Star the tasks that matter most today.</div>'}</section>`:'';
  const schedule=scheduled.length?`<section class="section"><div class="sectionHead"><div><h2>Schedule</h2></div><span class="muted">${scheduled.length}</span></div>${scheduled.map(t=>taskHtml(t)).join('')}</section>`:'';
  const anytimeSection=anytime.length?`<section class="section"><div class="sectionHead"><div><h2>Anytime</h2></div><span class="muted">${anytime.length}</span></div>${anytime.map(t=>taskHtml(t)).join('')}</section>`:'';
  const overdueSection=overdue.length?`<section class="section overdueSection"><div class="sectionHead"><div><h2>Overdue</h2></div><span class="muted">${overdue.length}</span></div>${overdue.map(t=>taskHtml(t)).join('')}</section>`:'';
  /* Tasks first: what's next is one glance away; Top 3, deadlines and the capacity check sit below the lists. */
  $('#view').innerHTML=`${planlyPushPromptHtml()}${dashboard}${todayCardOn('suggestions')?planlySuggestLineHtml():''}${statusCard}${billsDue}${schedule}${anytimeSection}${overdueSection}${household}${top3}${todayDeadlinesHtml()}${completedSection(completed,'today:'+key)}`
}
function startMonday(key){const d=parseKey(key);const diff=(d.getDay()+6)%7;d.setDate(d.getDate()-diff);return localKey(d)}
function upcomingGroup(title,tasks){
  if(!tasks.length)return '';
  const byDate=new Map();
  sortUpcoming(tasks).forEach(t=>{if(!byDate.has(t.date))byDate.set(t.date,[]);byDate.get(t.date).push(t)});
  const active=tasks.filter(t=>!t.completed).length;
  return `<section class="section upcomingSection"><div class="sectionHead"><h2>${title}</h2><span class="muted">${active}</span></div>${[...byDate.entries()].map(([date,items])=>{const open=items.filter(t=>!t.completed),done=items.filter(t=>t.completed);return `<div class="upcomingDateGroup"><div class="upcomingDateLabel">${fmt(date,{weekday:'long',day:'numeric',month:'short'})}</div>${open.map(t=>taskHtml(t)).join('')}${state.showCompleted?planlyDoneFold('upcoming',done.length,done.map(t=>taskHtml(t)).join('')):''}</div>`}).join('')}</section>`;
}
function upcomingView(){
  const today=localKey(new Date()),tomorrow=addDays(today,1),weekEnd=addDays(today,7);
  const futureAll=state.tasks.filter(t=>t.date&&t.date>today&&(!t.completed||state.showCompleted)),future=futureAll.filter(t=>!t.completed);
  const tomorrowTasks=futureAll.filter(t=>t.date===tomorrow);
  const nextSeven=futureAll.filter(t=>t.date>tomorrow&&t.date<=weekEnd);
  const later=futureAll.filter(t=>t.date>weekEnd);
  setHeader('Upcoming','Your next 7 days and beyond');
  const total=future.length;
  $('#view').innerHTML=`<div class="upcomingSummary"><strong>${total} upcoming</strong><span class="muted">${tomorrowTasks.filter(t=>!t.completed).length} tomorrow</span><button type="button" class="chip planWeekBtn" data-suggest-open>✨ Suggest</button></div>
  ${upcomingGroup('Tomorrow',tomorrowTasks)}
  ${upcomingGroup('Next 7 days',nextSeven)}
  ${upcomingGroup('Later',later)}
  ${!total?'<div class="empty upcomingEmpty">Nothing scheduled ahead yet.<br><span class="muted">Tap + to plan tomorrow.</span></div>':''}`
}
function monthStart(key){const d=parseKey(key);d.setDate(1);return localKey(d)}
function shiftMonth(key,n){const d=parseKey(key);d.setDate(1);d.setMonth(d.getMonth()+n);return localKey(d)}

function inboxView(){setHeader('Inbox','Capture now, schedule later');const arr=visibleTasks(state.tasks.filter(t=>!t.date));$('#view').innerHTML=`<div class="inboxIntro"><div><strong>Your unscheduled tasks</strong><span>Keep ideas here until you are ready to give them a date.</span></div><div class="inboxCount">${arr.length}</div></div><section class="section inboxTasks">${arr.length?arr.map(t=>taskHtml(t)).join(''):`<div class="empty">Your Inbox is clear.<br><span class="muted">Tap + to capture something without scheduling it.</span></div>`}</section>`}

// Planly 3.1 cloud account foundation
let planlySupabase=null,planlySession=null;
function initPlanlySupabase(){
  const c=window.PLANLY_SUPABASE_CONFIG;
  if(!c?.url||!c?.publishableKey||!window.supabase?.createClient)return false;
  if(!planlySupabase)planlySupabase=window.PlanlySupabase?.get?.();
  return true;
}
function planlyLastAccountId(){return String(planlySession?.user?.id||localStorage.getItem(PLANLY_CLOUD_LAST_ACCOUNT_KEY)||'')}
function rememberPlanlyAccount(session){const id=session?.user?.id;if(id)localStorage.setItem(PLANLY_CLOUD_LAST_ACCOUNT_KEY,String(id))}
function resetPlanlyCloudRuntimeState(){
  state.tasks=[];state.projects=[];
  state.defaultCategory='Personal';state.defaultDuration=30;state.autoCompleteParentSubtasks=false;state.planningStart='08:00';state.planningEnd='23:00';
  planlyCloudSyncMeta={tasks:new Map(),projects:new Map(),preferences:0};planlyCloudReadOnly=true;planlyCloudBootstrapPending=PLANLY_CLOUD_PREVIEW;planlyReconcilePromise=null;planlyLastReconcileAt=0;
  editingSubtasks=[];activeSearchFilter='all';projectPanelMode='list';activeProjectId='';editingProjectId='';timelineDrag=null;taskActionId='';
  expandedTaskChecklists.clear();
  planlyCalendarSources=[];planlyExternalEvents=[];planlyCalendarDataError='';planlyCalendarLoadPromise=null;planlyCalendarLoadedAt=0;planlyCalendarLoadedUser='';
  planlyHousehold=null;planlyHouseholdMembers=[];planlyHouseholdInvites=[];planlyHouseholdError='';planlyFreshHouseholdInvite=null;planlyHouseholdLoadPromise=null;planlyHouseholdLoadedAt=0;planlyHouseholdLoadedUser='';window.PlanlyHouseholdContext=null;
  for(const id of ['sheetWrap','taskActionWrap','timelineWrap','searchWrap','projectsWrap']){const el=$('#'+id);if(el){el.classList.remove('open');el.setAttribute('aria-hidden','true')}}
}
let planlyAuthChecked=false;
const PLANLY_WELCOME_SLIDES=[
  ['today','Your day, beautifully planned.','Top 3, your schedule and the little things, on one calm page.','<div class="wfxCard wfxMain wfxTilt1"><div class="wfxHead"><span><small>Thursday</small><strong>Today</strong></span><span class="wfxRing" style="--p:67"><b>2/3</b></span></div><div class="wfxRow"><span class="wfxCheck on">✓</span><span class="wfxText"><strong>Pay council tax</strong><small>Done</small></span><span class="wfxStar">★</span></div><div class="wfxRow"><span class="wfxCheck"></span><span class="wfxText"><strong>Book GP appointment</strong><small>09:30 · 15 min</small></span><span class="wfxStar">★</span></div></div><div class="wfxChips"><span class="wfxChip wfxTilt2"><span class="wfxEmoji">☀️</span>Top 3</span><span class="wfxChip wfxTilt3 wfxExtra"><span class="wfxEmoji">⏰</span>Schedule<span class="wfxCount">4</span></span></div>'],
  ['home','Made for two.','Share chores, lists and plans. Everyone has their own colour.','<div class="wfxChips wfxGrid"><span class="wfxChip wfxTilt2"><span class="wfxEmoji">🧺</span>Laundry<span class="wfxWho tone-self">You</span></span><span class="wfxChip wfxTilt3"><span class="wfxEmoji">🗑️</span>Bins out<span class="wfxWho tone-partner">Partner</span></span><span class="wfxChip wfxTilt1"><span class="wfxEmoji">🛒</span>Shopping<span class="wfxCount">8</span></span><span class="wfxChip wfxTilt2 wfxExtra"><span class="wfxEmoji">🧽</span>Bathroom<span class="wfxWho tone-anyone">Anyone</span></span></div>'],
  ['plan','Plans that fit your shifts.','Planly spots long work days and keeps your list realistic.','<div class="wfxCard wfxShift wfxTilt3"><span class="wfxBar"></span><span class="wfxText"><small>Rota</small><strong>Long day</strong><small>07:30–20:00 · Ward 7</small></span></div><div class="wfxCard wfxHint wfxTilt1"><span class="wfxEmoji">✨</span><span class="wfxText"><strong>Work day</strong><small>Keep it to 2 priorities today.</small></span></div><div class="wfxChips wfxExtra"><span class="wfxChip wfxTilt2"><span class="wfxEmoji">🌙</span>Rest tomorrow</span></div>']
];
function planlyWelcomeHtml(){
  return '<div class="wfxBg" aria-hidden="true">'+PLANLY_WELCOME_SLIDES.map(([k],i)=>'<span class="wfxGlow wfxGlow-'+k+(i?'':' on')+'"></span>').join('')+'<span class="wfxShade"></span></div><div class="welcomeCard"><div class="welcomeBrand"><span class="wfxLogo" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M6 12.5l4 4 8-9" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg></span>Planly</div><div class="welcomeSlides" id="planlyWelcomeSlides">'+PLANLY_WELCOME_SLIDES.map(([k,title,text,snip],i)=>'<section class="welcomeSlide" aria-label="'+(i+1)+' of '+PLANLY_WELCOME_SLIDES.length+'"><div class="wfxStage" aria-hidden="true">'+snip+'</div><h2'+(i?'':' id="planlyWelcomeTitle"')+'>'+title+'</h2><p>'+text+'</p></section>').join('')+'</div><div class="welcomeDots" aria-hidden="true">'+PLANLY_WELCOME_SLIDES.map((_,i)=>'<span class="'+(i?'':'active')+'"></span>').join('')+'</div><div class="welcomeActions" id="planlyWelcomeActions">'+(planlyGoogleSignInEnabled()?'<button type="button" class="wfxBtn wfxGoogle" id="planlyWelcomeGoogle" data-provider-slot="google"><span class="wfxGMark" aria-hidden="true"><svg viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.1C12.5 13.7 17.8 9.5 24 9.5z"/><path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 7l7.4 5.7c4.3-4 6.9-9.9 6.9-17.2z"/><path fill="#FBBC05" d="M10.5 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.8-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.1 1.4-4.8 2.3-8.5 2.3-6.2 0-11.5-4.2-13.4-9.9l-7.9 6.1C6.6 42.6 14.6 48 24 48z"/></svg></span><span>Sign in with Google</span></button>':'<div class="welcomeProviderSlot" data-provider-slot="google" hidden></div>')+'<button type="button" class="wfxBtn wfxPrimary" id="planlyWelcomeEmail"><svg class="wfxBtnIcon" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5.5" width="18" height="13" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M4 7.5l8 6 8-6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg><span>Continue with email</span></button><p class="wfxFoot">Your plans stay private to you and your household.</p></div><form class="welcomeEmailForm" id="planlyWelcomeForm" autocomplete="on" hidden novalidate><div class="wfxFormHead"><button type="button" class="wfxBack" id="planlyWelcomeBack" aria-label="Back to sign-in options">‹</button><strong id="planlyWelcomeFormTitle">Sign in with email</strong></div><label class="wfxField"><span>Email</span><input id="planlyWelcomeEmailInput" name="username" type="email" inputmode="email" autocapitalize="none" spellcheck="false" autocomplete="username" placeholder="you@example.com"></label><label class="wfxField"><span>Password</span><input id="planlyWelcomePassword" name="password" type="password" autocomplete="current-password" minlength="8" placeholder="Your password"></label><p class="wfxMsg" id="planlyWelcomeMsg" role="alert" hidden></p><button type="submit" class="wfxBtn wfxPrimary" id="planlyWelcomeSubmit">Sign in</button><button type="button" class="wfxLink" id="planlyWelcomeForgot">Forgot password?</button><button type="button" class="wfxLink" id="planlyWelcomeMode">New to Planly? Create an account</button></form></div></div>';
}
function planlyWelcomeThemeColour(on){document.querySelectorAll('meta[name="theme-color"]').forEach(m=>{if(on){if(!m.dataset.planlyWas)m.dataset.planlyWas=m.content;m.content='#0B0D17'}else if(m.dataset.planlyWas){m.content=m.dataset.planlyWas;delete m.dataset.planlyWas}})}
/* Stage 4b: after opening a password-reset link, ask for the new password (the link already signed the user in). */
function planlyRecoverySync(){let el=document.getElementById('planlyRecovery');let want=false;try{want=sessionStorage.getItem(PLANLY_RECOVERY_KEY)==='1'&&!!planlySession?.user}catch{}
  if(!want){if(el)el.remove();if(!document.getElementById('planlyWelcome'))document.body.classList.remove('welcomeOpen');return}
  if(el)return;
  el=document.createElement('div');el.id='planlyRecovery';el.className='planlyWelcome planlyRecovery';el.setAttribute('role','dialog');el.setAttribute('aria-modal','true');el.setAttribute('aria-labelledby','planlyRecoveryTitle');
  el.innerHTML='<div class="wfxBg" aria-hidden="true"><span class="wfxGlow wfxGlow-plan on"></span><span class="wfxShade"></span></div><div class="welcomeCard recoveryCard"><div class="welcomeBrand"><span class="wfxLogo" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M6 12.5l4 4 8-9" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg></span>Planly</div><form class="welcomeEmailForm" id="planlyRecoveryForm" autocomplete="on" novalidate><div class="wfxFormHead recoveryHead"><strong id="planlyRecoveryTitle">Set a new password</strong></div><input type="email" name="username" autocomplete="username" value="'+esc(planlySession.user.email||'')+'" hidden><label class="wfxField"><span>New password</span><input id="planlyRecoveryPassword" type="password" autocomplete="new-password" minlength="8" placeholder="At least 8 characters"></label><label class="wfxField"><span>Type it again</span><input id="planlyRecoveryPassword2" type="password" autocomplete="new-password" minlength="8"></label><p class="wfxMsg" id="planlyRecoveryMsg" role="alert" hidden></p><button type="submit" class="wfxBtn wfxPrimary" id="planlyRecoverySubmit">Save new password</button><button type="button" class="wfxLink" id="planlyRecoveryLater">Do this later in Settings</button></form></div>';
  document.body.appendChild(el);document.body.classList.add('welcomeOpen');
  const msg=el.querySelector('#planlyRecoveryMsg'),say=(t,ok)=>{msg.hidden=!t;msg.textContent=t||'';msg.classList.toggle('ok',!!ok)},done=()=>{try{sessionStorage.removeItem(PLANLY_RECOVERY_KEY)}catch{}planlyRecoverySync()};
  el.querySelector('#planlyRecoveryLater').onclick=done;
  el.querySelector('#planlyRecoveryForm').onsubmit=e=>{e.preventDefault();const b=el.querySelector('#planlyRecoverySubmit');b.disabled=true;say('');planlyChangePassword(el.querySelector('#planlyRecoveryPassword').value,el.querySelector('#planlyRecoveryPassword2').value).then(()=>{say('Password saved. You are signed in.',true);setTimeout(done,1200)}).catch(err=>{say(err?.message||'Password could not be saved.');b.disabled=false})};
  setTimeout(()=>el.querySelector('#planlyRecoveryPassword')?.focus(),60)}
function planlyWelcomeWanted(){
  if(!planlyAuthChecked||planlySession?.user||!planlySupabase)return false;
  try{return !(navigator.onLine===false&&localStorage.getItem(PLANLY_CLOUD_LAST_ACCOUNT_KEY))}catch{return true}
}
function planlyWelcomeSync(){
  let el=document.getElementById('planlyWelcome');const want=planlyWelcomeWanted();
  if(!want){if(el){el.remove();planlyWelcomeThemeColour(false)}document.body.classList.remove('welcomeOpen');return}
  if(el)return;
  el=document.createElement('div');el.id='planlyWelcome';el.className='planlyWelcome';el.setAttribute('role','dialog');el.setAttribute('aria-modal','true');el.setAttribute('aria-labelledby','planlyWelcomeTitle');el.innerHTML=planlyWelcomeHtml();
  document.body.appendChild(el);document.body.classList.add('welcomeOpen');
  const slides=el.querySelector('#planlyWelcomeSlides'),dots=[...el.querySelectorAll('.welcomeDots span')];
  const glows=[...el.querySelectorAll('.wfxGlow')];
  slides.addEventListener('scroll',()=>{const i=Math.round(slides.scrollLeft/Math.max(1,slides.clientWidth));dots.forEach((d,j)=>d.classList.toggle('active',j===i));glows.forEach((g,j)=>g.classList.toggle('on',j===i))},{passive:true});
  planlyWelcomeThemeColour(true);
  const actions=el.querySelector('#planlyWelcomeActions'),form=el.querySelector('#planlyWelcomeForm'),msg=el.querySelector('#planlyWelcomeMsg'),submit=el.querySelector('#planlyWelcomeSubmit'),pw=el.querySelector('#planlyWelcomePassword'),forgot=el.querySelector('#planlyWelcomeForgot'),modeBtn=el.querySelector('#planlyWelcomeMode');let mode='signin';
  const say=(text,ok)=>{msg.hidden=!text;msg.textContent=text||'';msg.classList.toggle('ok',!!ok)};
  /* modes: signin · signup · reset (Stage 4b: forgot password) */
  const setMode=m=>{mode=m;const up=m==='signup',reset=m==='reset';el.querySelector('#planlyWelcomeFormTitle').textContent=reset?'Reset your password':up?'Create your account':'Sign in with email';submit.textContent=reset?'Send reset link':up?'Create account':'Sign in';pw.closest('label').hidden=reset;pw.autocomplete=up?'new-password':'current-password';pw.name=up?'new-password':'password';pw.placeholder=up?'At least 8 characters':'Your password';forgot.hidden=m!=='signin';modeBtn.textContent=m==='signin'?'New to Planly? Create an account':'Back to sign in';say('')};
  const openForm=()=>{actions.hidden=true;form.hidden=false;el.classList.add('wfxFormOpen');setTimeout(()=>el.querySelector('#planlyWelcomeEmailInput')?.focus(),60)};
  el.querySelector('#planlyWelcomeEmail').onclick=openForm;
  el.querySelector('#planlyWelcomeBack').onclick=()=>{form.hidden=true;actions.hidden=false;el.classList.remove('wfxFormOpen');setMode('signin')};
  modeBtn.onclick=()=>setMode(mode==='signin'?'signup':'signin');
  forgot.onclick=()=>setMode('reset');
  form.onsubmit=e=>{e.preventDefault();const email=el.querySelector('#planlyWelcomeEmailInput').value.trim(),password=pw.value;
    if(mode==='reset'){if(!email){say('Enter the email address you sign in with.');return}submit.disabled=true;say('');planlyResetPassword(email).then(()=>say('If there is a Planly account for that email, a reset link is on its way. Open it on this phone.',true)).catch(err=>say(err?.message||'Reset email could not be sent. Please try again.')).finally(()=>{submit.disabled=false});return}
    if(!email||!password){say('Enter your email and password.');return}if(mode==='signup'&&password.length<8){say('Use a password of at least 8 characters.');return}submit.disabled=true;say('');(mode==='signup'?planlySignUp({email,password}):planlySignIn({email,password})).then(session=>{if(session)loadPlanlyCalendarData();else if(mode==='signup'){setMode('signin');say('Check your email to confirm your account, then sign in here.',true)}}).catch(err=>say(err?.message||'Sign-in failed. Please try again.')).finally(()=>{submit.disabled=false})};
  /* An expired or already-used email link lands here signed out: explain it in the email form. */
  if(PLANLY_AUTH_LINK.error){openForm();setMode('reset');say(PLANLY_AUTH_LINK.error.replace(/\.?$/,'.')+' Enter your email to get a new link.')}
  const g=el.querySelector('#planlyWelcomeGoogle');if(g)g.onclick=()=>{g.disabled=true;planlyGoogleSignIn().catch(err=>{g.disabled=false;alert(err.message||'Google sign-in is unavailable right now.')})};
  el.tabIndex=-1;setTimeout(()=>el.focus({preventScroll:true}),50);
}
// Settled first screen: confirming the saved sign-in can wait on the network (renewing it), so until then Today is drawn for
// the account already signed in on this phone. Display only: it carries no token, and the cloud still checks every request.
function planlyStoredSignedInUser(){try{const c=window.PLANLY_SUPABASE_CONFIG,ref=c?.url?new URL(c.url).hostname.split('.')[0]:'',raw=ref&&localStorage.getItem('sb-'+ref+'-auth-token'),stored=raw?JSON.parse(raw):null,u=stored?.user||stored?.currentSession?.user;if(!u?.id||String(u.id)!==String(localStorage.getItem(PLANLY_CLOUD_LAST_ACCOUNT_KEY)||''))return null;return {id:String(u.id),email:String(u.email||''),app_metadata:u.app_metadata||{},user_metadata:u.user_metadata||{},identities:Array.isArray(u.identities)?u.identities:[]}}catch{return null}}
function planlyAdoptStoredUser(){if(planlySession)return false;const user=planlyStoredSignedInUser();if(!user)return false;planlySession={user,provisional:true};restorePlanlyHouseholdCopy(user.id);restorePlanlyCalendarCache();return true}
function adoptPlanlySession(session,{explicitSignOut=false}={}){
  const previousOwner=String(planlySession?.user?.id||localStorage.getItem(PLANLY_CLOUD_LAST_ACCOUNT_KEY)||''),nextOwner=String(session?.user?.id||''),ownerChanged=!!previousOwner&&!!nextOwner&&previousOwner!==nextOwner;
  planlySession=session||null;
  ['planlyHouseholdDashboardBtn','planlyListsBtn'].forEach(id=>{const el=document.getElementById(id);if(el)el.hidden=!nextOwner});
  if(ownerChanged||explicitSignOut){resetPlanlyCloudRuntimeState();clearGoogleAuth()}
  if(nextOwner&&session?.access_token)setTimeout(planlyGoogleDiscover,4000);
  if(nextOwner)localStorage.setItem(PLANLY_CLOUD_LAST_ACCOUNT_KEY,nextOwner);
  else if(explicitSignOut)localStorage.removeItem(PLANLY_CLOUD_LAST_ACCOUNT_KEY);
  planlyWelcomeSync();planlyRecoverySync();
  return {previousOwner,nextOwner,ownerChanged,explicitSignOut};
}
async function refreshPlanlySession(){
  if(!initPlanlySupabase())return null;
  const {data}=await planlySupabase.auth.getSession();planlyAuthChecked=true;adoptPlanlySession(data?.session||null);return planlySession;
}
function planlyAccountHtml(){
  if(!initPlanlySupabase())return '<div class="muted settingsHelp">Cloud account service unavailable. Your local Planly data is unaffected.</div>';
  if(planlySession?.user){const u=planlySession.user,email=u.email||'Planly account',methods=planlySignInMethods(u),hasPassword=methods.some(m=>m.id==='email');return '<div class="calendarStatusRow settingsPrimaryRow"><span class="statusDot connected"></span><strong>Signed in</strong></div><div class="muted settingsHelp">'+esc(email)+'<br>Your tasks, projects and planning preferences sync securely to this Planly account and remain available offline.</div>'
+'<div class="accountMethods"><h4>How you sign in</h4>'+(methods.length?methods.map(m=>'<div class="accountMethod"><span class="accountMethodIcon accountMethod-'+m.id+'" aria-hidden="true">'+(m.id==='google'?'G':'@')+'</span><span><strong>'+esc(m.label)+'</strong><small>'+esc(m.detail)+'</small></span></div>').join(''):'<div class="muted settingsHelp">Email</div>')+'</div>'
+'<details class="accountSection" id="planlyPasswordSection"><summary>'+(hasPassword?'Change password':'Set a password')+'</summary><form id="planlyChangePasswordForm" class="accountForm" autocomplete="on" novalidate><input type="email" name="username" autocomplete="username" value="'+esc(u.email||'')+'" hidden><div class="field"><label for="planlyNewPassword">New password</label><input id="planlyNewPassword" class="input" type="password" autocomplete="new-password" minlength="8" placeholder="At least 8 characters"></div><div class="field"><label for="planlyNewPassword2">Type it again</label><input id="planlyNewPassword2" class="input" type="password" autocomplete="new-password" minlength="8"></div>'+(hasPassword?'':'<div class="muted settingsHelp">Lets you also sign in with your email address and this password.</div>')+'<p class="accountMsg" id="planlyPasswordMsg" role="status" hidden></p><button type="submit" class="primary">Save password</button></form></details>'
+'<details class="accountSection" id="planlyEmailSection"><summary>Change email</summary><form id="planlyChangeEmailForm" class="accountForm" novalidate><div class="field"><label for="planlyNewEmail">New email address</label><input id="planlyNewEmail" class="input" type="email" inputmode="email" autocapitalize="none" spellcheck="false" autocomplete="email" placeholder="you@example.com"></div><div class="muted settingsHelp">We send a confirmation link. The change happens after you confirm it.</div><p class="accountMsg" id="planlyEmailMsg" role="status" hidden></p><button type="submit" class="primary">Send confirmation link</button></form></details>'
+'<button id="planlySignOutBtn" class="secondaryBtn">Sign out on this device</button><button id="planlySignOutAllBtn" class="secondaryBtn accountDangerBtn">Sign out on all devices</button>'}
  return '<div class="muted settingsHelp">Sign in to sync your Planly data across sessions, keep it available offline and manage secure calendar sources.</div><form id="planlySignInForm" autocomplete="on"><div class="field"><label for="planlyAuthEmail">Email</label><input id="planlyAuthEmail" name="username" class="input" type="email" inputmode="email" autocapitalize="none" spellcheck="false" autocomplete="username" placeholder="you@example.com"></div><div class="field"><label for="planlyAuthPassword">Password</label><input id="planlyAuthPassword" name="password" class="input" type="password" autocomplete="current-password" minlength="8" placeholder="Your password"></div><button id="planlySignInBtn" class="primary" type="submit">Sign in</button></form><button id="planlySignUpBtn" class="secondaryBtn" type="button">Create account</button>'+(planlyGoogleSignInEnabled()?'<button id="planlyAccountGoogleBtn" class="secondaryBtn accountGoogleBtn" type="button">Continue with Google</button>':'');
}
const PLANLY_HOUSEHOLD_INVITE_SESSION_KEY='planly-household-invite-session-v1';
const PLANLY_HOUSEHOLD_MANAGE_SESSION_KEY='planly-household-manage-open-v1';
let planlyHousehold=null,planlyHouseholdMembers=[],planlyHouseholdInvites=[],planlyHouseholdError='',planlyPendingHouseholdInviteToken='',planlyFreshHouseholdInvite=null,planlyHouseholdLoadPromise=null,planlyHouseholdLoadedAt=0,planlyHouseholdLoadedUser='';
const PLANLY_HOUSEHOLD_TTL_MS=60000;
function publishPlanlyHouseholdContext(){const userId=String(planlySession?.user?.id||''),householdId=String(planlyHousehold?.id||''),members=householdId?planlyHouseholdMembers.map(m=>({user_id:String(m.user_id||''),role:String(m.role||''),joined_at:m.joined_at||null,display_name:String(m.display_name||'')})):[],acceptedInvites=householdId&&planlyHousehold?.myRole==='owner'?planlyHouseholdInvites.filter(i=>i.status==='accepted'&&i.accepted_by&&i.invited_email).map(i=>({accepted_by:String(i.accepted_by),invited_email:String(i.invited_email)})):[];const detail={householdId,userId,members,acceptedInvites};window.PlanlyHouseholdContext=detail;window.dispatchEvent(new CustomEvent('planly:household-ready',{detail}));return detail}
function normalizePlanlyHouseholdInviteToken(value){const token=String(value||'').trim().toLowerCase();return /^[0-9a-f]{64}$/.test(token)?token:''}
function readPendingPlanlyHouseholdInvite(){try{const token=normalizePlanlyHouseholdInviteToken(sessionStorage.getItem(PLANLY_HOUSEHOLD_INVITE_SESSION_KEY));if(!token)sessionStorage.removeItem(PLANLY_HOUSEHOLD_INVITE_SESSION_KEY);return token}catch{return ''}}
function setPendingPlanlyHouseholdInvite(value){const token=normalizePlanlyHouseholdInviteToken(value);planlyPendingHouseholdInviteToken=token;try{if(token)sessionStorage.setItem(PLANLY_HOUSEHOLD_INVITE_SESSION_KEY,token);else sessionStorage.removeItem(PLANLY_HOUSEHOLD_INVITE_SESSION_KEY)}catch{}return token}
planlyPendingHouseholdInviteToken=readPendingPlanlyHouseholdInvite();
function capturePlanlyHouseholdInviteFromUrl(){try{const params=new URLSearchParams(String(location.hash||'').replace(/^#/,''));if(!params.has('household-invite'))return false;const token=normalizePlanlyHouseholdInviteToken(params.get('household-invite'));history.replaceState(history.state,'',location.pathname+location.search);if(!token){setPendingPlanlyHouseholdInvite('');return false}setPendingPlanlyHouseholdInvite(token);return true}catch{return false}}
function clearPendingPlanlyHouseholdInvite(){setPendingPlanlyHouseholdInvite('');render()}
function planlyHouseholdManageOpen(){try{return sessionStorage.getItem(PLANLY_HOUSEHOLD_MANAGE_SESSION_KEY)==='1'}catch{return false}}
function setPlanlyHouseholdManageOpen(open){try{sessionStorage.setItem(PLANLY_HOUSEHOLD_MANAGE_SESSION_KEY,open?'1':'0')}catch{}}
function planlyHouseholdInviteLink(token){const base=location.origin+location.pathname.replace(/index[.]html$/i,'');return base+'#household-invite='+encodeURIComponent(token)}
// Saved copy of the household (names and roles; never invites) for the account on this phone, so names show straight away on open.
const PLANLY_HOUSEHOLD_COPY_PREFIX='planly-household-copy-v1:';
function savePlanlyHouseholdCopy(userId){try{localStorage.setItem(PLANLY_HOUSEHOLD_COPY_PREFIX+userId,JSON.stringify({version:1,ownerId:String(userId),household:planlyHousehold?{id:planlyHousehold.id,name:planlyHousehold.name,created_by:planlyHousehold.created_by,created_at:planlyHousehold.created_at,myRole:planlyHousehold.myRole}:null,members:planlyHouseholdMembers.map(m=>({household_id:m.household_id,user_id:m.user_id,role:m.role,joined_at:m.joined_at,display_name:m.display_name}))}))}catch{}}
function restorePlanlyHouseholdCopy(userId){try{const d=JSON.parse(localStorage.getItem(PLANLY_HOUSEHOLD_COPY_PREFIX+userId)||'null');if(!d||d.version!==1||String(d.ownerId)!==String(userId)||!Array.isArray(d.members))return false;planlyHousehold=d.household||null;planlyHouseholdMembers=d.household?d.members:[];planlyHouseholdInvites=[];publishPlanlyHouseholdContext();return true}catch{return false}}
async function loadPlanlyHouseholdCore(force=false){
  if(!planlySession?.user||!initPlanlySupabase()){planlyHousehold=null;planlyHouseholdMembers=[];planlyHouseholdInvites=[];planlyHouseholdError='';planlyHouseholdLoadedAt=0;planlyHouseholdLoadedUser='';publishPlanlyHouseholdContext();return null}
  const userId=String(planlySession.user.id||''),fresh=!force&&planlyHouseholdLoadedUser===userId&&planlyHouseholdLoadedAt&&Date.now()-planlyHouseholdLoadedAt<PLANLY_HOUSEHOLD_TTL_MS;
  if(fresh)return planlyHousehold;if(planlyHouseholdLoadPromise){if(!force)return planlyHouseholdLoadPromise;try{await planlyHouseholdLoadPromise}catch{}}
  planlyHouseholdLoadPromise=(async()=>{try{
    const {data:memberships,error:membershipError}=await planlySupabase.from('planly_household_members').select('household_id,user_id,role,joined_at,display_name').eq('user_id',planlySession.user.id).limit(1);if(membershipError)throw membershipError;
    const mine=(memberships||[])[0];if(!mine){planlyHousehold=null;planlyHouseholdMembers=[];planlyHouseholdInvites=[];planlyHouseholdError='';planlyHouseholdLoadedAt=Date.now();planlyHouseholdLoadedUser=userId;publishPlanlyHouseholdContext();savePlanlyHouseholdCopy(userId);return null}
    const {data:house,error:houseError}=await planlySupabase.from('planly_households').select('id,name,created_by,created_at').eq('id',mine.household_id).single();if(houseError)throw houseError;
    const {data:members,error:membersError}=await planlySupabase.from('planly_household_members').select('household_id,user_id,role,joined_at,display_name').eq('household_id',mine.household_id).order('joined_at',{ascending:true});if(membersError)throw membersError;
    planlyHousehold={...house,myRole:mine.role};planlyHouseholdMembers=members||[];
    if(mine.role==='owner'){
      const {data:invites,error:inviteError}=await planlySupabase.from('planly_household_invites').select('id,household_id,invited_email,status,expires_at,created_at,accepted_by,accepted_at').eq('household_id',mine.household_id).order('created_at',{ascending:false});
      if(inviteError)throw inviteError;planlyHouseholdInvites=invites||[]
    }else planlyHouseholdInvites=[];
    planlyHouseholdError='';planlyHouseholdLoadedAt=Date.now();planlyHouseholdLoadedUser=userId;publishPlanlyHouseholdContext();savePlanlyHouseholdCopy(userId);return planlyHousehold
  }catch(err){planlyHouseholdError=err?.message||'Household could not be loaded.';return null}})().finally(()=>{planlyHouseholdLoadPromise=null});return planlyHouseholdLoadPromise
}
function planlyHouseholdAcceptedInviteFor(member){return planlyHouseholdInvites.find(invite=>invite.status==='accepted'&&String(invite.accepted_by||'')===String(member?.user_id||''))}
function planlyHouseholdMemberLabel(member){
  const isMe=String(member?.user_id||'')===String(planlySession?.user?.id||'');
  const displayName=String(member?.display_name||'').trim();
  if(displayName)return displayName;
  if(isMe)return 'You';
  if(member?.role==='owner')return 'Household owner';
  const invite=planlyHouseholdAcceptedInviteFor(member);
  return invite?.invited_email||'Household member'
}
function planlyHouseholdPersonLabel(userId){const id=String(userId||''),me=String(planlySession?.user?.id||''),member=planlyHouseholdMembers.find(m=>String(m.user_id||'')===id),name=String(member?.display_name||'').trim();if(name)return name;if(id&&id===me)return 'You';return 'Partner'}
function planlyPersonTone(userId){const id=String(userId||''),me=String(planlySession?.user?.id||'');return !id?'anyone':id===me?'self':'partner'}
window.planlyPersonTone=planlyPersonTone;
function planlyTaskTone(t){if(t?.visibility!=='household')return '';const by=String(t.completedBy||t.completed_by||''),a=String(t.assigneeId||t.assignee_id||'');return planlyPersonTone(t.completed&&by?by:a)}
function planlyPersonInitial(userId){const label=planlyHouseholdPersonLabel(userId);return String(label||'?').trim().charAt(0).toUpperCase()||'?'}
function openProfile(){closeProfile();openSettingsPage('')}
function planlySelfInitial(){const n=planlyMyDisplayName()||String(planlySession?.user?.email||'');return (n.trim().charAt(0)||'?').toUpperCase()}
function planlyRenderProfileButton(){const b=$('#profileToggle');if(!b)return;const me=String(planlySession?.user?.id||'');if(!b.dataset.iconHtml)b.dataset.iconHtml=b.innerHTML;if(me){const name=planlyMyDisplayName(),initial=planlySelfInitial();b.innerHTML='<span class="profileInitial" aria-hidden="true">'+esc(initial)+'</span>';b.setAttribute('aria-label','Profile and settings'+(name?' for '+name:''))}else{b.innerHTML=b.dataset.iconHtml;b.setAttribute('aria-label','Open profile')}b.classList.toggle('active',state.tab==='settings')}
function closeProfile(){const wrap=$('#profileWrap');if(!wrap)return;wrap.classList.remove('open');wrap.setAttribute('aria-hidden','true')}
function openSettingsFromProfile(focusHousehold=false){closeProfile();openSettingsPage(focusHousehold?'household':'')}
function planlyHouseholdSentencePersonLabel(userId){const label=planlyHouseholdPersonLabel(userId);return label==='You'?'you':label}
function planlyAccountDisplayName(){return String(planlySession?.user?.user_metadata?.planly_display_name||'').trim()}
function planlyMyDisplayName(){const me=String(planlySession?.user?.id||''),member=planlyHouseholdMembers.find(m=>String(m.user_id||'')===me);return String(member?.display_name||'').trim()||planlyAccountDisplayName()}
let planlyNameSaving=false;
async function savePlanlyDisplayName(){if(planlyNameSaving)return;const input=$('#planlyDisplayName'),btn=$('#planlyDisplayNameSave'),status=$('#planlyDisplayNameStatus');if(!input||!btn||!initPlanlySupabase()||!planlySession?.user)return;const setStatus=(msg,bad=false)=>{if(status){status.textContent=msg;status.classList.toggle('error',bad)}input.classList.toggle('inputError',bad)};if(!navigator.onLine){setStatus('You are offline. Your name was not saved.',true);return}const name=input.value.replace(/\s+/g,' ').trim();if(name===planlyMyDisplayName()){setStatus('');return}if(name.length>20){setStatus('Use 20 characters or fewer.',true);return}planlyNameSaving=true;btn.disabled=true;const original=btn.textContent;btn.textContent='Saving…';setStatus('Saving…');try{
  // The account copy works without a household and is carried into a household when one is created or joined.
  const {data,error:userError}=await planlySupabase.auth.updateUser({data:{planly_display_name:name||null}});if(userError)throw userError;if(data?.user&&planlySession?.user)planlySession.user.user_metadata=data.user.user_metadata||{};
  if(planlyHousehold){const {error}=await planlySupabase.rpc('planly_set_household_display_name',{p_display_name:name});if(error)throw error;planlyHouseholdLoadedAt=0;await loadPlanlyHousehold(true)}
  input.value=planlyMyDisplayName();setStatus('Saved');showToast('Your Planly name was saved');render()}catch(err){const code=String(err?.code||'');setStatus(code==='22001'?'Use 20 characters or fewer.':code==='22023'?"That name contains characters Planly can't show.":'Your name could not be saved. Check your connection and try again.',true)}finally{planlyNameSaving=false;const b=$('#planlyDisplayNameSave');if(b){b.disabled=false;b.textContent=original}}}
/* After creating or joining a household, give the membership the name already saved on the account. */
async function carryPlanlyNameIntoHousehold(){const name=planlyAccountDisplayName(),me=String(planlySession?.user?.id||''),member=planlyHouseholdMembers.find(m=>String(m.user_id||'')===me);if(!name||!member||String(member.display_name||'').trim())return;try{const {error}=await planlySupabase.rpc('planly_set_household_display_name',{p_display_name:name});if(!error){planlyHouseholdLoadedAt=0;await loadPlanlyHousehold(true)}}catch{}}
function planlyNamePanelHtml(){const inHousehold=!!planlyHousehold;return '<section class="householdSubsection householdActionPanel planlyNamePanel"><div class="householdSubsectionHead"><div><span class="householdSectionEyebrow">Profile</span><h4>Your name in Planly</h4><p>'+(inHousehold?'Shown to people in this Household on shared tasks and activity.':'Shown on your profile. When you create or join a household, its members will see it too.')+'</p></div></div><div class="field householdField"><label for="planlyDisplayName">Display name</label><input id="planlyDisplayName" class="input" maxlength="20" autocomplete="name" enterkeyhint="done" value="'+esc(planlyMyDisplayName())+'" placeholder="Your name"></div><div id="planlyDisplayNameStatus" class="planlyNameStatus" role="status" aria-live="polite"></div><div class="muted settingsHelp">Up to 20 characters. Saves when you press Done or tap away.</div><button id="planlyDisplayNameSave" class="secondaryBtn" type="button">Save name</button></section>'}
function planlyHouseholdMemberRowsHtml(){
  if(!planlyHouseholdMembers.length)return '';
  const count=planlyHouseholdMembers.length;
  return '<section class="householdSubsection"><div class="householdSubsectionHead"><div><span class="householdSectionEyebrow">Members</span><h4>People in this household</h4></div><span class="householdCount">'+count+' member'+(count===1?'':'s')+'</span></div><div class="householdMemberList">'+planlyHouseholdMembers.map(member=>{const label=planlyHouseholdMemberLabel(member),role=member.role==='owner'?'Owner':'Member',joined=member.joined_at?new Date(member.joined_at).toLocaleDateString():'';return '<div class="householdMemberRow"><div class="householdMemberIdentity"><strong class="householdMemberName">'+esc(label)+'</strong><span class="householdMemberMeta">'+(joined?'Joined '+esc(joined):'Household member')+'</span></div><span class="householdRoleBadge '+(member.role==='owner'?'owner':'member')+'">'+esc(role)+'</span></div>'}).join('')+'</div></section>'
}
function planlyHouseholdPendingInvitesHtml(){
  if(planlyHousehold?.myRole!=='owner')return '';
  const pending=planlyHouseholdInvites.filter(invite=>invite.status==='pending');
  if(!pending.length)return '';
  return '<section class="householdSubsection"><div class="householdSubsectionHead"><div><span class="householdSectionEyebrow">Invitations</span><h4>Pending invites</h4></div><span class="householdCount">'+pending.length+' pending</span></div><div class="householdMemberList">'+pending.map(invite=>{const expired=new Date(invite.expires_at).getTime()<=Date.now();return '<div class="householdMemberRow"><div class="householdMemberIdentity"><strong class="householdMemberName">'+esc(invite.invited_email)+'</strong><span class="householdMemberMeta">'+(expired?'Expired':'Expires '+esc(new Date(invite.expires_at).toLocaleDateString()))+'</span></div><button type="button" class="smallbtn householdInlineAction" data-planly-household-revoke="'+esc(invite.id)+'">Revoke</button></div>'}).join('')+'</div></section>'
}
function planlyFreshHouseholdInviteHtml(){if(!planlyFreshHouseholdInvite)return '';return '<div class="householdInviteReady"><span class="householdSectionEyebrow">Invitation ready</span><strong>'+esc(planlyFreshHouseholdInvite.email)+'</strong><p>Share this private link now. Planly stores only its token hash.</p><div class="householdButtonStack"><button id="planlyShareHouseholdInviteBtn" type="button" class="primary">Share invitation</button><button id="planlyCopyHouseholdInviteBtn" type="button" class="secondaryBtn">Copy link</button><button id="planlyDiscardHouseholdInviteBtn" type="button" class="secondaryBtn householdQuietBtn">Hide link</button></div></div>'}
function planlyHouseholdTransferHtml(){
  if(planlyHousehold?.myRole!=='owner')return '';
  const candidates=planlyHouseholdMembers.filter(member=>member.role==='member'&&String(member.user_id)!==String(planlySession?.user?.id||''));
  if(!candidates.length)return '<p class="householdPanelHint">Invite another Planly account before transferring ownership.</p>';
  return '<p class="householdPanelHint">Choose the new owner. Your account will become a regular member.</p><div class="field householdField"><label for="planlyHouseholdTransferTarget">New owner</label><select id="planlyHouseholdTransferTarget" class="select">'+candidates.map(member=>'<option value="'+esc(member.user_id)+'">'+esc(planlyHouseholdMemberLabel(member))+'</option>').join('')+'</select></div><button id="planlyTransferHouseholdBtn" class="secondaryBtn" type="button">Transfer ownership</button>'
}
function planlyHouseholdHtml(){
  const inviteWaiting=!!planlyPendingHouseholdInviteToken;
  if(!planlySession?.user)return inviteWaiting?'<div class="householdInviteReady"><span class="householdSectionEyebrow">Invitation ready</span><strong>Sign in to continue</strong><p>Use the invited email address. The invite stays only in this browser tab.</p></div>':'<div class="muted settingsHelp">Sign in to create or join a household.</div>';
  if(planlyHouseholdError)return '<div class="empty compactEmpty"><strong>Household unavailable</strong><br><span class="muted">'+esc(planlyHouseholdError)+'</span></div>';
  if(!planlyHousehold){const inviteCard=inviteWaiting?'<div class="householdInviteReady"><span class="householdSectionEyebrow">Invitation ready</span><strong>Join this household</strong><p>The server will verify this account matches the invited email.</p><div class="householdButtonStack"><button id="planlyAcceptHouseholdLinkBtn" type="button" class="primary">Join household</button><button id="planlyDismissHouseholdInviteBtn" type="button" class="secondaryBtn householdQuietBtn">Dismiss</button></div></div>':'';return inviteCard+planlyNamePanelHtml()+'<div class="householdEmptyIntro"><strong>Create your household</strong><p>Set up secure sharing with another Planly account. Nothing is shared until you choose to share it.</p></div><div class="field householdField"><label for="planlyHouseholdName">Household name</label><input id="planlyHouseholdName" class="input" maxlength="80" placeholder="Our household"></div><button id="planlyCreateHouseholdBtn" class="primary" type="button">Create household</button><details class="advancedSettings householdInviteCode"><summary>Have an invite code?</summary><div class="field"><label for="planlyHouseholdInviteToken">Invite code</label><input id="planlyHouseholdInviteToken" class="input" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="Paste invite code"></div><button id="planlyAcceptHouseholdBtn" class="secondaryBtn" type="button">Join household</button></details>'}
  const owner=planlyHousehold.myRole==='owner',roleLabel=owner?'Owner':'Member',myDisplayName=planlyMyDisplayName();
  const namePanel=planlyNamePanelHtml();
  const waitingNotice=inviteWaiting?'<div class="householdInviteReady"><span class="householdSectionEyebrow">Another invitation</span><strong>Invitation waiting</strong><p>This account already belongs to a household.</p><button id="planlyDismissHouseholdInviteBtn" type="button" class="secondaryBtn householdQuietBtn">Dismiss invitation</button></div>':'';
  const invitePanel=owner?'<section class="householdSubsection householdActionPanel"><div class="householdSubsectionHead"><div><span class="householdSectionEyebrow">Invite</span><h4>Invite a member</h4><p>Send a private link to another Planly account.</p></div></div>'+planlyFreshHouseholdInviteHtml()+'<div class="field householdField"><label for="planlyHouseholdInviteEmail">Email address</label><input id="planlyHouseholdInviteEmail" class="input" type="email" inputmode="email" autocapitalize="none" autocomplete="email" placeholder="person@example.com"></div><button id="planlyCreateHouseholdInviteBtn" class="secondaryBtn" type="button">Create invitation link</button></section>':'';
  const ownershipPanel=owner?'<section class="householdSubsection householdActionPanel"><div class="householdSubsectionHead"><div><span class="householdSectionEyebrow">Ownership</span><h4>Household owner</h4></div></div>'+planlyHouseholdTransferHtml()+'</section>':'';
  const exitPanel='<section class="householdSubsection householdDangerPanel"><div class="householdSubsectionHead"><div><span class="householdSectionEyebrow">Danger zone</span><h4>'+(owner?'Delete household':'Leave household')+'</h4><p>'+(owner?'Removes household membership, invitations and the shared Household Budget. Personal budgets and private Planly data are not deleted.':'Leave this household and remove your shared access.')+'</p></div></div><button id="'+(owner?'planlyDeleteHouseholdBtn':'planlyLeaveHouseholdBtn')+'" class="dangerBtn" type="button">'+(owner?'Delete household':'Leave household')+'</button></section>';
  const manageOpen=(planlyHouseholdManageOpen()||!!planlyFreshHouseholdInvite)?' open':'',manageHelp=owner?'Invite members, ownership & household controls':'Household membership controls';
  const managePanel='<details id="planlyHouseholdManage" class="householdManage"'+manageOpen+'><summary><span class="householdManageText"><strong>Manage household</strong><small>'+manageHelp+'</small></span><span class="householdManageChevron" aria-hidden="true">›</span></summary><div class="householdManageBody">'+invitePanel+ownershipPanel+exitPanel+'</div></details>';
  return '<div class="householdSettings">'+waitingNotice+'<div class="householdSummary"><div class="householdSummaryTop"><div class="householdSummaryName"><span class="statusDot connected"></span><strong>'+esc(planlyHousehold.name)+'</strong></div><span class="householdRoleBadge '+(owner?'owner':'member')+'">'+roleLabel+'</span></div><div class="householdSummaryMeta"><span>'+planlyHouseholdMembers.length+' member'+(planlyHouseholdMembers.length===1?'':'s')+'</span><span aria-hidden="true">·</span><span>'+(owner?'You manage this household':'You are a household member')+'</span></div></div><div class="householdPrivacyNote"><strong>Private by default</strong><span>Tasks and projects stay private unless you explicitly share them.</span></div>'+namePanel+planlyHouseholdMemberRowsHtml()+planlyHouseholdPendingInvitesHtml()+managePanel+'</div>'
}

async function createPlanlyHousehold(){const name=$('#planlyHouseholdName')?.value.trim();if(!name)throw new Error('Enter a household name.');const {error}=await planlySupabase.rpc('planly_create_household',{p_name:name});if(error)throw error;await loadPlanlyHousehold(true);await carryPlanlyNameIntoHousehold();showToast('Household created');render()}
async function createPlanlyHouseholdInvite(){if(!planlyHousehold||planlyHousehold.myRole!=='owner')throw new Error('Only the household owner can create invitations.');const email=$('#planlyHouseholdInviteEmail')?.value.trim();if(!email)throw new Error('Enter an email address.');const {data,error}=await planlySupabase.rpc('planly_create_household_invite',{p_household_id:planlyHousehold.id,p_email:email});if(error)throw error;const token=normalizePlanlyHouseholdInviteToken(data);if(!token)throw new Error('Planly did not receive a valid invitation token.');const link=planlyHouseholdInviteLink(token);await loadPlanlyHousehold(true);const pending=planlyHouseholdInvites.find(invite=>invite.status==='pending'&&String(invite.invited_email||'').toLowerCase()===email.toLowerCase());planlyFreshHouseholdInvite={email,link,inviteId:pending?.id||''};showToast('Invitation created');render()}
async function sharePlanlyHouseholdInvite(){const invite=planlyFreshHouseholdInvite;if(!invite)return;if(typeof navigator.share==='function'){try{await navigator.share({title:'Planly household invitation',text:'Join my household in Planly.',url:invite.link});planlyFreshHouseholdInvite=null;showToast('Invitation shared');render();return}catch(err){if(err?.name==='AbortError')return}}await copyPlanlyHouseholdInvite()}
async function copyPlanlyHouseholdInvite(){const invite=planlyFreshHouseholdInvite;if(!invite)return;try{if(!navigator.clipboard?.writeText)throw new Error('Clipboard unavailable');await navigator.clipboard.writeText(invite.link);planlyFreshHouseholdInvite=null;showToast('Invitation link copied');render()}catch{prompt('Copy this private Planly invitation link:',invite.link)}}
function discardPlanlyHouseholdInvite(){planlyFreshHouseholdInvite=null;render()}
async function revokePlanlyHouseholdInvite(inviteId){if(!inviteId||!planlyHousehold||planlyHousehold.myRole!=='owner')throw new Error('Only the household owner can revoke invitations.');const invite=planlyHouseholdInvites.find(item=>String(item.id)===String(inviteId));if(!confirm('Revoke the invitation'+(invite?.invited_email?' for '+invite.invited_email:'')+'?'))return;const {error}=await planlySupabase.rpc('planly_revoke_household_invite',{p_invite_id:inviteId});if(error)throw error;if(planlyFreshHouseholdInvite?.inviteId===inviteId)planlyFreshHouseholdInvite=null;await loadPlanlyHousehold(true);showToast('Invitation revoked');render()}
async function acceptPlanlyHouseholdInvite(){const typed=$('#planlyHouseholdInviteToken')?.value||'',token=planlyPendingHouseholdInviteToken||normalizePlanlyHouseholdInviteToken(typed);if(!token)throw new Error('Enter a valid invitation code.');const {error}=await planlySupabase.rpc('planly_accept_household_invite',{p_token:token});if(error)throw error;setPendingPlanlyHouseholdInvite('');if($('#planlyHouseholdInviteToken'))$('#planlyHouseholdInviteToken').value='';await loadPlanlyHousehold(true);await carryPlanlyNameIntoHousehold();showToast('Household joined');render()}
async function transferPlanlyHouseholdOwnership(){
  if(!planlyHousehold||planlyHousehold.myRole!=='owner')throw new Error('Only the household owner can transfer ownership.');
  const targetId=$('#planlyHouseholdTransferTarget')?.value;
  const member=planlyHouseholdMembers.find(item=>String(item.user_id)===String(targetId));
  if(!targetId||!member)throw new Error('Choose a household member.');
  const label=planlyHouseholdMemberLabel(member);
  if(!confirm('Transfer ownership to '+label+'? You will become a household member and lose owner controls immediately.'))return;
  const {error}=await planlySupabase.rpc('planly_transfer_household_ownership',{p_household_id:planlyHousehold.id,p_new_owner:targetId});
  if(error)throw error;
  planlyFreshHouseholdInvite=null;
  await loadPlanlyHousehold(true);
  showToast('Household ownership transferred');
  render()
}
async function deletePlanlyHousehold(){
  if(!planlyHousehold||planlyHousehold.myRole!=='owner')throw new Error('Only the household owner can delete the household.');
  const expected=String(planlyHousehold.name||'').trim(),typed=prompt('This permanently deletes the shared Household Budget. Personal budgets and private Planly data stay intact. Type “'+expected+'” to delete this household.');
  if(typed===null)return;
  if(String(typed).trim()!==expected)throw new Error('Household name did not match. Nothing was deleted.');
  const {error}=await planlySupabase.rpc('planly_delete_household',{p_household_id:planlyHousehold.id});
  if(error)throw error;
  planlyFreshHouseholdInvite=null;await loadPlanlyHousehold(true);
  showToast('Household deleted');
  render()
}
async function leavePlanlyHousehold(){if(!planlyHousehold||!confirm('Leave “'+planlyHousehold.name+'”? Shared access will end immediately.'))return;const {error}=await planlySupabase.rpc('planly_leave_household',{p_household_id:planlyHousehold.id});if(error)throw error;planlyHousehold=null;planlyHouseholdMembers=[];planlyHouseholdInvites=[];planlyHouseholdError='';publishPlanlyHouseholdContext();await loadPlanlyHousehold(true);await reconcilePlanlyCloud({render:true,replay:true,replayToast:''}).catch(()=>{});showToast('Left household');render()}
function planlyCloudStatusKey(){return PLANLY_CLOUD_STATUS_PREFIX+(planlyLastAccountId()||'anonymous')}
function planlyCloudBackupKey(){return PLANLY_CLOUD_BACKUP_PREFIX+(planlyLastAccountId()||'anonymous')}
function planlyCloudLocalStatus(){try{return JSON.parse(localStorage.getItem(planlyCloudStatusKey())||'{}')}catch{return {}}}
function setPlanlyCloudLocalStatus(patch){const next={...planlyCloudLocalStatus(),...patch,updatedAt:new Date().toISOString()};localStorage.setItem(planlyCloudStatusKey(),JSON.stringify(next));return next}
function canonicalJson(value){if(Array.isArray(value))return '['+value.map(canonicalJson).join(',')+']';if(value&&typeof value==='object'){return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonicalJson(value[k])).join(',')+'}'}return JSON.stringify(value)}
async function sha256Text(text){const bytes=new TextEncoder().encode(text),hash=await crypto.subtle.digest('SHA-256',bytes);return [...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,'0')).join('')}
function migrationPayloadFromRaw(raw){let parsed={};try{parsed=JSON.parse(raw)||{}}catch{throw new Error('The Planly migration data is not valid JSON.')}const tasks=Array.isArray(parsed.tasks)?parsed.tasks:[],projects=Array.isArray(parsed.projects)?parsed.projects:[];return {raw,parsed,tasks,projects,preferences:{defaultCategory:parsed.defaultCategory||'Personal',defaultDuration:Number(parsed.defaultDuration||30),autoCompleteParentSubtasks:!!parsed.autoCompleteParentSubtasks,planningStart:parsed.planningStart||'08:00',planningEnd:parsed.planningEnd||'23:00'}}}
function planlyMigrationPayload(){return migrationPayloadFromRaw(localStorage.getItem(STORE)||'{}')}
function validateMigrationBackupFile(d){if(!d||d.kind!=='planly-cloud-migration-backup'||Number(d.version)!==1||d.storeKey!==STORE||typeof d.raw!=='string')throw new Error('This is not a Planly 3.2 migration backup.');const snapshot=migrationPayloadFromRaw(d.raw);assertUniqueLocalIds(snapshot.projects,'Projects');assertUniqueLocalIds(snapshot.tasks,'Tasks');if(!snapshot.tasks.length&&!snapshot.projects.length)throw new Error('The migration backup contains no tasks or projects.');if(Number(d.taskCount)!==snapshot.tasks.length||Number(d.projectCount)!==snapshot.projects.length)throw new Error('Migration backup counts do not match its embedded Planly data.');return snapshot}
function taskCloudRow(t,ownerId){const visibility=t.visibility==='household'?'household':'private',householdId=visibility==='household'?(t.householdId||planlyHousehold?.id||null):null,cloudData={...t,visibility,householdId};return {owner_id:ownerId,client_id:String(t.id),data:cloudData,visibility,household_id:householdId,assignee_id:visibility==='household'?(t.assigneeId||t.assignee_id||null):null,series_client_id:t.seriesId?String(t.seriesId):null,title:String(t.title||''),task_date:t.date||null,task_time:t.time||null,duration_minutes:Number(t.durationMinutes||30),priority:String(t.priority||'normal'),category:String(t.category||'Personal'),project_client_id:t.projectId?String(t.projectId):null,recurrence:String(t.recurrence||'none'),recurrence_config:t.recurrenceConfig??null,occurrence_number:Number.isFinite(Number(t.occurrenceNumber))?Number(t.occurrenceNumber):null,reminder:String(t.reminder||'none'),notes:String(t.notes||''),subtasks:Array.isArray(t.subtasks)?t.subtasks:[],completed:!!t.completed,pinned:!!t.pinned,top3_order:Number.isFinite(Number(t.top3Order))?Number(t.top3Order):null,add_to_calendar:!!t.addToCalendar,google_event_id:t.googleEventId||null,google_recurrence_start_date:t.googleRecurrenceStartDate||null,google_recurrence_version:Number.isFinite(Number(t.googleRecurrenceVersion))?Number(t.googleRecurrenceVersion):null,calendar_sync:String(t.calendarSync||''),calendar_synced_at:Number.isFinite(Number(t.calendarSyncedAt))?Number(t.calendarSyncedAt):null,client_created_at:Number.isFinite(Number(t.createdAt))?Number(t.createdAt):null,client_updated_at:Number.isFinite(Number(t.updatedAt))?Number(t.updatedAt):Number(t.createdAt)||Date.now(),deleted_at:null}}

function migrationEntityMap(rows){return new Map((rows||[]).map(r=>[String(r.client_id),r]))}
function assertUniqueLocalIds(items,label){const ids=items.map(x=>String(x?.id||''));if(ids.some(id=>!id))throw new Error(label+' contains an item without an ID.');if(new Set(ids).size!==ids.length)throw new Error(label+' contains duplicate IDs. Migration stopped.')}
async function inspectPlanlyCloud(ownerId){const [projects,tasks,prefs,sync]=await Promise.all([planlySupabase.from('planly_projects').select('client_id,data,deleted_at,cloud_version'),planlySupabase.from('planly_tasks').select('client_id,data,deleted_at,cloud_version'),planlySupabase.from('planly_preferences').select('*').eq('owner_id',ownerId).maybeSingle(),planlySupabase.from('planly_sync_state').select('*').eq('owner_id',ownerId).maybeSingle()]);for(const r of [projects,tasks,prefs,sync])if(r.error)throw r.error;return {projects:projects.data||[],tasks:tasks.data||[],preferences:prefs.data||null,sync:sync.data||null}}
function existingCloudMatchesLocal(existing,local,label){for(const row of existing){const item=local.find(x=>String(x.id)===String(row.client_id));if(!item)throw new Error('Cloud '+label+' contains data not present in this migration snapshot. Automatic migration stopped.');if(row.deleted_at||canonicalJson(row.data)!==canonicalJson(item))throw new Error('Cloud '+label+' differs from this migration snapshot. Automatic migration stopped.')}return migrationEntityMap(existing)}
async function upsertInChunks(table,rows,size=100){for(let i=0;i<rows.length;i+=size){const {error}=await planlySupabase.from(table).upsert(rows.slice(i,i+size),{onConflict:'owner_id,client_id'});if(error)throw error}}
async function verifyPlanlyMigration(snapshot,ownerId,digest){const cloud=await inspectPlanlyCloud(ownerId),projects=migrationEntityMap(cloud.projects),tasks=migrationEntityMap(cloud.tasks);if(cloud.projects.length!==snapshot.projects.length)throw new Error('Cloud project count verification failed.');if(cloud.tasks.length!==snapshot.tasks.length)throw new Error('Cloud task count verification failed.');for(const p of snapshot.projects){const row=projects.get(String(p.id));if(!row||row.deleted_at||canonicalJson(row.data)!==canonicalJson(p))throw new Error('Project verification failed for '+p.id)}for(const t of snapshot.tasks){const row=tasks.get(String(t.id));if(!row||row.deleted_at||canonicalJson(row.data)!==canonicalJson(t))throw new Error('Task verification failed for '+t.id)}const cloudDigest=await sha256Text(canonicalJson({projects:snapshot.projects,tasks:snapshot.tasks,preferences:snapshot.preferences}));if(cloudDigest!==digest)throw new Error('Migration digest verification failed.');return cloud}
async function migratePlanlySnapshotToCloud(snapshot){if(!PLANLY_CLOUD_PREVIEW)throw new Error('Cloud migration is disabled in this build.');if(!planlySession?.user||!initPlanlySupabase())throw new Error('Sign in to Planly first.');const ownerId=planlySession.user.id;assertUniqueLocalIds(snapshot.projects,'Projects');assertUniqueLocalIds(snapshot.tasks,'Tasks');if(!snapshot.tasks.length&&!snapshot.projects.length)throw new Error('No local tasks or projects were found. Migration stopped to protect against an empty snapshot.');const backupKey=planlyCloudBackupKey();if(!localStorage.getItem(backupKey))localStorage.setItem(backupKey,JSON.stringify({version:PLANLY_CLOUD_MIGRATION_VERSION,createdAt:new Date().toISOString(),ownerId,storeKey:STORE,raw:snapshot.raw}));const digest=await sha256Text(canonicalJson({projects:snapshot.projects,tasks:snapshot.tasks,preferences:snapshot.preferences}));setPlanlyCloudLocalStatus({state:'checking',digest,projectCount:snapshot.projects.length,taskCount:snapshot.tasks.length});const before=await inspectPlanlyCloud(ownerId);if(before.sync?.initial_migration_completed_at){if(before.sync.migration_digest&&before.sync.migration_digest!==digest)throw new Error('This account already completed migration from a different local snapshot. No data was overwritten.');setPlanlyCloudLocalStatus({state:'complete',digest,completedAt:before.sync.initial_migration_completed_at});return {alreadyComplete:true,taskCount:snapshot.tasks.length,projectCount:snapshot.projects.length}}existingCloudMatchesLocal(before.projects,snapshot.projects,'projects');existingCloudMatchesLocal(before.tasks,snapshot.tasks,'tasks');setPlanlyCloudLocalStatus({state:'uploading'});await upsertInChunks('planly_projects',snapshot.projects.map(p=>projectCloudRow(p,ownerId)));await upsertInChunks('planly_tasks',snapshot.tasks.map(t=>taskCloudRow(t,ownerId)));const now=Date.now();const {error:prefError}=await planlySupabase.from('planly_preferences').upsert({owner_id:ownerId,default_category:snapshot.preferences.defaultCategory,default_duration:snapshot.preferences.defaultDuration,auto_complete_parent_subtasks:snapshot.preferences.autoCompleteParentSubtasks,planning_start:snapshot.preferences.planningStart,planning_end:snapshot.preferences.planningEnd,client_updated_at:now},{onConflict:'owner_id'});if(prefError)throw prefError;setPlanlyCloudLocalStatus({state:'verifying'});await verifyPlanlyMigration(snapshot,ownerId,digest);const completedAt=new Date().toISOString();const {error:syncError}=await planlySupabase.from('planly_sync_state').upsert({owner_id:ownerId,schema_version:PLANLY_CLOUD_MIGRATION_VERSION,initial_migration_completed_at:completedAt,migration_project_count:snapshot.projects.length,migration_task_count:snapshot.tasks.length,migration_digest:digest,last_successful_sync_at:completedAt},{onConflict:'owner_id'});if(syncError)throw syncError;setPlanlyCloudLocalStatus({state:'complete',digest,completedAt});return {alreadyComplete:false,taskCount:snapshot.tasks.length,projectCount:snapshot.projects.length}}
function planlyCloudPreviewHtml(){if(!PLANLY_CLOUD_PREVIEW)return '';const cachedOwner=planlyLastAccountId(),hasCachedOwner=!!cachedOwner;if(!planlySession?.user&&!hasCachedOwner)return '<div class="muted settingsHelp">Sign in above to use Planly Cloud Sync.</div>';const s=planlyCloudLocalStatus(),pending=readPlanlyPendingWrites().length,conflicts=readPlanlyConflicts(),offlineCached=!planlySession?.user&&hasCachedOwner,label=pending?(pending+' change'+(pending===1?'':'s')+' pending sync'):offlineCached?'Offline cache loaded':s.state==='cloud-write-test'||s.state==='complete'?'Cloud sync active':s.state==='cloud-loaded'?'Cloud copy loaded · read only':s.state==='uploading'?'Uploading…':s.state==='verifying'?'Verifying…':s.state==='checking'?'Checking…':s.state==='error'?'Sync needs attention':'Setup required';const counts=(Number.isFinite(s.taskCount)&&Number.isFinite(s.projectCount))?'<br>'+s.taskCount+' tasks · '+s.projectCount+' projects':'';const freshness=s.lastPullAt?'<br>Last cloud check '+esc(new Date(s.lastPullAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})):'';const pendingHelp=pending?'<br><strong>'+pending+' queued change'+(pending===1?'':'s')+' waiting to sync.</strong>':'';const pendingRows=readPlanlyPendingWrites(),journalErrors=pendingRows.filter(x=>x.status==='error').length,journalConflicts=pendingRows.filter(x=>x.status==='conflict').length,journalHelp=(journalErrors||journalConflicts)?'<br>'+journalErrors+' retry error'+(journalErrors===1?'':'s')+' · '+journalConflicts+' blocked by conflict':'';const help=offlineCached?'Using the last verified local cloud snapshot while Planly is offline.':planlyCloudReadOnly?'Your verified cloud copy is loaded read-only.':'Your Planly data is synced to your account and remains available offline.';const offlineReadyHtml='<div class="muted settingsHelp" style="margin-top:10px"><strong>Offline mode:</strong> '+esc(planlyOfflineStatus)+'</div>'+(!planlyOfflineReady&&navigator.onLine?'<button id="planlyPrepareOfflineBtn" class="secondaryBtn">Prepare offline mode</button>':'');const conflictHtml=conflicts.length?'<div class="settingsHelp" style="margin-top:12px"><strong>'+conflicts.length+' sync conflict'+(conflicts.length===1?'':'s')+' need review</strong>'+conflicts.map(c=>{const name=c.kind==='preference'?'Account preferences':String(c.localData?.title||c.serverData?.title||c.id);const serverDeleted=!!c.serverDeleted;return '<div style="margin-top:10px;padding:12px;border:1px solid var(--line);border-radius:14px"><div><strong>'+esc(name)+'</strong></div><div class="muted" style="margin-top:4px">'+esc(serverDeleted?'Cloud copy was deleted':'Cloud and this device both changed')+'</div><button class="secondaryBtn" data-planly-conflict-cloud="'+esc(c.kind)+'|'+esc(c.id)+'">Use cloud version</button>'+(!serverDeleted?'<button class="secondaryBtn" data-planly-conflict-local="'+esc(c.kind)+'|'+esc(c.id)+'">Keep my version</button>':'')+'</div>'}).join('')+'</div>':'';const setupButton=!offlineCached&&!['cloud-write-test','complete'].includes(s.state)?'<input id="planlyMigrationFile" type="file" accept="application/json,.json" hidden><button id="planlyCloudMigrateBtn" class="secondaryBtn" '+(['checking','uploading','verifying'].includes(s.state)?'disabled':'')+'>'+(s.state==='cloud-loaded'?'Enable cloud sync':'Verify with migration backup')+'</button>':'';return offlineReadyHtml+'<div class="calendarStatusRow settingsPrimaryRow"><span class="statusDot '+((!pending&&!offlineCached&&['complete','cloud-loaded','cloud-write-test'].includes(s.state))?'connected':'offline')+'"></span><strong>'+esc(label)+'</strong></div><div class="muted settingsHelp">'+help+pendingHelp+journalHelp+counts+freshness+'</div>'+conflictHtml+setupButton}
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
function stagePlanlyPendingWrite(kind,action,item,baseVersion){const id=kind==='preference'?'preferences':String(item?.id||item||'');if(!id)return;const current=readPlanlyPendingWrites(),existing=current.find(x=>x.kind===kind&&x.id===id),list=current.filter(x=>!(x.kind===kind&&x.id===id)),stableBase=existing?Number(existing.baseVersion||0):Number(baseVersion||0),now=new Date().toISOString();list.push({kind,action,id,data:action==='delete'?null:item,baseVersion:stableBase,operationId:existing?.operationId||uid(),stagedAt:existing?.stagedAt||now,lastEditedAt:now,attempts:Number(existing?.attempts||0),lastAttemptAt:existing?.lastAttemptAt||'',lastError:'',status:'queued',edits:Number(existing?.edits||0)+1});writePlanlyPendingWrites(list);persistPlanlyCloudCache()}
function clearPlanlyPendingWrite(kind,id){writePlanlyPendingWrites(readPlanlyPendingWrites().filter(x=>!(x.kind===kind&&x.id===String(id))));persistPlanlyCloudCache()}
/* A write succeeded. If the item was edited again while that request was in flight, keep the newer edit queued on top of
   the version just written instead of clearing it (clearing silently dropped it, e.g. a Google sync result). */
function planlyPendingEditMark(kind,id){const op=pendingPlanlyWrite(kind,id);return op?String(op.edits||0)+'|'+String(op.lastEditedAt||''):''}
function settlePlanlyPendingWrite(kind,id,mark,version){const op=pendingPlanlyWrite(kind,id);if(!op||String(op.edits||0)+'|'+String(op.lastEditedAt||'')===mark){clearPlanlyPendingWrite(kind,id);return}updatePlanlyPendingWrite(kind,id,{baseVersion:Number(version),status:'queued'});queuePlanlyPendingReplay('')}
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
function planlyTaskConflictIsCompletionOnly(localData,serverData){if(!localData||!serverData||!localData.completed||!serverData.completed)return false;const ignored=new Set(['completed','completedBy','completed_by','completedAt','completed_at','updatedAt','_planlyCloudVersion','_planlyOwnerId','_planlyOwnedByMe']);const clean=x=>Object.fromEntries(Object.entries(x||{}).filter(([k])=>!ignored.has(k)));return canonicalJson(clean(localData))===canonicalJson(clean(serverData))}
async function adoptCompletedCloudTaskConflict(op,record){if(op?.kind!=='task'||op.action!=='upsert'||!record||record.serverDeleted||!planlyTaskConflictIsCompletionOnly(op.data,record.serverData))return false;const row=await fetchPlanlyTaskRow(op.id);if(!row||row.deleted_at||!row.completed_by||!row.data?.completed)return false;const cloudTask=planlyTaskFromCloudRow(row),i=state.tasks.findIndex(t=>String(t.id)===String(op.id)&&t._planlyOwnedByMe!==false);if(i>=0)state.tasks[i]=cloudTask;planlyCloudSyncMeta.tasks.set(String(op.id),Number(row.cloud_version||record.serverVersion||0));clearPlanlyPendingWrite('task',op.id);clearPlanlyConflict('task',op.id);persistPlanlyCloudCache();save();render();showToast('Already done by '+planlyHouseholdSentencePersonLabel(row.completed_by));return true}
async function fetchPlanlyTaskRow(id){const ownerId=planlySession.user.id,{data,error}=await planlySupabase.from('planly_tasks').select(PLANLY_TASK_SELECT).eq('owner_id',ownerId).eq('client_id',String(id)).maybeSingle();if(error)throw error;return data||null}
async function replayPlanlyPendingWritesCore(){
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
        if(await adoptCompletedCloudTaskConflict(op,err.planlyConflictRecord)){replayed++;continue}
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
function planlyCloudWritesEnabled(){return PLANLY_CLOUD_PREVIEW&&!planlyCloudReadOnly&&!!planlySession?.user&&String(planlyLastAccountId()||'')===String(planlySession.user.id||'')}
function currentPlanlyCloudPreferences(){return {defaultCategory:state.defaultCategory,defaultDuration:Number(state.defaultDuration||30),autoCompleteParentSubtasks:!!state.autoCompleteParentSubtasks,planningStart:state.planningStart||'08:00',planningEnd:state.planningEnd||'23:00'}}
function stageTaskMutation(t){if(!planlyCloudWritesEnabled()||!t?.id||t._planlyOwnedByMe===false)return '';planlyRotationNormalize(t);const id=String(t.id),baseVersion=Number(planlyCloudSyncMeta.tasks.get(id)||0);stagePlanlyPendingWrite('task','upsert',t,baseVersion);return id}
function stageProjectMutationCore(p){if(!planlyCloudWritesEnabled()||!p?.id)return '';const id=String(p.id),baseVersion=Number(planlyCloudSyncMeta.projects.get(id)||0);stagePlanlyPendingWrite('project','upsert',p,baseVersion);return id}
function stagePreferenceMutation(){if(!planlyCloudWritesEnabled())return false;stagePlanlyPendingWrite('preference','upsert',currentPlanlyCloudPreferences(),Number(planlyCloudSyncMeta.preferences||0));return true}
function stageChangedTasksFromSnapshot(before=[]){if(!planlyCloudWritesEnabled())return [];const prior=new Map((before||[]).filter(t=>t._planlyOwnedByMe!==false).map(t=>[String(t.id),t])),ids=[];for(const t of state.tasks){if(t._planlyOwnedByMe===false)continue;const old=prior.get(String(t.id));if(!old||canonicalJson(old)!==canonicalJson(t)){stageTaskMutation(t);ids.push(String(t.id))}}return ids}
function clearPendingTaskIds(ids=[]){for(const id of ids)clearPlanlyPendingWrite('task',id)}
function queuePlanlyPendingReplay(success='Planly Cloud synced'){if(!planlyCloudWritesEnabled())return Promise.resolve({replayed:0,deferred:true});return queueCloudWrite(()=>replayPlanlyPendingWrites(),success)}
let planlySyncTouchTimer=0,planlySyncTouchOwner='';
async function flushPlanlyLastSuccessfulSync(){clearTimeout(planlySyncTouchTimer);planlySyncTouchTimer=0;const ownerId=planlySyncTouchOwner;planlySyncTouchOwner='';if(!ownerId||!planlySession?.user||String(planlySession.user.id)!==ownerId)return;const {error}=await planlySupabase.from('planly_sync_state').update({last_successful_sync_at:new Date().toISOString()}).eq('owner_id',ownerId);if(error)throw error}
function touchPlanlyLastSuccessfulSync({flush=false}={}){if(!planlySession?.user)return Promise.resolve();planlySyncTouchOwner=String(planlySession.user.id);if(flush)return flushPlanlyLastSuccessfulSync();clearTimeout(planlySyncTouchTimer);planlySyncTouchTimer=setTimeout(()=>void flushPlanlyLastSuccessfulSync().catch(()=>{}),5000);return Promise.resolve()}
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
async function cloudInsertTaskCore(t,replay=false){const ownerId=planlySession.user.id,id=String(t.id);if(!replay)stagePlanlyPendingWrite('task','upsert',t,0);const mark=planlyPendingEditMark('task',id),row=taskCloudRow(t,ownerId);const {data,error}=await planlySupabase.from('planly_tasks').insert(row).select('client_id,cloud_version').single();if(error){const server=await fetchPlanlyServerConflict('task',id).catch(()=>null);if(server)throw await makePlanlyConflictError('task',id,'upsert',t,0,'This task was created or deleted in another Planly client before this insert.');throw error}planlyCloudSyncMeta.tasks.set(String(data.client_id),Number(data.cloud_version));settlePlanlyPendingWrite('task',id,mark,data.cloud_version);clearPlanlyConflict('task',id);return data}
async function cloudUpdateTask(t,replay=false,forcedVersion=null){const ownerId=planlySession.user.id,id=String(t.id),version=forcedVersion||planlyCloudSyncMeta.tasks.get(id);if(!version)return cloudInsertTask(t,replay);if(!replay)stagePlanlyPendingWrite('task','upsert',t,version);const mark=planlyPendingEditMark('task',id),row=taskCloudRow(t,ownerId);delete row.owner_id;delete row.client_id;const {data,error}=await planlySupabase.from('planly_tasks').update(row).eq('owner_id',ownerId).eq('client_id',id).eq('cloud_version',version).select('client_id,cloud_version').maybeSingle();if(error)throw error;if(!data)throw await makePlanlyConflictError('task',id,'upsert',t,version,'This task changed in another Planly client.');planlyCloudSyncMeta.tasks.set(id,Number(data.cloud_version));settlePlanlyPendingWrite('task',id,mark,data.cloud_version);return data}
async function cloudDeleteTaskById(id,replay=false,forcedVersion=null){const ownerId=planlySession.user.id,key=String(id),version=forcedVersion||planlyCloudSyncMeta.tasks.get(key);if(!version)throw await makePlanlyConflictError('task',key,'delete',null,0,'This task no longer has a valid cloud version.');if(!replay)stagePlanlyPendingWrite('task','delete',key,version);const {data,error}=await planlySupabase.from('planly_tasks').update({deleted_at:new Date().toISOString(),client_updated_at:Date.now()}).eq('owner_id',ownerId).eq('client_id',key).eq('cloud_version',version).select('client_id,cloud_version').maybeSingle();if(error)throw error;if(!data)throw await makePlanlyConflictError('task',key,'delete',null,version,'This task changed in another Planly client before deletion.');planlyCloudSyncMeta.tasks.set(key,Number(data.cloud_version));clearPlanlyPendingWrite('task',key);clearPlanlyConflict('task',key);return data}
async function cloudInsertProject(p,replay=false){const ownerId=planlySession.user.id,id=String(p.id);if(!replay)stagePlanlyPendingWrite('project','upsert',p,0);const mark=planlyPendingEditMark('project',id),row=projectCloudRow(p,ownerId);const {data,error}=await planlySupabase.from('planly_projects').insert(row).select('client_id,cloud_version').single();if(error){const server=await fetchPlanlyServerConflict('project',id).catch(()=>null);if(server)throw await makePlanlyConflictError('project',id,'upsert',p,0,'This project was created or deleted in another Planly client before this insert.');throw error}planlyCloudSyncMeta.projects.set(String(data.client_id),Number(data.cloud_version));settlePlanlyPendingWrite('project',id,mark,data.cloud_version);clearPlanlyConflict('project',id);return data}
async function cloudUpdateProject(p,replay=false,forcedVersion=null){const ownerId=planlySession.user.id,id=String(p.id),version=forcedVersion||planlyCloudSyncMeta.projects.get(id);if(!version)return cloudInsertProject(p,replay);if(!replay)stagePlanlyPendingWrite('project','upsert',p,version);const mark=planlyPendingEditMark('project',id),row=projectCloudRow(p,ownerId);delete row.owner_id;delete row.client_id;const {data,error}=await planlySupabase.from('planly_projects').update(row).eq('owner_id',ownerId).eq('client_id',id).eq('cloud_version',version).select('client_id,cloud_version').maybeSingle();if(error)throw error;if(!data)throw await makePlanlyConflictError('project',id,'upsert',p,version,'This project changed in another Planly client.');planlyCloudSyncMeta.projects.set(id,Number(data.cloud_version));settlePlanlyPendingWrite('project',id,mark,data.cloud_version);return data}
async function cloudDeleteProjectById(id,replay=false,forcedVersion=null){const ownerId=planlySession.user.id,key=String(id),version=forcedVersion||planlyCloudSyncMeta.projects.get(key);if(!version)throw await makePlanlyConflictError('project',key,'delete',null,0,'This project no longer has a valid cloud version.');if(!replay)stagePlanlyPendingWrite('project','delete',key,version);const {data,error}=await planlySupabase.from('planly_projects').update({deleted_at:new Date().toISOString(),client_updated_at:Date.now()}).eq('owner_id',ownerId).eq('client_id',key).eq('cloud_version',version).select('client_id,cloud_version').maybeSingle();if(error)throw error;if(!data)throw await makePlanlyConflictError('project',key,'delete',null,version,'This project changed in another Planly client before deletion.');planlyCloudSyncMeta.projects.set(key,Number(data.cloud_version));clearPlanlyPendingWrite('project',key);clearPlanlyConflict('project',key);return data}
async function cloudUpdatePreferences(p,replay=false,forcedVersion=null){const ownerId=planlySession.user.id,version=Number(forcedVersion||planlyCloudSyncMeta.preferences||0),row={owner_id:ownerId,default_category:p.defaultCategory||'Personal',default_duration:Number(p.defaultDuration||30),auto_complete_parent_subtasks:!!p.autoCompleteParentSubtasks,planning_start:p.planningStart||'08:00',planning_end:p.planningEnd||'23:00',client_updated_at:Date.now()};if(!replay)stagePlanlyPendingWrite('preference','upsert',p,version);let result;if(version){delete row.owner_id;result=await planlySupabase.from('planly_preferences').update(row).eq('owner_id',ownerId).eq('cloud_version',version).select('cloud_version').maybeSingle();if(result.error)throw result.error;if(!result.data)throw await makePlanlyConflictError('preference','preferences','upsert',p,version,'Planly preferences changed in another client.')}else{result=await planlySupabase.from('planly_preferences').insert(row).select('cloud_version').single();if(result.error){const server=await fetchPlanlyServerConflict('preference','preferences').catch(()=>null);if(server)throw await makePlanlyConflictError('preference','preferences','upsert',p,0,'Planly preferences were created in another client before this insert.');throw result.error}}planlyCloudSyncMeta.preferences=Number(result.data.cloud_version);clearPlanlyPendingWrite('preference','preferences');clearPlanlyConflict('preference','preferences');return result.data}
function isOfflineCloudError(err){const m=String(err?.message||err||'').toLowerCase();return !navigator.onLine||m.includes('failed to fetch')||m.includes('network')||m.includes('load failed')}
function queueCloudWrite(work,success='Synced to Planly Cloud'){if(!PLANLY_CLOUD_PREVIEW||planlyCloudReadOnly)return Promise.resolve();planlyCloudWriteQueue=planlyCloudWriteQueue.catch(()=>{}).then(work).then(v=>{if(v?.deferred||v?.replayed===0)return v;/* Successful syncs are shown by the Synced chip only (no pop-up). */return v}).catch(err=>{const offline=isOfflineCloudError(err);if(err?.planlyConflictRecord)upsertPlanlyConflict(err.planlyConflictRecord);else setPlanlyCloudLocalStatus({state:offline?'offline-retry-needed':'conflict',error:String(err?.message||err)});showToast(offline?'Offline · changes remain queued':err?.planlyConflictRecord?'Cloud conflict · review in Settings':'Cloud sync failed');if(!offline&&!err?.planlyConflictRecord)alert(err?.message||'Cloud sync failed.');render();return null});return planlyCloudWriteQueue}
function applyPlanlyPreferenceData(p){if(!p)return;state.defaultCategory=p.defaultCategory||'Personal';state.defaultDuration=Number(p.defaultDuration||30);state.autoCompleteParentSubtasks=!!p.autoCompleteParentSubtasks;state.planningStart=p.planningStart||'08:00';state.planningEnd=p.planningEnd||'23:00'}
/* Conflict resolution must leave Google Calendar matching the chosen version. The event recorded in the cloud
   row is the canonical one; an event only this device created for the same task is a duplicate and is deleted. */
function planlyConflictLocalTask(id,conflict){return pendingPlanlyWrite('task',id)?.data||state.tasks.find(x=>String(x.id)===String(id)&&x._planlyOwnedByMe!==false)||conflict?.localData||null}
async function reconcilePlanlyConflictGoogle(task,duplicateEventId){
  if(duplicateEventId)queueGoogleDelete(duplicateEventId);
  if(task?.addToCalendar&&task.date){try{await syncTaskToGoogle(task)}catch{}}
  if(googleConnected())await processPendingDeletes().catch(()=>{});
}
async function resolvePlanlyConflictUseCloud(kind,id){
  const conflict=readPlanlyConflicts().find(x=>x.kind===kind&&x.id===String(id));if(!conflict)return;
  const server=await fetchPlanlyServerConflict(kind,id);
  let googleTask=null,googleDuplicate='';
  if(kind==='task'){
    const local=planlyConflictLocalTask(id,conflict),localEvent=String(local?.googleEventId||''),cloudEvent=String(server?.serverData?.googleEventId||'');
    if(localEvent&&localEvent!==cloudEvent)googleDuplicate=localEvent;
    // This device may have moved the cloud row's event to its own date: put it back to the cloud version.
    if(server&&!server.serverDeleted&&cloudEvent&&localEvent===cloudEvent&&server.serverData?.addToCalendar)googleTask=server.serverData;
    if(!server||server.serverDeleted){state.tasks=state.tasks.filter(x=>String(x.id)!==String(id));planlyCloudSyncMeta.tasks.delete(String(id))}
    else{const i=state.tasks.findIndex(x=>String(x.id)===String(id));if(i>=0)state.tasks[i]=server.serverData;else state.tasks.push(server.serverData);planlyCloudSyncMeta.tasks.set(String(id),server.serverVersion);if(googleTask)googleTask=state.tasks[i>=0?i:state.tasks.length-1]}
  }else if(kind==='project'){
    if(!server||server.serverDeleted){state.projects=state.projects.filter(x=>String(x.id)!==String(id));planlyCloudSyncMeta.projects.delete(String(id))}
    else{const i=state.projects.findIndex(x=>String(x.id)===String(id));if(i>=0)state.projects[i]=server.serverData;else state.projects.push(server.serverData);planlyCloudSyncMeta.projects.set(String(id),server.serverVersion)}
  }else if(kind==='preference'){
    if(server){applyPlanlyPreferenceData(server.serverData);planlyCloudSyncMeta.preferences=server.serverVersion}
  }
  clearPlanlyPendingWrite(kind,id);clearPlanlyConflict(kind,id);persistPlanlyCloudCache();setPlanlyCloudLocalStatus({state:readPlanlyConflicts().length?'conflict':'cloud-write-test',pendingWrites:readPlanlyPendingWrites().length});render();showToast('Cloud version accepted');
  if(kind==='task'&&(googleTask||googleDuplicate)){await reconcilePlanlyConflictGoogle(googleTask,googleDuplicate);save();render()}
}
async function resolvePlanlyConflictKeepLocal(kind,id){
  const conflict=readPlanlyConflicts().find(x=>x.kind===kind&&x.id===String(id));if(!conflict)return;
  const server=await fetchPlanlyServerConflict(kind,id);
  if(!server||server.serverDeleted)throw new Error('The cloud copy was deleted. Accept the cloud version, then duplicate/recreate your local copy if needed.');
  let googleTask=null,googleDuplicate='';
  if(kind==='task'){
    if(conflict.action==='delete')await cloudDeleteTaskById(id,true,server.serverVersion);
    else{
      // Keep this device's task, but on the cloud row's Google event so Google ends with exactly one event.
      const local={...(planlyConflictLocalTask(id,conflict)||conflict.localData)},localEvent=String(local.googleEventId||''),cloudEvent=String(server.serverData?.googleEventId||'');
      if(local.addToCalendar&&local.date){if(cloudEvent){if(localEvent&&localEvent!==cloudEvent)googleDuplicate=localEvent;local.googleEventId=cloudEvent}local.calendarSync='pending'}
      await cloudUpdateTask(local,true,server.serverVersion);
      const i=state.tasks.findIndex(x=>String(x.id)===String(id));if(i>=0)state.tasks[i]=local;else state.tasks.push(local);
      if(local.addToCalendar&&local.date)googleTask=local;
    }
  }else if(kind==='project'){
    if(conflict.action==='delete')await cloudDeleteProjectById(id,true,server.serverVersion);
    else await cloudUpdateProject(conflict.localData,true,server.serverVersion);
  }else if(kind==='preference'){
    await cloudUpdatePreferences(conflict.localData,true,server.serverVersion);
  }
  clearPlanlyConflict(kind,id);persistPlanlyCloudCache();setPlanlyCloudLocalStatus({state:readPlanlyConflicts().length?'conflict':'cloud-write-test',pendingWrites:readPlanlyPendingWrites().length});render();showToast('Your version synced');
  if(googleTask||googleDuplicate){await reconcilePlanlyConflictGoogle(googleTask,googleDuplicate);save();render()}
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

const PLANLY_TASK_SELECT='owner_id,client_id,data,visibility,household_id,assignee_id,completed_by,completed_at,cloud_version,deleted_at';
const PLANLY_PROJECT_SELECT='owner_id,client_id,data,visibility,household_id,cloud_version,deleted_at';
function planlyTaskFromCloudRow(row){if(!row?.data)return null;const visibility=row.visibility==='household'?'household':'private',householdId=visibility==='household'?(row.household_id||null):null;return {...row.data,visibility,householdId,assigneeId:row.assignee_id||row.data.assigneeId||null,completedBy:row.completed_by||null,completedAt:row.completed_at||null,_planlyCloudVersion:Number(row.cloud_version||0),_planlyOwnerId:String(row.owner_id||''),_planlyOwnedByMe:String(row.owner_id||'')===String(planlySession?.user?.id||'')}}
function planlyCloudTaskKey(row){return String(row?.owner_id||'')+'|'+String(row?.client_id||'')}
function planlyLocalTaskKey(task){return String(task?._planlyOwnerId||planlySession?.user?.id||'')+'|'+String(task?.id||'')}
function planlyOwnedTasks(){return state.tasks.filter(t=>t._planlyOwnedByMe!==false)}
/* Cloud Sync readiness (formerly core-cloud-readiness 3.3D): the server-side migration boundary is authoritative for legacy and cloud-native accounts. */
function planlyCloudWriteStatusPersisted(status=planlyCloudLocalStatus()){
  return ['cloud-write-test','offline-retry-needed','conflict'].includes(String(status?.state||''));
}
async function loadVerifiedCloudPreview(){
  if(!PLANLY_CLOUD_PREVIEW||!planlySession?.user||!initPlanlySupabase()){planlyCloudBootstrapPending=false;return false;}
  const ownerId=planlySession.user.id;
  const previousStatus=planlyCloudLocalStatus();
  const {data:sync,error:syncError}=await planlySupabase.from('planly_sync_state').select('initial_migration_completed_at,migration_project_count,migration_task_count,migration_digest').eq('owner_id',ownerId).maybeSingle();
  if(syncError)throw syncError;
  // The server-side migration boundary is authoritative. For legacy accounts it is set only
  // after verified migration; for cloud-native accounts it is initialized at signup with a
  // zero-item completed boundary. A persisted device status remains a compatibility fallback
  // for accounts explicitly enabled before the server-side cloud-native marker existed.
  const cloudWritePersisted=planlyCloudWriteStatusPersisted(previousStatus);
  const serverCloudReady=!!sync?.initial_migration_completed_at;
  const ownCloudReady=serverCloudReady||cloudWritePersisted;
  const tasksPromise=planlySupabase.from('planly_tasks').select(PLANLY_TASK_SELECT).is('deleted_at',null);
  const projectsPromise=ownCloudReady?planlySupabase.from('planly_projects').select('client_id,data,cloud_version,deleted_at').eq('owner_id',ownerId).is('deleted_at',null):Promise.resolve({data:[],error:null});
  const prefsPromise=ownCloudReady?planlySupabase.from('planly_preferences').select('default_category,default_duration,auto_complete_parent_subtasks,planning_start,planning_end,cloud_version').eq('owner_id',ownerId).maybeSingle():Promise.resolve({data:null,error:null});
  const [tasksRes,projectsRes,prefsRes]=await Promise.all([tasksPromise,projectsPromise,prefsPromise]);
  for(const r of [tasksRes,projectsRes,prefsRes])if(r.error)throw r.error;
  const visibleTaskRows=tasksRes.data||[];
  const taskRows=ownCloudReady?visibleTaskRows:visibleTaskRows.filter(r=>String(r.owner_id||'')!==String(ownerId)&&r.visibility==='household');
  const projectRows=projectsRes.data||[];
  const tasks=taskRows.map(r=>{if(!r.data||String(r.data.id)!==String(r.client_id))throw new Error('Cloud bootstrap stopped: task identity mismatch.');return planlyTaskFromCloudRow(r)});
  const projects=projectRows.map(r=>{if(!r.data||String(r.data.id)!==String(r.client_id))throw new Error('Cloud bootstrap stopped: project identity mismatch.');return r.data});
  assertUniqueLocalIds(tasks,'Cloud tasks');assertUniqueLocalIds(projects,'Cloud projects');rememberCloudVersions(taskRows,projectRows,prefsRes.data||null);
  state.tasks=tasks;state.projects=projects;
  const p=prefsRes.data;if(p){state.defaultCategory=p.default_category||'Personal';state.defaultDuration=Number(p.default_duration||30);state.autoCompleteParentSubtasks=!!p.auto_complete_parent_subtasks;state.planningStart=p.planning_start||'08:00';state.planningEnd=p.planning_end||'23:00'}
  const pendingBeforeOverlay=readPlanlyPendingWrites();
  // Once the authenticated account has an authoritative completed migration boundary it is
  // writable immediately. Do not require a second browser-local "Enable cloud sync" click.
  planlyCloudReadOnly=!ownCloudReady;
  planlyCloudBootstrapPending=false;
  if(ownCloudReady)applyPlanlyPendingToState();
  persistPlanlyCloudCache();planlyLastReconcileAt=Date.now();
  if(ownCloudReady)setPlanlyCloudLocalStatus({state:'cloud-write-test',taskCount:tasks.filter(t=>t._planlyOwnedByMe!==false).length,projectCount:projects.length,loadedAt:new Date().toISOString(),pendingWrites:readPlanlyPendingWrites().length});
  else setPlanlyCloudLocalStatus({...previousStatus,householdLoadedAt:new Date().toISOString(),householdTaskCount:tasks.length});
  if(ownCloudReady&&readPlanlyPendingWrites().length)queueCloudWrite(()=>replayPlanlyPendingWrites(),'Offline changes synced');
  return true;
}
function planlyGoogleSignInEnabled(){return window.PLANLY_GOOGLE_SIGNIN===true}
async function planlyGoogleSignIn(){
  if(!planlyGoogleSignInEnabled())throw new Error('Google sign-in is not switched on yet.');
  if(!initPlanlySupabase())throw new Error('Planly cloud service is unavailable.');
  const {error}=await planlySupabase.auth.signInWithOAuth({provider:'google',options:{redirectTo:'https://kovacs-x.github.io/planly/v2/',queryParams:{prompt:'select_account'}}});if(error)throw error;
}

async function planlySignUp(creds){
  if(!initPlanlySupabase())throw new Error('Planly cloud service is unavailable.');
  const email=creds?String(creds.email||'').trim():$('#planlyAuthEmail')?.value.trim(),password=creds?String(creds.password||''):$('#planlyAuthPassword')?.value||'';if(!email||password.length<8)throw new Error('Enter your email and a password of at least 8 characters.');
  const {data,error}=await planlySupabase.auth.signUp({email,password,options:{emailRedirectTo:'https://kovacs-x.github.io/planly/v2/'}});if(error)throw error;adoptPlanlySession(data.session||null);showToast(data.session?'Planly account created':'Check your email to confirm your Planly account');render();return data.session||null;
}
async function planlySignOut({everywhere=false}={}){if(!initPlanlySupabase())return;await planlySupabase.auth.signOut({scope:everywhere?'global':'local'});adoptPlanlySession(null,{explicitSignOut:true});render()}
const PLANLY_APP_URL='https://kovacs-x.github.io/planly/v2/';
function planlySignInMethods(u){const ids=Array.isArray(u?.identities)?u.identities:[],providers=new Set([...ids.map(i=>i.provider),...(Array.isArray(u?.app_metadata?.providers)?u.app_metadata.providers:[])]);const out=[];if(providers.has('google')){const g=ids.find(i=>i.provider==='google');out.push({id:'google',label:'Google',detail:String(g?.identity_data?.email||u?.email||'')})}if(providers.has('email'))out.push({id:'email',label:'Email and password',detail:String(u?.email||'')});return out}
async function planlyChangePassword(password,confirm){if(!planlySession?.user||!initPlanlySupabase())throw new Error('Sign in to Planly first.');if(String(password||'').length<8)throw new Error('Use a password of at least 8 characters.');if(password!==confirm)throw new Error('The two passwords do not match.');const {error}=await planlySupabase.auth.updateUser({password});if(error)throw error;return true}
async function planlyChangeEmail(email){if(!planlySession?.user||!initPlanlySupabase())throw new Error('Sign in to Planly first.');email=String(email||'').trim();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new Error('Enter a valid email address.');if(email.toLowerCase()===String(planlySession.user.email||'').toLowerCase())throw new Error('That is already your email address.');const {error}=await planlySupabase.auth.updateUser({email},{emailRedirectTo:PLANLY_APP_URL});if(error)throw error;return true}
async function planlyResetPassword(email){if(!initPlanlySupabase())throw new Error('Planly cloud service is unavailable.');email=String(email||'').trim();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new Error('Enter the email address you sign in with.');const {error}=await planlySupabase.auth.resetPasswordForEmail(email,{redirectTo:PLANLY_APP_URL});if(error)throw error;return true}

function planlyWait(ms){return new Promise(resolve=>setTimeout(resolve,ms))}
async function planlyWithTimeout(promise,ms,label){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(label+' timed out')),ms)})])}finally{clearTimeout(timer)}}

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
    ['suggestion apply',applySuggestion,'stageChangedTasksFromSnapshot'],
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
    {name:'planning surfaces available',ok:[applySuggestion,renderTimeline,toggleTaskPin,endTop3Drag].every(x=>typeof x==='function')},
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


async function startPlanlyAuth(){
  if(!initPlanlySupabase())return;
  try{
    await refreshPlanlySession();
    if(PLANLY_CLOUD_PREVIEW&&planlySession?.user){
      const pending=readPlanlyPendingWrites(),cached=readPlanlyCloudCache();
      if(pending.length&&cached){restorePlanlyCloudCache();applyPlanlyPendingToState();planlyCloudReadOnly=false;setPlanlyCloudLocalStatus({state:'offline-retry-needed',cacheRestored:true,pendingWrites:pending.length});render()}
    }
    await loadPlanlyHousehold();await Promise.all([loadPlanlyCalendarData(),loadVerifiedCloudPreview()])
  }catch(err){planlyCloudBootstrapPending=false;if(PLANLY_CLOUD_PREVIEW){const offline=isOfflineCloudError(err),pending=readPlanlyPendingWrites(),restored=(offline||pending.length>0)&&restorePlanlyCloudCache();if(restored){applyPlanlyPendingToState();planlyCloudReadOnly=pending.length?false:planlyCloudReadOnly}console.warn('Planly cloud bootstrap stopped safely',err);setPlanlyCloudLocalStatus({state:pending.length?'offline-retry-needed':offline?'offline-retry-needed':'error',error:String(err?.message||err),cacheRestored:restored,pendingWrites:pending.length});if(restored)render()}}
  planlySupabase.auth.onAuthStateChange((_event,session)=>{const previousUser=planlySession?.provisional?'':String(planlySession?.user?.id||''),nextUser=String(session?.user?.id||'');adoptPlanlySession(session,{explicitSignOut:_event==='SIGNED_OUT'});if(session&&previousUser&&previousUser===nextUser)return;if(session){const pending=readPlanlyPendingWrites();if(PLANLY_CLOUD_PREVIEW&&pending.length){restorePlanlyCloudCache();applyPlanlyPendingToState();planlyCloudReadOnly=false;setPlanlyCloudLocalStatus({state:'offline-retry-needed',pendingWrites:pending.length});render()}loadPlanlyHousehold().then(()=>Promise.all([loadPlanlyCalendarData(),loadVerifiedCloudPreview()])).then(()=>render()).catch(()=>{});}else{render()}});
}
window.addEventListener('online',()=>{if(PLANLY_CLOUD_PREVIEW&&planlySession?.user)reconcilePlanlyCloud({replay:true,replayToast:'Offline changes synced'}).catch(err=>{if(!isOfflineCloudError(err))console.warn('Planly reconcile failed',err)})});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'&&planlySyncTouchTimer)void flushPlanlyLastSuccessfulSync().catch(()=>{})});
let planlyCalendarSources=[],planlyExternalEvents=[],monthCalendarFilter='all',planlyCalendarDataError='',planlyCalendarLoadPromise=null,planlyCalendarLoadedAt=0,planlyCalendarLoadedUser='';
const PLANLY_CALENDAR_TTL_MS=15000;
const PLANLY_CALENDAR_CACHE_PREFIX='planly-calendar-cache-v1:';
function calendarColour(value){return /^#[0-9a-f]{6}$/i.test(String(value||''))?String(value):'#E78AA7'}
function planlyCalendarSource(sourceId){return planlyCalendarSources.find(s=>String(s.id)===String(sourceId))||null}
function planlyCalendarCacheKey(){return PLANLY_CALENDAR_CACHE_PREFIX+(planlyLastAccountId()||'anonymous')}
function persistPlanlyCalendarCache(){if(!planlySession?.user)return;try{localStorage.setItem(planlyCalendarCacheKey(),JSON.stringify({version:1,ownerId:String(planlySession.user.id),sources:planlyCalendarSources,events:planlyExternalEvents,savedAt:Date.now()}))}catch{}}
function restorePlanlyCalendarCache(){if(!planlySession?.user)return false;try{const d=JSON.parse(localStorage.getItem(planlyCalendarCacheKey())||'null');if(!d||Number(d.version)!==1||String(d.ownerId)!==String(planlySession.user.id)||!Array.isArray(d.sources)||!Array.isArray(d.events))return false;planlyCalendarSources=d.sources;planlyExternalEvents=d.events;return true}catch{return false}}
async function planlyCalendarQueryWithRetry(run){try{return await run()}catch(err){if(!navigator.onLine)throw err;await planlyWait(450);return run()}}
async function loadPlanlyCalendarSources(){if(!planlySession?.user||!initPlanlySupabase()){planlyCalendarSources=[];return []}const {data,error}=await planlyCalendarQueryWithRetry(()=>planlySupabase.from('calendar_sources').select('id,name,source_type,colour,is_read_only,show_today,show_month,show_timeline,enabled,status,last_synced_at,represents').order('created_at',{ascending:true}));if(error)throw error;planlyCalendarSources=data||[];return planlyCalendarSources}
async function loadPlanlyExternalEvents(){if(!planlySession?.user||!initPlanlySupabase()){planlyExternalEvents=[];planlyCalendarDataError='';return []}const {data,error}=await planlyCalendarQueryWithRetry(()=>planlySupabase.from('external_calendar_events').select('id,source_id,external_uid,title,description,location,starts_at,ends_at,is_all_day,start_date,end_date,source_updated_at').order('start_date',{ascending:true}));if(error)throw error;planlyExternalEvents=data||[];return planlyExternalEvents}
async function loadPlanlyCalendarData(force=false){
  if(!planlySession?.user){planlyCalendarSources=[];planlyExternalEvents=[];planlyCalendarDataError='';planlyCalendarLoadedAt=0;planlyCalendarLoadedUser='';return []}
  const userId=String(planlySession.user.id||''),fresh=!force&&planlyCalendarLoadedUser===userId&&planlyCalendarLoadedAt&&Date.now()-planlyCalendarLoadedAt<PLANLY_CALENDAR_TTL_MS;if(fresh)return planlyExternalEvents;if(planlyCalendarLoadPromise)return planlyCalendarLoadPromise;
  planlyCalendarLoadPromise=(async()=>{const hadCache=restorePlanlyCalendarCache(),previousSources=planlyCalendarSources,previousEvents=planlyExternalEvents;
  try{await loadPlanlyCalendarSources();await loadPlanlyExternalEvents();planlyCalendarDataError='';persistPlanlyCalendarCache();return planlyExternalEvents}
  catch(err){if(!planlyCalendarSources.length)planlyCalendarSources=previousSources;if(!planlyExternalEvents.length)planlyExternalEvents=previousEvents;const retained=hadCache||planlyCalendarSources.length||planlyExternalEvents.length;planlyCalendarDataError=retained?'Calendar is temporarily offline. Showing the last saved calendar data.':(err?.message||'Calendar data could not be loaded.');console.warn('Planly calendar refresh failed safely',err);return planlyExternalEvents}finally{planlyCalendarLoadedAt=Date.now();planlyCalendarLoadedUser=userId}})().finally(()=>{planlyCalendarLoadPromise=null});return planlyCalendarLoadPromise
}
function sourceVisibleFor(surface,sourceId){const s=planlyCalendarSource(sourceId);if(!s||s.enabled===false)return false;if(surface==='today')return s.show_today!==false;if(surface==='month')return s.show_month!==false;if(surface==='timeline')return s.show_timeline!==false;return true}
function externalEventOccursOnDate(e,key){const start=String(e.start_date||''),end=String(e.end_date||start);if(!start)return false;if(e.is_all_day)return end>start?key>=start&&key<end:key===start;return key>=start&&key<=end}
function externalEventsForDate(key,surface){return planlyExternalEvents.filter(e=>sourceVisibleFor(surface,e.source_id)&&externalEventOccursOnDate(e,key)).sort((a,b)=>{if(a.is_all_day!==b.is_all_day)return a.is_all_day?-1:1;return String(a.starts_at||'').localeCompare(String(b.starts_at||''))||String(a.title||'').localeCompare(String(b.title||''))})}
function planlyZonedParts(iso){if(!iso)return null;const d=new Date(iso);if(Number.isNaN(d.getTime()))return null;const p={};new Intl.DateTimeFormat('en-GB',{timeZone:PLANLY_TIMEZONE,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(d).forEach(x=>{if(x.type!=='literal')p[x.type]=x.value});const hour=Number(p.hour||0),minute=Number(p.minute||0);return {key:`${p.year}-${p.month}-${p.day}`,time:`${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}`,minutes:hour*60+minute}}
function planlyShiftClass(label){const v=String(label||'').trim().toLowerCase();if(!v)return 'shiftOther';if(/sick|leave|annual|\boff\b|holiday|^al$|^sl$/.test(v))return 'shiftOff';if(/night|^n$|^nd$|^n\d/.test(v))return 'shiftNight';if(/early|^e$|^e\d/.test(v))return 'shiftEarly';if(/late|long|^l$|^ld$|^l\d|12\s*[-–]\s*8/.test(v))return 'shiftLate';return 'shiftOther'}
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
function externalEventHtml(e,key){const source=planlyCalendarSource(e.source_id),colour=calendarColour(source?.colour),sourceName=source?.name||'External calendar';return `<div class="externalEventCard" style="--calendar-source:${colour}"><div class="externalEventStripe"></div><div class="externalEventBody"><strong>${esc(e.title||'Busy')}</strong><span>${esc(externalEventTimeLabel(e,key))}${e.location?' · '+esc(e.location):''}</span><small>${esc(sourceName)} · Read only</small></div><span class="externalReadOnly"><svg class="pIcon" aria-hidden="true"><use href="#pi-plan"/></svg></span></div>`}
function externalEventBlocksTime(e){return externalEventShortLabel(e)!=='DO'}
function externalTimelineInterval(e,key){if(e.is_all_day||!externalEventBlocksTime(e))return null;const s=planlyZonedParts(e.starts_at),end=planlyZonedParts(e.ends_at);if(!s||s.key>key||(end&&end.key<key))return null;const start=s.key<key?0:s.minutes;let finish=end?(end.key>key?1440:end.minutes):Math.min(1440,start+30);if(finish<=start)finish=Math.min(1440,start+30);return {id:e.id,event:e,start,end:finish,colour:calendarColour(planlyCalendarSource(e.source_id)?.colour)}}
/* D10: whose schedule a calendar is ('self' / 'partner'). Owner-private metadata only; never an authorization signal. */
function planlySourceRepresents(sourceId){return planlyCalendarSource(sourceId)?.represents==='partner'?'partner':'self'}
/* Busy time for planning / Intelligence: only calendars that are the user's own. A partner's rota is shown but never counts as the user's busy time (D10). */
function planlyBusyIntervals(key){return externalTimelineIntervals(key).filter(x=>planlySourceRepresents(x.event?.source_id)!=='partner')}
function externalTimelineIntervals(key){return externalEventsForDate(key,'timeline').map(e=>externalTimelineInterval(e,key)).filter(Boolean)}
/* Partner name for wording; falls back to "your partner". */
/* Today's calendar card title: whose schedule the events are (D10 wording; no "Wife"). */
function planlyScheduleTitle(events){const kinds=new Set((events||[]).map(e=>planlySourceRepresents(e.source_id)));if(kinds.size===1&&kinds.has('partner')){const n=planlyPartnerName();return n?n+'’s schedule':'Partner’s schedule'}if(kinds.size===1)return 'Your calendar';return 'Calendars'}
function planlyPartnerName(){const me=String(planlySession?.user?.id||''),m=(Array.isArray(planlyHouseholdMembers)?planlyHouseholdMembers:[]).find(x=>String(x.user_id||'')!==me);return String(m?.display_name||'').trim()}
function planlyPartnerPossessive(){const n=planlyPartnerName();return n?n+'’s':'My partner’s'}
/* Duplicate hint: another of my own sources with the same set of event times. */
function planlyCalendarTwin(s){const sig=id=>planlyExternalEvents.filter(e=>String(e.source_id)===String(id)).map(e=>String(e.starts_at)+'|'+String(e.ends_at)).sort().join(',');const mine=sig(s.id);if(!mine)return null;return planlyCalendarSources.find(o=>String(o.id)!==String(s.id)&&sig(o.id)===mine)||null}
function planlyCalendarSourcesHtml(){
  if(!planlySession?.user)return '<div class="muted settingsHelp">Sign in to Planly to add secure external calendars.</div>';
  const rows=planlyCalendarSources.length?planlyCalendarSources.map(s=>{
    const synced=s.last_synced_at?'Updated '+new Intl.DateTimeFormat(undefined,{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(s.last_synced_at)):'Not imported yet';
    const count=planlyExternalEvents.filter(e=>String(e.source_id)===String(s.id)).length,twin=planlyCalendarTwin(s),whose=planlySourceRepresents(s.id);
    return `<details class="calendarSourceDetails" data-source-id="${esc(s.id)}"><summary><span class="statusDot ${s.enabled?'connected':'offline'}"></span><span class="calendarSourceSummaryText"><strong>${esc(s.name)}</strong><small>${esc((s.source_type==='ical'?'iCalendar · Read only':s.source_type)+' · '+synced+(count?' · '+count+' events':''))}</small></span><span class="calendarSourceChevron">›</span></summary><div class="calendarSourceBody">${twin?`<div class="calendarTwinHint" role="note">Looks like the same calendar as <strong>${esc(twin.name)}</strong>. You may only need one of them.</div>`:''}<label class="calendarWhose"><span>Whose calendar is this?</span><select class="input" data-planly-calendar-represents="${esc(s.id)}"><option value="self"${whose==='self'?' selected':''}>Mine</option><option value="partner"${whose==='partner'?' selected':''}>${esc(planlyPartnerPossessive())}</option></select><small>${whose==='partner'?'Shown on Today and Month, but never counted as your busy time.':'Counts as your busy time when Planly plans your day.'}</small></label><div class="calendarSourceActions"><button type="button" class="secondaryBtn" data-planly-calendar-refresh="${esc(s.id)}">Refresh now</button><label class="calendarColourControl">Colour <input type="color" value="${esc(calendarColour(s.colour))}" data-planly-calendar-colour="${esc(s.id)}" aria-label="Calendar colour"></label></div><label class="settingToggle"><input type="checkbox" data-planly-calendar-toggle="show_today" data-source-id="${esc(s.id)}" ${s.show_today!==false?'checked':''}><span><strong>Show in Today</strong><small>Include these events in the calendar card on Today.</small></span></label><label class="settingToggle"><input type="checkbox" data-planly-calendar-toggle="show_month" data-source-id="${esc(s.id)}" ${s.show_month!==false?'checked':''}><span><strong>Show in Month</strong><small>Show shift labels and date details.</small></span></label><label class="settingToggle"><input type="checkbox" data-planly-calendar-toggle="show_timeline" data-source-id="${esc(s.id)}" ${s.show_timeline!==false?'checked':''}><span><strong>Show in Timeline</strong><small>Draw these events on your day timeline.</small></span></label><button type="button" class="dangerBtn calendarRemoveBtn" data-planly-calendar-remove="${esc(s.id)}" data-event-count="${count}">Remove calendar</button></div></details>`;
  }).join(''):'<div class="muted settingsHelp">No external calendars connected yet.</div>';
  return rows+'<details class="advancedSettings" id="addCalendarDetails"><summary>+ Add calendar</summary><div class="field"><label for="planlyCalendarName">Calendar name</label><input id="planlyCalendarName" class="input" value="" placeholder="e.g. Work rota" autocomplete="off"></div><div class="field"><label for="planlyCalendarUrl">iCalendar subscription link</label><input id="planlyCalendarUrl" class="input" type="url" inputmode="url" placeholder="webcal://… or https://…" autocomplete="off"></div><div class="muted settingsHelp">The private subscription link is sent directly to Planly’s authenticated server function and encrypted in Supabase Vault. It is not saved in localStorage.</div><button id="planlyAddCalendarBtn" class="primary">Add calendar</button></details>';
}
async function updatePlanlyCalendarSource(sourceId,patch){
  if(!planlySession?.user||!initPlanlySupabase())throw new Error('Sign in to Planly first.');
  const allowed={};
  if(Object.prototype.hasOwnProperty.call(patch,'show_today'))allowed.show_today=!!patch.show_today;
  if(Object.prototype.hasOwnProperty.call(patch,'show_month'))allowed.show_month=!!patch.show_month;
  if(Object.prototype.hasOwnProperty.call(patch,'show_timeline'))allowed.show_timeline=!!patch.show_timeline;
  if(Object.prototype.hasOwnProperty.call(patch,'colour'))allowed.colour=calendarColour(patch.colour);
  if(Object.prototype.hasOwnProperty.call(patch,'represents'))allowed.represents=patch.represents==='partner'?'partner':'self';
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
async function addPlanlyCalendarSource(){if(!planlySession?.access_token)throw new Error('Sign in to Planly first.');const name=$('#planlyCalendarName')?.value.trim(),feedUrl=$('#planlyCalendarUrl')?.value.trim();if(!name||!feedUrl)throw new Error('Enter a calendar name and iCalendar subscription link.');const btn=$('#planlyAddCalendarBtn');if(btn){btn.disabled=true;btn.textContent='Connecting…'}try{const c=window.PLANLY_SUPABASE_CONFIG,res=await fetch(c.url+'/functions/v1/calendar-source-create',{method:'POST',headers:{Authorization:'Bearer '+planlySession.access_token,apikey:c.publishableKey,'Content-Type':'application/json'},body:JSON.stringify({name,feedUrl,colour:'#E78AA7',showToday:true,showMonth:true,showTimeline:true})});const body=await res.json().catch(()=>({}));if(!res.ok)throw new Error(body.error||'Calendar could not be connected.');if($('#planlyCalendarName'))$('#planlyCalendarName').value='';if($('#planlyCalendarUrl'))$('#planlyCalendarUrl').value='';await loadPlanlyCalendarData();showToast('Calendar connected securely');render()}finally{if(btn){btn.disabled=false;btn.textContent='Add calendar'}}}
let settingsPage='';
const PLANLY_RELEASE='planly-v2-714a-103';
const PLANLY_SETTINGS_PAGES=[['appearance','Appearance','Theme, task rows, Show on Today'],['planning','Planning','Task defaults and planning hours'],['intelligence','Suggestions','Suggestions, chore balance, night rest'],['calendars','Calendars','Rota feeds and Google Calendar'],['household','Household','Members, names and invites'],['notifications','Notifications','Reminders, morning summary, chores'],['account','Account','Sign-in and cloud sync'],['data','Data & backup','Export, import and diagnostics']];
const PLANLY_SETTINGS_ICONS={appearance:'<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" stroke="none"/>',planning:'<use href="#pi-clock"/>',intelligence:'<use href="#pi-spark"/>',calendars:'<use href="#pi-plan"/>',household:'<use href="#pi-home"/>',account:'<circle cx="12" cy="8.5" r="3.6"/><path d="M5 19.5c1.2-3.4 4-5 7-5s5.8 1.6 7 5"/>',data:'<rect x="4" y="4.5" width="16" height="5" rx="1.5"/><path d="M5.5 9.5v8.5a1.5 1.5 0 0 0 1.5 1.5h10a1.5 1.5 0 0 0 1.5-1.5V9.5M10 13h4"/>',notifications:'<path d="M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 2h-14zM10 20.5a2 2 0 0 0 4 0"/>',logout:'<path d="M14 4.5H7.5A1.5 1.5 0 0 0 6 6v12a1.5 1.5 0 0 0 1.5 1.5H14M11 12h9M17 8.5l3.5 3.5-3.5 3.5"/>'};
function planlySettingsIcon(id){return '<span class="setIcon set-'+id+'" aria-hidden="true"><svg class="pIcon" viewBox="0 0 24 24">'+(PLANLY_SETTINGS_ICONS[id]||'')+'</svg></span>'}
function planlyIsHouseholdOwner(){const me=String(planlySession?.user?.id||'');return !!planlyHousehold?.id&&planlyHouseholdMembers.some(m=>String(m.user_id||'')===me&&m.role==='owner')}
function planlyBudgetResetCardHtml(){if(!planlyIsHouseholdOwner())return '';return '<div class="settingsCard settingsDanger budgetResetCard" data-sp="household"><h3>Reset Household Budget</h3><div class="muted settingsHelp">Clears every payment, income and target in the shared Household Budget, including ones your partner added, and stops them repeating. Your personal Budget, tasks, lists and calendars are not touched. Only the household owner can do this.</div><button type="button" class="dangerBtn" data-budget-reset-open>Reset Household Budget…</button></div>'}
function openBudgetResetSheet(){if(!planlyIsHouseholdOwner())return;document.getElementById('budgetResetSheet')?.remove();const wrap=document.createElement('div');wrap.id='budgetResetSheet';wrap.className='budgetResetSheet';wrap.setAttribute('role','dialog');wrap.setAttribute('aria-modal','true');wrap.setAttribute('aria-labelledby','budgetResetTitle');
wrap.innerHTML='<div class="budgetResetCard"><h2 id="budgetResetTitle">Reset Household Budget?</h2><p>This permanently clears <strong>everything</strong> in the shared Household Budget for both of you: payments, income, targets and repeating items. It can\'t be undone from the app.</p><label class="budgetResetCheck"><input type="checkbox" id="budgetResetCategories"><span>Also remove the categories</span></label><label class="smallLabel muted" for="budgetResetConfirm">Type RESET to confirm</label><input id="budgetResetConfirm" class="input" autocomplete="off" autocapitalize="characters" spellcheck="false"><div class="budgetResetStatus" id="budgetResetStatus" aria-live="polite"></div><div class="budgetResetActions"><button type="button" class="secondaryBtn" data-budget-reset-cancel>Cancel</button><button type="button" class="dangerBtn" data-budget-reset-confirm disabled>Reset</button></div></div>';
document.body.appendChild(wrap);const input=wrap.querySelector('#budgetResetConfirm'),go=wrap.querySelector('[data-budget-reset-confirm]');input.addEventListener('input',()=>{go.disabled=input.value.trim().toUpperCase()!=='RESET'});setTimeout(()=>input.focus(),50)}
function closeBudgetResetSheet(){document.getElementById('budgetResetSheet')?.remove()}
async function resetHouseholdBudget(includeCategories){if(!planlyIsHouseholdOwner())throw new Error('Only the household owner can reset the Household Budget.');if(!navigator.onLine)throw new Error('You are offline. Nothing was reset.');if(!initPlanlySupabase()||!planlySession?.user)throw new Error('Sign in to Planly first.');
const budget=window.PlanlyBudget;if(budget?.getPending?.().some(x=>x.status==='queued'))throw new Error('Budget changes are still syncing. Try again in a moment.');
const {data:scope,error:scopeError}=await planlySupabase.from('planly_budget_scopes').select('id').eq('scope_type','household').eq('household_id',planlyHousehold.id).is('deleted_at',null).maybeSingle();if(scopeError)throw new Error('Could not find the Household Budget. Nothing was reset.');if(!scope?.id)throw new Error('There is no Household Budget yet.');
const {data,error}=await planlySupabase.rpc('planly_reset_household_budget',{p_scope_id:scope.id,p_include_categories:!!includeCategories});if(error)throw new Error(String(error.code)==='42501'?'Only the household owner can reset the Household Budget.':'The Household Budget could not be reset. Nothing was changed.');
try{await budget?.bootstrap?.();await budget?.refreshTodayBills?.({force:true})}catch(e){console.warn('Budget reload after reset',e)}window.dispatchEvent(new CustomEvent('planly-budget-scope-changed',{detail:{scopeType:budget?.getScopeType?.()||'household',ready:true,reset:true}}));return data||{}}
document.addEventListener('click',e=>{if(e.target.closest('[data-budget-reset-open]')){openBudgetResetSheet();return}if(e.target.closest('[data-budget-reset-cancel]')||e.target.id==='budgetResetSheet'){closeBudgetResetSheet();return}const go=e.target.closest('[data-budget-reset-confirm]');if(!go||go.disabled)return;const wrap=document.getElementById('budgetResetSheet'),status=wrap?.querySelector('#budgetResetStatus'),inc=!!wrap?.querySelector('#budgetResetCategories')?.checked;go.disabled=true;go.textContent='Resetting…';if(status)status.textContent='';
resetHouseholdBudget(inc).then(r=>{closeBudgetResetSheet();showToast('Household Budget cleared · '+Number(r.entries||0)+' item'+(Number(r.entries||0)===1?'':'s')+' removed');render()}).catch(err=>{go.disabled=false;go.textContent='Reset';if(status)status.textContent=err.message||String(err)})});
function settingsHubHtml(){const me=String(planlySession?.user?.id||''),name=planlyMyDisplayName(),email=planlySession?.user?.email||'',members=Array.isArray(planlyHouseholdMembers)?planlyHouseholdMembers:[],partner=members.find(m=>String(m.user_id||'')!==me),partnerName=String(partner?.display_name||'').trim(),household=members.length>1?'With '+(partnerName||'your partner'):planlyHousehold?'Just you':'Not set up',intel=state.intelligenceSuggestions===false?'Off':'On',row=id=>{const x=PLANLY_SETTINGS_PAGES.find(v=>v[0]===id);return '<button type="button" class="settingsHubRow" data-settings-page="'+x[0]+'">'+planlySettingsIcon(x[0])+'<span><strong>'+esc(x[1])+'</strong><small>'+esc(x[2])+'</small></span><span class="settingsHubChevron" aria-hidden="true">›</span></button>'};
return '<div class="settingsHub"><button type="button" class="settingsHubIdentity" data-settings-page="household" data-settings-focus-name><span class="personAvatar settingsHubAvatar">'+esc(planlySelfInitial())+'</span><span class="settingsHubIdentityText"><strong>'+esc(name||'Add your name')+'</strong><small>'+esc(email||'Not signed in')+'</small></span><span class="settingsHubChevron" aria-hidden="true">›</span></button>'
+'<div class="settingsHubTiles"><button type="button" class="settingsHubTile" data-settings-page="household">'+planlySettingsIcon('household')+'<small>Household</small><strong>'+esc(household)+'</strong></button><button type="button" class="settingsHubTile" data-settings-page="intelligence">'+planlySettingsIcon('intelligence')+'<small>Suggestions</small><strong>'+intel+'</strong></button></div>'
+'<h3 class="settingsHubLabel">Preferences</h3><div class="settingsHubGroup">'+['appearance','notifications','planning','intelligence','calendars'].map(row).join('')+'</div>'
+'<h3 class="settingsHubLabel">Household & account</h3><div class="settingsHubGroup">'+['household','account','data'].map(row).join('')+'</div>'
+'<div class="settingsAbout">Planly · '+esc(PLANLY_RELEASE.replace('planly-v2-',''))+' · Private planner with account sync and offline support. Your data stays in your account; suggestions are worked out on this device.</div>'
+(planlySession?.user?'<button type="button" class="dangerBtn settingsHubSignOut" id="planlySettingsHubSignOut">'+planlySettingsIcon('logout')+'<span>Log out</span></button>':'')+'</div>'}
// ---- Push notifications (migration 050 + planly-push Edge Function). Ownership is always auth.uid() on the server. ----
const PLANLY_PUSH_PUBLIC_KEY='BK_sXeVJK-GXVrVfvXq3MeFYqh4VasMiB8IZdRPsqW_RkqSwLGkhJpH5VI8iubRFRk6mVkTOZgsOihLXzEaCuFI';
let planlyPushState={checked:false,endpoint:'',prefs:null,busy:false,note:''};
function planlyPushSupported(){return 'serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window}
function planlyPushIsIos(){return /iP(hone|ad|od)/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1)}
function planlyPushStandalone(){return window.matchMedia?.('(display-mode: standalone)')?.matches||navigator.standalone===true}
function planlyPushKeyBytes(s){const pad='='.repeat((4-s.length%4)%4),bin=atob((s+pad).replace(/-/g,'+').replace(/_/g,'/'));return Uint8Array.from(bin,c=>c.charCodeAt(0))}
function planlyPushTimeOptions(sel){let h='';for(let m=7*60;m<=10*60;m+=15){const v=String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');h+='<option value="'+v+'"'+(v===sel?' selected':'')+'>'+v+'</option>'}return h}
function planlyPushPanelHtml(){
  const st=planlyPushState,p=st.prefs,note=st.note?'<p class="muted settingsHelp" role="status">'+esc(st.note)+'</p>':'';
  if(!planlySession?.user)return '<p class="muted settingsHelp">Sign in to use notifications.</p>';
  if(!planlyPushSupported())return '<p class="muted settingsHelp">'+(planlyPushIsIos()&&!planlyPushStandalone()?'On iPhone, notifications only work in the Home Screen app. Open Planly from your Home Screen, then come back here.':'This browser can’t receive notifications.')+'</p>';
  if(Notification.permission==='denied')return '<p class="muted settingsHelp">Notifications are blocked for Planly. Turn them on in your phone’s Settings › Notifications › Planly, then come back here.</p>';
  if(!st.checked)return '<p class="muted settingsHelp">Checking this phone…</p>';
  if(!p)return '<p class="muted settingsHelp">Get a reminder for your timed tasks, a short morning summary of today’s tasks, and an alert when your partner gives you a chore. Each phone has its own switches.</p><button type="button" class="primary" id="planlyPushEnable"'+(st.busy?' disabled':'')+'>Turn on notifications</button>'+note;
  const row=(id,label,help,on)=>'<label class="todayCardToggle"><input type="checkbox" id="'+id+'"'+(on?' checked':'')+(st.busy?' disabled':'')+'><span><strong>'+label+'</strong><small>'+help+'</small></span></label>';
  return row('planlyPushTasks','Task reminders','Your timed tasks, at their reminder time or when they start.',p.notify_tasks)
    +row('planlyPushSummary','Morning summary','A short list of today’s tasks. Chores aren’t included.',p.notify_summary)
    +(p.notify_summary?'<label class="muted smallLabel" for="planlyPushSummaryTime">Summary time</label><select id="planlyPushSummaryTime" class="select"'+(st.busy?' disabled':'')+'>'+planlyPushTimeOptions(p.summary_time||'07:30')+'</select>':'')
    +row('planlyPushChores','New chores','When your partner assigns you a chore.',p.notify_chores)
    +'<p class="muted settingsHelp">Nothing is sent between 10pm and 7am. Chore alerts wait until 7am.</p>'
    +'<div class="planlyPushActions"><button type="button" class="secondaryBtn" id="planlyPushTest"'+(st.busy?' disabled':'')+'>Send a test</button><button type="button" class="secondaryBtn" id="planlyPushDisable"'+(st.busy?' disabled':'')+'>Turn off on this phone</button></div>'+note}
function planlyPushRender(){const el=document.getElementById('planlyPushPanel');if(el){el.innerHTML=planlyPushPanelHtml();planlyPushBind()}}
async function planlyPushCurrent(){const reg=await navigator.serviceWorker.ready;return reg.pushManager.getSubscription()}
async function planlyPushCheck(){
  if(!planlySession?.user||!planlyPushSupported()||Notification.permission==='denied'){planlyPushState.checked=true;planlyPushRender();return}
  try{const sub=await planlyPushCurrent();planlyPushState.endpoint=sub?.endpoint||'';
    if(sub&&Notification.permission==='granted'){const {data,error}=await planlySupabase.rpc('planly_get_push_subscription',{p_endpoint:sub.endpoint});planlyPushState.prefs=error?null:(data||null)}else planlyPushState.prefs=null}
  catch{planlyPushState.prefs=null}
  planlyPushState.checked=true;planlyPushRender()}
async function planlyPushSave(sub,prefs){
  const j=sub.toJSON(),tz=(Intl.DateTimeFormat().resolvedOptions().timeZone)||'Europe/London';
  const {data,error}=await planlySupabase.rpc('planly_save_push_subscription',{p_endpoint:j.endpoint,p_p256dh:j.keys?.p256dh||'',p_auth:j.keys?.auth||'',p_time_zone:tz,p_notify_tasks:prefs.notify_tasks!==false,p_notify_chores:prefs.notify_chores!==false,p_notify_summary:prefs.notify_summary!==false,p_summary_time:prefs.summary_time||'07:30'});
  if(error)throw error;planlyPushState.prefs=data;planlyPushState.endpoint=j.endpoint}
async function planlyPushRun(work){if(planlyPushState.busy)return;planlyPushState.busy=true;planlyPushState.note='';planlyPushRender();try{await work()}catch(err){planlyPushState.note=err?.message||'Something went wrong. Please try again.';if(document.getElementById('planlyPushPrompt'))showToast(planlyPushState.note)}finally{planlyPushState.busy=false;planlyPushRender();if(document.getElementById('planlyPushPrompt'))render()}}
const PLANLY_PUSH_PROMPT_KEY='planly-push-prompt-v1';
function planlyPushPromptPrefs(){try{return JSON.parse(localStorage.getItem(PLANLY_PUSH_PROMPT_KEY)||'{}')||{}}catch{return {}}}
function planlyPushPromptSave(p){try{localStorage.setItem(PLANLY_PUSH_PROMPT_KEY,JSON.stringify({...planlyPushPromptPrefs(),...p}))}catch{}}
// A one-tap card on Today. Shown only while this phone has never decided: signed in, push works here,
// permission still "default", not turned off on purpose, and not snoozed with "Later" in the last 14 days.
function planlyPushPromptHtml(){
  if(!planlySession?.user||!planlyPushSupported()||Notification.permission!=='default')return '';
  if(planlyPushIsIos()&&!planlyPushStandalone())return '';
  const p=planlyPushPromptPrefs();if(p.optedOut||(p.snoozedUntil&&Date.now()<Number(p.snoozedUntil)))return '';
  return '<section class="planlyPushPrompt" id="planlyPushPrompt"><div><strong>Get reminders on this phone?</strong><small>Task reminders, a morning summary and chore alerts. Nothing between 10pm and 7am.</small></div><div class="planlyPushPromptActions"><button type="button" class="primary" data-push-prompt="on">Turn on</button><button type="button" class="planlyPushPromptLater" data-push-prompt="later">Later</button></div></section>'}
document.addEventListener('click',e=>{const b=e.target.closest('[data-push-prompt]');if(!b)return;
  if(b.dataset.pushPrompt==='on'){planlyPushEnable();return}
  planlyPushPromptSave({snoozedUntil:Date.now()+14*86400000});document.getElementById('planlyPushPrompt')?.remove()});
function planlyPushEnable(){
  // The permission prompt must start inside the tap, so it is requested before anything else is awaited.
  const ask=Notification.requestPermission();
  planlyPushRun(async()=>{const perm=await ask;if(perm!=='granted'){planlyPushState.note='Notifications weren’t allowed. You can allow them in your phone’s Settings › Notifications › Planly.';return}
    const reg=await navigator.serviceWorker.ready;let sub=await reg.pushManager.getSubscription();
    if(!sub)sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:planlyPushKeyBytes(PLANLY_PUSH_PUBLIC_KEY)});
    await planlyPushSave(sub,{});showToast('Notifications are on for this phone')})}
function planlyPushUpdate(change){planlyPushRun(async()=>{const sub=await planlyPushCurrent();if(!sub){planlyPushState.prefs=null;return}await planlyPushSave(sub,{...planlyPushState.prefs,...change})})}
function planlyPushBind(){
  const on=(id,ev,fn)=>{const el=document.getElementById(id);if(el)el['on'+ev]=fn};
  on('planlyPushEnable','click',planlyPushEnable);
  on('planlyPushTasks','change',e=>planlyPushUpdate({notify_tasks:e.target.checked}));
  on('planlyPushSummary','change',e=>planlyPushUpdate({notify_summary:e.target.checked}));
  on('planlyPushChores','change',e=>planlyPushUpdate({notify_chores:e.target.checked}));
  on('planlyPushSummaryTime','change',e=>planlyPushUpdate({summary_time:e.target.value}));
  on('planlyPushTest','click',()=>planlyPushRun(async()=>{const {data,error}=await planlySupabase.rpc('planly_queue_test_push');if(error)throw error;planlyPushState.note=data?'Test sent. It should arrive within 5 minutes.':'A test was just sent. Please wait a minute before sending another.'}));
  on('planlyPushDisable','click',()=>planlyPushRun(async()=>{const sub=await planlyPushCurrent();if(sub){const {error}=await planlySupabase.rpc('planly_revoke_push_subscription',{p_endpoint:sub.endpoint});if(error)throw error;await sub.unsubscribe().catch(()=>{})}planlyPushState.prefs=null;planlyPushPromptSave({optedOut:true});showToast('Notifications are off for this phone')}))}
// ---- Suggestions (replaces Plan my day / Plan my week / Day check). Engine: PlanlyIntelligence.suggest (pure). ----
const PLANLY_SUGGEST_DISMISSED_KEY='planly-suggest-dismissed-v1',PLANLY_SUGGEST_FEEDBACK_KEY='planly-suggest-feedback-v1';
function planlySuggestDismissed(){try{const d=JSON.parse(localStorage.getItem(PLANLY_SUGGEST_DISMISSED_KEY)||'{}')||{},cut=addDays(localKey(new Date()),-14),out={};for(const [k,v] of Object.entries(d))if(String(v)>=cut)out[k]=v;return out}catch{return {}}}
// Learning stays on this phone and never stops: it is read from your own completed private tasks (already here) plus what you do
// with suggestions. Recent days count more, so when your routine changes, suggestions follow.
function planlyLearningHistory(){const out=[];for(const t of state.tasks){if(!t||!t.completed||t._planlyOwnedByMe===false||t.visibility==='household')continue;const stamp=t.completedAt?Date.parse(t.completedAt):Number(t.updatedAt||0);if(!Number.isFinite(stamp)||stamp<=0)continue;const d=new Date(stamp);out.push({id:String(t.id),title:String(t.title||''),category:String(t.category||'Personal'),date:String(t.date||''),time:String(t.time||''),durationMinutes:Number(t.durationMinutes||state.defaultDuration||30),deferCount:Number(t.deferCount||t.data?.deferCount||0),recurring:!!(t.recurrence&&t.recurrence!=='none'),doneDay:localKey(d),doneMin:d.getHours()*60+d.getMinutes(),at:stamp})}return out.sort((a,b)=>b.at-a.at).slice(0,600)}
function planlySuggestFeedbackEvents(){try{const d=JSON.parse(localStorage.getItem(PLANLY_SUGGEST_FEEDBACK_KEY)||'[]'),cut=addDays(localKey(new Date()),-60);return Array.isArray(d)?d.filter(e=>e&&String(e.day||'')>=cut):[]}catch{return []}}
function planlyRecordSuggestFeedback(x,act){if(!x?.kind)return;const events=planlySuggestFeedbackEvents();events.push({day:localKey(new Date()),kind:String(x.kind),subject:String(x.subject||''),act});try{localStorage.setItem(PLANLY_SUGGEST_FEEDBACK_KEY,JSON.stringify(events.slice(-300)))}catch{}}
function planlySuggestFeedback(){const kinds={},subjects={},cut=addDays(localKey(new Date()),-14);for(const e of planlySuggestFeedbackEvents()){const k=kinds[e.kind]||(kinds[e.kind]={a:0,d:0});k[e.act==='a'?'a':'d']++;if(e.act==='d'&&e.subject&&String(e.day)>=cut)subjects[e.subject]=(subjects[e.subject]||0)+1}return {kinds,subjects}}
function planlySuggestInput(){const n=new Date(),today=localKey(n),wd=n.getDay(),sat=addDays(today,wd===6?7:6-wd);return {today,tomorrow:addDays(today,1),weekend:sat,nowMinutes:n.getHours()*60+n.getMinutes(),planningStart:String(state.planningStart||'08:00').slice(0,5),planningEnd:String(state.planningEnd||'23:00').slice(0,5),currentUserId:String(planlySession?.user?.id||''),defaultDuration:state.defaultDuration,tasks:state.tasks,busy:planlyBusyIntervals(today).map(x=>({start:x.start,end:x.end})),learning:intelligenceLearningInput(),history:planlyLearningHistory(),feedback:planlySuggestFeedback(),dismissed:Object.keys(planlySuggestDismissed()),nightRestHours:state.intelligenceNightRest===false?0:Number(state.intelligenceNightRestHours||8)}}
function planlySuggestions(){if(state.intelligenceSuggestions===false||!window.PlanlyIntelligence?.suggest)return [];
  try{return window.PlanlyIntelligence.suggest(planlySuggestInput()).suggestions||[]}catch{return []}}
function planlySuggestLineHtml(){const n=planlySuggestions().length;if(!n)return '';return '<button type="button" class="suggestLine" data-suggest-open><span class="suggestLineSpark" aria-hidden="true">✨</span><span class="suggestLineText"><strong>'+n+' suggestion'+(n===1?'':'s')+'</strong> for today</span><span class="suggestLineChevron" aria-hidden="true">›</span></button>'}
function planlySuggestCardHtml(x,i){return '<article class="suggestCard suggest-'+esc(x.kind)+'"><div class="suggestTag">'+esc(x.tag)+'</div><strong>'+esc(x.title)+'</strong><p>'+esc(x.why)+'</p><div class="suggestActions">'+x.actions.map((a,j)=>'<button type="button" class="'+(j?'secondaryBtn':'primary')+'" data-suggest-act="'+i+':'+j+'">'+esc(a.label)+'</button>').join('')+'<button type="button" class="suggestDismiss" data-suggest-dismiss="'+esc(x.key)+'" aria-label="Dismiss suggestion">✕</button></div></article>'}
function renderSuggestSheet(){const el=document.getElementById('suggestSheet');if(!el)return;const list=planlySuggestions();el._suggestions=list;const box=el.querySelector('.suggestList');if(!box)return;
  box.innerHTML=list.length?list.map(planlySuggestCardHtml).join(''):'<div class="suggestEmpty"><strong>Nothing to suggest right now</strong><span>Your day looks good. Planly will suggest something when it spots free time, a slipping task, a habit or a busy day.</span></div>'}
function openSuggestions(){let el=document.getElementById('suggestSheet');if(!el){el=document.createElement('div');el.id='suggestSheet';el.className='intelligenceWhySheet suggestSheet';document.body.appendChild(el);
  el.addEventListener('click',e=>{if(e.target===el||e.target.closest('[data-suggest-close]')){el.classList.remove('open');return}
   const d=e.target.closest('[data-suggest-dismiss]');if(d){const key=d.dataset.suggestDismiss,x=(el._suggestions||[]).find(s=>s.key===key);planlyRecordSuggestFeedback(x,'d');const m=planlySuggestDismissed();m[key]=localKey(new Date());try{localStorage.setItem(PLANLY_SUGGEST_DISMISSED_KEY,JSON.stringify(m))}catch{}renderSuggestSheet();render();return}
   const a=e.target.closest('[data-suggest-act]');if(a){const [i,j]=a.dataset.suggestAct.split(':').map(Number),x=el._suggestions?.[i],act=x?.actions?.[j];if(act&&applySuggestion(act)!==false)planlyRecordSuggestFeedback(x,'a');renderSuggestSheet()}})}
  el.innerHTML='<div class="intelligenceWhyCard suggestPanel"><div class="sectionHead"><div><h2>Suggestions</h2><p class="muted">Based on your tasks, free time and what you usually do.</p></div><button type="button" class="i2CloseButton" data-suggest-close aria-label="Close"><svg class="pIcon i2CloseIcon"><use href="#pi-plus"/></svg></button></div><div class="suggestList"></div></div>';
  renderSuggestSheet();el.classList.add('open')}
// "Make it repeat": a new open task from the last time you did it, repeating at the rhythm Planly saw, starting on the next due day.
function planlyRepeatFromHabit(act){const src=state.tasks.find(x=>String(x.id)===String(act.id));if(!src||src._planlyOwnedByMe===false||src.visibility==='household'){showToast('That task has changed. Suggestions updated.');return false}
  const today=localKey(new Date()),unit=['days','weeks','months'].includes(act.unit)?act.unit:'weeks',interval=clampInt(act.interval,1,4,1),start=src.date||today,base=defaultRecurrenceConfig(unit==='days'?'daily':unit==='months'?'monthly':'weekly',start);
  const cfg={...base,unit,interval,weekdays:unit==='weeks'?[clampInt(act.weekday,0,6,parseKey(start).getDay())]:[],anchorDate:start,endMode:'never'};
  let date=start,guard=0;do{date=nextOccurrence(date,'custom',cfg)}while(date&&date<today&&++guard<500);if(!date){showToast('Could not work out the next date.');return false}
  if(typeof planlyHaptic==='function')planlyHaptic();
  const before=cloneTasks(),now=Date.now(),id=uid(),next={...src,id,seriesId:id,occurrenceNumber:1,date,completed:false,completedBy:null,completedAt:null,pinned:false,deferCount:0,recurrence:'custom',recurrenceConfig:cfg,subtasks:Array.isArray(src.subtasks)?src.subtasks.map(s=>({...s,id:uid(),done:false})):[],googleEventId:'',calendarSync:src.addToCalendar?'pending':'',createdAt:now,updatedAt:now,_planlyOwnedByMe:true};delete next.top3Order;delete next._planlyCloudVersion;
  state.tasks.push(next);const pendingIds=stageChangedTasksFromSnapshot(before);save();render();
  showUndoToast('Repeats '+recurrenceLabel(next).toLowerCase()+' · next '+fmt(date,{weekday:'short',day:'numeric',month:'short'}),()=>{clearPendingTaskIds(pendingIds);restoreTaskSnapshot(before);renderSuggestSheet()},()=>{queuePlanlyPendingReplay('Repeat synced');finishCalendarChange(state.tasks.find(x=>x.id===id))});return true}
function applySuggestion(act){
  if(act.op==='repeat')return planlyRepeatFromHabit(act);
  const ids=act.op==='duration'?(act.ids||[]):[act.id],targets=ids.map(id=>state.tasks.find(x=>String(x.id)===String(id))).filter(t=>t&&t._planlyOwnedByMe!==false&&t.visibility!=='household'&&!t.completed);
  if(!targets.length){showToast('That task has changed. Suggestions updated.');return false}
  if(typeof planlyHaptic==='function')planlyHaptic();
  const before=cloneTasks(),changed=targets.map(t=>t.id),today=localKey(new Date());
  for(const t of targets){if(act.op==='move'){if(t.date&&act.date&&act.date>t.date)t.deferCount=Math.max(0,Number(t.deferCount||t.data?.deferCount||0))+1;t.date=act.date;if(act.time)t.time=act.time}else if(act.op==='duration'){t.durationMinutes=Number(act.minutes)}t.updatedAt=Date.now();if(t.addToCalendar)t.calendarSync='pending'}
  const pendingIds=stageChangedTasksFromSnapshot(before);save();render();
  const msg=act.op==='duration'?'Updated '+targets.length+' task'+(targets.length===1?'':'s')+' to '+durationLabel(Number(act.minutes)):'Moved to '+(act.date===today?'today':fmt(act.date,{weekday:'short',day:'numeric',month:'short'}))+(act.time?' at '+act.time:'');
  showUndoToast(msg,()=>{clearPendingTaskIds(pendingIds);restoreTaskSnapshot(before);changed.forEach(id=>finishCalendarChange(state.tasks.find(x=>x.id===id)));renderSuggestSheet()},()=>{queuePlanlyPendingReplay('Task synced');changed.forEach(id=>finishCalendarChange(state.tasks.find(x=>x.id===id)))});return true}
function openSettingsPage(page,focusName=false){if(page==='notifications'){planlyPushState.checked=false;planlyPushState.note=''}settingsPage=PLANLY_SETTINGS_PAGES.some(x=>x[0]===page)?page:'';state.tab='settings';render();window.scrollTo(0,0);if(focusName)setTimeout(()=>{const f=document.getElementById('planlyDisplayName');f?.scrollIntoView({block:'center'});f?.focus()},60)}
document.addEventListener('click',e=>{const b=e.target.closest('[data-settings-page]');if(!b||!b.closest('#view'))return;openSettingsPage(b.dataset.settingsPage,b.hasAttribute('data-settings-focus-name'))});
document.addEventListener('click',e=>{if(e.target.closest('#planlySettingsHubSignOut')){if(confirm('Log out of Planly on this device?'))planlySignOut().catch(err=>alert(err.message))}});
function settingsView(){
  setHeader('Settings','Planly preferences');
  const googleStatus=googleStatusText(),googleId=getGoogleClientId();
  const pendingCount=state.tasks.filter(t=>t.addToCalendar&&t.date&&t.calendarSync!=='synced').length+getDeleteQueue().length;
  const page=PLANLY_SETTINGS_PAGES.some(x=>x[0]===settingsPage)?settingsPage:'';if(page)setHeader('Settings',PLANLY_SETTINGS_PAGES.find(x=>x[0]===page)[1]);
  $('#view').innerHTML=`<div class="settingsPaged" data-page="${page||'hub'}">${page?`<div class="settingsPageHead"><button type="button" class="settingsBack" data-settings-page="">‹ Settings</button><h2>${esc(PLANLY_SETTINGS_PAGES.find(x=>x[0]===page)[1])}</h2></div>`:settingsHubHtml()}
  <div class="settingsCard" data-sp="notifications"><h3>Notifications</h3><div id="planlyPushPanel">${planlyPushPanelHtml()}</div></div>
  <section class="settingsGroup" data-sp="account household calendars"><div class="settingsGroupHead"><div><span class="calendarGroupLabel">Account</span><h2>Your Planly</h2><p>Identity, cloud state and household calendar sources.</p></div></div>
    <div class="settingsCard" data-sp="account"><h3>Planly Account</h3>${planlyAccountHtml()}</div>
    <div class="settingsCard" data-sp="account"><h3>Cloud Sync</h3>${planlyCloudPreviewHtml()}</div>
    <div class="settingsCard householdSettingsCard" data-sp="household"><h3>Household</h3>${planlyHouseholdHtml()}</div>${planlyBudgetResetCardHtml()}
    <div class="settingsCard" data-sp="calendars"><h3>Calendars</h3>${planlyCalendarDataError?'<div class="empty compactEmpty"><strong>Calendar data error</strong><br><span class="muted">'+esc(planlyCalendarDataError)+'</span></div>':''}${planlyCalendarSourcesHtml()}</div>
  </section>
  <section class="settingsGroup" data-sp="planning"><div class="settingsGroupHead"><div><span class="calendarGroupLabel">Planning</span><h2>Tasks & time</h2><p>Defaults that shape new tasks and your daily timeline.</p></div></div>
    <div class="settingsCard"><h3>Task defaults</h3><label class="muted" for="defaultCat" style="font-size:13px">Default category</label><select id="defaultCat" class="select" style="margin-top:6px"><option>Personal</option><option>Work</option><option>Home</option><option>Health</option><option>Finance</option><option>Errands</option></select><label class="muted smallLabel" for="defaultDuration">Default duration for timed tasks</label><select id="defaultDuration" class="select"><option value="15">15 minutes</option><option value="30">30 minutes</option><option value="45">45 minutes</option><option value="60">1 hour</option><option value="90">1 hour 30 minutes</option><option value="120">2 hours</option></select><label class="settingToggle"><input id="showCompleted" type="checkbox"><span>Show completed tasks</span></label><label class="settingToggle"><input id="autoCompleteParentSubtasks" type="checkbox"><span><strong>Complete task when checklist finishes</strong><small>When the final subtask is checked, complete the parent task automatically. You can still Undo it.</small></span></label></div>
    <div class="settingsCard"><h3>Time planning</h3><div class="row2"><div class="field"><label for="planningStart">Planning day starts</label><input id="planningStart" type="time" step="900" class="input"></div><div class="field"><label for="planningEnd">Planning day ends</label><input id="planningEnd" type="time" step="900" class="input"></div></div><div class="muted settingsHelp">The Timeline uses these hours to calculate free time. Tasks outside the range are still shown.</div></div>
  </section>
  <section class="settingsGroup" data-sp="intelligence"><div class="settingsGroupHead"><div><span class="calendarGroupLabel">Suggested</span><h2>Suggestions</h2><p>Concrete suggestions for today, worked out on this device from your tasks, free time and timings.</p></div></div><div class="settingsCard"><label class="settingToggle"><input id="intelligenceSuggestions" type="checkbox"><span><strong>Suggestions</strong><small>Show suggestions on Today and Plan. Nothing changes until you tap one.</small></span></label><label class="settingToggle"><input id="intelligenceChoreBalance" type="checkbox"><span><strong>Chore balance on Home</strong><small>Show neutral weekly household chore counts and optional share-out suggestions on this device.</small></span></label><label class="settingToggle"><input id="intelligenceNightRest" type="checkbox"><span><strong>Protect rest after night shifts</strong><small>Don’t suggest times during your rest after a long overnight block.</small></span></label><label class="muted smallLabel" for="intelligenceNightRestHours">Protected rest</label><select id="intelligenceNightRestHours" class="select"><option value="6">6 hours</option><option value="7">7 hours</option><option value="8">8 hours</option><option value="9">9 hours</option><option value="10">10 hours</option><option value="11">11 hours</option><option value="12">12 hours</option></select><div class="muted settingsHelp">These settings apply to this device. Suggestions are worked out on this phone; no AI or outside service is used.</div></div></section>\n  <section class="settingsGroup" data-sp="calendars"><div class="settingsGroupHead"><div><span class="calendarGroupLabel">Connections</span><h2>Google Calendar</h2><p>Control how Planly writes timed tasks to your private Planly calendar.</p></div></div>
    <div class="settingsCard"><div class="calendarStatusRow"><span class="statusDot ${googleConnected()?'connected':'offline'}"></span><strong>${esc(googleStatus)}</strong>${pendingCount?`<span class="muted">${pendingCount} pending</span>`:''}</div><div class="muted settingsHelp">Sync destination: your private <strong>Planly</strong> Google calendar. Connect once and Planly stays connected; there is no need to reconnect. Outlook is never modified.</div><label class="settingToggle"><input id="autoCalendarTimed" type="checkbox"><span><strong>Automatically sync timed tasks</strong><small>When a new task has a time, turn on “Add to Google Calendar” automatically.</small></span></label><details class="advancedSettings"><summary>Connection settings</summary><label class="muted smallLabel" for="googleClientId">Google OAuth client ID</label><input id="googleClientId" class="input" value="${esc(googleId)}" placeholder="...apps.googleusercontent.com" autocomplete="off"></details><button id="googleConnectBtn" class="primary">${googleConnected()?'Reconnect Google':'Connect Google Calendar'}</button><button id="googleSyncBtn" class="secondaryBtn">Sync pending items${pendingCount?` (${pendingCount})`:''}</button>${googleConnected()?'<button id="googleDisconnectBtn" class="dangerBtn">Disconnect Google</button>':''}</div>
  </section>
  <section class="settingsGroup" data-sp="appearance data"><div class="settingsGroupHead"><div><span class="calendarGroupLabel">App</span><h2>Appearance & data</h2><p>Device appearance, backups and destructive actions.</p></div></div>
    <div class="settingsCard" data-sp="appearance"><h3>Appearance</h3><label class="muted smallLabel" for="themeSetting">Theme</label><select id="themeSetting" class="select"><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select><label class="muted smallLabel" for="taskRowDensity">Task rows</label><select id="taskRowDensity" class="select"><option value="compact">Compact</option><option value="comfortable">Comfortable</option></select><label class="todayCardToggle hapticsToggle"><input id="hapticsSetting" type="checkbox"><span><strong>Haptic feedback</strong><small>A light tap when you complete or save something. Works on Android and on iPhone with iOS 18 or later.</small></span></label></div>
    <div class="settingsCard todayCardsSetting" data-sp="appearance"><h3>Show on Today</h3><div class="muted settingsHelp">Choose which cards appear on Today on this device. Your tasks always show.</div>${PLANLY_TODAY_CARDS.map(([k,label,help])=>`<label class="todayCardToggle"><input type="checkbox" data-today-card="${k}"><span><strong>${label}</strong>${help?`<small>${help}</small>`:''}</span></label>`).join('')}</div>
    <div class="settingsCard settingsDanger" data-sp="data"><h3>Data</h3><button id="exportBtn" class="primary">Export backup</button><button id="importBtn" class="secondaryBtn">Import backup</button><button id="clearBtn" class="dangerBtn">Clear all data</button></div>
    <div class="settingsCard" data-sp="data"><h3>Diagnostics</h3><div class="muted settingsHelp">Freeze diagnostics stay on this device until you copy or clear them.</div><button id="planlyCopyFreezeDiagnosticsBtn" class="secondaryBtn">Copy freeze report</button><button id="planlyClearFreezeDiagnosticsBtn" class="secondaryBtn">Clear freeze diagnostics</button><textarea id="planlyFreezeDiagnosticsFallback" class="textarea" readonly hidden aria-label="Freeze diagnostics report" style="min-height:180px;margin-top:10px"></textarea></div>
    ${isStandalone()?'':'<div class="settingsCard" data-sp="data"><h3>Install on iPhone</h3><div class="muted settingsHelp">Open Planly in Safari, tap Share, then Add to Home Screen.</div></div>'}
  </section>
  </div>`
  if($('#planlySignInForm'))$('#planlySignInForm').onsubmit=e=>{e.preventDefault();planlySignIn().then(()=>loadPlanlyCalendarData()).catch(err=>alert(err.message))};
  if($('#planlyAddCalendarBtn'))$('#planlyAddCalendarBtn').onclick=()=>addPlanlyCalendarSource().catch(err=>{alert(err.message);render()});
  $$('[data-planly-calendar-refresh]').forEach(btn=>btn.onclick=()=>refreshPlanlyCalendarSource(btn.dataset.planlyCalendarRefresh,btn).catch(err=>alert(err.message)));
  $$('[data-planly-calendar-toggle]').forEach(input=>input.onchange=()=>updatePlanlyCalendarSource(input.dataset.sourceId,{[input.dataset.planlyCalendarToggle]:input.checked}).catch(err=>{alert(err.message);render()}));
  $$('[data-planly-calendar-represents]').forEach(sel=>sel.onchange=()=>updatePlanlyCalendarSource(sel.dataset.planlyCalendarRepresents,{represents:sel.value}).then(()=>render()).catch(err=>{alert(err.message);render()}));
  $$('[data-planly-calendar-colour]').forEach(input=>input.onchange=()=>updatePlanlyCalendarSource(input.dataset.planlyCalendarColour,{colour:input.value}).catch(err=>{alert(err.message);render()}));
  $$('[data-planly-calendar-remove]').forEach(btn=>btn.onclick=()=>removePlanlyCalendarSource(btn.dataset.planlyCalendarRemove,Number(btn.dataset.eventCount||0)).catch(err=>alert(err.message)));
  if($('#planlySignUpBtn'))$('#planlySignUpBtn').onclick=()=>{const email=$('#planlyAuthEmail')?.value||'';const host=$('#planlySignUpBtn').parentElement;host.innerHTML='<form id="planlySignUpForm" autocomplete="on"><div class="muted settingsHelp">Create a Planly account. Apple can suggest and save a strong password here.</div><div class="field"><label for="planlyAuthEmail">Email</label><input id="planlyAuthEmail" name="username" class="input" type="email" inputmode="email" autocapitalize="none" spellcheck="false" autocomplete="username" placeholder="you@example.com" value="'+esc(email)+'"></div><div class="field"><label for="planlyAuthPassword">New password</label><input id="planlyAuthPassword" name="new-password" class="input" type="password" autocomplete="new-password" minlength="8" placeholder="At least 8 characters"></div><button class="primary" type="submit">Create account</button><button id="planlyBackToSignInBtn" class="secondaryBtn" type="button">Back to sign in</button></form>';$('#planlySignUpForm').onsubmit=e=>{e.preventDefault();planlySignUp().catch(err=>alert(err.message))};$('#planlyBackToSignInBtn').onclick=()=>render()};
  if($('#planlyAccountGoogleBtn'))$('#planlyAccountGoogleBtn').onclick=()=>planlyGoogleSignIn().catch(err=>alert(err.message));
  if($('#planlySignOutBtn'))$('#planlySignOutBtn').onclick=()=>planlySignOut().catch(err=>alert(err.message));
  if($('#planlySignOutAllBtn'))$('#planlySignOutAllBtn').onclick=()=>{if(confirm('Sign out of Planly on all your devices? You will need to sign in again on each one.'))planlySignOut({everywhere:true}).catch(err=>alert(err.message))};
  const accountSay=(id,text,ok)=>{const m=document.getElementById(id);if(!m)return;m.hidden=!text;m.textContent=text||'';m.classList.toggle('ok',!!ok)};
  if($('#planlyChangePasswordForm'))$('#planlyChangePasswordForm').onsubmit=e=>{e.preventDefault();const b=e.target.querySelector('button[type=submit]');b.disabled=true;accountSay('planlyPasswordMsg','');planlyChangePassword($('#planlyNewPassword').value,$('#planlyNewPassword2').value).then(()=>{$('#planlyNewPassword').value='';$('#planlyNewPassword2').value='';accountSay('planlyPasswordMsg','Password saved.',true)}).catch(err=>accountSay('planlyPasswordMsg',err?.message||'Password could not be saved.')).finally(()=>{b.disabled=false})};
  if($('#planlyChangeEmailForm'))$('#planlyChangeEmailForm').onsubmit=e=>{e.preventDefault();const b=e.target.querySelector('button[type=submit]');b.disabled=true;accountSay('planlyEmailMsg','');planlyChangeEmail($('#planlyNewEmail').value).then(()=>accountSay('planlyEmailMsg','Check your inbox: we sent a confirmation link. Your email changes once you confirm it.',true)).catch(err=>accountSay('planlyEmailMsg',err?.message||'Email could not be changed.')).finally(()=>{b.disabled=false})};
  if($('#planlyCreateHouseholdBtn'))$('#planlyCreateHouseholdBtn').onclick=()=>createPlanlyHousehold().catch(err=>alert(err.message));
  if($('#planlyCreateHouseholdInviteBtn'))$('#planlyCreateHouseholdInviteBtn').onclick=()=>createPlanlyHouseholdInvite().catch(err=>alert(err.message));
  if($('#planlyAcceptHouseholdBtn'))$('#planlyAcceptHouseholdBtn').onclick=()=>acceptPlanlyHouseholdInvite().catch(err=>alert(err.message));
  if($('#planlyLeaveHouseholdBtn'))$('#planlyLeaveHouseholdBtn').onclick=()=>leavePlanlyHousehold().catch(err=>alert(err.message));
  if($('#planlyTransferHouseholdBtn'))$('#planlyTransferHouseholdBtn').onclick=()=>transferPlanlyHouseholdOwnership().catch(err=>alert(err.message));
  if($('#planlyDeleteHouseholdBtn'))$('#planlyDeleteHouseholdBtn').onclick=()=>deletePlanlyHousehold().catch(err=>alert(err.message));
  if($('#planlyAcceptHouseholdLinkBtn'))$('#planlyAcceptHouseholdLinkBtn').onclick=()=>acceptPlanlyHouseholdInvite().catch(err=>alert(err.message));
  if($('#planlyDismissHouseholdInviteBtn'))$('#planlyDismissHouseholdInviteBtn').onclick=clearPendingPlanlyHouseholdInvite;
  if($('#planlyShareHouseholdInviteBtn'))$('#planlyShareHouseholdInviteBtn').onclick=()=>sharePlanlyHouseholdInvite().catch(err=>alert(err.message));
  if($('#planlyCopyHouseholdInviteBtn'))$('#planlyCopyHouseholdInviteBtn').onclick=()=>copyPlanlyHouseholdInvite().catch(err=>alert(err.message));
  if($('#planlyDiscardHouseholdInviteBtn'))$('#planlyDiscardHouseholdInviteBtn').onclick=discardPlanlyHouseholdInvite;
  $$('[data-planly-household-revoke]').forEach(btn=>btn.onclick=()=>revokePlanlyHouseholdInvite(btn.dataset.planlyHouseholdRevoke).catch(err=>alert(err.message)));
  if($('#planlyHouseholdManage'))$('#planlyHouseholdManage').ontoggle=e=>setPlanlyHouseholdManageOpen(e.currentTarget.open);
  $('#themeSetting').value=state.theme;
  if($('#taskRowDensity'))$('#taskRowDensity').value=state.taskRowDensity;
  if($('#hapticsSetting'))$('#hapticsSetting').checked=state.haptics!==false;
  $('#defaultCat').value=state.defaultCategory;
  $('#defaultDuration').value=String(state.defaultDuration||30);
  $('#showCompleted').checked=state.showCompleted;
  $('#autoCalendarTimed').checked=state.autoCalendarTimed;if($('#intelligenceSuggestions'))$('#intelligenceSuggestions').checked=state.intelligenceSuggestions!==false;if($('#intelligenceChoreBalance'))$('#intelligenceChoreBalance').checked=!!state.intelligenceChoreBalance;if($('#intelligenceNightRest'))$('#intelligenceNightRest').checked=state.intelligenceNightRest!==false;if($('#intelligenceNightRestHours'))$('#intelligenceNightRestHours').value=String(state.intelligenceNightRestHours||8);
  $('#autoCompleteParentSubtasks').checked=state.autoCompleteParentSubtasks;
  $('#planningStart').value=state.planningStart||'08:00';
  $('#planningEnd').value=state.planningEnd||'23:00';
  $('#themeSetting').onchange=e=>{state.theme=e.target.value;save();applyTheme()};
  document.querySelectorAll('[data-today-card]').forEach(c=>{c.checked=todayCardOn(c.dataset.todayCard);c.onchange=()=>{const hidden=new Set(planlyTodayHiddenList());if(c.checked)hidden.delete(c.dataset.todayCard);else hidden.add(c.dataset.todayCard);state.todayHidden=[...hidden];persistPlanlyDeviceSettings();save()}});
  if(document.getElementById('planlyPushPanel')){planlyPushBind();if(!planlyPushState.checked)planlyPushCheck()}
  if($('#taskRowDensity'))$('#taskRowDensity').onchange=e=>{state.taskRowDensity=e.target.value==='comfortable'?'comfortable':'compact';save();render()};
  if($('#hapticsSetting'))$('#hapticsSetting').onchange=e=>{state.haptics=e.target.checked;save();planlySyncHaptics();if(state.haptics)planlyHaptic()};
  $('#defaultCat').onchange=e=>{state.defaultCategory=e.target.value;stagePreferenceMutation();save();queuePlanlyPendingReplay('Preferences synced')};
  $('#defaultDuration').onchange=e=>{state.defaultDuration=Number(e.target.value||30);stagePreferenceMutation();save();queuePlanlyPendingReplay('Preferences synced')};
  $('#showCompleted').onchange=e=>{state.showCompleted=e.target.checked;save()};
  $('#autoCalendarTimed').onchange=e=>{state.autoCalendarTimed=e.target.checked;save()};if($('#intelligenceSuggestions'))$('#intelligenceSuggestions').onchange=e=>{state.intelligenceSuggestions=e.target.checked;save()};if($('#intelligenceChoreBalance'))$('#intelligenceChoreBalance').onchange=e=>{state.intelligenceChoreBalance=e.target.checked;save();render()};if($('#intelligenceNightRest'))$('#intelligenceNightRest').onchange=e=>{state.intelligenceNightRest=e.target.checked;save()};if($('#intelligenceNightRestHours'))$('#intelligenceNightRestHours').onchange=e=>{state.intelligenceNightRestHours=Number(e.target.value||8);save()};
  $('#autoCompleteParentSubtasks').onchange=e=>{state.autoCompleteParentSubtasks=e.target.checked;stagePreferenceMutation();save();queuePlanlyPendingReplay('Preferences synced')};
  const savePlanningHours=()=>{const start=$('#planningStart').value||'08:00',end=$('#planningEnd').value||'23:00';if(timeToMinutes(end)<=timeToMinutes(start)){alert('Planning day end must be after the start time.');$('#planningStart').value=state.planningStart;$('#planningEnd').value=state.planningEnd;return}state.planningStart=start;state.planningEnd=end;stagePreferenceMutation();save();queuePlanlyPendingReplay('Preferences synced')};
  $('#planningStart').onchange=savePlanningHours;$('#planningEnd').onchange=savePlanningHours;
  $('#googleClientId').onchange=e=>setGoogleClientId(e.target.value);
  $('#googleConnectBtn').onclick=async()=>{setGoogleClientId($('#googleClientId').value);try{await connectGoogle();render()}catch(err){alert(err.message)}};
  $('#googleSyncBtn').onclick=async()=>{setGoogleClientId($('#googleClientId').value);try{if(!googleConnected())await requestGoogleAccess('consent');await syncPendingGoogle();showToast('Google Calendar sync complete');render()}catch(err){alert(err.message)}};
  if($('#googleDisconnectBtn'))$('#googleDisconnectBtn').onclick=()=>{disconnectGoogle();render()};
  if($('#planlyCopyFreezeDiagnosticsBtn'))$('#planlyCopyFreezeDiagnosticsBtn').onclick=async()=>{const d=window.PlanlySafariDiagnostics,btn=$('#planlyCopyFreezeDiagnosticsBtn'),fallback=$('#planlyFreezeDiagnosticsFallback');if(!d){showToast('Diagnostics unavailable');return}const text=await d.report();let copied=false;try{await navigator.clipboard.writeText(text);copied=true}catch{}if(copied){btn.textContent='Copied';fallback.hidden=true;showToast('Freeze report copied')}else{fallback.value=text;fallback.hidden=false;fallback.focus();fallback.select();btn.textContent='Select report below';showToast('Copy blocked · select the report below')}setTimeout(()=>{if(btn)btn.textContent='Copy freeze report'},1800)};
  if($('#planlyClearFreezeDiagnosticsBtn'))$('#planlyClearFreezeDiagnosticsBtn').onclick=()=>{window.PlanlySafariDiagnostics?.clear();const fallback=$('#planlyFreezeDiagnosticsFallback');if(fallback){fallback.value='';fallback.hidden=true}showToast('Freeze diagnostics cleared')};
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

function render(){planlySyncHaptics(); $$('.nav button').forEach(b=>b.classList.toggle('active',b.dataset.tab===state.tab)); planlyRenderProfileButton(); $('#addBtn').style.display=state.tab==='settings'?'none':'block'; if(state.tab==='today')todayView();else if(state.tab==='upcoming')upcomingView();else if(state.tab==='month')monthView();else if(state.tab==='inbox')inboxView();else settingsView(); const view=$('#view');if(view&&!window.matchMedia('(prefers-reduced-motion: reduce)').matches){view.classList.remove('viewEntering');void view.offsetWidth;view.classList.add('viewEntering')} refreshProjectsIfOpen(); refreshTimelineIfOpen(); refreshTaskActionsIfOpen() }

function toggleTaskSubtask(t,subtaskId){
  if(!t||!Array.isArray(t.subtasks))return;
  const subtask=t.subtasks.find(s=>String(s.id)===String(subtaskId));
  if(!subtask)return;
  subtask.done=!subtask.done;
  if(subtask.done)planlyHaptic();
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
  else{expandedTaskChecklists.clear();expandedTaskChecklists.add(t.id)}
  render();
  /* A checklist opened near the bottom must not land behind the docked tab bar (scroll-padding keeps it clear). */
  if(expandedTaskChecklists.has(t.id))document.querySelector('[data-inline-checklist="'+CSS.escape(String(t.id))+'"]')?.scrollIntoView({block:'nearest',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
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

function taskCanEdit(t){return !!t&&t._planlyOwnedByMe!==false}
function handleViewClick(e){
  const calendarSeries=e.target.closest('[data-calendar-series]');if(calendarSeries){const source=state.tasks.find(x=>x.id===calendarSeries.dataset.calendarSeries);if(source)openSheet(source);return}
  const dashboardOpen=e.target.closest('[data-dashboard-open]');if(dashboardOpen){const t=state.tasks.find(x=>String(x.id)===String(dashboardOpen.dataset.dashboardOpen));if(t)openTaskActions(t);return}
  const billPaid=e.target.closest('[data-budget-bill-paid]');if(billPaid){void markPlanlyBudgetBillPaid(billPaid.dataset.budgetBillPaid);return}
  const dashboardProject=e.target.closest('[data-dashboard-project]');if(dashboardProject){openProjects(dashboardProject.dataset.dashboardProject);return}
  const timelineBtn=e.target.closest('#timelineBtn');if(timelineBtn){openTimeline(localKey(new Date()));return}
  if(e.target.closest('[data-suggest-open]')){openSuggestions();return}
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

  const candidates=state.tasks.filter(x=>String(x.id)===String(taskEl.dataset.id)),ownerKey=String(taskEl.dataset.owner||'');
  const t=(ownerKey?candidates.find(x=>String(x._planlyOwnerId||planlySession?.user?.id||'')===ownerKey):null)||candidates.find(x=>x._planlyOwnedByMe!==false)||candidates[0];
  if(!t)return;

  const action=actionEl.dataset.action;
  if(action!=='pin'&&action!=='expand-checklist'&&action!=='toggle-subtask')closeOpenTaskSwipes();
  if(action==='toggle-subtask'&&!taskCanEdit(t)&&typeof planlyHouseholdCompletionEligible==='function'&&planlyHouseholdCompletionEligible(t)){toggleHouseholdTaskSubtask(t,actionEl.dataset.subtaskId);return}
  if(!taskCanEdit(t)&&['toggle','pin','today','tomorrow','delete','toggle-subtask','checklist','edit','retry-sync'].includes(action)){showToast('Shared task · only its creator can edit it');return}
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
// Smart quick add: while you type a new task, Planly reads its date, time, duration, repeat, priority and #category,
// fills the form and shows what it understood. Tap a part to ignore it. The title is tidied when you save.
let planlyQuickAdd={base:null,touched:new Set(),ignore:new Set(),timer:0,parsed:null};
function planlyQuickAddActive(){return !$('#taskId')?.value&&!$('#taskForm')?.classList.contains('taskReadOnlySheet')&&!!window.PlanlyIntelligence?.parseQuick}
function planlyQuickAddReset(){clearTimeout(planlyQuickAdd.timer);planlyQuickAdd={base:null,touched:new Set(),ignore:new Set(),timer:0,parsed:null};planlyRenderQuickUnderstood(null)}
// Any length works (e.g. 20m or 1h 15m): a missing length is added to the list instead of falling back to 30m.
function planlySetDuration(minutes){const sel=$('#taskDuration');if(!sel)return;const v=String(clampInt(minutes,5,720,30));for(const o of [...sel.options])if(o.dataset.custom&&o.value!==v)o.remove();if(![...sel.options].some(o=>o.value===v)){const o=document.createElement('option');o.value=v;o.textContent=durationLabel(Number(v));o.dataset.custom='1';sel.insertBefore(o,[...sel.options].find(x=>Number(x.value)>Number(v))||null)}sel.value=v}
// For a task you've had before (same title): its usual category and how long it really takes you.
function planlyQuickLearned(title){const api=window.PlanlyIntelligence,key=api?.titleKey?api.titleKey(title):'';if(!key)return {};const same=state.tasks.filter(t=>t&&t._planlyOwnedByMe!==false&&t.visibility!=='household'&&api.titleKey(t.title)===key),out={};
  if(same.length>=2){const c={};for(const t of same){const k=String(t.category||'Personal');c[k]=(c[k]||0)+1}const top=Object.entries(c).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]))[0];if(top&&top[1]>=2&&top[1]/same.length>=0.6)out.category=top[0]}
  try{const g=api.learn({today:localKey(new Date()),history:planlyLearningHistory()}).byKey[key];if(g&&g.actualN>=3)out.minutes=g.actual}catch{}
  if(!out.minutes&&same.length>=2){const d={};for(const t of same){const m=Number(t.durationMinutes||0);if(m>=5)d[m]=(d[m]||0)+1}const top=Object.entries(d).sort((a,b)=>b[1]-a[1]||Number(a[0])-Number(b[0]))[0];if(top&&top[1]>=2)out.minutes=Number(top[0])}
  return out}
function planlyQuickParse(){const q=planlyQuickAdd,title=$('#taskTitle').value,p=window.PlanlyIntelligence.parseQuick(title,{today:localKey(new Date()),planningStart:String(state.planningStart||'08:00').slice(0,5),ignore:[...q.ignore],categories:[...$('#taskCategory').options].map(o=>o.value)}),learned=planlyQuickLearned(p.title||title);
  if(!p.category&&learned.category&&!q.ignore.has('category')){p.category=learned.category;p.parts.push({kind:'category',label:learned.category,learned:true})}
  if(!p.minutes&&learned.minutes&&!q.ignore.has('duration')){p.minutes=learned.minutes;p.parts.push({kind:'duration',label:durationLabel(learned.minutes),learned:true})}
  return p}
function planlyQuickRecurrence(x,date){const type=x.type==='weekdays'?'weekdays':x.unit==='days'?'daily':x.unit==='months'?'monthly':'weekly',cfg=defaultRecurrenceConfig(type,date);cfg.unit=x.unit;cfg.interval=clampInt(x.interval,1,99,1);
  if(x.unit==='weeks')cfg.weekdays=Array.isArray(x.weekdays)&&x.weekdays.length?x.weekdays.slice():[parseKey(date).getDay()];
  if(x.unit==='months'){cfg.monthlyMode=x.monthlyMode==='ordinal'?'ordinal':'day';if(cfg.monthlyMode==='ordinal'){cfg.ordinal=x.ordinal;cfg.weekday=x.weekday}else cfg.monthDay=clampInt(x.monthDay||parseKey(date).getDate(),1,31,1)}
  cfg.anchorDate=date;return {recurrence:['daily','weekly','weekdays','monthly'].includes(x.type)?x.type:'custom',recurrenceConfig:cfg,date}}
// Fill each field from what was typed, or put back what it was before; a field you change yourself is left alone.
// (Planly sets these fields without firing input/change events, so any such event on them is the user's own change.)
function planlyQuickApply(p){const q=planlyQuickAdd,b=q.base,t=q.touched,today=localKey(new Date());
  if(!t.has('date')){$('#taskDate').value=p.date||b.date;refreshQuickDateSelection()}
  if(!t.has('time'))$('#taskTime').value=p.time||b.time;
  if(!t.has('duration'))planlySetDuration(p.minutes||b.duration);
  if(!t.has('priority'))$('#taskPriority').value=p.priority||b.priority;
  if(!t.has('category'))$('#taskCategory').value=p.category||b.category;
  if(!t.has('calendar'))$('#taskCalendar').checked=b.calendar||!!(p.time&&state.autoCalendarTimed);
  if(!t.has('repeat')){const date=$('#taskDate').value||today;writeRecurrenceForm(p.repeat?planlyQuickRecurrence(p.repeat,date):b.repeat,date)}}
function planlyRenderQuickUnderstood(p){const box=$('#quickUnderstood'),hint=$('#quickAddHint');if(!box)return;const parts=p?.parts||[];box.hidden=!parts.length;if(hint)hint.hidden=!!parts.length;if(!parts.length){box.innerHTML='';return}
  const rd=readRecurrenceForm(),repeatLabel=p.repeat&&rd.recurrence!=='none'?recurrenceLabel({recurrence:rd.recurrence,recurrenceConfig:rd.recurrenceConfig,date:$('#taskDate').value}):'';
  box.innerHTML='<span class="quickUnderstoodLabel">Understood</span>'+parts.map(x=>{const label=x.kind==='repeat'&&repeatLabel?repeatLabel:x.label;return '<button type="button" class="quickChip'+(x.learned?' learned':'')+'" data-quick-ignore="'+esc(x.kind)+'" aria-label="Ignore '+esc(label)+'"><span>'+esc(label)+'</span>'+(x.learned?'<small>usual</small>':'')+'<b aria-hidden="true">✕</b></button>'}).join('')}
function planlyQuickRun(){if(!planlyQuickAddActive())return null;const q=planlyQuickAdd;
  if(!q.base){const rd=readRecurrenceForm();q.base={date:$('#taskDate').value,time:$('#taskTime').value,duration:Number($('#taskDuration').value||state.defaultDuration||30),priority:$('#taskPriority').value,category:$('#taskCategory').value,calendar:$('#taskCalendar').checked,repeat:rd.recurrence==='none'?'none':{recurrence:rd.recurrence,recurrenceConfig:rd.recurrenceConfig,date:$('#taskDate').value}}}
  let p;try{p=planlyQuickParse()}catch{return null}q.parsed=p;planlyQuickApply(p);planlyRenderQuickUnderstood(p);return p}
// Before saving: the latest reading, and the title without the date/time words (kept as typed if nothing else is left).
function planlyQuickFinal(){if(!planlyQuickAddActive()||!planlyQuickAdd.base)return;clearTimeout(planlyQuickAdd.timer);const p=planlyQuickRun();if(p&&p.title)$('#taskTitle').value=p.title}
const PLANLY_QUICK_FIELDS={taskDate:'date',taskTime:'time',taskDuration:'duration',taskPriority:'priority',taskCategory:'category',taskCalendar:'calendar'};
document.addEventListener('input',e=>{if(e.target?.id==='taskTitle'&&planlyQuickAddActive()){clearTimeout(planlyQuickAdd.timer);planlyQuickAdd.timer=setTimeout(planlyQuickRun,300)}});
for(const type of ['input','change'])document.addEventListener(type,e=>{if(!e.target?.closest?.('#taskForm'))return;const id=e.target.id||'',kind=PLANLY_QUICK_FIELDS[id]||(id==='taskRepeat'||id.startsWith('repeat')||e.target.closest('#repeatAdvanced')?'repeat':'');if(kind)planlyQuickAdd.touched.add(kind)},true);
document.addEventListener('click',e=>{if(e.target.closest?.('#quickDates .chip'))planlyQuickAdd.touched.add('date');const chip=e.target.closest?.('[data-quick-ignore]');if(chip){planlyQuickAdd.ignore.add(chip.dataset.quickIgnore);planlyQuickRun();$('#taskTitle')?.focus()}},true);

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
  /* Only one chip looks selected: when two mean the same date (Sunday: Today = This weekend), keep the one tapped, else the first. */
  const chips=$$('#quickDates .chip'),hits=chips.filter(c=>map[c.dataset.q]===value),pick=hits.find(c=>c.dataset.q===planlyQuickDatePick)||hits[0];
  chips.forEach(c=>{c.classList.toggle('active',c===pick);c.setAttribute('aria-pressed',c===pick?'true':'false')});
}
let planlyQuickDatePick='';
function setQuick(q){
  planlyQuickDatePick=q;
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
  const visibility=$('#taskVisibility');if(visibility&&source._planlyOwnedByMe===false){visibility.value='private'}
  $('#deleteTask').style.display='none';
  $('#duplicateTask').style.display='none';
  $('#formActions').classList.remove('editing');
  editingSubtasks=editingSubtasks.map(s=>({...s,id:uid(),done:false}));
  renderSubtaskEditor();
  showToast('Duplicate ready — edit if needed, then save');
}

function openSheet(task,projectId=''){
  const readOnly=!!(task&&task._planlyOwnedByMe===false);
  if($('#taskActionWrap')?.classList.contains('open'))closeTaskActions();
  resetSheetPosition();
  lockSheetBackground();
  $('#sheetWrap').classList.add('open');
  $('#sheetWrap').setAttribute('aria-hidden','false');
  $('#taskId').value=task?.id||'';
  $('#taskTitle').value=task?.title||'';
  $('#taskDate').value=task?.date??defaultDateForNewTask();
  $('#taskTime').value=task?.time||'';
  planlySetDuration(task?.durationMinutes||state.defaultDuration||30);
  $('#taskPriority').value=task?.priority||'normal';
  $('#taskCategory').value=task?.category||state.defaultCategory;
  refreshProjectSelect(task?.projectId||projectId||'');
  writeRecurrenceForm(task||'none',task?.date||$('#taskDate').value);
  $('#taskReminder').value=task?.reminder||'none';
  $('#taskNotes').value=task?.notes||'';
  editingSubtasks=Array.isArray(task?.subtasks)?task.subtasks.map(s=>({id:s.id||uid(),title:s.title||'',done:!!s.done})):[];
  renderSubtaskEditor();
  $('#taskCalendar').checked=task?!!task.addToCalendar:false;
  const share=$('#taskVisibility'),shareHelp=$('#taskVisibilityHelp'),canShare=!!(planlySession?.user&&planlyHousehold?.id);if(share){share.value=task?.visibility==='household'?'household':'private';share.disabled=!canShare&&share.value!=='household';if(shareHelp)shareHelp.textContent=canShare?'Household tasks are visible to current household members. You remain the owner and only you can edit or delete them.':'Join or create a Household in Settings before sharing tasks.'}
  $('#deleteTask').style.display=task?'block':'none';
  $('#duplicateTask').style.display=task?'block':'none';
  $('#formActions').classList.toggle('editing',!!task);
  const form=$('#taskForm');if(form){form.classList.toggle('taskReadOnlySheet',readOnly);form.querySelectorAll('input,select,textarea,button').forEach(el=>{if(el.closest('.sheetDragZone'))return;el.disabled=readOnly});const actions=$('#formActions');if(actions)actions.hidden=readOnly;const duplicate=$('#duplicateTask');if(duplicate)duplicate.hidden=readOnly}
  setTaskMoreOptions(taskHasMoreOptions(task));
  planlyQuickAddReset();
  refreshQuickDateSelection();
  window.dispatchEvent(new CustomEvent('planly:task-sheet-open',{detail:{taskId:task?.id||'',readOnly,assigneeId:String(task?.assigneeId||task?.assignee_id||''),visibility:task?.visibility||'private'}}));
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
  if(e.target.classList.contains('taskReadOnlySheet'))return;
  planlyQuickFinal();
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
    visibility:$('#taskVisibility')?.value==='household'?'household':'private',
    householdId:$('#taskVisibility')?.value==='household'?(planlyHousehold?.id||null):null,
    updatedAt:now
  };
  if(!data.title)return;
  if(data.visibility==='household'&&!data.householdId){alert('Create or join a Household in Settings before sharing this task.');return}
  if(data.addToCalendar&&!data.date){alert('Choose a date before adding this task to Google Calendar.');return}
  planlyHaptic();
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
document.addEventListener('click',e=>{const b=e.target.closest('#planlyDisplayNameSave');if(b)void savePlanlyDisplayName()});
document.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target?.id==='planlyDisplayName'){e.preventDefault();e.target.blur()}});
/* Checklist rows open with Enter/Space like a real button; focus returns to the same row after the re-render. */
document.addEventListener('keydown',e=>{if(e.key!=='Enter'&&e.key!==' ')return;const body=e.target;if(!body?.matches?.('.taskBody[role="button"][data-action]'))return;e.preventDefault();const id=body.closest('.task')?.dataset.id;body.click();if(id)document.querySelector('.task[data-id="'+CSS.escape(id)+'"] .taskBody[role="button"]')?.focus()});
document.addEventListener('change',e=>{if(e.target?.id==='planlyDisplayName')void savePlanlyDisplayName()});
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
  if(!task||e.target.closest('button,input,select,textarea,a,.inlineChecklist'))return;
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
$('#taskActionClose').onclick=closeTaskActions;$('#taskActionWrap').addEventListener('click',e=>{if(e.target.classList.contains('taskActionBackdrop'))closeTaskActions();else handleTaskActionClick(e)});$('#taskActionContent').addEventListener('change',handleTaskActionChange);$('#timelineClose').onclick=closeTimeline;$('#timelinePrev').onclick=()=>{timelineDate=addDays(timelineDate,-1);renderTimeline()};$('#timelineNext').onclick=()=>{timelineDate=addDays(timelineDate,1);renderTimeline()};$('#timelineDate').addEventListener('change',e=>{if(e.target.value){timelineDate=e.target.value;renderTimeline()}});$('#timelineContent').addEventListener('click',handleTimelineClick);$('#timelineContent').addEventListener('change',handleTimelineChange);$('#timelineContent').addEventListener('touchstart',beginTimelineDrag,{passive:true});$('#timelineContent').addEventListener('touchmove',moveTimelineDrag,{passive:false});$('#timelineContent').addEventListener('touchend',endTimelineDrag,{passive:true});$('#timelineContent').addEventListener('touchcancel',endTimelineDrag,{passive:true});$('#projectsToggle').onclick=()=>openProjects();$('#projectsClose').onclick=closeProjects;$('#projectsBack').onclick=()=>{if(projectPanelMode==='editor'&&editingProjectId){activeProjectId=editingProjectId;editingProjectId='';projectPanelMode='detail'}else if(projectPanelMode==='editor'){editingProjectId='';projectPanelMode='list'}else{activeProjectId='';projectPanelMode='list'}renderProjectsPanel()};$('#projectsContent').addEventListener('click',e=>{handleProjectsClick(e);handleViewClick(e)});$('#projectsContent').addEventListener('submit',e=>{if(e.target.id==='projectForm'){e.preventDefault();saveProjectEditor()}});$('#projectsContent').addEventListener('touchstart',beginTaskSwipe,{passive:true});$('#projectsContent').addEventListener('touchmove',moveTaskSwipe,{passive:false});$('#projectsContent').addEventListener('touchend',endTaskSwipe,{passive:true});$('#projectsContent').addEventListener('touchcancel',endTaskSwipe,{passive:true});$('#sheetWrap').addEventListener('click',e=>{if(e.target===$('#sheetWrap'))closeSheet()});$('#subtaskAdd').addEventListener('click',addEditingSubtask);$('#subtaskInput').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();addEditingSubtask()}});$('#subtaskList').addEventListener('click',handleSubtaskEditorClick);$('#taskDate').addEventListener('change',()=>{refreshQuickDateSelection();if($('#taskRepeat').value!=='none'&&$('#taskRepeat').value!=='custom')applyRepeatPreset()});$('#taskTime').addEventListener('change',()=>{if(!$('#taskId').value&&state.autoCalendarTimed&&$('#taskTime').value)$('#taskCalendar').checked=true});$('#taskRepeat').addEventListener('change',applyRepeatPreset);
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
$('#view').addEventListener('touchstart',beginTop3Drag,{passive:true});$('#view').addEventListener('touchmove',moveTop3Drag,{passive:false});$('#view').addEventListener('touchend',endTop3Drag,{passive:true});$('#view').addEventListener('touchcancel',endTop3Drag,{passive:true});$('#view').addEventListener('touchstart',beginTaskSwipe,{passive:true});$('#view').addEventListener('touchmove',moveTaskSwipe,{passive:false});$('#view').addEventListener('touchend',endTaskSwipe,{passive:true});$('#view').addEventListener('touchcancel',endTaskSwipe,{passive:true});$('#view').addEventListener('click',handleViewClick);$$('#quickDates .chip').forEach(c=>c.onclick=()=>setQuick(c.dataset.q));$('#addBtn').onclick=()=>openSheet();$$('.nav button').forEach(b=>b.onclick=()=>{state.tab=b.dataset.tab;if(state.tab==='today')state.selectedDate=localKey(new Date());render()});$('#profileToggle').onclick=openProfile;$('#profileClose').onclick=closeProfile;$('#profileWrap').addEventListener('click',e=>{if(e.target.classList.contains('profileBackdrop'))closeProfile();else if(e.target.closest('[data-profile-settings]'))openSettingsFromProfile(false);else if(e.target.closest('[data-profile-household]'))openSettingsFromProfile(true)});$('#searchToggle').onclick=openSearch;$('#searchClose').onclick=closeSearch;$('#searchInput').addEventListener('input',renderSearchResults);document.querySelectorAll('[data-search-filter]').forEach(b=>b.addEventListener('click',()=>{activeSearchFilter=b.dataset.searchFilter;document.querySelectorAll('[data-search-filter]').forEach(x=>x.classList.toggle('active',x===b));renderSearchResults()}));$('#searchCategory').addEventListener('change',renderSearchResults);$('#searchPriority').addEventListener('change',renderSearchResults);$('#searchProject').addEventListener('change',renderSearchResults);$('#searchWrap').addEventListener('click',e=>{if(e.target===$('#searchWrap'))closeSearch()});$('#searchResults').addEventListener('click',e=>{const result=e.target.closest('[data-search-id]');if(!result)return;const t=state.tasks.find(x=>x.id===result.dataset.searchId);if(!t)return;closeSearch();setTimeout(()=>openSheet(t),0)});$('#themeToggle').onclick=()=>{state.theme=(document.documentElement.dataset.theme==='dark')?'light':'dark';save();applyTheme()};
document.addEventListener('keydown',e=>{if(e.key!=='Escape')return;if($('#taskActionWrap').classList.contains('open'))closeTaskActions();else if($('#searchWrap').classList.contains('open'))closeSearch();else if($('#timelineWrap').classList.contains('open'))closeTimeline();});
let planlyHouseholdRemoteChangeTimer=0;window.addEventListener('planly:household-remote-change',()=>{clearTimeout(planlyHouseholdRemoteChangeTimer);planlyHouseholdRemoteChangeTimer=setTimeout(()=>void reconcilePlanlyCloud({render:true}).catch(()=>{}),400)});window.addEventListener('planly:budget-today-bills-refreshed',()=>{if(state.tab==='today')render()});
let planlyForegroundResumeTimer=0;window.addEventListener('planly:foreground-resume',()=>{clearTimeout(planlyForegroundResumeTimer);planlyForegroundResumeTimer=setTimeout(()=>void reconcilePlanlyCloud({render:true,replay:true,replayToast:''}).catch(()=>{}),400)});
capturePlanlyHouseholdInviteFromUrl();window.addEventListener('hashchange',()=>{if(capturePlanlyHouseholdInviteFromUrl())render()});load();applyTheme();if(PLANLY_CLOUD_PREVIEW)planlyAdoptStoredUser();if(PLANLY_CLOUD_PREVIEW){const restored=restorePlanlyCloudCache();if(restored){applyPlanlyPendingToState();const pending=readPlanlyPendingWrites();planlyCloudReadOnly=pending.length?false:!['cloud-write-test','offline-retry-needed'].includes(planlyCloudLocalStatus().state);planlyCloudBootstrapPending=false;setPlanlyCloudLocalStatus({state:pending.length?'offline-retry-needed':planlyCloudLocalStatus().state||'cloud-loaded',cacheRestored:true,pendingWrites:pending.length});render()}else{state.tasks=[];state.projects=[];planlyCloudBootstrapPending=true}}else render();startPlanlyAuth().then(()=>render()).catch(()=>{planlyCloudBootstrapPending=false;render()});if(!isStandalone())$('#installHelp').hidden=false;if('serviceWorker'in navigator){if(PLANLY_CLOUD_PREVIEW)preparePlanlyOfflineMode(false).then(()=>render());else navigator.serviceWorker.register('./sw.js').catch(()=>{})};if(googleConnected()&&!PLANLY_CLOUD_PREVIEW)syncPendingGoogle().then(()=>render()).catch(()=>{});
// The modules added after this file (Suggestions, Budget, Lists…) run in the same script; one more render once they have all run,
// still before the first paint, so the first screen is already complete.
queueMicrotask(()=>render());
})();
