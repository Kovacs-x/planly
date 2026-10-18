// A project keeps all its done tasks (folded), even ones done weeks ago. Project saves that go wrong. (1) The server refuses a project save: the change is kept on the phone and still waits to
// sync (nothing is lost), and it goes through once the server accepts it again. (2) A project restored while its delete is
// still on the way to the server: the restore is kept and sent after the delete, so the project comes back.
// Run: node tests/browser/project-sync.test.mjs (see tests/browser/README.md).
import {startServer,launchBrowser,makeDb,newPhone,openApp,OWNER} from './harness.mjs';
const server=await startServer();const browser=await launchBrowser();
let pass=0,fail=0;const check=(n,c,d='')=>{console.log((c?'PASS ':'FAIL ')+n+(c?'':' — '+d));c?pass++:fail++};
const W=ms=>new Promise(r=>setTimeout(r,ms));
const P=(id,name)=>({owner_id:OWNER,client_id:id,data:{id,name,dueDate:'',notes:'',visibility:'private',householdId:null,archived:false,createdAt:1,updatedAt:1},visibility:'private',household_id:null,name,due_date:null,notes:'',archived:false,cloud_version:1,deleted_at:null});
const db=makeDb();db.tables.planly_projects.push(P('p1','House move'),P('p2','Garden'));
const old=new Date(Date.now()-30*864e5).toISOString();
db.tables.planly_tasks.push({owner_id:OWNER,client_id:'t1',data:{id:'t1',title:'Find a van',date:'',time:'',category:'Personal',durationMinutes:30,priority:'normal',completed:true,completedAt:old,recurrence:'none',reminder:'none',notes:'',subtasks:[],createdAt:1,updatedAt:1,visibility:'private',householdId:null,assigneeId:null,projectId:'p1'},visibility:'private',household_id:null,assignee_id:null,completed_by:OWNER,completed_at:old,cloud_version:1,deleted_at:null,task_date:null});
const {context,errors}=await newPhone(browser,db,OWNER);const page=await openApp(context,errors);
const KEY='planly-cloud-pending-v1:'+OWNER;
const pending=()=>page.evaluate(k=>JSON.parse(localStorage.getItem(k)||'[]').filter(x=>x.kind==='project').map(x=>({id:x.id,action:x.action,status:x.status,name:x.data?.name})),KEY);
const row=id=>db.tables.planly_projects.find(r=>r.client_id===id);
const nav=s=>page.evaluate(s=>document.querySelector(`.nav button[data-section="${s}"]`).click(),s);
const home=async()=>{await nav('plan');await W(800);await page.evaluate(()=>document.querySelector('[data-plan-segment="projects"]').click());await W(800)};
const shown=()=>page.evaluate(()=>[...document.querySelectorAll('[data-r1-project] strong')].map(e=>e.textContent.trim()));

// 0. a task done 30 days ago still shows in its project's Completed fold
await home();await page.evaluate(()=>document.querySelector('[data-r1-project="p1"]').click());await W(700);
check('a project shows its done tasks, even one done a month ago',await page.evaluate(()=>{const f=document.querySelector('#projectsContent .doneFold');return !!f&&/Completed \(1\)/.test(f.querySelector('summary').textContent)&&/Find a van/.test(f.textContent)}));
await page.evaluate(()=>document.getElementById('projectsClose')?.click());await nav('today');await W(600);

// 1. the server refuses the save
db.fail=({table,method})=>table==='planly_projects'&&method!=='GET'?[403,{code:'42501',message:'new row violates row-level security policy for table "planly_projects"'}]:null;
await home();await page.evaluate(()=>document.querySelector('[data-r1-project="p1"]').click());await W(600);
await page.evaluate(()=>document.querySelector('[data-project-action="edit"]').click());await W(500);
await page.evaluate(()=>{document.getElementById('projectName').value='House move 2'});await nav('today');await W(3000);
check('a refused save is not written to the server',row('p1').data.name==='House move'&&row('p1').cloud_version===1,JSON.stringify(row('p1').data.name));
await home();
check('…the change is kept on the phone',(await shown()).includes('House move 2'),JSON.stringify(await shown()));
const p1=await pending();
check('…and still waits to sync',p1.some(x=>x.id==='p1'&&x.name==='House move 2'),JSON.stringify(p1));
check('…and the sync chip does not say Synced',await page.evaluate(()=>!/^Synced$/.test(document.querySelector('#planlySyncChip .syncChipText')?.textContent.trim()||'')),await page.evaluate(()=>document.querySelector('#planlySyncChip')?.textContent));
db.fail=null;
await page.evaluate(()=>window.dispatchEvent(new Event('online')));await W(3500);
check('once the server accepts it again, the change is saved and nothing is left waiting',row('p1').data.name==='House move 2'&&!(await pending()).some(x=>x.id==='p1'),JSON.stringify({srv:row('p1').data.name,pending:await pending()}));

// 2. a restore that arrives while the project's delete is still on its way
await page.evaluate(([k,v])=>{const l=JSON.parse(localStorage.getItem(k)||'[]');l.push({kind:'project',action:'delete',id:'p2',data:null,baseVersion:v,baseData:null,operationId:'del-p2',stagedAt:new Date().toISOString(),lastEditedAt:new Date().toISOString(),attempts:0,lastAttemptAt:'',lastError:'',status:'queued',edits:1});localStorage.setItem(k,JSON.stringify(l))},[KEY,row('p2').cloud_version]);
db.delays.planly_projects=1500;
await page.evaluate(()=>window.dispatchEvent(new Event('online')));await W(500);
// while the delete is in flight, the project is restored (a newer write for the same project)
await page.evaluate(k=>{const l=JSON.parse(localStorage.getItem(k)||'[]'),i=l.findIndex(x=>x.kind==='project'&&x.id==='p2');l[i]={...l[i],action:'upsert',data:{id:'p2',name:'Garden',dueDate:'',notes:'',visibility:'private',householdId:null,archived:false,createdAt:1,updatedAt:Date.now()},lastEditedAt:new Date(Date.now()+1).toISOString(),edits:l[i].edits+1};localStorage.setItem(k,JSON.stringify(l))},KEY);
for(let i=0;i<40&&!row('p2').deleted_at;i++)await W(50);
const mid=await pending();
check('the delete reached the server, and the newer restore is still waiting, not dropped',!!row('p2').deleted_at&&mid.some(x=>x.id==='p2'&&x.action==='upsert'),JSON.stringify({deleted:row('p2').deleted_at,mid}));
db.delays.planly_projects=0;
await page.evaluate(()=>window.dispatchEvent(new Event('online')));await W(3500);
check('…and once it is sent, the project is back on the server and nothing is left waiting',!row('p2').deleted_at&&row('p2').cloud_version>=3&&!(await pending()).some(x=>x.id==='p2'),JSON.stringify({deleted:row('p2').deleted_at,v:row('p2').cloud_version,pending:await pending()}));
check('no page errors',errors.length===0,errors.slice(0,3).join(' | '));
console.log(`${pass} passed, ${fail} failed`);await browser.close();server.close();process.exit(fail?1:0);
