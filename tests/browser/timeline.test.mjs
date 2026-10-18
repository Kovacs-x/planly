// Timeline: a Mon–Sun strip to pick the day, one stats bar (timed · events · free · clashes), Anytime tasks as chips, and
// the day as a list in time order — tasks, calendar events and free gaps — with a red Now line on today. A task opens its
// actions; an Anytime chip (your own tasks only) is scheduled with a quick time or into a free gap; + Plan adds a task there.
// Run: node tests/browser/timeline.test.mjs (see tests/browser/README.md).
import {startServer,launchBrowser,makeDb,newPhone,openApp,OWNER,PARTNER,HOUSEHOLD} from './harness.mjs';
const server=await startServer();const browser=await launchBrowser();
let pass=0,fail=0;const check=(n,c,d='')=>{console.log((c?'PASS ':'FAIL ')+n+(c?'':' — '+d));c?pass++:fail++};
const W=ms=>new Promise(r=>setTimeout(r,ms));
const key=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
const n=new Date(),today=key(n),day=key(new Date(n.getFullYear(),n.getMonth(),n.getDate()+1)),now=n.toISOString();
const T=(owner,id,title,more={})=>{const shared=more.visibility==='household';return {owner_id:owner,client_id:id,data:{id,title,date:day,time:'',category:'Personal',durationMinutes:30,priority:'normal',completed:false,recurrence:'none',reminder:'none',notes:'',subtasks:[],createdAt:1,updatedAt:1,visibility:'private',householdId:shared?HOUSEHOLD:null,assigneeId:null,...more},visibility:shared?'household':'private',household_id:shared?HOUSEHOLD:null,assignee_id:null,completed_by:null,completed_at:null,cloud_version:1,deleted_at:null,task_date:day}};
const db=makeDb();
db.tables.planly_tasks.push(T(OWNER,'gym','Gym',{time:'11:30',durationMinutes:60}),T(OWNER,'bank','Call the bank',{time:'11:45',durationMinutes:15}),T(OWNER,'dinner','Cook dinner',{time:'18:00',durationMinutes:45,visibility:'household'}),
  T(OWNER,'mum','Ring mum'),T(PARTNER,'laki','Laki errand',{visibility:'household'}),T(OWNER,'now','Today task',{date:today,time:'00:00',durationMinutes:15}));
db.tables.planly_tasks.at(-1).task_date=today;
const src=(id,name,colour,represents)=>({id,owner_id:OWNER,name,colour,enabled:true,show_today:true,show_month:true,show_timeline:true,represents,status:'ok',last_synced_at:now,provider:'ics',created_at:now,updated_at:now});
db.tables.calendar_sources=[src('s1','NHS Rota','#e0407a','partner'),src('s2','Home','#2f9e68','self')];
db.tables.external_calendar_events=[{id:'ev1',source_id:'s1',owner_id:OWNER,external_uid:'u1',title:'Laki late shift',description:'',location:'',starts_at:day+'T13:30:00Z',ends_at:day+'T20:30:00Z',is_all_day:false,start_date:day,end_date:day,source_updated_at:now},{id:'ev2',source_id:'s2',owner_id:OWNER,external_uid:'u2',title:'Bin day',description:'',location:'',starts_at:null,ends_at:null,is_all_day:true,start_date:day,end_date:day,source_updated_at:now}];
const {context,errors}=await newPhone(browser,db,OWNER);const page=await openApp(context,errors);
const tl=()=>page.evaluate(()=>{const q=s=>[...document.querySelectorAll('#timelineWrap '+s)];return {open:document.getElementById('timelineWrap').classList.contains('open'),days:q('[data-timeline-day]').map(b=>({k:b.dataset.timelineDay,on:b.classList.contains('active')})),title:document.getElementById('timelineTitle').textContent,
  stats:q('.tlStats>div').map(d=>d.innerText.replace(/\s+/g,' ').trim()),rows:q('.tlAgenda .tlRow').map(r=>({time:r.querySelector('.tlTime')?.textContent,kind:r.querySelector('.tlNow')?'now':r.querySelector('.tlFree')?'free':r.querySelector('.tlEvent')?'event':'task',text:r.innerText.replace(/\s+/g,' ').trim(),clash:!!r.querySelector('.clash')})),
  chips:q('.tlAnytime .tlChip').map(c=>({t:c.textContent.trim(),btn:c.tagName==='BUTTON'})),allDay:q('.tlAllDay .tlChip').map(c=>c.textContent.trim())}});
await page.evaluate(()=>document.getElementById('timelineBtn').click());await W(900);
let s=await tl();
check('Timeline opens on today with a Mon–Sun strip, today picked',s.open&&s.days.length===7&&s.days.find(d=>d.on)?.k===today,JSON.stringify(s.days));
check('today has a red Now line, once',s.rows.filter(r=>r.kind==='now').length===1,JSON.stringify(s.rows));
if(!s.days.some(d=>d.k===day)){await page.evaluate(()=>document.querySelector('[data-timeline-week="7"]').click());await W(400)}
await page.evaluate(k=>document.querySelector(`[data-timeline-day="${k}"]`).click(),day);await W(700);
s=await tl();
check('tapping a day in the strip shows that day',s.days.find(d=>d.on)?.k===day&&!s.rows.some(r=>r.kind==='now'),JSON.stringify(s.days.find(d=>d.on)));
check('one stats bar: timed, events, free time, clashes',JSON.stringify(s.stats)===JSON.stringify(['⏱ 3 Timed','📅 2 Events','🌿 13h Free','⚠️ 1 Clashes']),JSON.stringify(s.stats));
const order=s.rows.map(r=>r.kind+':'+(r.text.match(/^(?:📅 |🌿 )?([A-Za-z ]+?)(?: ·| \d|$)/)||[])[1]);
check('the day is a list in time order: free gaps, tasks and calendar events',JSON.stringify(s.rows.filter(r=>r.kind!=='event').map(r=>r.kind+' '+r.time))===JSON.stringify(['free 08:00','task 11:30','task 11:45','free 12:30','task 18:00','free 18:45']),JSON.stringify(order));
check('free gaps show how long they are (3h 30m, 5h 30m, 4h 15m)',s.rows.filter(r=>r.kind==='free').map(r=>r.text.match(/Free · (\d+h(?: \d+m)?|\d+m)/)?.[1]).join('|')==='3h 30m|5h 30m|4h 15m',JSON.stringify(s.rows.filter(r=>r.kind==='free').map(r=>r.text)));
check('the two overlapping tasks are marked as a clash, the others are not',s.rows.filter(r=>r.clash).map(r=>r.time).join()==='11:30,11:45',JSON.stringify(s.rows.map(r=>[r.time,r.clash])));
check('a calendar event shows in the list in its calendar\'s colour, and all-day events as chips',s.rows.some(r=>r.kind==='event'&&/Laki late shift/.test(r.text))&&await page.evaluate(()=>getComputedStyle(document.querySelector('.tlEvent')).getPropertyValue('--calendar-source').trim()==='#e0407a')&&JSON.stringify(s.allDay)==='["📅 Bin day"]',JSON.stringify([s.allDay,s.rows.filter(r=>r.kind==='event')]));
check('Anytime tasks are chips; a household task of someone else cannot be picked',JSON.stringify(s.chips)===JSON.stringify([{t:'Laki errand',btn:false},{t:'↕ Ring mum',btn:true}])||JSON.stringify(s.chips)===JSON.stringify([{t:'↕ Ring mum',btn:true},{t:'Laki errand',btn:false}]),JSON.stringify(s.chips));

// pick an Anytime chip, then a free gap
await page.evaluate(()=>document.querySelector('[data-timeline-pick="mum"]').click());await W(400);
const picked=await page.evaluate(()=>({times:[...document.querySelectorAll('.tlPickTimes button')].map(b=>b.textContent),put:[...document.querySelectorAll('.tlFree button')].map(b=>b.textContent)}));
check('picking a chip offers quick times and "Put here" on every free gap',picked.times.join()==='Morning,Afternoon,Evening'&&picked.put.length===3&&picked.put.every(t=>t==='Put here'),JSON.stringify(picked));
await page.evaluate(()=>document.querySelectorAll('.tlFree button')[1].click());await W(2500);
s=await tl();
check('"Put here" schedules it at the start of that gap',s.rows.some(r=>r.kind==='task'&&r.time==='12:30'&&/Ring mum/.test(r.text))&&!s.chips.some(c=>/Ring mum/.test(c.t)),JSON.stringify(s.rows.map(r=>r.time+' '+r.kind)));
// (it saves once the undo toast has gone)
await W(3000);check('…and it is saved',db.tables.planly_tasks.find(r=>r.client_id==='mum')?.data?.time==='12:30',JSON.stringify(db.tables.planly_tasks.find(r=>r.client_id==='mum')?.data?.time));
await page.evaluate(()=>document.querySelector('[data-timeline-plan]').click());await W(700);
check('+ Plan on a free gap opens a new task on that day at that time',await page.evaluate(()=>document.getElementById('sheetWrap').classList.contains('open')&&document.getElementById('taskDate').value)===day&&await page.evaluate(()=>document.getElementById('taskTime').value)==='08:00');
await page.keyboard.press('Escape');await page.evaluate(()=>{const w=document.getElementById('sheetWrap');if(w.classList.contains('open'))(document.querySelector('#sheetWrap [data-close],#sheetClose,#cancelBtn')||w).click()});await W(600);
await page.evaluate(()=>document.querySelector('[data-timeline-open="gym"]').click());await W(700);
check('tapping a task opens its actions',await page.evaluate(()=>document.getElementById('taskActionWrap').classList.contains('open')));
check('no page errors',errors.length===0,errors.slice(0,3).join(' | '));
console.log(`${pass} passed, ${fail} failed`);await browser.close();server.close();process.exit(fail?1:0);
