// Household chores offline (release gate): on the partner's phone, checklist ticks and completions of the owner's shared
// chores made offline are kept across a restart and replayed through the household RPCs when back online; the partner's
// phone never writes the owner's task rows directly.
// Run: node tests/browser/household-offline.test.mjs (see tests/browser/README.md).
import {startServer,launchBrowser,makeDb,newPhone,openApp,OWNER,PARTNER,HOUSEHOLD} from './harness.mjs';
const server=await startServer();const browser=await launchBrowser();
let pass=0,fail=0;const check=(n,c,d='')=>{console.log((c?'PASS ':'FAIL ')+n+(c?'':' — '+d));c?pass++:fail++};
const W=ms=>new Promise(r=>setTimeout(r,ms));
const key=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
const today=key(new Date());
const chore=(id,title,subtasks)=>({owner_id:OWNER,client_id:id,data:{id,title,date:today,time:'',category:'Home',durationMinutes:30,priority:'normal',completed:false,recurrence:'none',reminder:'none',notes:'',subtasks,createdAt:1,updatedAt:1,visibility:'household',householdId:HOUSEHOLD,assigneeId:null},visibility:'household',household_id:HOUSEHOLD,assignee_id:null,completed_by:null,completed_at:null,cloud_version:1,deleted_at:null,task_date:today});
const db=makeDb();
db.tables.planly_tasks.push(chore('h1','Dishes',[{id:'a',title:'Wash',done:false},{id:'b',title:'Dry',done:false}]),chore('h2','Hoover',[]));
const {context,errors}=await newPhone(browser,db,PARTNER);const page=await openApp(context,errors);
const rpc=[],direct=[];
context.on('request',r=>{const u=r.url();if(u.includes('/rpc/planly_set_household_'))rpc.push({fn:u.split('/rpc/')[1],body:JSON.parse(r.postData()||'{}')});
  if(u.includes('/rest/v1/planly_tasks')&&['PATCH','POST','DELETE'].includes(r.method())&&u.includes(OWNER))direct.push(r.method()+' '+u)});
const cloud=id=>db.tables.planly_tasks.find(r=>r.client_id===id);
const chip=()=>page.evaluate(()=>document.querySelector('#planlySyncChip .syncChipText')?.textContent||'');
const pending=()=>page.evaluate(p=>JSON.parse(localStorage.getItem('planly-cloud-pending-v1:'+p)||'[]'),PARTNER);
const today_=async()=>{await page.evaluate(()=>document.querySelector('.nav button[data-section="today"]').click());await W(1200)};
const open=id=>page.evaluate(id=>{const c=document.querySelector(`[data-id="${id}"]`);if(c&&!c.querySelector('[data-action="toggle-subtask"]'))c.querySelector('[data-action="expand-checklist"]')?.click()},id);
const tickItem=(id,sub)=>page.evaluate(([id,sub])=>{const b=document.querySelector(`[data-id="${id}"] [data-action="toggle-subtask"][data-subtask-id="${sub}"]`);b?.click();return !!b},[id,sub]);
const complete=id=>page.evaluate(id=>{const b=[...document.querySelectorAll('[data-action="toggle"],[data-household-completion]')].find(b=>b.closest(`[data-id="${id}"]`));b?.click();return !!b},id);

await today_();
check('the owner\'s two shared chores show on the partner\'s Today',await page.evaluate(()=>!!document.querySelector('[data-id="h1"]')&&!!document.querySelector('[data-id="h2"]')));

// Offline: tick both checklist items of Dishes (the last one completes it), and complete Hoover.
db.offline=true;await context.setOffline(true);await W(400);
await open('h1');await W(400);
const t1=await tickItem('h1','a');await W(500);const t2=await tickItem('h1','b');await W(800);
const c2=await complete('h2');await W(800);
check('ticks and completion were made offline',t1&&t2&&c2,JSON.stringify({t1,t2,c2}));
let q=await pending();
check('they wait in the queue while offline',q.length>=3,JSON.stringify(q.map(x=>x.kind+':'+x.id)));
check('nothing reached the cloud yet',!cloud('h1').data.subtasks.some(s=>s.done)&&!cloud('h2').data.completed&&rpc.length===0);

// Restart the app while still offline: the queue survives, including the auto-complete of Dishes.
await page.reload({waitUntil:'load'});await W(3000);await today_();
q=await pending();
check('the queue survives a restart offline',q.length>=3,JSON.stringify(q.map(x=>x.kind+':'+x.id)));
check('the final tick still carries the auto-complete',q.some(x=>x.kind==='householdSubtask'&&x.data?.clientId==='h1'&&x.data?.subtaskId==='b'&&x.autoComplete===true),JSON.stringify(q.map(x=>({k:x.kind,id:x.id,a:x.autoComplete}))));

// Back online: everything is replayed through the household RPCs.
db.offline=false;await context.setOffline(false);
for(let i=0;i<40;i++){await W(500);if((await pending()).length===0&&cloud('h1').data.completed&&cloud('h2').data.completed)break}
const h1=cloud('h1'),h2=cloud('h2');
check('both checklist ticks reached the cloud',h1.data.subtasks.every(s=>s.done),JSON.stringify(h1.data.subtasks));
check('Dishes was completed automatically after its last tick',h1.data.completed===true,JSON.stringify({completed:h1.data.completed}));
check('Hoover was completed',h2.data.completed===true,JSON.stringify({completed:h2.data.completed}));
check('done by the partner',h1.completed_by===PARTNER&&h2.completed_by===PARTNER,JSON.stringify({h1:h1.completed_by,h2:h2.completed_by}));
check('only through the household RPCs',rpc.some(c=>c.fn==='planly_set_household_subtask_done')&&rpc.some(c=>c.fn==='planly_set_household_task_completed'&&c.body.p_client_id==='h2'),JSON.stringify(rpc.map(c=>c.fn+':'+c.body.p_client_id)));
check('the partner\'s phone never wrote the owner\'s task rows directly',direct.length===0,direct.join(' | '));
check('nothing is left waiting',(await pending()).length===0&&(await chip())==='Synced',JSON.stringify({q:(await pending()).length,chip:await chip()}));
check('no page errors',errors.length===0,errors.slice(0,3).join(' | '));
console.log(`${pass} passed, ${fail} failed`);await browser.close();server.close();process.exit(fail?1:0);
