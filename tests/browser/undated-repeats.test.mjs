// Repeating tasks with no date (weekly chores) come back after being ticked (migration 052 + app).
// Run: node tests/browser/undated-repeats.test.mjs (see tests/browser/README.md).
import {startServer,launchBrowser,makeDb,newPhone,openApp,OWNER,PARTNER,HOUSEHOLD} from './harness.mjs';
const server=await startServer();const browser=await launchBrowser();
let pass=0,fail=0;const check=(n,c,d='')=>{console.log((c?'PASS ':'FAIL ')+n+(c?'':' — '+d));c?pass++:fail++};
const W=ms=>new Promise(r=>setTimeout(r,ms));
const key=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
const today=new Date();const nextSat=new Date(today);do{nextSat.setDate(nextSat.getDate()+1)}while(nextSat.getDay()!==6);
const in3=new Date(today);in3.setDate(in3.getDate()+3);
const weekly={unit:'weeks',weekdays:[6],interval:1,endMode:'never',anchorDate:''};
const row=(owner,id,title,date,assignee)=>({owner_id:owner,client_id:id,data:{id,title,date:date||'',category:'Home',durationMinutes:30,completed:false,recurrence:'weekly',recurrenceConfig:{...weekly},subtasks:[{id:'s1',title:'Wipe',done:false}],createdAt:1,updatedAt:1,assigneeId:assignee},visibility:'household',household_id:HOUSEHOLD,assignee_id:assignee,completed_by:null,completed_at:null,cloud_version:1,deleted_at:null,recurrence:'weekly',task_date:date||null});
const db=makeDb();
db.tables.planly_tasks.push(row(OWNER,'own1','Kitchen',null,OWNER),row(PARTNER,'lak1','Bedroom',null,OWNER),row(OWNER,'dat1','Bins',key(in3),OWNER));
const {context,errors}=await newPhone(browser,db,OWNER);const page=await openApp(context,errors);
const rpc=[];page.on('request',r=>{if(r.url().includes('/rpc/planly_set_household_task_completed'))rpc.push(JSON.parse(r.postData()||'{}'))});
async function tick(id){for(const s of ['home','today','plan']){await page.evaluate(s=>document.querySelector(`.nav button[data-section="${s}"]`)?.click(),s);await W(900);
  if(s==='plan')await page.evaluate(()=>document.querySelector('[data-plan-segment="inbox"]')?.click()),await W(800);
  const ok=await page.evaluate(id=>{const b=[...document.querySelectorAll('[data-action="toggle"],[data-household-completion]')].find(b=>b.closest(`[data-id="${id}"],[data-task-id="${id}"]`)&&!b.closest('.done'));if(!b)return false;b.click();return true},id);if(ok)return s}return ''}
const nextRows=series=>db.tables.planly_tasks.filter(r=>r.client_id!==series&&(r.data?.seriesId===series||r.series_client_id===series)&&!r.deleted_at);
// 1. my own undated chore
let where=await tick('own1');await W(3000);
check('found and ticked my undated chore ('+where+')',!!where);
let nx=nextRows('own1');
check('a next copy of my chore is created',nx.length===1,JSON.stringify(nx.map(r=>r.data?.date)));
check('dated the next repeat day ('+key(nextSat)+')',nx[0]?.data?.date===key(nextSat),String(nx[0]?.data?.date));
check('its checklist starts unticked',nx[0]?.data?.subtasks?.[0]?.done===false,JSON.stringify(nx[0]?.data?.subtasks));
check('it is not completed and keeps the person',nx[0]&&!nx[0].data.completed&&(nx[0].assignee_id||nx[0].data.assigneeId)===OWNER,JSON.stringify(nx[0]?.data));
// 2. Laki's undated chore, ticked by me: the server is asked to make the next copy on the repeat day
where=await tick('lak1');await W(3000);
const call=rpc.find(c=>c.p_client_id==='lak1');
check('found and ticked Laki\'s undated chore ('+where+')',!!where);
check('server asked to complete it with next date '+key(nextSat),call&&call.p_completed===true&&call.p_next_date===key(nextSat),JSON.stringify(call));
// 3. dated repeat unchanged: next is a week after its own date's next Saturday
where=await tick('dat1');await W(3000);nx=nextRows('dat1');
const exp=new Date(in3);do{exp.setDate(exp.getDate()+1)}while(exp.getDay()!==6);
check('dated repeat still counts from its own date ('+key(exp)+')',nx.length===1&&nx[0].data?.date===key(exp),JSON.stringify(nx.map(r=>r.data?.date)));
check('no page errors',!errors.length,errors.slice(0,3).join(' | '));
console.log(`\n${pass} passed, ${fail} failed`);await browser.close();server.close();process.exit(fail?1:0);
