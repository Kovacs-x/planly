// Sync conflicts: a change made on this phone while offline and a change made elsewhere to the same item are combined
// automatically when safe; a real clash waits for a choice, and the sync label says so and opens where it is chosen.
// Run: node tests/browser/sync-conflicts.test.mjs (see tests/browser/README.md).
import {startServer,launchBrowser,makeDb,newPhone,openApp,OWNER} from './harness.mjs';
const server=await startServer();const browser=await launchBrowser();
let pass=0,fail=0;const check=(n,c,d='')=>{console.log((c?'PASS ':'FAIL ')+n+(c?'':' — '+d));c?pass++:fail++};
const W=ms=>new Promise(r=>setTimeout(r,ms));
const key=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
const today=key(new Date());
const row=(id,title,time,extra={})=>({owner_id:OWNER,client_id:id,data:{id,title,date:today,time,category:'Personal',durationMinutes:30,priority:'normal',completed:false,recurrence:'none',reminder:'none',notes:'',subtasks:[{id:'a',title:'Bag',done:false},{id:'b',title:'Water',done:false}],createdAt:1,updatedAt:1,visibility:'private',...extra},visibility:'private',household_id:null,assignee_id:null,completed_by:null,completed_at:null,cloud_version:1,deleted_at:null,task_date:today,task_time:time});
const db=makeDb();
db.tables.planly_tasks.push(row('t1','Gym','18:00'),row('t2','Run','07:00'),row('t3','Swim','12:00'),row('t4','Yoga','20:00'),row('t5','Walk','08:00'),row('t6','Read','21:00'));
const {context,errors}=await newPhone(browser,db,OWNER);const page=await openApp(context,errors);
page.on('dialog',d=>d.accept());
const cloud=id=>db.tables.planly_tasks.find(r=>r.client_id===id);
const chip=()=>page.evaluate(()=>document.querySelector('#planlySyncChip .syncChipText')?.textContent||'');
await page.evaluate(()=>document.querySelector('.nav button[data-section="today"]').click());await W(1500);
check('the four tasks are loaded and synced',(await page.evaluate(()=>['t1','t2','t3','t4'].every(id=>document.querySelector(`[data-id="${id}"]`))))&&(await chip())==='Synced',await chip());

// edit a task through the app's own edit sheet
async function edit(id,patch){
  await page.evaluate(id=>{const card=document.querySelector(`[data-id="${id}"]`);(card.querySelector('[data-action="edit"]')||card.querySelector('[data-action="actions"]')).click()},id);await W(500);
  await page.evaluate(()=>document.querySelector('#taskActionWrap.open [data-task-action="edit"],.taskActionWrap.open [data-action="edit"]')?.click());await W(600);
  await page.evaluate(p=>{for(const [k,v] of Object.entries(p)){const el=document.getElementById(k);el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}))}document.getElementById('taskForm').requestSubmit()},patch);await W(800);
}
async function del(id){
  await page.evaluate(id=>{const card=document.querySelector(`[data-id="${id}"]`);(card.querySelector('[data-action="delete"]')||card.querySelector('[data-action="actions"]')).click()},id);await W(500);
  await page.evaluate(()=>document.querySelector('#taskActionWrap.open [data-task-action="delete"],.taskActionWrap.open [data-action="delete"]')?.click());await W(800);
}

// Offline on this phone: four changes
db.offline=true;await context.setOffline(true);await W(300);
await edit('t1',{taskTime:'19:00'});            // only the time here …
await edit('t2',{taskTitle:'Run A'});           // a clash on the title …
await edit('t3',{taskTime:'13:00'});            // the same change on both sides …
await del('t4');                                // deleted here …
check('four changes wait while offline',/Offline · \d+ waiting/.test(await chip()),await chip());
// … meanwhile, elsewhere:
const bump=(id,f)=>{const r=cloud(id);f(r);r.cloud_version++};
bump('t1',r=>{r.data={...r.data,subtasks:[{id:'a',title:'Bag',done:true},{id:'b',title:'Water',done:false}],updatedAt:5}}); // … a checklist tick there
bump('t2',r=>{r.data={...r.data,title:'Run B',updatedAt:5}});
bump('t3',r=>{r.data={...r.data,time:'13:00',updatedAt:5};r.task_time='13:00'});
bump('t4',r=>{r.deleted_at=new Date().toISOString()});                                       // … and deleted there too

// Back online
db.offline=false;await context.setOffline(false);
let label='';for(let i=0;i<30;i++){await W(500);label=await chip();if(label==='1 to review')break}
const t1=cloud('t1'),t2=cloud('t2'),t3=cloud('t3');
check('different fields are combined: the new time from here and the tick from there',t1.data.time==='19:00'&&t1.data.subtasks[0].done===true&&t1.data.subtasks[1].done===false,JSON.stringify({time:t1.data.time,subs:t1.data.subtasks}));
check('the same change on both sides needs no choice',t3.data.time==='13:00'&&t3.data.title==='Swim',JSON.stringify({time:t3.data.time,title:t3.data.title}));
check('deleted on both sides needs nothing',!!cloud('t4').deleted_at&&!(await page.evaluate(()=>!!document.querySelector('[data-id="t4"]'))));
check('a real clash is not overwritten',t2.data.title==='Run B',t2.data.title);
check('the sync label says one change needs a look',label==='1 to review',label);
const shown=await page.evaluate(()=>({t1:document.querySelector('[data-id="t1"]')?.innerText||''}));
check('this phone shows the combined task',/19:00/.test(shown.t1),shown.t1.slice(0,80));

// The label opens where the choice is made
await page.evaluate(()=>document.getElementById('planlySyncChip').click());await W(900);
const card=await page.evaluate(()=>document.body.innerText);
check('tapping the label opens the change to choose',/1 sync conflict need/.test(card)&&/Run A/.test(card)&&/Cloud and this device both changed/.test(card),card.slice(0,200));
await page.evaluate(()=>document.querySelector('[data-planly-conflict-local^="task|t2"],[data-planly-conflict-keep^="task|t2"]')?.click()||[...document.querySelectorAll('button')].find(b=>/Keep this device/.test(b.textContent))?.click());await W(2000);
check('choosing keeps this phone’s title and clears the label',cloud('t2').data.title==='Run A'&&(await chip())==='Synced',cloud('t2').data.title+' / '+await chip());

// A change made here while the cloud copy is being read for a combine is kept, together with both earlier changes.
// checklist items are ticked on the card, once its checklist is open
const sheet=async id=>{await page.evaluate(id=>{const c=document.querySelector(`[data-id="${id}"]`);if(!c.querySelector('[data-action="toggle-subtask"]'))c.querySelector('[data-action="expand-checklist"]').click()},id);await W(400)};
const tickOn=(id,sub)=>page.evaluate(([id,sub])=>{const b=document.querySelector(`[data-id="${id}"] [data-action="toggle-subtask"][data-subtask-id="${sub}"]`);b?.click();return !!b},[id,sub]);
const ticksOn=id=>page.evaluate(id=>[...document.querySelectorAll(`[data-id="${id}"] [data-action="toggle-subtask"]`)].map(b=>b.getAttribute('aria-pressed')),id);
await page.evaluate(()=>document.querySelector('.nav button[data-section="today"]').click());await W(1000);
db.offline=true;await context.setOffline(true);await W(300);
await edit('t5',{taskTime:'09:00'});                                                          // the time here …
bump('t5',r=>{r.data={...r.data,subtasks:[{id:'a',title:'Bag',done:true},{id:'b',title:'Water',done:false}],updatedAt:5}}); // … a tick there
let reading=null;const inRead=new Promise(r=>reading=r);
db.hold=async q=>{if(q.method==='GET'&&q.query.includes('client_id=eq.t5')&&q.query.includes('completed_by')){db.hold=null;reading();await W(1500)}};
await sheet('t5');
db.offline=false;await context.setOffline(false);
const caught=await Promise.race([inRead.then(()=>true),W(15000).then(()=>false)]);
const ticked=caught&&await tickOn('t5','b');                                                               // … and another tick here, mid-read
for(let i=0;i<30;i++){await W(500);if(cloud('t5').data.subtasks[1].done&&(await chip())==='Synced')break}
await sheet('t5');const t5ticks=await ticksOn('t5');
const t5=cloud('t5'),t5text=await page.evaluate(()=>document.querySelector('[data-id="t5"]')?.innerText||'');
check('the combine read the cloud copy while this phone changed the task',caught&&ticked,JSON.stringify({caught,ticked}));
check('a change made mid-combine is kept with both earlier changes',t5.data.time==='09:00'&&t5.data.subtasks[0].done===true&&t5.data.subtasks[1].done===true,JSON.stringify({time:t5.data.time,subs:t5.data.subtasks}));
check('this phone shows all three changes',/09:00/.test(t5text)&&t5ticks.length===2&&t5ticks.every(x=>x==='true'),JSON.stringify(t5ticks));

// A row that is simply missing in the cloud is not taken as a delete: the task stays and waits for a choice.
db.offline=true;await context.setOffline(true);await W(300);
await sheet('t6');await tickOn('t6','a');await W(300);await tickOn('t6','a');await W(300);                          // a change here that undoes itself
db.tables.planly_tasks=db.tables.planly_tasks.filter(r=>r.client_id!=='t6');
db.offline=false;await context.setOffline(false);
label='';for(let i=0;i<30;i++){await W(500);label=await chip();if(label==='1 to review')break}
check('a missing cloud row is not followed as a delete',await page.evaluate(()=>!!document.querySelector('[data-id="t6"]')));
check('it waits for a choice instead',label==='1 to review',label);
check('no page errors',errors.length===0,errors.join(' | '));
console.log(`${pass} passed, ${fail} failed`);await browser.close();server.close();process.exit(fail?1:0);
