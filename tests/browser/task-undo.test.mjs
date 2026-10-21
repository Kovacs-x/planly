// Task Undo bar and swipes: a finished Undo takes its bar away (deleting one task, then ticking another, used to leave
// "Task deleted · Undo" stuck on screen with a dead Undo); Undo puts back only what that action changed, so a task saved
// in the meantime stays; swiping a done task springs back; a swipe on someone else's private task does nothing; the
// next "Saved to Inbox" pop-up stays tappable for its whole time; online or offline, a write held for its Undo bar is
// not counted as waiting.
// The Undo bar stays 3 seconds; it is a frosted rounded card with Undo as a pill in the section colour, beside the + button.
// Run: node tests/browser/task-undo.test.mjs (see tests/browser/README.md).
import {startServer,launchBrowser,makeDb,newPhone,openApp,OWNER,PARTNER,HOUSEHOLD} from './harness.mjs';
const server=await startServer();const browser=await launchBrowser();
let pass=0,fail=0;const check=(n,c,d='')=>{console.log((c?'PASS ':'FAIL ')+n+(c?'':' — '+d));c?pass++:fail++};
const W=ms=>new Promise(r=>setTimeout(r,ms));
const today=new Date().toISOString().slice(0,10),now=new Date().toISOString();
const T=(owner,id,title,more={})=>{const vis=more.visibility||'private',{visibility,...extra}=more;return {owner_id:owner,client_id:id,data:{id,title,date:extra.date??today,time:'',category:'Personal',durationMinutes:30,priority:'normal',completed:!!extra.completed,completedAt:extra.completed?now:null,recurrence:'none',reminder:'none',notes:'',subtasks:[],createdAt:1,updatedAt:1,visibility:vis,householdId:vis==='household'?HOUSEHOLD:null,assigneeId:extra.assigneeId||null,projectId:'',...extra},visibility:vis,household_id:vis==='household'?HOUSEHOLD:null,assignee_id:extra.assigneeId||null,completed_by:extra.completed?owner:null,completed_at:extra.completed?now:null,cloud_version:1,deleted_at:null,task_date:extra.date??today}};
const db=makeDb();
db.tables.planly_tasks.push(T(OWNER,'a','Alpha'),T(OWNER,'b','Bravo'),T(OWNER,'c','Charlie'),T(OWNER,'d','Delta'),T(OWNER,'done','Already done',{completed:true}));
const {context,errors}=await newPhone(browser,db,OWNER);const page=await openApp(context,errors);
page.on('dialog',x=>x.accept());
const cdp=await context.newCDPSession(page);
const touch=(type,x,y)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'?[]:[{x,y}]});
const swipeRight=async id=>{await page.evaluate(id=>{const e=document.querySelector(`.task[data-id="${id}"]`);if(e)window.scrollBy(0,e.getBoundingClientRect().top-300)},id);await W(400);const r=await page.evaluate(id=>{const e=document.querySelector(`.task[data-id="${id}"] .taskSurface`);if(!e)return null;const b=e.getBoundingClientRect();return {x:Math.round(b.left+60),y:Math.round(b.top+b.height/2)}},id);if(!r)return false;await touch('touchStart',r.x,r.y);for(let i=1;i<=10;i++){await touch('touchMove',r.x+i*20,r.y);await W(16)}await touch('touchEnd',r.x+200,r.y);return true};
const titles=()=>page.evaluate(()=>[...document.querySelectorAll('.task[data-id] .taskTitle')].map(e=>e.textContent.trim()));
const bar=()=>page.evaluate(()=>{const e=document.getElementById('planlyUndoToast');return {show:!!e?.classList.contains('show'),text:e?.querySelector('.undoLabel')?.textContent||''}});
const rowAct=(id,act)=>page.evaluate(([id,act])=>document.querySelector(`.task[data-id="${id}"] [data-action="${act}"]`)?.click(),[id,act]);
const addTask=async title=>{await page.evaluate(()=>document.getElementById('addBtn').click());await W(600);await page.fill('#taskTitle',title);await page.evaluate(()=>document.getElementById('taskForm').requestSubmit());await W(700)};
const serverRow=id=>db.tables.planly_tasks.find(r=>r.client_id===id&&r.owner_id===OWNER);

// 1. Delete, then tick another task while the Undo bar is up
await rowAct('a','delete');await W(500);
check('deleting a task shows the Undo bar',(await bar()).show&&(await bar()).text==='Task deleted',JSON.stringify(await bar()));
await rowAct('b','toggle');await W(500);
check('ticking another task straight after takes the Undo bar away',!(await bar()).show,JSON.stringify(await bar()));
await W(5600);
check('…and it does not come back or stay stuck',!(await bar()).show&&!(await titles()).includes('Alpha'),JSON.stringify({bar:await bar(),titles:await titles()}));
check('…the delete and the tick both reach the server',!!serverRow('a')?.deleted_at&&serverRow('b')?.data?.completed===true,JSON.stringify({a:serverRow('a')?.deleted_at,b:serverRow('b')?.data?.completed}));

// 2. Delete, add a new task, then Undo: the deleted task returns and the new one stays
await rowAct('c','delete');await W(400);
await addTask('Brand new');
await W(1000);const chip=await page.evaluate(()=>(document.querySelector('.syncChipText')?.textContent||'').trim());
check('while the Undo bar is up, the sync label still says Synced (the held delete is not shown as waiting)',chip==='Synced'&&(await bar()).show,JSON.stringify({chip,bar:await bar()}));
check('saving a new task during the Undo window keeps the Undo bar for the delete',(await bar()).show&&(await bar()).text==='Task deleted',JSON.stringify(await bar()));
await page.evaluate(()=>document.querySelector('#planlyUndoToast .undoButton').click());await W(1200);
let t=await titles();
check('Undo brings the deleted task back…',t.includes('Charlie'),JSON.stringify(t));
check('…and keeps the task saved in the meantime',t.includes('Brand new'),JSON.stringify(t));
await W(2500);
check('…and on the server nothing is deleted and the new task is saved',!serverRow('c')?.deleted_at&&db.tables.planly_tasks.some(r=>r.data?.title==='Brand new'&&!r.deleted_at),JSON.stringify({c:serverRow('c')?.deleted_at}));

// 3. Move to tomorrow, add a task, Undo: back to today, new task kept
await rowAct('d','tomorrow');await W(400);
await addTask('Second new');
await page.evaluate(()=>document.querySelector('#planlyUndoToast .undoButton')?.click());await W(1200);
t=await titles();
check('Undo of "Tomorrow" moves the task back and keeps the task added since',t.includes('Delta')&&t.includes('Second new'),JSON.stringify(t));
await W(2500);
check('…and the server keeps Delta on today',serverRow('d')?.data?.date===today&&db.tables.planly_tasks.some(r=>r.data?.title==='Second new'),JSON.stringify(serverRow('d')?.data?.date));

// 5. Two "Saved to Inbox" pop-ups in a row: the second stays tappable for its whole time
const saveToInbox=async title=>{await page.evaluate(()=>document.getElementById('addBtn').click());await W(500);await page.fill('#taskTitle',title);await page.evaluate(()=>[...document.querySelectorAll('#quickDates .chip')].find(x=>/No date/.test(x.textContent))?.click());await page.evaluate(()=>document.getElementById('taskForm').requestSubmit())};
await saveToInbox('Inbox one');await W(300);
const first=await page.evaluate(()=>{const e=document.getElementById('planlyToast');return {text:e?.textContent,pe:e?.style.pointerEvents}});
check('"Saved to Inbox · tap to plan it" can be tapped',/Inbox/.test(first.text||'')&&first.pe==='auto',JSON.stringify(first));
await W(1300);await saveToInbox('Inbox two');await W(1900);
const second=await page.evaluate(()=>{const e=document.getElementById('planlyToast');return {text:e?.textContent,pe:e?.style.pointerEvents,op:e?.style.opacity}});
check('a second Inbox pop-up straight after is still tappable while it shows (the first one\'s timer does not cut it short)',second.op==='1'&&second.pe==='auto',JSON.stringify(second));
await W(1200);
const gone=await page.evaluate(()=>{const e=document.getElementById('planlyToast');return {pe:e?.style.pointerEvents,op:e?.style.opacity}});
check('…and once it fades it no longer catches taps',gone.op==='0'&&gone.pe==='none',JSON.stringify(gone));

// Offline: a delete held for its Undo bar is not counted as waiting until the bar ends
await addTask('Offline one');await W(1500);
db.offline=true;await context.setOffline(true);await W(400);
await rowAct(await page.evaluate(()=>[...document.querySelectorAll('.task[data-id]')].find(r=>r.querySelector('.taskTitle')?.textContent==='Offline one')?.dataset.id),'delete');await W(600);
const chipHeld=await page.evaluate(()=>(document.querySelector('.syncChipText')?.textContent||'').trim());
check('offline, while the Undo bar is up the held delete is not counted as waiting',(await bar()).show&&chipHeld==='Offline',JSON.stringify({chipHeld,bar:await bar()}));
await W(5600);
const chipAfter=await page.evaluate(()=>(document.querySelector('.syncChipText')?.textContent||'').trim());
check('…once the bar ends it is counted as waiting',!(await bar()).show&&/^Offline · 1 waiting$/.test(chipAfter),chipAfter);
db.offline=false;await context.setOffline(false);await W(3000);
check('…and back online it is sent and the label says Synced',db.tables.planly_tasks.some(r=>r.data?.title==='Offline one'&&r.deleted_at)&&(await page.evaluate(()=>(document.querySelector('.syncChipText')?.textContent||'').trim()))==='Synced',await page.evaluate(()=>(document.querySelector('.syncChipText')?.textContent||'').trim()));

// 5. The Undo bar stays 3 seconds, then goes and the delete is sent
await rowAct('d','delete');await W(2400);
check('the Undo bar is still up after 2.4 seconds',(await bar()).show&&!serverRow('d')?.deleted_at,JSON.stringify({bar:await bar(),d:serverRow('d')?.deleted_at}));
const look=await page.evaluate(()=>{const t=document.getElementById('planlyUndoToast'),ts=getComputedStyle(t),b=t.querySelector('.undoButton'),bs=getComputedStyle(b),r=t.getBoundingClientRect(),a=document.getElementById('addBtn')?.getBoundingClientRect(),n=document.querySelector('.nav').getBoundingClientRect();
  const probe=document.createElement('i');probe.style.color='var(--card)';document.body.appendChild(probe);const card=getComputedStyle(probe).color;probe.style.color='var(--sec)';const sec=getComputedStyle(probe).color;probe.remove();
  return {radius:parseFloat(ts.borderTopLeftRadius),h:r.height,blur:ts.backdropFilter,bg:ts.backgroundColor,card,text:ts.color,btnBg:bs.backgroundColor,btnInk:bs.color,sec,underline:bs.textDecorationLine,overAdd:!!a&&r.right>a.left&&r.bottom>a.top&&r.top<a.bottom,aboveNav:r.bottom<=n.top,line:getComputedStyle(t,'::after').animationName}});
const rgb=c=>(c.match(/[\d.]+/g)||[]).slice(0,3).map(Number).map(v=>Math.round(c.startsWith('color(')?v*255:v)).join(',');
check('the Undo bar looks like the app: a frosted rounded card in the page colours, not a black box',look.radius>=look.h/2-1&&/blur\(/.test(look.blur)&&rgb(look.bg)===rgb(look.card),JSON.stringify(look));
check('…Undo is a pill in the section colour (no underline), with a line running down for the time left',look.btnInk===look.sec&&look.btnBg!=='rgba(0, 0, 0, 0)'&&look.underline==='none'&&look.line==='undoTimeLeft',JSON.stringify(look));
check('…and it sits beside the + button and above the tab bar, covering neither',!look.overAdd&&look.aboveNav,JSON.stringify(look));
await W(1300);
check('…and is gone by 3.7 seconds, with the delete sent',!(await bar()).show&&!!serverRow('d')?.deleted_at,JSON.stringify({bar:await bar(),d:serverRow('d')?.deleted_at}));

check('no page errors',errors.length===0,errors.slice(0,3).join(' | '));
console.log(`\n${pass} passed, ${fail} failed`);await browser.close();server.close();process.exit(fail?1:0);
