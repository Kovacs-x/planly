(()=>{
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const STORE='planly-data-v1';
let state={tasks:[],tab:'today',theme:'system',showCompleted:true,defaultCategory:'Personal',selectedDate:localKey(new Date()),weekAnchor:localKey(new Date()),monthAnchor:localKey(new Date())};
const completedOpen={};
function localKey(d){const x=new Date(d);return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`}
function parseKey(s){const [y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d,12)}
function addDays(s,n){const d=parseKey(s);d.setDate(d.getDate()+n);return localKey(d)}
function fmt(s,o={weekday:'short',day:'numeric',month:'short'}){return new Intl.DateTimeFormat(undefined,o).format(parseKey(s))}
function uid(){return `${Date.now()}-${Math.random().toString(16).slice(2)}`}
function esc(v=''){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function save(){localStorage.setItem(STORE,JSON.stringify({tasks:state.tasks,theme:state.theme,showCompleted:state.showCompleted,defaultCategory:state.defaultCategory}))}
function load(){try{const d=JSON.parse(localStorage.getItem(STORE)||'{}');state.tasks=Array.isArray(d.tasks)?d.tasks:[];state.theme=d.theme||'system';state.showCompleted=d.showCompleted!==false;state.defaultCategory=d.defaultCategory||'Personal'}catch{}}
function applyTheme(){let t=state.theme;if(t==='system')t=matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light';document.documentElement.dataset.theme=t}
function isStandalone(){return matchMedia('(display-mode: standalone)').matches||navigator.standalone===true}
function setHeader(title,dateText=''){ $('#pageTitle').textContent=title; $('#eyebrow').textContent=dateText }
function taskHtml(t){return `<div class="task ${t.completed?'done':''}" data-id="${t.id}"><button class="check" data-action="toggle" aria-label="Toggle complete">${t.completed?'✓':''}</button><div><div class="taskTitle">${esc(t.title)}</div><div class="meta">${t.time?`<span class="pill">${esc(t.time)}</span>`:''}${isOverdue(t)?`<span class="pill" style="color:var(--danger)">Overdue · ${esc(fmt(t.date,{day:'numeric',month:'short'}))}</span>`:''}<span class="pill">${esc(t.category)}</span><span class="pill">${esc(t.priority)}</span>${t.recurrence&&t.recurrence!=='none'?`<span class="pill">↻ ${esc(t.recurrence)}</span>`:''}${t.reminder&&t.reminder!=='none'?`<span class="pill">Reminder inactive</span>`:''}</div>${t.notes?`<div class="muted" style="font-size:13px;margin-top:8px">${esc(t.notes)}</div>`:''}${isOverdue(t)?`<button class="chip" data-action="today" style="margin-top:10px;padding:7px 10px">Move to Today</button>`:''}</div><div class="taskActions"><button class="smallbtn" data-action="pin" aria-label="Pin">${t.pinned?'★':'☆'}</button><button class="smallbtn" data-action="edit" aria-label="Edit">•••</button></div></div>`}
function visibleTasks(arr){return state.showCompleted?arr:arr.filter(t=>!t.completed)}
function completedSection(tasks,key){
  if(!state.showCompleted||!tasks.length)return '';
  const open=!!completedOpen[key];
  return `<section class="section completedSection"><button class="completedToggle" data-completed-key="${esc(key)}" aria-expanded="${open}"><span>Completed</span><span class="muted">${tasks.length} ${open?'⌃':'⌄'}</span></button>${open?`<div class="completedList">${sortTasks(tasks).map(taskHtml).join('')}</div>`:''}</section>`
}
function bindCompletedToggles(){
  $('.completedToggle').forEach(b=>b.onclick=()=>{completedOpen[b.dataset.completedKey]=!completedOpen[b.dataset.completedKey];render()})
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
    createdAt:now,
    updatedAt:now
  });
}
function todayView(){
  const key=localKey(new Date());
  const todayAll=state.tasks.filter(t=>t.date===key);
  const completed=sortTasks(todayAll.filter(t=>t.completed));
  const activeToday=todayAll.filter(t=>!t.completed);
  const done=completed.length;
  const overdue=sortTasks(state.tasks.filter(isOverdue));
  const pins=sortTasks(activeToday.filter(t=>t.pinned)).slice(0,3);
  const rest=sortTasks(activeToday.filter(t=>!t.pinned));
  setHeader('Today',new Intl.DateTimeFormat(undefined,{weekday:'long',day:'numeric',month:'long'}).format(new Date()));
  const pct=todayAll.length?Math.round(done/todayAll.length*100):0;
  $('#view').innerHTML=`<div class="progress"><div class="progressRow"><strong>${done} of ${todayAll.length} done</strong><span class="muted">${pct}%</span></div><div class="bar"><span style="width:${pct}%"></span></div></div>
  ${overdue.length?`<section class="section"><div class="sectionHead"><h2>Overdue</h2><span class="muted">${overdue.length}</span></div>${overdue.map(taskHtml).join('')}</section>`:''}
  <section class="section"><div class="sectionHead"><h2>Top 3</h2><span class="muted">${pins.length}/3</span></div>${pins.length?pins.map(taskHtml).join(''):`<div class="empty">Pin up to three important tasks with ☆.</div>`}</section>
  <section class="section"><div class="sectionHead"><h2>Today</h2></div>${rest.length?rest.map(taskHtml).join(''):`<div class="empty">Nothing else planned for today.</div>`}</section>
  ${completedSection(completed,'today:'+key)}`
}
function startMonday(key){const d=parseKey(key);const diff=(d.getDay()+6)%7;d.setDate(d.getDate()-diff);return localKey(d)}
function weekView(){const start=startMonday(state.weekAnchor);setHeader('Week',`${fmt(start,{day:'numeric',month:'short'})} – ${fmt(addDays(start,6),{day:'numeric',month:'short'})}`);let strip='<div class="weekStrip">';for(let i=0;i<7;i++){const k=addDays(start,i),c=state.tasks.filter(t=>t.date===k).length;strip+=`<button class="weekDay ${state.selectedDate===k?'selected':''}" data-date="${k}"><small>${fmt(k,{weekday:'short'}).slice(0,2)}</small>${parseKey(k).getDate()}${c?`<small>${c}</small>`:''}</button>`}strip+='</div>';const dayTasks=state.tasks.filter(t=>t.date===state.selectedDate),active=sortTasks(dayTasks.filter(t=>!t.completed)),completed=sortTasks(dayTasks.filter(t=>t.completed));$('#view').innerHTML=`<div class="toolbar"><button id="prevWeek">‹</button><button id="thisWeek">This week</button><button id="nextWeek">›</button></div>${strip}<section class="section"><div class="sectionHead"><h2>${fmt(state.selectedDate,{weekday:'long',day:'numeric',month:'long'})}</h2></div>${active.length?active.map(taskHtml).join(''):`<div class="empty">No active tasks for this day.</div>`}</section>${completedSection(completed,'week:'+state.selectedDate)}`;$('#prevWeek').onclick=()=>{state.weekAnchor=addDays(start,-7);state.selectedDate=startMonday(state.weekAnchor);render()};$('#nextWeek').onclick=()=>{state.weekAnchor=addDays(start,7);state.selectedDate=startMonday(state.weekAnchor);render()};$('#thisWeek').onclick=()=>{state.weekAnchor=localKey(new Date());state.selectedDate=localKey(new Date());render()};$$('.weekDay').forEach(b=>b.onclick=()=>{state.selectedDate=b.dataset.date;render()})}
function monthStart(key){const d=parseKey(key);d.setDate(1);return localKey(d)}
function shiftMonth(key,n){const d=parseKey(key);d.setDate(1);d.setMonth(d.getMonth()+n);return localKey(d)}
function monthView(){const first=monthStart(state.monthAnchor),d=parseKey(first),year=d.getFullYear(),month=d.getMonth();setHeader(new Intl.DateTimeFormat(undefined,{month:'long'}).format(d),String(year));const offset=(d.getDay()+6)%7;const days=new Date(year,month+1,0).getDate();let cal='<div class="calendar">'+['M','T','W','T','F','S','S'].map(x=>`<div class="dow">${x}</div>`).join('');for(let i=0;i<offset;i++)cal+='<div></div>';for(let day=1;day<=days;day++){const k=localKey(new Date(year,month,day,12)),c=state.tasks.filter(t=>t.date===k).length;cal+=`<button class="day ${c?'has':''} ${state.selectedDate===k?'selected':''}" data-date="${k}">${day}${c?`<span style="font-size:9px;margin-left:2px">•</span>`:''}</button>`}cal+='</div>';const dayTasks=state.tasks.filter(t=>t.date===state.selectedDate),active=sortTasks(dayTasks.filter(t=>!t.completed)),completed=sortTasks(dayTasks.filter(t=>t.completed));$('#view').innerHTML=`<div class="toolbar"><button id="prevMonth">‹</button><button id="todayMonth">Today</button><button id="nextMonth">›</button></div>${cal}<section class="section"><div class="sectionHead"><h2>${fmt(state.selectedDate,{weekday:'long',day:'numeric',month:'long'})}</h2></div>${active.length?active.map(taskHtml).join(''):`<div class="empty">No active tasks for this date.</div>`}</section>${completedSection(completed,'month:'+state.selectedDate)}`;$('#prevMonth').onclick=()=>{state.monthAnchor=shiftMonth(first,-1);state.selectedDate=state.monthAnchor;render()};$('#nextMonth').onclick=()=>{state.monthAnchor=shiftMonth(first,1);state.selectedDate=state.monthAnchor;render()};$('#todayMonth').onclick=()=>{state.monthAnchor=localKey(new Date());state.selectedDate=localKey(new Date());render()};$$('.day[data-date]').forEach(b=>b.onclick=()=>{state.selectedDate=b.dataset.date;render()})}
function inboxView(){setHeader('Inbox','Undated tasks');const arr=visibleTasks(state.tasks.filter(t=>!t.date));$('#view').innerHTML=`<section class="section">${arr.length?arr.map(taskHtml).join(''):`<div class="empty">Quick thoughts and undated tasks will appear here.</div>`}</section>`}
function settingsView(){setHeader('Settings','Planly preferences');$('#view').innerHTML=`<div class="settingsCard"><h3>Appearance</h3><select id="themeSetting" class="select"><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></div><div class="settingsCard"><h3>Task defaults</h3><label class="muted" style="font-size:13px">Default category</label><select id="defaultCat" class="select" style="margin-top:6px"><option>Personal</option><option>Work</option><option>Home</option><option>Health</option><option>Finance</option><option>Errands</option></select><label style="display:flex;align-items:center;gap:10px;margin-top:14px"><input id="showCompleted" type="checkbox"> Show completed tasks</label></div><div class="settingsCard"><h3>Data</h3><button id="exportBtn" class="primary">Export backup</button><button id="importBtn" class="primary" style="margin-top:8px;background:transparent;color:var(--text);border:1px solid var(--line)">Import backup</button><button id="clearBtn" class="primary" style="margin-top:8px;background:transparent;color:var(--danger);border:1px solid var(--line)">Clear all data</button></div><div class="settingsCard"><h3>Install on iPhone</h3><div class="muted" style="font-size:14px;line-height:1.5">Open Planly in Safari, tap Share, then Add to Home Screen. Once installed it opens like an app.</div></div><div class="settingsCard"><h3>About Planly</h3><div class="muted" style="font-size:14px">Private local-first planner. Your tasks stay on this device unless you export them.</div></div>`;$('#themeSetting').value=state.theme;$('#defaultCat').value=state.defaultCategory;$('#showCompleted').checked=state.showCompleted;$('#themeSetting').onchange=e=>{state.theme=e.target.value;save();applyTheme()};$('#defaultCat').onchange=e=>{state.defaultCategory=e.target.value;save()};$('#showCompleted').onchange=e=>{state.showCompleted=e.target.checked;save()};$('#exportBtn').onclick=exportData;$('#importBtn').onclick=()=>$('#importFile').click();$('#clearBtn').onclick=()=>{if(confirm('Delete all Planly tasks and settings?')){localStorage.removeItem(STORE);location.reload()}}}
function render(){ $$('.nav button').forEach(b=>b.classList.toggle('active',b.dataset.tab===state.tab)); $('#addBtn').style.display=state.tab==='settings'?'none':'block'; if(state.tab==='today')todayView();else if(state.tab==='week')weekView();else if(state.tab==='month')monthView();else if(state.tab==='inbox')inboxView();else settingsView(); bindTaskActions(); bindCompletedToggles() }
function bindTaskActions(){ $('.task').forEach(el=>{
  el.querySelector('[data-action="toggle"]').onclick=()=>{
    const t=state.tasks.find(x=>x.id===el.dataset.id);
    if(t){
      const wasCompleted=t.completed;
      t.completed=!t.completed;
      t.updatedAt=Date.now();
      if(!wasCompleted&&t.completed)createNextRecurring(t);
      save();render();
    }
  };
  el.querySelector('[data-action="pin"]').onclick=()=>{
    const t=state.tasks.find(x=>x.id===el.dataset.id);if(!t)return;
    if(!t.pinned&&state.tasks.filter(x=>x.date===t.date&&x.pinned&&!x.completed).length>=3){alert('Top 3 is full for that day.');return}
    t.pinned=!t.pinned;t.updatedAt=Date.now();save();render()
  };
  const move=el.querySelector('[data-action="today"]');
  if(move)move.onclick=()=>{const t=state.tasks.find(x=>x.id===el.dataset.id);if(t){t.date=localKey(new Date());t.updatedAt=Date.now();save();render()}};
  el.querySelector('[data-action="edit"]').onclick=()=>openSheet(state.tasks.find(x=>x.id===el.dataset.id))
}) }
function setQuick(q){$('#quickDates .chip').forEach(c=>c.classList.toggle('active',c.dataset.q===q));const today=localKey(new Date());if(q==='today')$('#taskDate').value=today;else if(q==='tomorrow')$('#taskDate').value=addDays(today,1);else if(q==='nextweek')$('#taskDate').value=addDays(startMonday(today),7);else if(q==='none')$('#taskDate').value=''}
function openSheet(task){$('#sheetWrap').classList.add('open');$('#sheetWrap').setAttribute('aria-hidden','false');$('#taskId').value=task?.id||'';$('#taskTitle').value=task?.title||'';$('#taskDate').value=task?.date??(state.tab==='inbox'?'':localKey(new Date()));$('#taskTime').value=task?.time||'';$('#taskPriority').value=task?.priority||'normal';$('#taskCategory').value=task?.category||state.defaultCategory;$('#taskRepeat').value=task?.recurrence||'none';$('#taskReminder').value=task?.reminder||'none';$('#taskNotes').value=task?.notes||'';$('#deleteTask').style.display=task?'block':'none';$$('#quickDates .chip').forEach(c=>c.classList.remove('active'));setTimeout(()=>$('#taskTitle').focus(),100)}
function closeSheet(){ $('#sheetWrap').classList.remove('open');$('#sheetWrap').setAttribute('aria-hidden','true') }
function exportData(){const blob=new Blob([JSON.stringify({version:1,exportedAt:new Date().toISOString(),tasks:state.tasks,settings:{theme:state.theme,showCompleted:state.showCompleted,defaultCategory:state.defaultCategory}},null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`planly-backup-${localKey(new Date())}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
$('#importFile').addEventListener('change',async e=>{const f=e.target.files?.[0];if(!f)return;try{const d=JSON.parse(await f.text());if(!Array.isArray(d.tasks))throw new Error();if(confirm(`Import ${d.tasks.length} tasks and replace current data?`)){state.tasks=d.tasks;state.theme=d.settings?.theme||state.theme;state.showCompleted=d.settings?.showCompleted!==false;state.defaultCategory=d.settings?.defaultCategory||state.defaultCategory;save();applyTheme();render()}}catch{alert('That backup file is not valid.')}e.target.value=''})
$('#taskForm').addEventListener('submit',e=>{e.preventDefault();const id=$('#taskId').value,now=Date.now();const data={title:$('#taskTitle').value.trim(),date:$('#taskDate').value||'',time:$('#taskTime').value||'',priority:$('#taskPriority').value,category:$('#taskCategory').value,recurrence:$('#taskRepeat').value,reminder:$('#taskReminder').value,notes:$('#taskNotes').value.trim(),updatedAt:now};if(!data.title)return;let t=id?state.tasks.find(x=>x.id===id):null;if(t)Object.assign(t,data);else state.tasks.push({id:uid(),...data,completed:false,pinned:false,createdAt:now});save();closeSheet();render()})
$('#deleteTask').onclick=()=>{const id=$('#taskId').value;if(id&&confirm('Delete this task?')){state.tasks=state.tasks.filter(t=>t.id!==id);save();closeSheet();render()}}
$('#sheetWrap').addEventListener('click',e=>{if(e.target===$('#sheetWrap'))closeSheet()});$$('#quickDates .chip').forEach(c=>c.onclick=()=>setQuick(c.dataset.q));$('#addBtn').onclick=()=>openSheet();$$('.nav button').forEach(b=>b.onclick=()=>{state.tab=b.dataset.tab;if(state.tab==='today')state.selectedDate=localKey(new Date());render()});$('#themeToggle').onclick=()=>{state.theme=(document.documentElement.dataset.theme==='dark')?'light':'dark';save();applyTheme()};
load();applyTheme();if(!isStandalone())$('#installHelp').hidden=false;if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});render();
})();
