// Two members can each have a project with the same id. On the projects list each card shows its own project's status
// (from that project's own tasks and due date) and its own next task, and tapping it opens that project — someone else's
// shared project opens read-only.
// Run: node tests/browser/projects-owners.test.mjs (see tests/browser/README.md).
import {startServer,launchBrowser,makeDb,newPhone,openApp,OWNER,PARTNER,HOUSEHOLD} from './harness.mjs';
const server=await startServer();const browser=await launchBrowser();
let pass=0,fail=0;const check=(n,c,d='')=>{console.log((c?'PASS ':'FAIL ')+n+(c?'':' — '+d));c?pass++:fail++};
const W=ms=>new Promise(r=>setTimeout(r,ms));
const key=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
const n=new Date(),day=k=>key(new Date(n.getFullYear(),n.getMonth(),n.getDate()+k));
const P=(owner,name,due,vis)=>({owner_id:owner,client_id:'same',data:{id:'same',name,dueDate:due,notes:'',visibility:vis,householdId:vis==='household'?HOUSEHOLD:null,archived:false,createdAt:1,updatedAt:1},visibility:vis,household_id:vis==='household'?HOUSEHOLD:null,name,due_date:due,notes:'',archived:false,cloud_version:1,deleted_at:null});
const T=(owner,id,title,more={})=>{const vis=more.visibility||'private';return {owner_id:owner,client_id:id,data:{id,title,date:more.date||'',time:'',category:'Personal',durationMinutes:30,priority:'normal',completed:false,recurrence:'none',reminder:'none',notes:'',subtasks:[],createdAt:1,updatedAt:1,visibility:vis,householdId:vis==='household'?HOUSEHOLD:null,assigneeId:null,projectId:'same'},visibility:vis,household_id:vis==='household'?HOUSEHOLD:null,assignee_id:null,completed_by:null,completed_at:null,cloud_version:1,deleted_at:null,task_date:more.date||null}};
const db=makeDb();
// mine: due in 5 days, nothing scheduled -> At risk; Laki's (shared): due in 30 days, work scheduled -> on track (a ring)
db.tables.planly_projects.push(P(OWNER,'My plan',day(5),'private'),P(PARTNER,"Laki's plan",day(30),'household'));
db.tables.planly_tasks.push(T(OWNER,'m1','My first step'),T(PARTNER,'l1',"Laki's step",{date:day(3),visibility:'household'}));
const {context,errors}=await newPhone(browser,db,OWNER);const page=await openApp(context,errors);
const open=async()=>{await page.evaluate(()=>document.querySelector('.nav button[data-section="plan"]').click());await W(800);await page.evaluate(()=>document.querySelector('[data-plan-segment="projects"]').click());await W(1200)};
const cards=()=>page.evaluate(()=>[...document.querySelectorAll('#view [data-r1-project]')].map(c=>({owner:c.dataset.r1Owner,name:c.querySelector('strong')?.textContent,chip:c.querySelector('.pjChip')?.textContent||'',ring:c.querySelector('.pjRing b')?.textContent||'',next:c.querySelector('.pjNextText')?.textContent.trim()||''})));
await open();let c=await cards();const mine=c.find(x=>x.owner===OWNER)||{},laki=c.find(x=>x.owner===PARTNER)||{};
check('both projects with the same id are listed, each with its owner',c.length===2&&mine.name==='My plan'&&laki.name==="Laki's plan",JSON.stringify(c));
check('my project shows its own status (due soon, nothing scheduled: At risk)',mine.chip==='At risk',JSON.stringify(mine));
check('Laki\'s project shows its own status (on track: a ring, not At risk)',!laki.chip&&laki.ring==='0%',JSON.stringify(laki));
check('each card shows its own next task',/My first step/.test(mine.next)&&/Laki's step/.test(laki.next),JSON.stringify([mine.next,laki.next]));
const panel=()=>page.evaluate(()=>({open:document.getElementById('projectsWrap')?.classList.contains('open'),title:document.getElementById('projectsTitle')?.textContent,edit:!!document.querySelector('#projectsContent [data-project-action="edit"]'),viewOnly:/View only/.test(document.getElementById('projectsContent')?.textContent||'')}));
await page.evaluate(o=>document.querySelector(`#view [data-r1-project][data-r1-owner="${o}"]`).click(),PARTNER);await W(800);
let s=await panel();
check('tapping Laki\'s card opens Laki\'s project, read-only',s.open&&s.title==="Laki's plan"&&!s.edit&&s.viewOnly,JSON.stringify(s));
await page.evaluate(()=>document.getElementById('projectsClose')?.click());await W(400);await open();
await page.evaluate(o=>document.querySelector(`#view [data-r1-project][data-r1-owner="${o}"]`).click(),OWNER);await W(800);
s=await panel();
check('tapping my card opens my project, which I can edit',s.open&&s.title==='My plan'&&s.edit&&!s.viewOnly,JSON.stringify(s));
check('no page errors',errors.length===0,errors.slice(0,3).join(' | '));
console.log(`${pass} passed, ${fail} failed`);await browser.close();server.close();process.exit(fail?1:0);
