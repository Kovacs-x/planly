// Project stages: a project can have its own stages (e.g. Plan → Buy → Move in), set in Edit project and kept in the
// project's data. The project page groups the tasks by stage, each with a small progress bar and a quick add; tasks
// without a stage sit under Other. A task's stage is changed from its actions (your own tasks only). No database change.
// Run: node tests/browser/project-stages.test.mjs (see tests/browser/README.md).
import {startServer,launchBrowser,makeDb,newPhone,openApp,OWNER,PARTNER,HOUSEHOLD} from './harness.mjs';
const server=await startServer();const browser=await launchBrowser();
let pass=0,fail=0;const check=(n,c,d='')=>{console.log((c?'PASS ':'FAIL ')+n+(c?'':' — '+d));c?pass++:fail++};
const W=ms=>new Promise(r=>setTimeout(r,ms));
const now=new Date().toISOString();
const P=(owner,id,name,more={})=>({owner_id:owner,client_id:id,data:{id,name,dueDate:'',notes:'',visibility:more.visibility||'private',householdId:more.visibility?HOUSEHOLD:null,archived:false,createdAt:1,updatedAt:1,...more},visibility:more.visibility||'private',household_id:more.visibility?HOUSEHOLD:null,name,due_date:null,notes:'',archived:false,cloud_version:1,deleted_at:null});
const T=(owner,id,proj,title,done,more={})=>{const vis=more.visibility||'private';return {owner_id:owner,client_id:id,data:{id,title,date:'',time:'',category:'Personal',durationMinutes:30,priority:'normal',completed:done,completedAt:done?now:null,recurrence:'none',reminder:'none',notes:'',subtasks:[],createdAt:1,updatedAt:1,visibility:vis,householdId:vis==='household'?HOUSEHOLD:null,assigneeId:null,projectId:proj,...(more.stageId?{stageId:more.stageId}:{})},visibility:vis,household_id:vis==='household'?HOUSEHOLD:null,assignee_id:null,completed_by:done?owner:null,completed_at:done?now:null,cloud_version:1,deleted_at:null,task_date:null}};
const db=makeDb();
db.tables.planly_projects.push(P(OWNER,'p1','Move into new flat',{stages:[{id:'s1',name:'Plan'},{id:'s2',name:'Buy'}]}),P(OWNER,'p2','Garden'),P(PARTNER,'p3',"Laki's plan",{visibility:'household',stages:[{id:'x1',name:'Start'}]}));
db.tables.planly_tasks.push(T(OWNER,'a','p1','Measure rooms',true,{stageId:'s1'}),T(OWNER,'b','p1','Book viewing',true,{stageId:'s1'}),T(OWNER,'c','p1','Order sofa',false,{stageId:'s2'}),T(OWNER,'d','p1','Buy lamp',true,{stageId:'s2'}),T(OWNER,'e','p1','Change address',false),T(OWNER,'g','p2','Plant seeds',false),T(PARTNER,'l','p3',"Laki's step",false,{visibility:'household',stageId:'x1'}));
const {context,errors}=await newPhone(browser,db,OWNER);const page=await openApp(context,errors);
const list=async()=>{await page.evaluate(()=>document.querySelector('.nav button[data-section="plan"]').click());await W(800);await page.evaluate(()=>document.querySelector('[data-plan-segment="projects"]').click());await W(1000)};
const openP=async(id,owner=null)=>{await page.evaluate(()=>document.getElementById('projectsClose')?.click());await list();await page.evaluate(([id,o])=>document.querySelector(`#view [data-r1-project="${id}"]${o?`[data-r1-owner="${o}"]`:''}`).click(),[id,owner]);await W(900)};
const stages=()=>page.evaluate(()=>[...document.querySelectorAll('#projectsContent .pjStage')].map(g=>({name:g.querySelector('.pjStageHead strong')?.textContent,count:g.querySelector('.pjStageHead small')?.textContent||'',done:g.classList.contains('done'),tasks:[...g.querySelectorAll('.projectTaskList [data-id]')].map(e=>e.dataset.id),quick:!!g.querySelector('[data-project-quick]')})));
const row=id=>db.tables.planly_tasks.find(r=>r.client_id===id);

await openP('p1');let g=await stages();
check('tasks are grouped by stage, with tasks done / in the stage',JSON.stringify(g.map(x=>[x.name,x.count,x.tasks]))===JSON.stringify([['Plan','2/2',[]],['Buy','1/2',['c']],['Other','',['e']]]),JSON.stringify(g));
check('a finished stage is marked done',g[0].done&&!g[1].done,JSON.stringify(g.map(x=>x.done)));
check('each stage has its own quick add (and no extra one at the top)',g[0].quick&&g[1].quick&&!g[2].quick&&await page.evaluate(()=>!document.getElementById('projectQuickAdd')),JSON.stringify(g.map(x=>x.quick)));
// quick add into Buy
await page.evaluate(()=>{const f=document.querySelector('#projectsContent [data-stage-id="s2"]');f.querySelector('input').value='Buy boxes';f.requestSubmit()});await W(2500);
const nb=db.tables.planly_tasks.find(r=>r.data?.title==='Buy boxes');
check('adding to a stage saves the task in that stage',!!nb&&nb.data.projectId==='p1'&&nb.data.stageId==='s2'&&nb.visibility==='private',JSON.stringify(nb?.data));
g=await stages();check('…and it shows in that stage',g[1].tasks.includes(nb?.client_id)&&g[1].count==='1/3',JSON.stringify(g[1]));
// move a task to a stage from its actions
await page.evaluate(()=>document.querySelector('#projectsContent .pjStageOther [data-id="e"] .taskTitle,#projectsContent .pjStageOther [data-id="e"]').click());await W(700);
let sel=await page.evaluate(()=>{const s=document.getElementById('taskActionStage');return s?[...s.options].map(o=>o.textContent):null});
if(!sel){await page.evaluate(()=>{const t=document.querySelector('#projectsContent [data-id="e"] [data-action="actions"],#projectsContent [data-id="e"] .taskMenuBtn,#projectsContent [data-id="e"] [aria-label*="ore"]');t?.click()});await W(700);sel=await page.evaluate(()=>{const s=document.getElementById('taskActionStage');return s?[...s.options].map(o=>o.textContent):null})}
check('a task\'s actions offer its project\'s stages',JSON.stringify(sel)===JSON.stringify(['No stage','Plan','Buy']),JSON.stringify(sel));
await page.evaluate(()=>{const s=document.getElementById('taskActionStage');s.value='s1';s.dispatchEvent(new Event('change',{bubbles:true}))});await W(2500);
check('choosing a stage saves it on the task',row('e').data.stageId==='s1',JSON.stringify(row('e').data.stageId));
await page.evaluate(()=>document.getElementById('taskActionClose')?.click());await W(400);await openP('p1');g=await stages();
check('…and the task moves to that stage (Other goes away when empty)',g.length===2&&g[0].tasks.includes('e')&&g[0].count==='2/3'&&!g[0].done,JSON.stringify(g));
// stages in the editor
await openP('p2');
await page.evaluate(()=>document.querySelector('[data-project-action="edit"]').click());await W(500);
for(const nm of ['Prepare','Plant']){await page.evaluate(()=>document.querySelector('[data-project-stage-add]').click());await W(150);await page.evaluate(nm=>{const r=[...document.querySelectorAll('#projectStages [data-stage-id]')].at(-1);r.value=nm},nm)}
await page.evaluate(()=>document.getElementById('projectForm').requestSubmit());await W(2500);
const r2=db.tables.planly_projects.find(r=>r.client_id==='p2');
check('stages are added in Edit project and saved with the project',JSON.stringify((r2.data.stages||[]).map(x=>x.name))==='["Prepare","Plant"]'&&r2.data.stages.every(x=>x.id),JSON.stringify(r2.data.stages));
g=await stages();check('…and the page shows them, with the existing task under Other',JSON.stringify(g.map(x=>x.name))==='["Prepare","Plant","Other"]'&&g[2].tasks.includes('g'),JSON.stringify(g));
// remove a stage: its tasks fall back to Other
await openP('p1');await page.evaluate(()=>document.querySelector('[data-project-action="edit"]').click());await W(500);
await page.evaluate(()=>[...document.querySelectorAll('#projectStages [data-stage-id]')].find(i=>i.value==='Buy').closest('.pjStageRow').querySelector('[data-project-stage-remove]').click());
await page.evaluate(()=>document.getElementById('projectForm').requestSubmit());await W(2500);
g=await stages();
check('removing a stage keeps its tasks, under Other',JSON.stringify(g.map(x=>x.name))==='["Plan","Other"]'&&g[1].tasks.includes('c'),JSON.stringify(g));
// shared project of someone else
await openP('p3',PARTNER);g=await stages();
check('someone else\'s shared project shows its stages without quick add',g.length===1&&g[0].name==='Start'&&!g[0].quick,JSON.stringify(g));
check('no page errors',errors.length===0,errors.slice(0,3).join(' | '));
console.log(`${pass} passed, ${fail} failed`);await browser.close();server.close();process.exit(fail?1:0);
