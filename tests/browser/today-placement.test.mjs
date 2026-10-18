// What shows on Today: where a task is made decides it (Today: on; Home → Add chore and a project's Add task: off), and the
// task sheet's "Show on Today" changes it. Older tasks without the setting: project tasks and household chores stay off
// Today. "Unscheduled" counts only loose to-dos with no date. Completed tasks drop out of lists a week after they were ticked.
// Run: node tests/browser/today-placement.test.mjs (see tests/browser/README.md).
import {startServer,launchBrowser,makeDb,newPhone,openApp,OWNER,HOUSEHOLD} from './harness.mjs';
const server=await startServer();const browser=await launchBrowser();
let pass=0,fail=0;const check=(n,c,d='')=>{console.log((c?'PASS ':'FAIL ')+n+(c?'':' — '+d));c?pass++:fail++};
const W=ms=>new Promise(r=>setTimeout(r,ms));
const key=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
const today=key(new Date()),yesterday=key(new Date(Date.now()-864e5)),tomorrow=key(new Date(Date.now()+864e5)),daysAgo=n=>new Date(Date.now()-n*864e5).toISOString();
const T=(id,title,more={})=>{const shared=more.visibility==='household',data={id,title,date:today,time:'',category:'Personal',durationMinutes:30,priority:'normal',completed:false,recurrence:'none',reminder:'none',notes:'',subtasks:[],createdAt:1,updatedAt:1,projectId:'',visibility:shared?'household':'private',householdId:shared?HOUSEHOLD:null,assigneeId:null,...more};
  return {owner_id:OWNER,client_id:id,data,visibility:data.visibility,household_id:data.householdId,assignee_id:null,completed_by:null,completed_at:more.completedAt||null,cloud_version:1,deleted_at:null,task_date:data.date||null}};
const db=makeDb();
db.tables.planly_projects.push({owner_id:OWNER,client_id:'p1',data:{id:'p1',name:'House move',dueDate:'',notes:'',visibility:'private',householdId:null,archived:false,createdAt:1,updatedAt:1},visibility:'private',household_id:null,name:'House move',due_date:null,notes:'',archived:false,cloud_version:1,deleted_at:null});
db.tables.planly_tasks.push(
  T('plain','Dentist'),
  T('proj','Pack boxes',{projectId:'p1'}),
  T('projLate','Book van',{projectId:'p1',date:yesterday}),
  T('projOn','Call landlord',{projectId:'p1',showOnToday:true}),
  T('chore','Bins',{visibility:'household'}),
  T('choreOn','Hoover',{visibility:'household',showOnToday:true}),
  T('loose','Fix shelf',{date:''}),
  T('looseChore','Clean oven',{date:'',visibility:'household'}),
  T('looseProj','Measure rooms',{date:'',projectId:'p1'}),
  T('doneNew','Post letter',{date:'',completed:true,completedAt:daysAgo(2)}),
  T('doneOld','Return parcel',{date:'',completed:true,completedAt:daysAgo(8)}),
  T('projDoneOld','Order boxes',{projectId:'p1',completed:true,completedAt:daysAgo(9)}),
  T('lateLoose','Return library book',{date:yesterday}),
  T('projNext','Order skip',{projectId:'p1',date:tomorrow}),
  T('projNextOn','Book removal men',{projectId:'p1',date:tomorrow,showOnToday:true}),
  T('nextLoose','Gym',{date:tomorrow}));
const {context,errors}=await newPhone(browser,db,OWNER);const page=await openApp(context,errors);
const nav=s=>page.evaluate(s=>document.querySelector(`.nav button[data-section="${s}"]`).click(),s);
const shown=()=>page.evaluate(()=>[...document.querySelectorAll('#view [data-id]')].map(e=>e.dataset.id));
const row=id=>db.tables.planly_tasks.find(r=>r.data?.title===id);
const save=async title=>{await page.evaluate(t=>{const i=document.getElementById('taskTitle');i.value=t;i.dispatchEvent(new Event('input',{bubbles:true}));document.getElementById('taskForm').requestSubmit()},title);await W(2000)};
const toggle=()=>page.evaluate(()=>document.getElementById('taskShowToday')?.checked);

await nav('today');await W(1500);let ids=await shown();
check('Today shows a plain task, and project tasks or chores only when switched on',ids.includes('plain')&&ids.includes('projOn')&&ids.includes('choreOn')&&!ids.includes('proj')&&!ids.includes('chore'),JSON.stringify(ids));
check('an overdue project task is not on Today either',!ids.includes('projLate'),JSON.stringify(ids));
const link=await page.evaluate(()=>document.querySelector('[data-r1-plan-inbox]')?.textContent||'');
check('"unscheduled" counts only the loose to-do with no date (not chores, project tasks or done tasks)',/^1 unscheduled/.test(link),link);
await page.evaluate(()=>document.querySelector('[data-r1-plan-inbox]').click());await W(1000);ids=await shown();
check('the Inbox lists that to-do and a task done 2 days ago, not one done 8 days ago, a chore or a project task',ids.includes('loose')&&ids.includes('doneNew')&&!ids.includes('doneOld')&&!ids.includes('looseChore')&&!ids.includes('looseProj'),JSON.stringify(ids));

// Project tasks live in their project: not in Upcoming or Month unless switched on, and never suggested for Today
await nav('plan');await W(800);await page.evaluate(()=>document.querySelector('[data-plan-segment="upcoming"]').click());await W(900);ids=await shown();
check('Upcoming leaves out a project task unless it is switched on for Today',ids.includes('nextLoose')&&ids.includes('projNextOn')&&!ids.includes('projNext'),JSON.stringify(ids));
await page.evaluate(()=>document.querySelector('[data-plan-segment="month"]').click());await W(900);
await page.evaluate(d=>document.querySelector(`[data-date="${d}"]`)?.click(),tomorrow);await W(900);ids=await shown();
check('Month leaves it out too',ids.includes('nextLoose')&&ids.includes('projNextOn')&&!ids.includes('projNext'),JSON.stringify(ids));
await nav('today');await W(1000);await page.evaluate(()=>document.querySelector('[data-suggest-open]')?.click());await W(1200);
const sugg=await page.evaluate(()=>document.querySelector('.sheetWrap.open, .suggestWrap.open, [class*="uggest"][class*="open"]')?.innerText||document.body.innerText);
check('Suggestions offer an overdue to-do but no project task kept off Today',sugg.includes('Return library book')&&!sugg.includes('Book van')&&!sugg.includes('Pack boxes')&&!sugg.includes('Order skip'),sugg.slice(0,400));
await page.keyboard.press('Escape');await W(300);await page.reload();await W(2500);

// Where a task is made
await nav('today');await W(1000);await page.evaluate(()=>document.getElementById('addBtn').click());await W(800);
check('a task added from Today is switched on for Today',await toggle()===true);
await save('Ring mum');
check('…and saved with it on, and shown on Today',row('Ring mum')?.data.showOnToday===true&&(await shown()).includes(row('Ring mum')?.client_id),JSON.stringify(row('Ring mum')?.data));
await nav('home');await W(1200);await page.evaluate(()=>document.querySelector('[data-add-chore]').click());await W(800);
check('a chore added from Home is switched off for Today',await toggle()===false);
await save('Water plants');
const plants=row('Water plants');
check('…and saved shared, switched off',plants&&plants.visibility==='household'&&plants.data.showOnToday===false,JSON.stringify(plants&&{v:plants.visibility,on:plants.data.showOnToday}));
await nav('today');await W(1200);
check('…so it is not on Today',!(await shown()).includes(plants?.client_id),JSON.stringify(await shown()));
await nav('plan');await W(800);await page.evaluate(()=>document.querySelector('[data-plan-segment="projects"]').click());await W(800);
await page.evaluate(()=>document.querySelector('[data-r1-project="p1"]').click());await W(800);
const detail=await page.evaluate(()=>document.getElementById('projectsContent').innerText);
check('a project\'s completed tasks hide a week after they were ticked',detail.includes('Pack boxes')&&!detail.includes('Order boxes'),detail.slice(0,300));
await page.evaluate(()=>document.querySelector('[data-project-action="add-task"]').click());await W(800);
check('a task added from a project is switched off for Today',await toggle()===false);
await save('Label boxes');
const label=row('Label boxes');
check('…and saved in the project, switched off',label&&label.data.projectId==='p1'&&label.data.showOnToday===false,JSON.stringify(label?.data));
await page.evaluate(()=>document.getElementById('projectsClose')?.click());await W(500);

// Switching an existing project task on
await nav('today');await W(1000);
check('…so it is not on Today',!(await shown()).includes(label?.client_id));
await nav('plan');await W(800);
await page.evaluate(()=>document.querySelector('[data-plan-segment="projects"]').click());await W(800);await page.evaluate(()=>document.querySelector('[data-r1-project="p1"]').click());await W(800);
await page.evaluate(()=>{const card=document.querySelector('#projectsContent [data-id="proj"]');(card.querySelector('[data-action="edit"]')||card.querySelector('[data-action="actions"]')).click()});await W(600);
await page.evaluate(()=>document.querySelector('#taskActionWrap.open [data-task-menu="edit"],#taskActionWrap.open [data-task-action="edit"]')?.click());await W(900);
check('an older project task opens switched off',await toggle()===false);
await page.evaluate(()=>{document.getElementById('taskShowToday').checked=true;document.getElementById('taskForm').requestSubmit()});await W(2000);
await page.evaluate(()=>document.getElementById('projectsClose')?.click());await W(500);
await nav('today');await W(1200);
check('switching it on puts it on Today',row('Pack boxes')?.data.showOnToday===true&&(await shown()).includes('proj'),JSON.stringify(await shown()));
check('no page errors',errors.length===0,errors.slice(0,3).join(' | '));
console.log(`${pass} passed, ${fail} failed`);await browser.close();server.close();process.exit(fail?1:0);
