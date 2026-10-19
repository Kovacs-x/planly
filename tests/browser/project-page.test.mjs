// Project page: the project's colour behind its emoji and "why", a ring with what is left and the days left, done / late /
// this week, a quick add for tasks, the done tasks folded, and the weeks' momentum. When every task is done it turns green
// with 🎉 (confetti once per project) and offers Finish project, which archives it. Someone else's shared project has no
// quick add or Finish.
// Run: node tests/browser/project-page.test.mjs (see tests/browser/README.md).
import {startServer,launchBrowser,makeDb,newPhone,openApp,OWNER,PARTNER,HOUSEHOLD} from './harness.mjs';
const server=await startServer();const browser=await launchBrowser();
let pass=0,fail=0;const check=(n,c,d='')=>{console.log((c?'PASS ':'FAIL ')+n+(c?'':' — '+d));c?pass++:fail++};
const W=ms=>new Promise(r=>setTimeout(r,ms));
const key=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
const n=new Date(),day=k=>key(new Date(n.getFullYear(),n.getMonth(),n.getDate()+k)),now=n.toISOString(),old=new Date(Date.now()-20*864e5).toISOString();
const P=(owner,id,name,due,more={})=>({owner_id:owner,client_id:id,data:{id,name,dueDate:due,notes:'',visibility:more.visibility||'private',householdId:more.visibility?HOUSEHOLD:null,archived:false,createdAt:1,updatedAt:1,...more},visibility:more.visibility||'private',household_id:more.visibility?HOUSEHOLD:null,name,due_date:due||null,notes:'',archived:false,cloud_version:1,deleted_at:null});
let i=0;const T=(owner,proj,title,done,more={})=>{const id='t'+(i++),vis=more.visibility||'private',at=done?(more.at||now):null;return {owner_id:owner,client_id:id,data:{id,title,date:more.date||'',time:'',category:'Personal',durationMinutes:30,priority:'normal',completed:done,completedAt:at,recurrence:'none',reminder:'none',notes:'',subtasks:[],createdAt:i,updatedAt:1,visibility:vis,householdId:vis==='household'?HOUSEHOLD:null,assigneeId:null,projectId:proj},visibility:vis,household_id:vis==='household'?HOUSEHOLD:null,assignee_id:null,completed_by:done?owner:null,completed_at:at,cloud_version:1,deleted_at:null,task_date:more.date||null}};
const db=makeDb();
db.tables.planly_projects.push(P(OWNER,'p1','Move into new flat',day(12),{why:"So we're settled in by Christmas",color:'#2f9e68'}),P(OWNER,'p2',"Mum's birthday",day(3)),P(PARTNER,'p3',"Laki's plan",day(20),{visibility:'household'}));
db.tables.planly_tasks.push(T(OWNER,'p1','Measure rooms',true),T(OWNER,'p1','Book viewing',true),T(OWNER,'p1','Sign lease',true,{at:old}),T(OWNER,'p1','Order sofa',false,{date:day(-1)}),T(OWNER,'p1','Book removal van',false,{date:day(2)}));
db.tables.planly_tasks.push(T(OWNER,'p2','Cake',true),T(OWNER,'p2','Present',true),T(PARTNER,'p3',"Laki's step",false,{visibility:'household'}));
const {context,errors}=await newPhone(browser,db,OWNER);const page=await openApp(context,errors);
const list=async()=>{await page.evaluate(()=>document.querySelector('.nav button[data-section="plan"]').click());await W(800);await page.evaluate(()=>document.querySelector('[data-plan-segment="projects"]').click());await W(1000)};
const openP=async(id,owner=null)=>{await list();await page.evaluate(([id,o])=>document.querySelector(`#view [data-r1-project="${id}"]${o?`[data-r1-owner="${o}"]`:''}`).click(),[id,owner]);await W(900)};
const look=()=>page.evaluate(()=>{const w=document.getElementById('projectsWrap'),c=document.getElementById('projectsContent'),h=c.querySelector('.pjHero');return {band:w.classList.contains('pjDetailOpen'),colour:w.style.getPropertyValue('--pj').trim(),emoji:c.querySelector('.pjBigEmoji')?.textContent,why:c.querySelector('.pjWhy')?.textContent,ring:h?.querySelector('.dashRingText')?.textContent,head:h?.querySelector('.dashHead')?.innerText.replace(/\s+/g,' ').trim(),stats:[...(h?.querySelectorAll('.dashStat')||[])].map(s=>s.textContent.trim()),allDone:h?.classList.contains('allDone'),burst:h?.classList.contains('celebrate'),confetti:h?.querySelectorAll('.dashConfetti i').length||0,finish:!!c.querySelector('[data-project-action="finish"]'),quick:!!c.querySelector('[data-project-quick]'),momentum:c.querySelector('.pjMomentumHead span')?.textContent||'',bars:c.querySelectorAll('.pjBars i').length,active:[...c.querySelectorAll('.projectTasksSection .projectTaskList [data-id]')].map(e=>e.querySelector('.taskTitle,strong')?.textContent||e.textContent.trim().slice(0,30))}});

await openP('p1');let s=await look();
check('the page has the project\'s colour band, its emoji and its "why"',s.band&&s.colour==='#2f9e68'&&s.emoji==='🏡'&&s.why==="“So we're settled in by Christmas”",JSON.stringify(s));
check('a ring with % done, what is left and the days left',s.ring==='60%'&&/2 tasks left/.test(s.head)&&/12 days left/.test(s.head),JSON.stringify([s.ring,s.head]));
check('done / late / this week',JSON.stringify(s.stats)===JSON.stringify(['✅ 3 done','⏰ 1 late','🔥 2 this week']),JSON.stringify(s.stats));
check('momentum over the last weeks',s.bars===4&&s.momentum==='2 done this week',JSON.stringify([s.bars,s.momentum]));
check('no Finish while tasks are left',!s.finish&&s.quick,JSON.stringify(s));
// quick add
await page.evaluate(()=>{const i=document.getElementById('projectQuickAdd');i.value='Buy boxes';i.form.requestSubmit()});await W(2500);
const added=db.tables.planly_tasks.find(r=>r.data?.title==='Buy boxes');
check('quick add saves a task in this project (private, no date, off Today)',!!added&&added.data.projectId==='p1'&&added.visibility==='private'&&!added.data.date&&added.data.showOnToday===false&&added.owner_id===OWNER,JSON.stringify(added?.data));
s=await look();
check('…shows it in the project straight away and is ready for the next one',/2 tasks left|3 tasks left/.test(s.head)&&await page.evaluate(()=>[...document.querySelectorAll('#projectsContent .projectTaskList [data-id]')].some(e=>/Buy boxes/.test(e.textContent))&&document.getElementById('projectQuickAdd').value===''),JSON.stringify(s.head));
// finished project
await page.evaluate(()=>document.getElementById('projectsClose').click());await W(300);
await openP('p2');s=await look();
check('when every task is done: green, 🎉, "Project complete!" and a confetti burst',s.allDone&&s.ring==='🎉'&&/Project complete!/.test(s.head)&&s.burst&&s.confetti===6,JSON.stringify(s));
check('…and Finish project is offered',s.finish,JSON.stringify(s));
await page.evaluate(()=>document.getElementById('projectsClose').click());await W(4500);await openP('p2');s=await look();
check('the confetti plays only once for a project',s.allDone&&!s.burst&&s.confetti===0,JSON.stringify(s));
await page.evaluate(()=>document.querySelector('[data-project-action="finish"]').click());await W(2500);
const r2=db.tables.planly_projects.find(r=>r.client_id==='p2');
check('Finish project archives it (saved, with when it was finished)',r2.archived===true&&r2.data.archived===true&&!!r2.data.finishedAt,JSON.stringify({a:r2.archived,f:r2.data.finishedAt}));
await page.evaluate(()=>document.getElementById('projectsClose').click());await list();
check('…and it leaves the projects list',await page.evaluate(()=>!document.querySelector('#view [data-r1-project="p2"]')));
// someone else's shared project
await openP('p3',PARTNER);s=await look();
check('someone else\'s shared project has no quick add and no Finish',s.band&&!s.quick&&!s.finish,JSON.stringify(s));
// why in the editor
await page.evaluate(()=>document.getElementById('projectsClose').click());await openP('p1');
await page.evaluate(()=>document.querySelector('[data-project-action="edit"]').click());await W(500);
await page.evaluate(()=>{document.getElementById('projectWhy').value='Before Christmas';document.getElementById('projectForm').requestSubmit()});await W(2500);
check('the "why" is edited in Edit project and saved',db.tables.planly_projects.find(r=>r.client_id==='p1').data.why==='Before Christmas'&&(await look()).why==='“Before Christmas”');
check('no page errors',errors.length===0,errors.slice(0,3).join(' | '));
console.log(`${pass} passed, ${fail} failed`);await browser.close();server.close();process.exit(fail?1:0);
