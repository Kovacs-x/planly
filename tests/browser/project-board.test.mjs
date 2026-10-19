// Project board view: a List / Board switch on the project page (remembered on this phone). The board has To do / Doing /
// Done columns; ▶ Start moves a task to Doing (kept as doing:true in the task's data), ↩ moves it back, ✓ Done completes it
// through the usual completion. Cards show the stage, the day (Late in red) and who it is for, and open the task's actions.
// Someone else's shared project shows its board without moves. Stages with a repeated id are shown once.
// Run: node tests/browser/project-board.test.mjs (see tests/browser/README.md).
import {startServer,launchBrowser,makeDb,newPhone,openApp,OWNER,PARTNER,HOUSEHOLD} from './harness.mjs';
const server=await startServer();const browser=await launchBrowser();
let pass=0,fail=0;const check=(n,c,d='')=>{console.log((c?'PASS ':'FAIL ')+n+(c?'':' — '+d));c?pass++:fail++};
const W=ms=>new Promise(r=>setTimeout(r,ms));
const key=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
const n=new Date(),day=k=>key(new Date(n.getFullYear(),n.getMonth(),n.getDate()+k)),now=n.toISOString();
const P=(owner,id,name,more={})=>({owner_id:owner,client_id:id,data:{id,name,dueDate:'',notes:'',visibility:more.visibility||'private',householdId:more.visibility?HOUSEHOLD:null,archived:false,createdAt:1,updatedAt:1,...more},visibility:more.visibility||'private',household_id:more.visibility?HOUSEHOLD:null,name,due_date:null,notes:'',archived:false,cloud_version:1,deleted_at:null});
const T=(owner,id,proj,title,done,more={})=>{const vis=more.visibility||'private',{visibility,...extra}=more;return {owner_id:owner,client_id:id,data:{id,title,date:extra.date||'',time:'',category:'Personal',durationMinutes:30,priority:'normal',completed:done,completedAt:done?now:null,recurrence:'none',reminder:'none',notes:'',subtasks:[],createdAt:1,updatedAt:1,visibility:vis,householdId:vis==='household'?HOUSEHOLD:null,assigneeId:null,projectId:proj,...extra},visibility:vis,household_id:vis==='household'?HOUSEHOLD:null,assignee_id:null,completed_by:done?owner:null,completed_at:done?now:null,cloud_version:1,deleted_at:null,task_date:extra.date||null}};
const db=makeDb();
db.tables.planly_projects.push(P(OWNER,'p1','Move into new flat',{stages:[{id:'s1',name:'Buy'},{id:'s1',name:'Duplicate'}]}),P(PARTNER,'p3',"Laki's plan",{visibility:'household'}));
db.tables.planly_tasks.push(T(OWNER,'a','p1','Order sofa',false,{stageId:'s1',date:day(-1)}),T(OWNER,'b','p1','Pack kitchen',false,{doing:true}),T(OWNER,'c','p1','Measure rooms',true),T(PARTNER,'l','p3',"Laki's step",false,{visibility:'household'}));
const {context,errors}=await newPhone(browser,db,OWNER);const page=await openApp(context,errors);
const list=async()=>{await page.evaluate(()=>document.querySelector('.nav button[data-section="plan"]').click());await W(800);await page.evaluate(()=>document.querySelector('[data-plan-segment="projects"]').click());await W(1000)};
const openP=async(id,owner=null)=>{await page.evaluate(()=>document.getElementById('projectsClose')?.click());await list();await page.evaluate(([id,o])=>document.querySelector(`#view [data-r1-project="${id}"]${o?`[data-r1-owner="${o}"]`:''}`).click(),[id,owner]);await W(900)};
const board=()=>page.evaluate(()=>Object.fromEntries([...document.querySelectorAll('#projectsContent [data-board-col]')].map(c=>[c.dataset.boardCol,{count:c.querySelector('h4 span')?.textContent,cards:[...c.querySelectorAll('[data-board-task]')].map(e=>({id:e.dataset.boardTask,meta:e.querySelector('small')?.textContent||'',moves:[...e.querySelectorAll('[data-board-move]')].map(b=>b.dataset.boardMove)})),quick:!!c.querySelector('[data-project-quick]')}])));
const row=id=>db.tables.planly_tasks.find(r=>r.client_id===id);
const move=async(id,to)=>{await page.evaluate(([id,to])=>document.querySelector(`#projectsContent [data-board-move="${to}"][data-board-id="${id}"]`).click(),[id,to]);await W(2500)};

await openP('p1');
check('the List view shows a repeated stage id once',await page.evaluate(()=>[...document.querySelectorAll('#projectsContent .pjStage .pjStageHead strong')].map(e=>e.textContent).join())==='Buy,Other');
await page.evaluate(()=>document.querySelector('[data-project-view="board"]').click());await W(600);
let b=await board();
check('Board shows To do / Doing / Done with their tasks',JSON.stringify(Object.keys(b))==='["todo","doing","done"]'&&b.todo.cards.map(x=>x.id).join()==='a'&&b.doing.cards.map(x=>x.id).join()==='b'&&b.done.cards.map(x=>x.id).join()==='c'&&b.done.count==='1',JSON.stringify(b));
check('a card shows its stage and Late',b.todo.cards[0].meta==='Buy · Late',JSON.stringify(b.todo.cards[0]));
check('your cards can move (To do: Start; Doing: back or Done; Done: none), and To do has a quick add',JSON.stringify(b.todo.cards[0].moves)==='["doing"]'&&JSON.stringify(b.doing.cards[0].moves)==='["todo","done"]'&&b.done.cards[0].moves.length===0&&b.todo.quick,JSON.stringify(b));
await move('a','doing');b=await board();
check('▶ Start moves it to Doing, saved on the task',b.doing.cards.some(x=>x.id==='a')&&row('a').data.doing===true,JSON.stringify({b,d:row('a').data.doing}));
await move('a','todo');b=await board();
check('↩ moves it back to To do',b.todo.cards.some(x=>x.id==='a')&&!('doing' in row('a').data),JSON.stringify(row('a').data.doing));
await page.evaluate(()=>document.querySelector('#projectsContent [data-board-move="done"][data-board-id="b"]').click());await W(300);
await W(2300);b=await board();
check('✓ Done completes it through the usual completion (saved) and it shows under Done',row('b').data.completed===true&&!('doing' in row('b').data)&&b.done.cards.some(x=>x.id==='b')&&b.done.count==='2',JSON.stringify({c:row('b').data.completed,b}));
await page.evaluate(()=>document.querySelector('#projectsContent [data-board-open="a"]').click());await W(700);
check('tapping a card opens its actions',await page.evaluate(()=>document.getElementById('taskActionWrap').classList.contains('open')));
await page.evaluate(()=>document.getElementById('taskActionClose')?.click());await W(300);
await page.reload();await W(3000);await openP('p1');
check('the Board choice is remembered on this phone',!!(await page.evaluate(()=>document.querySelector('#projectsContent .pjBoard'))));
await openP('p3',PARTNER);b=await board();
check('someone else\'s shared project shows its board without moves or quick add',b.todo?.cards.length===1&&b.todo.cards[0].moves.length===0&&!b.todo.quick,JSON.stringify(b));
check('no page errors',errors.length===0,errors.slice(0,3).join(' | '));
console.log(`${pass} passed, ${fail} failed`);await browser.close();server.close();process.exit(fail?1:0);
