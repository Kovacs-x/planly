// Deleting a repeating task that is in Google Calendar asks: Just this one / Delete all repeats / Cancel. Cancel changes
// nothing; "Just this one" moves the task to its next date and, once the Undo bar has gone, Google drops only that day;
// Undo sends nothing to Google; "Delete all repeats" removes the task and the whole repeating event (once, even on a
// double tap); a repeating task that is not in Google deletes as before; only Planly's own calendar is ever touched.
// Run: node tests/browser/repeat-delete.test.mjs (see tests/browser/README.md).
import {startServer,launchBrowser,makeDb,newPhone,openApp,OWNER} from './harness.mjs';
const server=await startServer();const browser=await launchBrowser();
let pass=0,fail=0;const check=(n,c,d='')=>{console.log((c?'PASS ':'FAIL ')+n+(c?'':' — '+d));c?pass++:fail++};
const W=ms=>new Promise(r=>setTimeout(r,ms));
const key=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
const today=key(new Date()),inWeek=key(new Date(Date.now()+7*864e5));
const CAL='95b035b05d2f967eb609d34cb4d79348bfdb21e3b1fe06e0bd076fa450577989@group.calendar.google.com';
const T=(id,title,more={})=>({owner_id:OWNER,client_id:id,data:{id,title,date:today,time:'',category:'Personal',durationMinutes:30,priority:'normal',completed:false,recurrence:'weekly',reminder:'none',notes:'',subtasks:[],createdAt:1,updatedAt:1,visibility:'private',projectId:'',seriesId:id,occurrenceNumber:1,addToCalendar:true,calendarSync:'synced',googleRecurrenceVersion:1,googleRecurrenceStartDate:today,...more},visibility:'private',cloud_version:1,deleted_at:null,task_date:today});
const db=makeDb();
db.tables.planly_tasks.push(T('gym','Gym',{time:'18:00',googleEventId:'evtgym'}),T('bins','Bins',{googleEventId:'evtbins'}),T('walk','Walk',{addToCalendar:false,calendarSync:'',googleEventId:''}),T('swim','Swim',{googleEventId:'evtswim'}));
const {context,errors}=await newPhone(browser,db,OWNER);
const google=[];
await context.route('https://www.googleapis.com/**',r=>{const q=r.request(),u=new URL(q.url());google.push({method:q.method(),path:decodeURIComponent(u.pathname)});
  const m=q.method();if(m==='DELETE')return r.fulfill({status:204,body:''});return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(m==='GET'?{items:[]}:{id:'evt-'+google.length})})});
await context.addInitScript(o=>{try{localStorage.setItem('planly-google-auth-v1',JSON.stringify({accessToken:'test-token',expiresAt:Date.now()+36e5,user:o}))}catch{}},OWNER);
const page=await openApp(context,errors);page.on('dialog',d=>d.accept());
const row=id=>db.tables.planly_tasks.find(r=>r.client_id===id);
const sheet=()=>page.evaluate(()=>{const e=document.getElementById('planlyRepeatDeleteSheet');return {open:!!e?.classList.contains('open'),title:e?.querySelector('h2')?.textContent||'',choices:e?[...e.querySelectorAll('[data-repeat-delete]')].map(b=>b.dataset.repeatDelete):[]}});
const del=id=>page.evaluate(id=>document.querySelector(`.task[data-id="${id}"] [data-action="delete"]`)?.click(),id);
const choose=k=>page.evaluate(k=>document.querySelector(`#planlyRepeatDeleteSheet [data-repeat-delete="${k}"]`)?.click(),k);
const deletes=()=>google.filter(g=>g.method==='DELETE').map(g=>g.path);
const toast=()=>page.evaluate(()=>{const e=document.getElementById('planlyUndoToast');return e?.classList.contains('show')?e.querySelector('.undoLabel').textContent:''});
await page.evaluate(()=>document.querySelector('.nav button[data-section="today"]').click());await W(1500);

// Cancel
await del('gym');await W(400);let s=await sheet();
check('deleting a repeating Google task asks: Just this one / Delete all repeats / Cancel',s.open&&s.title==='Delete “Gym”?'&&JSON.stringify(s.choices)==='["one","all","cancel"]',JSON.stringify(s));
const before=google.length;
await choose('cancel');await W(3800);
check('Cancel closes it and changes nothing (no Google call)',!(await sheet()).open&&!!(await page.$('.task[data-id="gym"]'))&&row('gym').data.date===today&&!row('gym').deleted_at&&google.length===before,JSON.stringify({g:google.slice(before)}));

// Just this one
await del('gym');await W(400);await choose('one');await W(400);
const stamp=await page.evaluate(d=>'evtgym_'+new Date(d+'T18:00:00').toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,''),today);
const t1=await toast();
check('"Just this one" moves the task to its next date, with an Undo bar',/^Skipped · next /.test(t1)&&!(await page.$('.task[data-id="gym"]'))&&deletes().length===0,JSON.stringify({t1,d:deletes()}));
await W(3600);
check('…once the Undo bar has gone Google drops only that day',JSON.stringify(deletes())===JSON.stringify([`/calendar/v3/calendars/${CAL}/events/${stamp}`]),JSON.stringify(deletes()));
check('…and the task is saved on its next date (same Google series)',row('gym').data.date===inWeek&&row('gym').data.googleEventId==='evtgym'&&!row('gym').deleted_at,JSON.stringify(row('gym').data));

// Undo sends nothing
await del('bins');await W(400);await choose('one');await W(500);
await page.evaluate(()=>document.querySelector('#planlyUndoToast .undoButton').click());await W(3800);
check('Undo puts it back and sends nothing to Google',!!(await page.$('.task[data-id="bins"]'))&&row('bins').data.date===today&&deletes().length===1,JSON.stringify({d:deletes(),date:row('bins').data.date}));

// Delete all repeats, double tap
await del('bins');await W(400);await page.evaluate(()=>{const b=document.querySelector('#planlyRepeatDeleteSheet [data-repeat-delete="all"]');b.click();b.click()});await W(400);
check('"Delete all repeats" removes the task, with an Undo bar',(await toast())==='All repeats deleted'&&!(await page.$('.task[data-id="bins"]')),await toast());
await W(3600);
check('…then deletes the whole repeating event in Google, once',JSON.stringify(deletes().slice(1))===JSON.stringify([`/calendar/v3/calendars/${CAL}/events/evtbins`])&&!!row('bins').deleted_at,JSON.stringify({d:deletes(),del:row('bins').deleted_at}));

// A repeating task not in Google deletes as before
await del('walk');await W(400);
check('a repeating task that is not in Google deletes as before (no question)',!(await sheet()).open&&(await toast())==='Task deleted',JSON.stringify({s:await sheet(),t:await toast()}));
await W(3600);
// The ⋯ actions sheet asks the same question instead of "Delete this task?"
const dialogs=[];page.on('dialog',d=>dialogs.push(d.message()));
await page.evaluate(()=>document.querySelector('.task[data-id="swim"] [data-action="actions"]')?.click());await W(500);
await page.evaluate(()=>document.querySelector('#taskActionWrap [data-task-menu="delete"]')?.click());await W(500);
s=await sheet();check('the ⋯ menu\'s Delete asks the same question (no "Delete this task?")',s.open&&s.title==='Delete “Swim”?'&&!dialogs.length,JSON.stringify({s,dialogs}));
await choose('cancel');await W(300);
check('only Planly\'s own calendar is ever touched',google.every(g=>g.path.startsWith(`/calendar/v3/calendars/${CAL}/`)||g.path.startsWith('/calendar/v3/users/me/calendarList')),JSON.stringify(google.map(g=>g.method+' '+g.path)));
check('no page errors',errors.length===0,errors.slice(0,3).join(' | '));
console.log(`${pass} passed, ${fail} failed`);await browser.close();server.close();process.exit(fail?1:0);
