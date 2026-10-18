// Repeating shared chores keep coming back. Laki saved five weekly chores with no date and Musti ticked them, so next week's
// copies were never made (the server makes the other member's next copy only for a dated chore). Now a repeating task is
// never saved without a date, and once on each phone the owner's stalled chores get their next copy. Two phones of the same
// owner racing on the same cloud state make exactly one copy: the database allows one live copy per owner, series and
// date, and the refused duplicate counts as done.
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
  T(OWNER,'stairs','Stairs'),T(OWNER,'stairs-next','Stairs',{seriesId:'stairs',date:saturday,completed:false}),
  T(OWNER,'private','Plants',{visibility:'private'}),
  T(PARTNER,'bins','Bins',{date:today,completed:false,showOnToday:true}));
const live=series=>db.tables.planly_tasks.filter(r=>(r.data?.seriesId||r.client_id)===series&&!r.data?.completed&&!r.deleted_at);
const count=()=>db.tables.planly_tasks.filter(r=>!r.deleted_at).length;
const pending=(page,uid)=>page.evaluate(uid=>JSON.parse(localStorage.getItem('planly-cloud-pending-v1:'+uid)||'[]').length,uid);
const shownOnPlan=async(page,title)=>{await page.evaluate(()=>document.querySelector('.nav button[data-section="plan"]').click());await W(800);await page.evaluate(()=>document.querySelector('[data-plan-segment="upcoming"]')?.click());await W(800);
  return page.evaluate(t=>[...document.querySelectorAll('#view [data-id]')].filter(e=>e.textContent.includes(t)).length,title)};

// Musti's phone: only Musti's own stalled chore
const {context,errors}=await newPhone(browser,db,OWNER);const page=await openApp(context,errors);await W(3000);
const h=live('mine')[0];
check('Musti\'s stalled weekly chore gets next week\'s copy, dated the coming Saturday, as a clean shared chore',h&&h.owner_id===OWNER&&h.visibility==='household'&&h.data.date===saturday&&h.data.completed===false&&h.data.completedBy==null&&!('_planlyOwnedByMe' in h.data)&&h.series_client_id==='mine',JSON.stringify(h&&{d:h.data.date,s:h.series_client_id}));
const mine=db.tables.planly_tasks.find(r=>r.client_id==='mine');
check('the chore it follows is not changed',mine.cloud_version===3&&mine.data.date===''&&mine.data.completed===true,JSON.stringify({v:mine.cloud_version}));
check('Laki\'s chores are left for Laki\'s phone, and a chore with its next copy or a private task are left alone',live('kitchen').length===0&&live('bathroom').length===0&&live('stairs').length===1&&live('private').length===0);
const n1=count();await page.reload();await W(3500);
check('opening the app again makes nothing more',count()===n1,`${n1} → ${count()}`);
await page.evaluate(()=>document.querySelector('.nav button[data-section="today"]').click());await W(1200);
await page.evaluate(()=>[...document.querySelectorAll('[data-action="toggle"],[data-household-completion]')].find(b=>b.closest('[data-id="bins"]'))?.click());await W(4500);
const call=db.log.filter(l=>l.rpc==='planly_set_household_task_completed').find(l=>l.body.p_client_id==='bins');
check('ticking Laki\'s dated chore still asks the server for its next copy, and this phone makes none',call&&call.body.p_next_date===saturday&&live('bins').filter(r=>r.owner_id===OWNER).length===0,JSON.stringify({next:call?.body.p_next_date}));

// Two of Laki's phones open at the same moment on the same cloud state; their inserts reach the database together
db.delays.planly_tasks=1500;
const [a,b]=await Promise.all([newPhone(browser,db,PARTNER),newPhone(browser,db,PARTNER)]);
const [pa,pb]=await Promise.all([openApp(a.context,a.errors),openApp(b.context,b.errors)]);
await W(9000);db.delays.planly_tasks=0;
const tries=db.log.filter(l=>l.table==='planly_tasks'&&l.method==='POST'&&l.userId===PARTNER).length;
check('both phones really raced: each tried to send the copies',tries>=4,'inserts from Laki\'s phones: '+tries);
const inserts=db.log.filter(l=>l.table==='planly_tasks'&&l.method==='POST').length;
const k=live('kitchen'),bt=live('bathroom');
check('racing phones: exactly one next copy per chore, as Laki\'s, dated Saturday',k.length===1&&bt.length===1&&[...k,...bt].every(r=>r.owner_id===PARTNER&&r.data.date===saturday),JSON.stringify({k:k.length,b:bt.length,inserts}));
await W(2000);
check('…both phones settle with nothing left waiting to send',await pending(pa,PARTNER)===0&&await pending(pb,PARTNER)===0,JSON.stringify([await pending(pa,PARTNER),await pending(pb,PARTNER)]));
check('…and each shows Kitchen once',await shownOnPlan(pa,'Kitchen')===1&&await shownOnPlan(pb,'Kitchen')===1,JSON.stringify([await shownOnPlan(pa,'Kitchen'),await shownOnPlan(pb,'Kitchen')]));

// A repeating task is never saved without a date
await page.evaluate(()=>document.querySelector('.nav button[data-section="today"]').click());await W(800);
await page.evaluate(()=>document.getElementById('addBtn').click());await W(800);
await page.evaluate(()=>{document.querySelector('[data-q="none"]').click();const r=document.getElementById('taskRepeat');r.value='daily';r.dispatchEvent(new Event('change',{bubbles:true}));const t=document.getElementById('taskTitle');t.value='Feed cat';t.dispatchEvent(new Event('input',{bubbles:true}))});
await page.evaluate(()=>document.getElementById('taskForm').requestSubmit());await W(2000);
const cat=db.tables.planly_tasks.find(r=>r.data?.title==='Feed cat');
check('a daily task saved with "No date" starts today',cat&&cat.data.date===today&&cat.data.recurrence==='daily',JSON.stringify(cat&&{d:cat.data.date,r:cat.data.recurrence}));
check('no page errors',errors.length===0&&a.errors.length===0&&b.errors.length===0,[...errors,...a.errors,...b.errors].slice(0,3).join(' | '));
console.log(`${pass} passed, ${fail} failed`);await browser.close();server.close();process.exit(fail?1:0);
