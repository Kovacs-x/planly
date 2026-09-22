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
let state={tasks:[],tab:'today',theme:'system',showCompleted:true,defaultCategory:'Personal',defaultDuration:30,autoCalendarTimed:false,selectedDate:localKey(new Date()),weekAnchor:localKey(new Date()),monthAnchor:localKey(new Date())};
const completedOpen={};
function localKey(d){const x=new Date(d);return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`}
function parseKey(s){const [y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d,12)}
function addDays(s,n){const d=parseKey(s);d.setDate(d.getDate()+n);return localKey(d)}
function fmt(s,o={weekday:'short',day:'numeric',month:'short'}){return new Intl.DateTimeFormat(undefined,o).format(parseKey(s))}
function uid(){return `${Date.now()}-${Math.random().toString(16).slice(2)}`}
function esc(v=''){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function save(){localStorage.setItem(STORE,JSON.stringify({tasks:state.tasks,theme:state.theme,showCompleted:state.showCompleted,defaultCategory:state.defaultCategory,defaultDuration:state.defaultDuration,autoCalendarTimed:state.autoCalendarTimed}))}
function load(){try{const d=JSON.parse(localStorage.getItem(STORE)||'{}');state.tasks=Array.isArray(d.tasks)?d.tasks:[];state.theme=d.theme||'system';state.showCompleted=d.showCompleted!==false;state.defaultCategory=d.defaultCategory||'Personal';state.defaultDuration=Number(d.defaultDuration||30);state.autoCalendarTimed=!!d.autoCalendarTimed}catch{}}
function applyTheme(){let t=state.theme;if(t==='system')t=matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light';document.documentElement.dataset.theme=t}
function isStandalone(){return matchMedia('(display-mode: standalone)').matches||navigator.standalone===true}
function setHeader(title,dateText=''){ $('#pageTitle').textContent=title; $('#eyebrow').textContent=dateText }
function calendarSyncHtml(t){
  if(!t.addToCalendar||t.calendarSync==='synced')return '';
  const label=t.calendarSync==='error'?'Calendar error':'Calendar pending';
  return `<span class="pill syncPill ${t.calendarSync==='error'?'error':'pending'}">${label}</span><button class="syncRetry" data-action="retry-sync">Retry</button>`;
}
function durationLabel(minutes){
  const n=Number(minutes||30);
  if(n<60)return n+'m';
  if(n%60===0)return (n/60)+'h';
  return Math.floor(n/60)+'h '+(n%60)+'m';
}
function reminderLabel(value){
  return ({'at-time':'At time','5-min':'5m reminder','15-min':'15m reminder','30-min':'30m reminder','60-min':'1h reminder','1440-min':'1d reminder'})[value]||'';
}
function taskHtml(t){
  const subtasks=Array.isArray(t.subtasks)?t.subtasks:[];
  const subtaskDone=subtasks.filter(s=>s.done).length;
  const subtaskMeta=subtasks.length?`<span class="subtaskMeta">☑ ${subtaskDone}/${subtasks.length}</span>`:'';
  const priority=t.priority&&t.priority!=='normal'?`<span class="pill priorityPill ${t.priority==='high'?'priorityHigh':''}">${esc(t.priority)}</span>`:'';
  const reminder=reminderLabel(t.reminder);
  const surface=`<div class="taskSurface"><button class="check" data-action="toggle" aria-label="Toggle complete">${t.completed?'✓':''}</button><div class="taskBody"><div class="taskTitle">${esc(t.title)}</div><div class="meta">${t.time?`<span class="taskTimeBadge">${esc(t.time)} · ${durationLabel(t.durationMinutes)}</span>`:''}${isOverdue(t)?`<span class="pill" style="color:var(--danger)">Overdue · ${esc(fmt(t.date,{day:'numeric',month:'short'}))}</span>`:''}<span class="categoryText">${esc(t.category)}</span>${priority}${t.recurrence&&t.recurrence!=='none'?`<span class="pill">↻ ${esc(t.recurrence)}</span>`:''}${reminder?`<span class="pill">◷ ${esc(reminder)}</span>`:''}${subtaskMeta}${calendarSyncHtml(t)}</div>${t.notes?`<div class="taskNotes muted">${esc(t.notes)}</div>`:''}${isOverdue(t)?`<button class="chip" data-action="today" style="margin-top:10px;padding:7px 10px">Move to Today</button>`:''}</div><div class="taskActions">${t.completed?'':`<button class="smallbtn" data-action="pin" aria-label="Pin">${t.pinned?'★':'☆'}</button>`}<button class="smallbtn" data-action="edit" aria-label="Edit">•••</button></div></div>`;
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
function sortUpcoming(arr){return [...arr].sort((a,b)=>{
  if((a.date||'')!==(b.date||''))return (a.date||'').localeCompare(b.date||'');
  const at=a.time||'99:99',bt=b.time||'99:99';
  if(at!==bt)return at.localeCompare(bt);
  return priorityRank(a.priority)-priorityRank(b.priority);
})}
function nextOccurrence(date,recurrence){
  if(!date||recurrence==='none')return '';
  const d=parseKey(date);
  if(recurrence==='daily')d.setDate(d.getDate()+1);
  else if(recurrence==='weekly')d.setDate(d.getDate()+7);
  else if(recurrence==='monthly'){
    const day=d.getDate(), targetMonth=d.getMonth()+1;
    d.setDate(1); d.setMonth(targetMonth);
    const last=new Date(d.getFullYear(),d.getMonth()+1,0).getDate();
    d.setDate(Math.min(day,last));
  }
  return localKey(d);
}
function createNextRecurring(t){
  if(!t||!t.completed||!t.date||!t.recurrence||t.recurrence==='none')return;
  const nextDate=nextOccurrence(t.date,t.recurrence);
  if(!nextDate)return;
  const seriesId=t.seriesId||t.id;
  t.seriesId=seriesId;
  const exists=state.tasks.some(x=>x.seriesId===seriesId&&x.date===nextDate);
  if(exists)return;
  const now=Date.now();
  state.tasks.push({
    ...t,
    id:uid(),
    seriesId,
    date:nextDate,
    completed:false,
    pinned:false,
    subtasks:Array.isArray(t.subtasks)?t.subtasks.map(s=>({...s,id:uid(),done:false})):[],
    googleEventId:'',
    calendarSync:t.addToCalendar?'pending':'',
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
  const before=cloneTasks(),eventId=t.googleEventId||'';state.tasks=state.tasks.filter(x=>x.id!==t.id);save();render();
  showUndoToast('Task deleted',()=>restoreTaskSnapshot(before),()=>{if(eventId)queueGoogleDelete(eventId);if(googleConnected())processPendingDeletes().catch(()=>{})});
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
  if(checklist)descriptionParts.push(checklist);
  descriptionParts.push('Created by Planly');
  const resource={
    summary:t.title,
    description:descriptionParts.join('\n\n'),
    visibility:'private'
  };
  if(t.time){
    const start=new Date(t.date+'T'+t.time+':00');
    const duration=Math.max(5,Number(t.durationMinutes||30));
    const end=new Date(start.getTime()+duration*60*1000);
    resource.start={dateTime:start.toISOString(),timeZone:PLANLY_TIMEZONE};
    resource.end={dateTime:end.toISOString(),timeZone:PLANLY_TIMEZONE};
  }else{
    resource.start={date:t.date};
    resource.end={date:addDays(t.date,1)};
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

function todayView(){
  const key=localKey(new Date());
  const todayAll=state.tasks.filter(t=>t.date===key);
  const completed=sortTasks(todayAll.filter(t=>t.completed));
  const activeToday=todayAll.filter(t=>!t.completed);
  const done=completed.length;
  const overdue=sortTasks(state.tasks.filter(isOverdue));
  const pins=sortTasks(activeToday.filter(t=>t.pinned)).slice(0,3);
  const remaining=activeToday.filter(t=>!t.pinned);
  const scheduled=sortTasks(remaining.filter(t=>t.time));
  const anytime=sortTasks(remaining.filter(t=>!t.time));
  setHeader('Today',new Intl.DateTimeFormat(undefined,{weekday:'long',day:'numeric',month:'long'}).format(new Date()));
  const pct=todayAll.length?Math.round(done/todayAll.length*100):0;
  const allDone=!activeToday.length&&!overdue.length&&todayAll.length>0;
  const nothingPlanned=!todayAll.length&&!overdue.length;
  const statusCard=allDone?'<div class="dayStatus doneStatus"><strong>All done for today</strong><span>✓</span></div>':nothingPlanned?'<div class="dayStatus"><strong>Nothing planned yet</strong><span class="muted">Tap + to add something.</span></div>':'';
  const top3=activeToday.length?`<section class="section"><div class="sectionHead"><h2>Top 3</h2><span class="muted">${pins.length}/3</span></div>${pins.length?pins.map(taskHtml).join(''):'<div class="empty compactEmpty">Star up to three priorities for today.</div>'}</section>`:'';
  const schedule=scheduled.length?`<section class="section"><div class="sectionHead"><h2>Schedule</h2><span class="muted">${scheduled.length}</span></div>${scheduled.map(taskHtml).join('')}</section>`:'';
  const anytimeSection=anytime.length?`<section class="section"><div class="sectionHead"><h2>Anytime</h2><span class="muted">${anytime.length}</span></div>${anytime.map(taskHtml).join('')}</section>`:'';
  $('#view').innerHTML=`<div class="progress"><div class="progressRow"><strong>${done} of ${todayAll.length} done</strong><span class="muted">${pct}%</span></div><div class="bar"><span style="width:${pct}%"></span></div></div>
  ${overdue.length?`<section class="section"><div class="sectionHead"><h2>Overdue</h2><span class="muted">${overdue.length}</span></div>${overdue.map(taskHtml).join('')}</section>`:''}
  ${statusCard}${top3}${schedule}${anytimeSection}
  ${completedSection(completed,'today:'+key)}`
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
  const offset=(d.getDay()+6)%7,days=new Date(year,month+1,0).getDate();
  let cal='<div class="calendar">'+['M','T','W','T','F','S','S'].map(x=>`<div class="dow">${x}</div>`).join('');
  for(let i=0;i<offset;i++)cal+='<div></div>';
  for(let day=1;day<=days;day++){
    const k=localKey(new Date(year,month,day,12));
    const items=state.tasks.filter(t=>t.date===k);
    const activeCount=items.filter(t=>!t.completed).length,completedCount=items.length-activeCount;
    cal+=`<button class="day ${activeCount?'has':''} ${!activeCount&&completedCount?'doneDay':''} ${state.selectedDate===k?'selected':''}" data-date="${k}"><span>${day}</span>${activeCount?'<small>•</small>':completedCount?'<small>✓</small>':''}</button>`;
  }
  cal+='</div>';
  const dayTasks=state.tasks.filter(t=>t.date===state.selectedDate),active=sortTasks(dayTasks.filter(t=>!t.completed)),completed=sortTasks(dayTasks.filter(t=>t.completed));
  $('#view').innerHTML=`<div class="toolbar"><button id="prevMonth">‹</button><button id="todayMonth">Today</button><button id="nextMonth">›</button></div>${cal}<section class="section"><div class="sectionHead"><h2>${fmt(state.selectedDate,{weekday:'long',day:'numeric',month:'long'})}</h2></div>${active.length?active.map(taskHtml).join(''):`<div class="empty compactEmpty">No active tasks for this date.</div>`}</section>${completedSection(completed,'month:'+state.selectedDate)}`;
  $('#prevMonth').onclick=()=>{state.monthAnchor=shiftMonth(first,-1);state.selectedDate=state.monthAnchor;render()};
  $('#nextMonth').onclick=()=>{state.monthAnchor=shiftMonth(first,1);state.selectedDate=state.monthAnchor;render()};
  $('#todayMonth').onclick=()=>{state.monthAnchor=localKey(new Date());state.selectedDate=localKey(new Date());render()};
  $$('.day[data-date]').forEach(b=>b.onclick=()=>{state.selectedDate=b.dataset.date;render()})
}function inboxView(){setHeader('Inbox','Undated tasks');const arr=visibleTasks(state.tasks.filter(t=>!t.date));$('#view').innerHTML=`<section class="section">${arr.length?arr.map(taskHtml).join(''):`<div class="empty">Quick thoughts and undated tasks will appear here.</div>`}</section>`}
function settingsView(){
  setHeader('Settings','Planly preferences');
  const googleStatus=googleStatusText(),googleId=getGoogleClientId();
  const pendingCount=state.tasks.filter(t=>t.addToCalendar&&t.date&&t.calendarSync!=='synced').length+getDeleteQueue().length;
  $('#view').innerHTML=`
  <div class="settingsCard"><h3>Appearance</h3><select id="themeSetting" class="select"><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></div>
  <div class="settingsCard"><h3>Task defaults</h3><label class="muted" style="font-size:13px">Default category</label><select id="defaultCat" class="select" style="margin-top:6px"><option>Personal</option><option>Work</option><option>Home</option><option>Health</option><option>Finance</option><option>Errands</option></select><label class="muted smallLabel">Default duration for timed tasks</label><select id="defaultDuration" class="select"><option value="15">15 minutes</option><option value="30">30 minutes</option><option value="45">45 minutes</option><option value="60">1 hour</option><option value="90">1 hour 30 minutes</option><option value="120">2 hours</option></select><label class="settingToggle"><input id="showCompleted" type="checkbox"><span>Show completed tasks</span></label></div>
  <div class="settingsCard"><h3>Google Calendar</h3><div class="calendarStatusRow"><span class="statusDot ${googleConnected()?'connected':'offline'}"></span><strong>${esc(googleStatus)}</strong>${pendingCount?`<span class="muted">${pendingCount} pending</span>`:''}</div><div class="muted settingsHelp">Sync destination: your private <strong>Planly</strong> Google calendar. Outlook is never modified.</div><label class="settingToggle"><input id="autoCalendarTimed" type="checkbox"><span><strong>Automatically sync timed tasks</strong><small>When a new task has a time, turn on “Add to Google Calendar” automatically.</small></span></label><details class="advancedSettings"><summary>Connection settings</summary><label class="muted smallLabel">Google OAuth client ID</label><input id="googleClientId" class="input" value="${esc(googleId)}" placeholder="...apps.googleusercontent.com" autocomplete="off"></details><button id="googleConnectBtn" class="primary">${googleConnected()?'Reconnect Google':'Connect Google Calendar'}</button><button id="googleSyncBtn" class="secondaryBtn">Sync pending items${pendingCount?` (${pendingCount})`:''}</button>${googleConnected()?'<button id="googleDisconnectBtn" class="dangerBtn">Disconnect Google</button>':''}</div>
  <div class="settingsCard"><h3>Data</h3><button id="exportBtn" class="primary">Export backup</button><button id="importBtn" class="secondaryBtn">Import backup</button><button id="clearBtn" class="dangerBtn">Clear all data</button></div>
  ${isStandalone()?'':'<div class="settingsCard"><h3>Install on iPhone</h3><div class="muted settingsHelp">Open Planly in Safari, tap Share, then Add to Home Screen.</div></div>'}
  <div class="settingsCard"><h3>About Planly</h3><div class="muted settingsHelp">Private local-first planner. Your tasks stay on this device unless you export or sync them.</div><div class="muted" style="font-size:12px;margin-top:8px">Planly 2.4.0</div></div>`;
  $('#themeSetting').value=state.theme;
  $('#defaultCat').value=state.defaultCategory;
  $('#defaultDuration').value=String(state.defaultDuration||30);
  $('#showCompleted').checked=state.showCompleted;
  $('#autoCalendarTimed').checked=state.autoCalendarTimed;
  $('#themeSetting').onchange=e=>{state.theme=e.target.value;save();applyTheme()};
  $('#defaultCat').onchange=e=>{state.defaultCategory=e.target.value;save()};
  $('#defaultDuration').onchange=e=>{state.defaultDuration=Number(e.target.value||30);save()};
  $('#showCompleted').onchange=e=>{state.showCompleted=e.target.checked;save()};
  $('#autoCalendarTimed').onchange=e=>{state.autoCalendarTimed=e.target.checked;save()};
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
  return [t.title,t.notes,t.category,t.priority,subtaskText].filter(Boolean).join(' ').toLowerCase();
}
function searchResultHtml(t){
  const subtasks=Array.isArray(t.subtasks)?t.subtasks:[];
  const done=subtasks.filter(s=>s.done).length;
  const dateLabel=t.date?fmt(t.date,{day:'numeric',month:'short',year:'numeric'}):'Inbox';
  return `<button class="searchResult" type="button" data-search-id="${t.id}"><span class="searchResultMain"><strong>${esc(t.title)}</strong><span class="searchResultMeta">${t.completed?'✓ Completed · ':''}${esc(dateLabel)}${t.time?' · '+esc(t.time):''} · ${esc(t.category)}${subtasks.length?' · '+done+'/'+subtasks.length+' subtasks':''}</span></span><span class="searchChevron">›</span></button>`;
}
function renderSearchResults(){
  const input=$('#searchInput'),results=$('#searchResults');
  if(!input||!results)return;
  const query=input.value.trim().toLowerCase();
  if(!query){
    results.innerHTML='<div class="searchHint">Search task titles, notes, categories and subtasks.</div>';
    return;
  }
  const matches=state.tasks.filter(t=>searchTaskHaystack(t).includes(query)).sort((a,b)=>{
    if(a.completed!==b.completed)return a.completed?1:-1;
    const ad=a.date||'9999-99-99',bd=b.date||'9999-99-99';
    if(ad!==bd)return ad.localeCompare(bd);
    return (a.time||'99:99').localeCompare(b.time||'99:99');
  });
  results.innerHTML=matches.length?matches.slice(0,100).map(searchResultHtml).join(''):`<div class="searchHint">No tasks found for “${esc(input.value.trim())}”.</div>`;
}
function openSearch(){
  closeOpenTaskSwipes();
  lockSheetBackground();
  $('#searchWrap').classList.add('open');
  $('#searchWrap').setAttribute('aria-hidden','false');
  $('#searchInput').value='';
  renderSearchResults();
  setTimeout(()=>$('#searchInput').focus(),50);
}
function closeSearch(){
  const active=document.activeElement;if(active&&typeof active.blur==='function')active.blur();
  $('#searchWrap').classList.remove('open');
  $('#searchWrap').setAttribute('aria-hidden','true');
  unlockSheetBackground();
}

function render(){ $$('.nav button').forEach(b=>b.classList.toggle('active',b.dataset.tab===state.tab)); $('#addBtn').style.display=state.tab==='settings'?'none':'block'; if(state.tab==='today')todayView();else if(state.tab==='upcoming')upcomingView();else if(state.tab==='month')monthView();else if(state.tab==='inbox')inboxView();else settingsView() }
function handleViewClick(e){
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
  if(action!=='pin')closeOpenTaskSwipes();
  if(action==='toggle'){
    if(t.completed){t.completed=false;t.updatedAt=Date.now();save();render()}else completeTaskWithUndo(t);
    return;
  }

  if(action==='pin'){
    if(!t.pinned&&state.tasks.filter(x=>x.date===t.date&&x.pinned&&!x.completed).length>=3){
      alert('Top 3 is full for that day.');
      return;
    }
    t.pinned=!t.pinned;
    t.updatedAt=Date.now();
    save();
    render();
    return;
  }

  if(action==='today'){rescheduleTaskWithUndo(t,localKey(new Date()),'Moved to today');return}
  if(action==='tomorrow'){rescheduleTaskWithUndo(t,addDays(localKey(new Date()),1),'Moved to tomorrow');return}
  if(action==='delete'){deleteTaskWithUndo(t);return}

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
  const map={today,tomorrow:addDays(today,1),nextweek:addDays(startMonday(today),7),none:''};
  $$('#quickDates .chip').forEach(c=>c.classList.toggle('active',map[c.dataset.q]===value));
}
function setQuick(q){
  const today=localKey(new Date());
  if(q==='today')$('#taskDate').value=today;
  else if(q==='tomorrow')$('#taskDate').value=addDays(today,1);
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
function openSheet(task){
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
  $('#taskRepeat').value=task?.recurrence||'none';
  $('#taskReminder').value=task?.reminder||'none';
  $('#taskNotes').value=task?.notes||'';
  editingSubtasks=Array.isArray(task?.subtasks)?task.subtasks.map(s=>({id:s.id||uid(),title:s.title||'',done:!!s.done})):[];
  renderSubtaskEditor();
  $('#taskCalendar').checked=task?!!task.addToCalendar:false;
  $('#deleteTask').style.display=task?'block':'none';
  $('#formActions').classList.toggle('editing',!!task);
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
function exportData(){const blob=new Blob([JSON.stringify({version:1,exportedAt:new Date().toISOString(),tasks:state.tasks,settings:{theme:state.theme,showCompleted:state.showCompleted,defaultCategory:state.defaultCategory,defaultDuration:state.defaultDuration,autoCalendarTimed:state.autoCalendarTimed}},null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`planly-backup-${localKey(new Date())}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
$('#importFile').addEventListener('change',async e=>{const f=e.target.files?.[0];if(!f)return;try{const d=JSON.parse(await f.text());if(!Array.isArray(d.tasks))throw new Error();if(confirm(`Import ${d.tasks.length} tasks and replace current data?`)){state.tasks=d.tasks;state.theme=d.settings?.theme||state.theme;state.showCompleted=d.settings?.showCompleted!==false;state.defaultCategory=d.settings?.defaultCategory||state.defaultCategory;state.defaultDuration=Number(d.settings?.defaultDuration||state.defaultDuration||30);state.autoCalendarTimed=!!d.settings?.autoCalendarTimed;save();applyTheme();render()}}catch{alert('That backup file is not valid.')}e.target.value=''})
$('#taskForm').addEventListener('submit',async e=>{
  e.preventDefault();
  const id=$('#taskId').value,now=Date.now();
  const data={
    title:$('#taskTitle').value.trim(),
    date:$('#taskDate').value||'',
    time:$('#taskTime').value||'',
    durationMinutes:Number($('#taskDuration').value||state.defaultDuration||30),
    priority:$('#taskPriority').value,
    category:$('#taskCategory').value,
    recurrence:$('#taskRepeat').value,
    reminder:$('#taskReminder').value,
    notes:$('#taskNotes').value.trim(),
    subtasks:editingSubtasks.map(s=>({id:s.id||uid(),title:s.title,done:!!s.done})),
    addToCalendar:$('#taskCalendar').checked,
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
    else{if(wasCalendar&&oldEventId)queueGoogleDelete(oldEventId);t.googleEventId='';t.calendarSync=''}
  }else{
    t={id:uid(),...data,completed:false,pinned:false,googleEventId:'',calendarSync:data.addToCalendar?'pending':'',createdAt:now};
    state.tasks.push(t);
  }
  save();closeSheet();render();
  if(data.addToCalendar){
    if(googleConnected()){
      try{await syncTaskToGoogle(t);showToast('Saved and synced to Google Calendar');render()}
      catch(err){showToast('Saved in Planly; calendar sync needs attention')}
    }else{
      showToast('Saved in Planly. Connect Google in Settings to sync.');
    }
  }else if(oldEventId&&googleConnected()){
    await processPendingDeletes();render();
  }
})
$('#deleteTask').onclick=()=>{const id=$('#taskId').value;const t=state.tasks.find(x=>x.id===id);if(id&&t&&confirm('Delete this task?')){closeSheet();deleteTaskWithUndo(t)}}

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
$('#sheetWrap').addEventListener('click',e=>{if(e.target===$('#sheetWrap'))closeSheet()});$('#subtaskAdd').addEventListener('click',addEditingSubtask);$('#subtaskInput').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();addEditingSubtask()}});$('#subtaskList').addEventListener('click',handleSubtaskEditorClick);$('#taskDate').addEventListener('change',refreshQuickDateSelection);$('#taskTime').addEventListener('change',()=>{if(!$('#taskId').value&&state.autoCalendarTimed&&$('#taskTime').value)$('#taskCalendar').checked=true});$('#view').addEventListener('touchstart',beginTaskSwipe,{passive:true});$('#view').addEventListener('touchmove',moveTaskSwipe,{passive:false});$('#view').addEventListener('touchend',endTaskSwipe,{passive:true});$('#view').addEventListener('touchcancel',endTaskSwipe,{passive:true});$('#view').addEventListener('click',handleViewClick);$$('#quickDates .chip').forEach(c=>c.onclick=()=>setQuick(c.dataset.q));$('#addBtn').onclick=()=>openSheet();$$('.nav button').forEach(b=>b.onclick=()=>{state.tab=b.dataset.tab;if(state.tab==='today')state.selectedDate=localKey(new Date());render()});$('#searchToggle').onclick=openSearch;$('#searchClose').onclick=closeSearch;$('#searchInput').addEventListener('input',renderSearchResults);$('#searchWrap').addEventListener('click',e=>{if(e.target===$('#searchWrap'))closeSearch()});$('#searchResults').addEventListener('click',e=>{const result=e.target.closest('[data-search-id]');if(!result)return;const t=state.tasks.find(x=>x.id===result.dataset.searchId);if(!t)return;closeSearch();setTimeout(()=>openSheet(t),0)});$('#themeToggle').onclick=()=>{state.theme=(document.documentElement.dataset.theme==='dark')?'light':'dark';save();applyTheme()};
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&$('#searchWrap').classList.contains('open'))closeSearch()});
load();applyTheme();if(!isStandalone())$('#installHelp').hidden=false;if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});render();
})();
