// Repeating shared chores keep coming back. Laki saved five weekly chores with no date and Musti ticked them, so next week's
// copies were never made: a phone only made the next copy of its own tasks, and there was no date to count from. Now:
// whoever ticks a shared chore makes its next copy; a repeating task is never saved without a date; and once on each phone
// the stalled chores get their next copy (the other member's tasks are not changed, and nothing is made twice).
// Run: node tests/browser/chore-restart.test.mjs (see tests/browser/README.md).
import {startServer,launchBrowser,makeDb,newPhone,openApp,OWNER,PARTNER,HOUSEHOLD} from './harness.mjs';
const server=await startServer();const browser=await launchBrowser();
let pass=0,fail=0;const check=(n,c,d='')=>{console.log((c?'PASS ':'FAIL ')+n+(c?'':' — '+d));c?pass++:fail++};
const W=ms=>new Promise(r=>setTimeout(r,ms));
const key=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
const now=new Date(),today=key(now),inDays=n=>key(new Date(now.getFullYear(),now.getMonth(),now.getDate()+n));
// the next Saturday after today
const saturday=inDays((6-now.getDay()+7)%7||7);
const SAT={unit:'weeks',interval:1,weekdays:[6],weekday:6,monthlyMode:'day',monthDay:3,ordinal:1,endMode:'never',endDate:'',maxOccurrences:10,anchorDate:''};
const T=(owner,id,title,more={})=>{const shared=more.visibility!=='private',data={id,seriesId:id,title,date:'',time:'',category:'Home',durationMinutes:30,priority:'normal',completed:true,recurrence:'weekly',recurrenceConfig:SAT,reminder:'none',notes:'',subtasks:[],createdAt:1,updatedAt:1,visibility:shared?'household':'private',householdId:shared?HOUSEHOLD:null,assigneeId:null,...more};
  return {owner_id:owner,client_id:id,data,visibility:data.visibility,household_id:data.householdId,assignee_id:null,completed_by:data.completed?OWNER:null,completed_at:data.completed?'2026-10-07T10:00:00Z':null,cloud_version:3,deleted_at:null,task_date:data.date||null}};
const db=makeDb();
db.tables.planly_tasks.push(
  T(PARTNER,'kitchen','Kitchen'),T(PARTNER,'bathroom','Bathroom'),
  T(OWNER,'mine','Hall'),
  T(PARTNER,'stairs','Stairs'),T(PARTNER,'stairs-next','Stairs',{seriesId:'stairs',date:saturday,completed:false}),
  T(OWNER,'private','Plants',{visibility:'private'}),
  T(PARTNER,'bins','Bins',{date:today,completed:false,showOnToday:true}),
  T(PARTNER,'mop','Mop',{completed:false,showOnToday:true}));
const copies=series=>db.tables.planly_tasks.filter(r=>(r.data?.seriesId||r.client_id)===series&&!r.data?.completed&&!r.deleted_at);
const {context,errors}=await newPhone(browser,db,OWNER);const page=await openApp(context,errors);await W(3000);

const k=copies('kitchen')[0],b=copies('bathroom')[0],h=copies('mine')[0];
check('the stalled weekly chores get next week\'s copy, dated the coming Saturday, as Musti\'s own shared chore',k&&b&&h&&[k,b,h].every(r=>r.owner_id===OWNER&&r.visibility==='household'&&r.data.date===saturday&&r.data.completed===false&&r.data.recurrence==='weekly'),JSON.stringify([k,b,h].map(r=>r&&{o:r.owner_id===OWNER,v:r.visibility,d:r.data.date,c:r.data.completed})));
check('the copy is clean: not done, no one ticked it, editable by its owner',k&&k.data.completedBy==null&&k.data.completedAt==null&&k.completed_by==null&&!('_planlyOwnedByMe' in k.data)&&!('_planlyOwnerId' in k.data),JSON.stringify(k?.data));
const kitchen=db.tables.planly_tasks.find(r=>r.client_id==='kitchen');
check('Laki\'s original chores are not changed',kitchen.owner_id===PARTNER&&kitchen.cloud_version===3&&kitchen.data.date===''&&kitchen.data.completed===true,JSON.stringify({v:kitchen.cloud_version,d:kitchen.data.date}));
check('a chore that already has its next copy, and a private task, are left alone',copies('stairs').length===1&&copies('private').length===0,JSON.stringify({stairs:copies('stairs').length,priv:copies('private').length}));

// Once only, and never twice
const count=()=>db.tables.planly_tasks.filter(r=>!r.deleted_at).length,n1=count();
await page.reload();await W(3500);
check('opening the app again makes nothing more',count()===n1,`${n1} → ${count()}`);
const two=await newPhone(browser,db,PARTNER);const page2=await openApp(two.context,two.errors);await W(3500);
check('Laki\'s phone sees the copies and makes no duplicates',count()===n1&&copies('kitchen').length===1,`${n1} → ${count()}`);
await two.context.close();

// Ticking Laki's chores: a dated one gets its next copy from the server (as Laki's); an undated one from this phone
const tick=async id=>{await page.evaluate(id=>[...document.querySelectorAll('[data-action="toggle"],[data-household-completion]')].find(b=>b.closest(`[data-id="${id}"]`))?.click(),id);await W(4500)};
await page.evaluate(()=>document.querySelector('.nav button[data-section="home"]').click());await W(1500);
await tick('bins');
const call=db.log.filter(l=>l.rpc==='planly_set_household_task_completed').find(l=>l.body.p_client_id==='bins');
check('ticking Laki\'s dated weekly chore asks the server for next week\'s copy, and this phone makes none',call&&call.body.p_next_date===saturday&&copies('bins').filter(r=>r.owner_id===OWNER).length===0,JSON.stringify({next:call?.body.p_next_date,mine:copies('bins').filter(r=>r.owner_id===OWNER).length}));
await tick('mop');
const mop=copies('mop').filter(r=>r.client_id!=='mop');
check('ticking Laki\'s weekly chore with no date makes next week\'s copy on this phone, dated Saturday',mop.length===1&&mop[0].owner_id===OWNER&&mop[0].data.date===saturday&&mop[0].visibility==='household',JSON.stringify(mop.map(r=>({o:r.owner_id===OWNER,d:r.data.date}))));

// A repeating task is never saved without a date
await page.evaluate(()=>document.getElementById('addBtn').click());await W(800);
await page.evaluate(()=>{document.querySelector('[data-q="none"]').click();const r=document.getElementById('taskRepeat');r.value='daily';r.dispatchEvent(new Event('change',{bubbles:true}));const t=document.getElementById('taskTitle');t.value='Feed cat';t.dispatchEvent(new Event('input',{bubbles:true}))});
await page.evaluate(()=>document.getElementById('taskForm').requestSubmit());await W(2000);
const cat=db.tables.planly_tasks.find(r=>r.data?.title==='Feed cat');
check('a daily task saved with "No date" starts today',cat&&cat.data.date===today&&cat.data.recurrence==='daily',JSON.stringify(cat&&{d:cat.data.date,r:cat.data.recurrence}));
check('no page errors',errors.length===0&&two.errors.length===0,[...errors,...two.errors].slice(0,3).join(' | '));
console.log(`${pass} passed, ${fail} failed`);await browser.close();server.close();process.exit(fail?1:0);
