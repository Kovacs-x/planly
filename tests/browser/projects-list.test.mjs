// Projects list: each project has its own colour and emoji (guessed from the name until one is chosen), the days left or
// late and how many tasks are done, a ring with the % done (or a chip when overdue, at risk or done), and the next task with
// who it is for. Finished projects sit under Done. The icon and colour are chosen in the project's editor and saved.
// Run: node tests/browser/projects-list.test.mjs (see tests/browser/README.md).
import {startServer,launchBrowser,makeDb,newPhone,openApp,OWNER,PARTNER,HOUSEHOLD} from './harness.mjs';
const server=await startServer();const browser=await launchBrowser();
let pass=0,fail=0;const check=(n,c,d='')=>{console.log((c?'PASS ':'FAIL ')+n+(c?'':' — '+d));c?pass++:fail++};
const W=ms=>new Promise(r=>setTimeout(r,ms));
const key=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
const n=new Date(),day=k=>key(new Date(n.getFullYear(),n.getMonth(),n.getDate()+k));
const P=(id,name,due,more={})=>({owner_id:OWNER,client_id:id,data:{id,name,dueDate:due,notes:'',visibility:more.visibility||'private',householdId:more.visibility?HOUSEHOLD:null,archived:false,createdAt:1,updatedAt:1,...more},visibility:more.visibility||'private',household_id:more.visibility?HOUSEHOLD:null,name,due_date:due||null,notes:'',archived:false,cloud_version:1,deleted_at:null});
let i=0;const T=(proj,title,done,more={})=>{const id='t'+(i++),vis=more.visibility||'private';return {owner_id:OWNER,client_id:id,data:{id,title,date:'',time:'',category:'Personal',durationMinutes:30,priority:'normal',completed:done,completedAt:done?n.toISOString():null,recurrence:'none',reminder:'none',notes:'',subtasks:[],createdAt:i,updatedAt:1,visibility:vis,householdId:vis==='household'?HOUSEHOLD:null,assigneeId:null,projectId:proj,...more},visibility:vis,household_id:vis==='household'?HOUSEHOLD:null,assignee_id:more.assigneeId||null,completed_by:null,completed_at:null,cloud_version:1,deleted_at:null,task_date:more.date||null}};
const db=makeDb();
db.tables.planly_projects.push(P('p1','Move into new flat',day(12),{visibility:'household'}),P('p2','CV & job hunt',day(-3)),P('p3','Lisbon trip',''),P('p4',"Mum's birthday",day(-6)),P('p5','Odd colour','',{color:'red;background:url(x)',emoji:'<b>'}));
for(let k=0;k<7;k++)db.tables.planly_tasks.push(T('p1','Done '+k,true,{visibility:'household'}));
db.tables.planly_tasks.push(T('p1','Book removal van',false,{date:day(2),visibility:'household',assigneeId:PARTNER}),T('p1','Order sofa',false,{visibility:'household'}),T('p1','Change address',false,{visibility:'household'}),T('p1','Pack kitchen',false,{visibility:'household'}),T('p1','Paint bedroom',false,{visibility:'household'}));
db.tables.planly_tasks.push(T('p2','Write CV',true),T('p2','Ask for references',true),T('p2','Update LinkedIn photo',false,{date:day(0)}),T('p2','Apply: 3 jobs',false),T('p2','Practice interview',false),T('p2','Cover letter',false));
db.tables.planly_tasks.push(T('p3','Book flights',false),T('p4','Cake',true),T('p4','Present',true));
const {context,errors}=await newPhone(browser,db,OWNER);const page=await openApp(context,errors);
const open=async()=>{await page.evaluate(()=>document.querySelector('.nav button[data-section="plan"]').click());await W(800);await page.evaluate(()=>document.querySelector('[data-plan-segment="projects"]').click());await W(1000)};
const cards=()=>page.evaluate(()=>[...document.querySelectorAll('#view .planProjectGrid > *')].map(c=>c.classList.contains('pjGroupLabel')?{group:c.textContent.trim()}:c.matches('[data-r1-project]')?{id:c.dataset.r1Project,colour:c.style.getPropertyValue('--pj').trim(),emoji:c.querySelector('.pjIcon')?.textContent,name:c.querySelector('strong')?.textContent,meta:c.querySelector('.planProjectMeta')?.textContent,ring:c.querySelector('.pjRing b')?.textContent||'',chip:c.querySelector('.pjChip')?.textContent||'',next:c.querySelector('.pjNextText')?.textContent.trim()||'',who:c.querySelector('.pjAvatar')?.textContent||''}:{other:c.textContent.trim()}));
await open();let c=await cards();const by=id=>c.find(x=>x.id===id)||{};
check('open projects first, then finished ones under Done',JSON.stringify(c.map(x=>x.id||x.group||x.other))===JSON.stringify(['+ New project','p1','p2','p3','p5','Done','p4']),JSON.stringify(c.map(x=>x.id||x.group||x.other)));
check('each project gets an emoji from its name',by('p1').emoji==='🏡'&&by('p2').emoji==='💼'&&by('p3').emoji==='✈️'&&by('p4').emoji==='🎂',JSON.stringify(c.map(x=>x.emoji)));
check('…and a colour of its own from the palette',c.filter(x=>x.id).every(x=>/^#[0-9a-f]{6}$/.test(x.colour)),JSON.stringify(c.map(x=>x.colour)));
check('a saved colour or emoji that is not one of the choices is ignored',/^#[0-9a-f]{6}$/.test(by('p5').colour)&&by('p5').emoji==='🎯',JSON.stringify(by('p5')));
check('days left and tasks done',by('p1').meta==='12 days left · 7 of 12 done'&&by('p3').meta==='0 of 1 done',JSON.stringify([by('p1').meta,by('p3').meta]));
check('a ring with the % done',by('p1').ring==='58%'&&by('p3').ring==='0%',JSON.stringify([by('p1').ring,by('p3').ring]));
check('a project past its due date with tasks left is Overdue, and says how late',by('p2').chip==='Overdue'&&by('p2').meta==='3 days late · 2 of 6 done',JSON.stringify(by('p2')));
check('a finished project shows 🎉 Done and no next task',by('p4').chip==='🎉 Done'&&!by('p4').next&&by('p4').meta.endsWith('2 of 2 done'),JSON.stringify(by('p4')));
check('the next task shows with its day and who it is for',/Next: Book removal van · \w+/.test(by('p1').next)&&by('p1').who==='L',JSON.stringify(by('p1')));
// choose an icon and colour in the editor
await page.evaluate(()=>document.querySelector('[data-r1-project="p3"]').click());await W(700);
await page.evaluate(()=>document.querySelector('[data-project-action="edit"]').click());await W(600);
const picked=await page.evaluate(()=>({emoji:document.querySelector('.pjEmojiPick.active')?.textContent,colours:document.querySelectorAll('.pjColourPick').length}));
check('the editor offers icons and colours, with the current icon picked',picked.emoji==='✈️'&&picked.colours===8,JSON.stringify(picked));
await page.evaluate(()=>{document.querySelector('[data-project-emoji="🎨"]').click();document.querySelector('[data-project-colour="#e0407a"]').click()});
await page.evaluate(()=>document.getElementById('projectForm').requestSubmit());await W(2500);
const r3=db.tables.planly_projects.find(r=>r.client_id==='p3');
check('the chosen icon and colour are saved with the project',r3.data.emoji==='🎨'&&r3.data.color==='#e0407a',JSON.stringify({e:r3.data.emoji,c:r3.data.color}));
await page.evaluate(()=>document.getElementById('projectsClose')?.click());await open();c=await cards();
check('…and the card shows them',by('p3').emoji==='🎨'&&by('p3').colour==='#e0407a',JSON.stringify(by('p3')));
check('no page errors',errors.length===0,errors.slice(0,3).join(' | '));
console.log(`${pass} passed, ${fail} failed`);await browser.close();server.close();process.exit(fail?1:0);
