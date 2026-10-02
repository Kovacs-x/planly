// Stage 5: weekly chore rotation. Rotate shows only for my own repeating household chores with a person assigned;
// turning it on saves data.rotation; completing it assigns next week to my partner; labels show; Anyone/private/partner-owned have no Rotate; turning off works.
import { launch } from './harness.mjs';
import { ME, PARTNER } from './mock.mjs';
const PORT=process.env.PORT||8802;
await fetch(`http://localhost:${PORT}/__switch?to=pr`);
const bad=[],R={};
const h=await launch({uid:ME}); const {page:p,W,MOCK}=h; const q=(f,a)=>p.evaluate(f,a);
const today=new Date().toISOString().slice(0,10);
await p.clock.setFixedTime(new Date(today+'T10:00:00Z'));
const bins=MOCK.db.planly_tasks.find(r=>r.client_id==='task-bins');bins.assignee_id=ME;bins.data={...bins.data,assigneeId:ME};
for(const m of MOCK.db.planly_household_members)m.display_name=m.user_id===ME?'Musti':'Laki';
await p.setViewportSize({width:390,height:844});
await p.goto(`http://localhost:${PORT}/planly/v2/`); await W(4000); await p.reload(); await W(10000);
const openMenu=id=>q(i=>{const b=document.querySelector('.task[data-id="'+i+'"] [data-action="actions"]');b?.click();return !!b},id);
const menuState=()=>q(()=>{const b=document.querySelector('[data-task-menu="rotate"]');return b?{text:b.innerText.replace(/\s+/g,' ').trim(),pressed:b.getAttribute('aria-pressed'),h:Math.round(b.getBoundingClientRect().height)}:null});
const closeMenu=()=>q(()=>{document.querySelector('#taskActionWrap .close, #taskActionClose, [data-close-task-actions]')?.click()}).then(()=>p.keyboard.press('Escape'));
// eligibility
R.binsOpened=await openMenu('task-bins');await W(500);R.rotateOff=await menuState();
if(!R.rotateOff||R.rotateOff.pressed!=='false'||!/Rotate weekly/.test(R.rotateOff.text))bad.push('rotate missing on own assigned chore '+JSON.stringify(R.rotateOff));if(R.rotateOff&&R.rotateOff.h<44)bad.push('rotate <44');
await p.screenshot({path:'t162-menu.png'});
// turn on
const n=MOCK.bodies.length;await q(()=>document.querySelector('[data-task-menu="rotate"]').click());await W(1500);
R.rotateOn=await menuState();if(R.rotateOn?.pressed!=='true')bad.push('rotate did not turn on');
const saved=MOCK.db.planly_tasks.find(r=>r.client_id==='task-bins');R.savedRotation=saved?.data?.rotation;
if(!saved?.data?.rotation?.enabled||saved.data.rotation.a!==ME||saved.data.rotation.b!==PARTNER||!/^\d{4}-\d{2}-\d{2}$/.test(saved.data.rotation.anchorWeek||''))bad.push('rotation not saved '+JSON.stringify(R.savedRotation));
await closeMenu();await W(500);
// other chores: Anyone (Clean bathroom), partner-owned (Partner shared task), private (Laundry)
for(const [id,label] of [['task-bathroom','anyone'],['task-partner-assigned','partner-owned'],['task-laundry','private']]){const opened=await openMenu(id);await W(400);const st=await menuState();R['menu_'+label]={opened,rotate:!!st};if(opened&&st)bad.push('rotate shown for '+label);await closeMenu();await W(300)}
// labels
await q(()=>document.querySelector('.nav button[data-section="today"]').click());await W(600);
R.todayLabel=await q(()=>document.querySelector('.task[data-id="task-bins"] .choreSwap')?.innerText);
await q(()=>document.querySelector('.nav button[data-section="home"]').click());await W(800);
R.homeLabel=await q(()=>document.querySelector('.homeChore[data-id="task-bins"] .choreSwap')?.innerText);
if(R.todayLabel!=='⇄ Swaps weekly'||R.homeLabel!=='⇄ Swaps weekly')bad.push('labels '+JSON.stringify([R.todayLabel,R.homeLabel]));
await p.screenshot({path:'t162-home.png'});
// complete as owner -> next occurrence assigned to partner (next week)
await q(()=>document.querySelector('.nav button[data-section="today"]').click());await W(600);
await q(()=>document.querySelector('.task[data-id="task-bins"] [data-action="toggle"]').click());await W(3000);
R.next=await q(()=>{const s=window.__planlyDebugState||null;return null});
const nextRow=MOCK.db.planly_tasks.find(r=>r.series_client_id==='task-bins'&&r.client_id!=='task-bins'&&!r.completed);
R.nextRow=nextRow?{date:nextRow.task_date,assignee:nextRow.assignee_id===PARTNER?'PARTNER':nextRow.assignee_id===ME?'ME':nextRow.assignee_id,dataAssignee:nextRow.data?.assigneeId===PARTNER?'PARTNER':nextRow.data?.assigneeId,rotation:nextRow.data?.rotation?.enabled}:null;
if(!R.nextRow||R.nextRow.assignee!=='PARTNER'||R.nextRow.rotation!==true)bad.push('next occurrence '+JSON.stringify(R.nextRow));
// turn off on the next occurrence
if(nextRow){await closeMenu();await W(300);await q(()=>document.querySelector('.nav button[data-section="plan"]')?.click());await W(500);await q(()=>document.querySelector('[data-plan-segment="upcoming"]')?.click());await W(600);R.nextMenuOpened=await openMenu(nextRow.client_id);if(!R.nextMenuOpened)bad.push('next occurrence menu not found in Upcoming');await W(500);await W(500);await q(()=>document.querySelector('[data-task-menu="rotate"]')?.click());await W(1500);const r2=MOCK.db.planly_tasks.find(r=>r.client_id===nextRow.client_id);R.offSaved=r2?.data?.rotation;if(r2?.data?.rotation?.enabled!==false)bad.push('rotation off not saved '+JSON.stringify(R.offSaved))}
R.errors=h.errors;if(h.errors.length)bad.push('errors');
console.log(JSON.stringify(R));console.log(bad.length?'FAIL '+JSON.stringify(bad):'PASS t162');await h.browser.close();
