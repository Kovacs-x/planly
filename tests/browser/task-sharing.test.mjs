// Task sheet sharing and Assign (tidy-up 2c): Share (Just me / Household) and Assign (Anyone / a member) in the task sheet,
// the sharing gate while Planly Cloud Sync is not ready, a read-only shared task, duplicate, and the foreground-resume
// signal. Written before tidy-up 2c so that refactor can be shown to change nothing.
// Run: node tests/browser/task-sharing.test.mjs (see tests/browser/README.md).
import {startServer,launchBrowser,makeDb,newPhone,openApp,OWNER,PARTNER,HOUSEHOLD} from './harness.mjs';
const server=await startServer();const browser=await launchBrowser();
let pass=0,fail=0;const check=(n,c,d='')=>{console.log((c?'PASS ':'FAIL ')+n+(c?'':' — '+d));c?pass++:fail++};
const W=ms=>new Promise(r=>setTimeout(r,ms));
const d=new Date(),today=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
const chore=(id,title,assignee)=>({owner_id:OWNER,client_id:id,data:{id,title,date:today,time:'',category:'Home',durationMinutes:30,priority:'normal',completed:false,recurrence:'none',reminder:'none',notes:'',subtasks:[],createdAt:1,updatedAt:1,visibility:'household',householdId:HOUSEHOLD,assigneeId:assignee},visibility:'household',household_id:HOUSEHOLD,assignee_id:assignee,completed_by:null,completed_at:null,cloud_version:1,deleted_at:null,task_date:today});
const db=makeDb();
db.tables.planly_tasks.push(chore('c1','Bins',PARTNER));
const sheet=page=>page.evaluate(()=>{const v=document.getElementById('taskVisibility'),a=document.getElementById('taskAssignee'),field=document.getElementById('taskAssigneeField');
  return {share:!document.getElementById('taskHouseholdControls')?.hidden,visibility:v?.value||'',householdDisabled:!!v?.querySelector('option[value="household"]')?.disabled,
    activeShare:document.querySelector('[data-task-visibility].active')?.dataset.taskVisibility||'',assignShown:!!field&&!field.hidden,assignee:a?.value??null,
    people:[...document.querySelectorAll('[data-task-assignee]')].map(b=>b.textContent.trim()),activePerson:document.querySelector('[data-task-assignee].active')?.textContent.trim()||'',
    buttonsDisabled:[...document.querySelectorAll('[data-task-visibility],[data-task-assignee]')].every(b=>b.disabled)}});
const tap=(page,sel)=>page.evaluate(sel=>{const e=document.querySelector(sel);e?.click();return !!e},sel);
const today_=async page=>{await page.evaluate(()=>document.querySelector('.nav button[data-section="today"]').click());await W(1200)};
const openEdit=async(page,id)=>{await page.evaluate(id=>{const card=document.querySelector(`[data-id="${id}"]`);(card.querySelector('[data-action="edit"]')||card.querySelector('[data-action="actions"]')).click()},id);await W(500);
  await page.evaluate(()=>document.querySelector('#taskActionWrap.open [data-task-action="edit"],.taskActionWrap.open [data-action="edit"]')?.click());await W(900)};
const close=async page=>{await page.evaluate(()=>{const b=document.getElementById('closeSheet')||document.querySelector('[data-close-sheet],.sheetClose');if(b)b.click();else document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}))});await W(600)};

// Owner's phone.
const {context,errors}=await newPhone(browser,db,OWNER);const page=await openApp(context,errors);
const dialogs=[];page.on('dialog',x=>{dialogs.push(x.message());x.accept()});
await today_(page);
await tap(page,'#addBtn');await W(900);
let s=await sheet(page);
check('a new task opens on Just me with Share shown and Assign hidden',s.share&&s.visibility==='private'&&s.activeShare==='private'&&!s.assignShown,JSON.stringify(s));
await tap(page,'[data-task-visibility="household"]');await W(600);s=await sheet(page);
check('Household shows Assign with Anyone and both members by name',s.visibility==='household'&&s.activeShare==='household'&&s.assignShown&&JSON.stringify(s.people)===JSON.stringify(['Anyone','Musti','Laki'])&&s.activePerson==='Anyone',JSON.stringify(s));
await page.evaluate(()=>[...document.querySelectorAll('[data-task-assignee]')].find(b=>b.textContent.trim()==='Laki')?.click());await W(300);s=await sheet(page);
check('choosing a person selects them',s.assignee===PARTNER&&s.activePerson==='Laki',JSON.stringify(s));
await page.evaluate(()=>{const t=document.getElementById('taskTitle');t.value='Hoover';t.dispatchEvent(new Event('input',{bubbles:true}));document.getElementById('taskForm').requestSubmit()});await W(2000);
const saved=db.tables.planly_tasks.find(r=>r.data?.title==='Hoover');
check('saving shares the task with the household and assigns it',saved&&saved.visibility==='household'&&saved.household_id===HOUSEHOLD&&saved.assignee_id===PARTNER,JSON.stringify(saved&&{v:saved.visibility,h:saved.household_id,a:saved.assignee_id}));
await today_(page);
await openEdit(page,saved?.client_id);s=await sheet(page);
check('editing it shows Household and the person it is assigned to',s.visibility==='household'&&s.assignShown&&s.assignee===PARTNER&&s.activePerson==='Laki',JSON.stringify(s));
await tap(page,'#duplicateTask');await W(600);s=await sheet(page);
check('duplicating it keeps Household and resets Assign to Anyone',s.visibility==='household'&&s.assignee===''&&s.activePerson==='Anyone',JSON.stringify(s));
await tap(page,'[data-task-visibility="private"]');await W(500);s=await sheet(page);
check('Just me hides Assign again',s.visibility==='private'&&!s.assignShown&&s.assignee==='',JSON.stringify(s));
await close(page);

// The sharing gate: while Planly Cloud Sync is not ready, a task cannot be shared.
await page.evaluate(o=>localStorage.setItem('planly-cloud-migration-status-v1:'+o,JSON.stringify({state:'local-only'})),OWNER);
await today_(page);await tap(page,'#addBtn');await W(900);dialogs.length=0;
await tap(page,'[data-task-visibility="household"]');await W(500);s=await sheet(page);
check('while sync is not ready, Household is refused and the task stays Just me',s.visibility==='private'&&s.activeShare==='private'&&dialogs.some(m=>m.includes('Enable Planly Cloud Sync')),JSON.stringify({s,dialogs}));
const before=db.tables.planly_tasks.length;dialogs.length=0;
await page.evaluate(()=>{const v=document.getElementById('taskVisibility');v.value='household';const t=document.getElementById('taskTitle');t.value='Gate test';document.getElementById('taskForm').requestSubmit()});await W(1500);
check('…and a shared save is stopped with a message',!db.tables.planly_tasks.some(r=>r.data?.title==='Gate test')&&!(await page.evaluate(()=>JSON.parse(localStorage.getItem('planly-tasks')||'[]').some?.(t=>t.title==='Gate test')))&&dialogs.some(m=>m.includes('Household sharing is not ready')),JSON.stringify({rows:db.tables.planly_tasks.length-before,dialogs}));
await close(page);
await page.evaluate(o=>localStorage.setItem('planly-cloud-migration-status-v1:'+o,JSON.stringify({state:'cloud-write-test'})),OWNER);

// Foreground resume: coming back to the app tells the rest of Planly once.
const resumes=await page.evaluate(async()=>{let n=0;const on=()=>n++;window.addEventListener('planly:foreground-resume',on);
  const set=v=>Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>v});
  set('hidden');document.dispatchEvent(new Event('visibilitychange'));set('visible');document.dispatchEvent(new Event('visibilitychange'));document.dispatchEvent(new Event('visibilitychange'));
  await new Promise(r=>setTimeout(r,100));delete document.visibilityState;window.removeEventListener('planly:foreground-resume',on);return n});
check('coming back to the app signals a foreground resume once',resumes===1,'resumes '+resumes);

// Partner's phone: the owner's shared chore assigned to the partner opens read-only with its person shown.
const two=await newPhone(browser,db,PARTNER);const page2=await openApp(two.context,two.errors);
await today_(page2);
await page2.evaluate(()=>document.querySelector('[data-id="c1"] [data-action="actions"]')?.click());await W(500);
await page2.evaluate(()=>document.querySelector('#taskActionWrap.open [data-task-menu="edit"]')?.click());await W(1200);
s=await sheet(page2);
check('the partner sees the owner\'s chore read-only with its person shown',s.visibility==='household'&&s.assignShown&&s.assignee===PARTNER&&s.activePerson==='Laki'&&s.buttonsDisabled,JSON.stringify(s));
check('no page errors',errors.length===0&&two.errors.length===0,[...errors,...two.errors].slice(0,3).join(' | '));
console.log(`${pass} passed, ${fail} failed`);await browser.close();server.close();process.exit(fail?1:0);
