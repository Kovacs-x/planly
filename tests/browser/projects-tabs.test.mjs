// Bottom tabs always work from Projects (PR #250). Run: node tests/browser/projects-tabs.test.mjs (see tests/browser/README.md).
import {startServer,launchBrowser,makeDb,newPhone,openApp,OWNER} from './harness.mjs';
const server=await startServer();const browser=await launchBrowser();
let pass=0,fail=0;const check=(n,c,d='')=>{console.log((c?'PASS ':'FAIL ')+n+(c?'':' — '+d));c?pass++:fail++};
const W=ms=>new Promise(r=>setTimeout(r,ms));
const db=makeDb();db.tables.planly_projects.push({owner_id:OWNER,client_id:'p1',data:{id:'p1',name:'House move',dueDate:'',notes:'',visibility:'private',householdId:null,archived:false,createdAt:1,updatedAt:1},visibility:'private',household_id:null,name:'House move',due_date:null,notes:'',archived:false,cloud_version:1,deleted_at:null});
const {context,errors}=await newPhone(browser,db,OWNER);const page=await openApp(context,errors);
const writes=[];page.on('request',r=>{if(r.url().includes('/rest/v1/planly_projects')&&r.method()!=='GET')writes.push(r.method()+' '+(r.postData()||'').slice(0,80))});
const look=()=>page.evaluate(()=>({open:document.getElementById('projectsWrap')?.classList.contains('open'),active:document.querySelector('.nav button.active')?.dataset.section||'',title:document.getElementById('pageTitle')?.textContent||'',projects:[...document.querySelectorAll('.nav')].length}));
const nav=s=>page.evaluate(s=>document.querySelector(`.nav button[data-section="${s}"]`).click(),s);
const home=async()=>{await nav('plan');await W(800);await page.evaluate(()=>document.querySelector('[data-plan-segment="projects"]').click());await W(800)};
const newProject=async name=>{await home();await page.evaluate(()=>document.querySelector('[data-r1-project-new]').click());await W(600);if(name!==undefined)await page.evaluate(n=>{document.getElementById('projectName').value=n},name)};
const editProject=async()=>{await home();await page.evaluate(()=>document.querySelector('[data-r1-project="p1"]').click());await W(600);await page.evaluate(()=>document.querySelector('[data-project-action="edit"]').click());await W(500)};
const srvNames=()=>db.tables.planly_projects.filter(r=>!r.deleted_at).map(r=>r.data?.name||r.name);
// 1. new project with a name, tap Today
await newProject('Garden');let s=await look();check('editor is open for a new project',s.open&&await page.evaluate(()=>!!document.getElementById('projectName')),JSON.stringify(s));
await nav('today');await W(2500);s=await look();
check('tapping Today closes Projects and shows Today',!s.open&&s.active==='today'&&/Today/.test(s.title),JSON.stringify(s));
check('the named new project was saved',srvNames().includes('Garden')&&await page.evaluate(()=>!!document.body.innerText),JSON.stringify(srvNames()));
await page.evaluate(()=>document.querySelector('.nav button[data-section="plan"]').click());await W(800);s=await look();
check('app keeps responding: Plan opens next',s.active==='plan'&&!s.open,JSON.stringify(s));
// 2. new project with no name, tap Plan
const before=srvNames().length;await newProject('');await nav('plan');await W(2000);s=await look();
check('empty new project: tab opens, nothing saved',!s.open&&s.active==='plan'&&srvNames().length===before,JSON.stringify({s,n:srvNames()}));
// 3. existing project, no changes, tap Budget
await editProject();writes.length=0;await nav('budget');await W(2000);s=await look();
check('unchanged edit: Budget opens, no project write',!s.open&&s.active==='budget'&&writes.length===0,JSON.stringify({s,writes}));
// 4. existing project renamed, tap Home
await editProject();await page.evaluate(()=>{document.getElementById('projectName').value='House move 2'});await nav('home');await W(2500);s=await look();
check('renamed project: Home shows, rename saved',!s.open&&s.active==='home'&&srvNames().includes('House move 2'),JSON.stringify({s,n:srvNames()}));
// 5. projects list / detail views
await home();await page.evaluate(()=>document.querySelector('[data-r1-project="p1"]').click());await W(600);s=await look();check('project detail is open',s.open,JSON.stringify(s));
await nav('today');await W(1200);s=await look();check('project detail: tapping Today closes it',!s.open&&s.active==='today',JSON.stringify(s));
// 6. reviewer: typed work with no name is never silently discarded
const toast=()=>page.evaluate(()=>[...document.querySelectorAll('#planlyToast,.toast,[role="status"]')].map(e=>e.innerText).join(' '));
let n0=srvNames().length;await newProject('');await page.evaluate(()=>{document.getElementById('projectNotes').value='Buy seeds'});await nav('today');await W(1200);s=await look();
check('new project with notes but no name: editor stays open, nothing saved',s.open&&await page.evaluate(()=>document.getElementById('projectNotes')?.value==='Buy seeds')&&srvNames().length===n0,JSON.stringify({s,n:srvNames()}));
check('it says to add a name or tap ‹ to discard',/Add a project name/.test(await toast()),await toast());
await page.evaluate(()=>{document.getElementById('projectName').value='Seeds'});await nav('today');await W(2500);s=await look();
check('after adding a name, the tab works and the project is saved',!s.open&&s.active==='today'&&srvNames().includes('Seeds'),JSON.stringify({s,n:srvNames()}));
await newProject('');await page.evaluate(()=>{document.getElementById('projectDueDate').value='2026-12-01'});await page.evaluate(()=>document.getElementById('projectsBack').click());await W(500);await nav('plan');await W(1000);s=await look();
check('tapping ‹ discards it, then tabs work',!s.open&&s.active==='plan'&&srvNames().length===n0+1,JSON.stringify({s,n:srvNames()}));
await editProject();await page.evaluate(()=>{document.getElementById('projectName').value='';document.getElementById('projectNotes').value='new note'});writes.length=0;await nav('budget');await W(1500);s=await look();
check('existing project with name cleared and notes changed: editor stays open, no write',s.open&&writes.length===0,JSON.stringify({s,writes}));
await page.evaluate(()=>document.getElementById('projectsBack').click());await W(500);await nav('budget');await W(1000);s=await look();
check('tapping ‹ then a tab leaves without saving',!s.open&&s.active==='budget'&&!srvNames().includes(''),JSON.stringify({s,n:srvNames()}));
// 7. reviewer: sharing choice on a new project
n0=srvNames().length;await newProject('');s=await look();const vis0=await page.evaluate(()=>document.getElementById('projectVisibility')?.value);
await nav('today');await W(1200);s=await look();
check('untouched new project (default Private): tab opens, nothing saved',vis0==='private'&&!s.open&&s.active==='today'&&srvNames().length===n0,JSON.stringify({vis0,s,n:srvNames()}));
await newProject('');await page.evaluate(()=>{const v=document.getElementById('projectVisibility');v.value='household';v.dispatchEvent(new Event('change',{bubbles:true}))});await nav('today');await W(1200);s=await look();
check('new project switched to Household with no name: editor stays open, Household kept, nothing saved',s.open&&await page.evaluate(()=>document.getElementById('projectVisibility')?.value==='household')&&srvNames().length===n0,JSON.stringify({s,n:srvNames()}));
check('it shows the add-a-name message',/Add a project name/.test(await toast()),await toast());
await page.evaluate(()=>{document.getElementById('projectName').value='Shared garden'});await nav('today');await W(2500);s=await look();
const sg=db.tables.planly_projects.find(r=>(r.data?.name||r.name)==='Shared garden');
check('after naming it, it saves as a Household project and the tab opens',!s.open&&s.active==='today'&&sg?.visibility==='household',JSON.stringify({s,vis:sg?.visibility}));
check('no page errors',!errors.length,errors.slice(0,3).join(' | '));
console.log(`\n${pass} passed, ${fail} failed`);await browser.close();server.close();process.exit(fail?1:0);
