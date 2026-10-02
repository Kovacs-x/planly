// Stage 5 follow-up (reviewer N2/N3): client next-occurrence assignee matches SQL 046 rules
// (future anchor => negative even week, non-member partner => fallback) and reassigning a rotating chore to Anyone switches rotation off.
import { launch } from './harness.mjs';
import { ME, PARTNER } from './mock.mjs';
const PORT=process.env.PORT||8802;
await fetch(`http://localhost:${PORT}/__switch?to=pr`);
const bad=[],R={};
const h=await launch({uid:ME}); const {page:p,W,MOCK}=h; const q=(f,a)=>p.evaluate(f,a);
const today=new Date().toISOString().slice(0,10);
await p.clock.setFixedTime(new Date(today+'T10:00:00Z'));
const monday=k=>{const d=new Date(k+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));return d.toISOString().slice(0,10)};
const addWeeks=(k,n)=>{const d=new Date(k+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+7*n);return d.toISOString().slice(0,10)};
const thisMon=monday(today),NONMEMBER='33333333-3333-4333-8333-333333333333';
const bins=MOCK.db.planly_tasks.find(r=>r.client_id==='task-bins');
const clone=(id,title,rotation)=>{const r=JSON.parse(JSON.stringify(bins));r.client_id=id;r.title=title;r.assignee_id=ME;r.task_date=today;r.series_client_id=null;r.cloud_version=1;r.data={...r.data,id,title,date:today,recurrence:'weekly',assigneeId:ME,rotation};MOCK.db.planly_tasks.push(r);return r};
// next occurrence is in the week after thisMon. Anchor 3 weeks after thisMon => weeks = -2 (even) => a.
clone('task-rot-neg','Rot negative',{enabled:true,a:PARTNER,b:ME,anchorWeek:addWeeks(thisMon,3)});
// partner not a member => fallback to current assignee (ME)
clone('task-rot-nonmember','Rot nonmember',{enabled:true,a:ME,b:NONMEMBER,anchorWeek:thisMon});
// to be reassigned to Anyone
clone('task-rot-anyone','Rot anyone',{enabled:true,a:ME,b:PARTNER,anchorWeek:thisMon});
for(const m of MOCK.db.planly_household_members)m.display_name=m.user_id===ME?'Musti':'Laki';
await p.setViewportSize({width:390,height:844});
await p.goto(`http://localhost:${PORT}/planly/v2/`); await W(4000); await p.reload(); await W(10000);
const who=id=>id===PARTNER?'PARTNER':id===ME?'ME':id==null?null:String(id);
for(const id of ['task-rot-neg','task-rot-nonmember']){
  const ok=await q(i=>{const b=document.querySelector('.task[data-id="'+i+'"] [data-action="toggle"]');b?.click();return !!b},id);await W(3000);
  const n=MOCK.db.planly_tasks.find(r=>r.series_client_id===id&&r.client_id!==id&&!r.completed);
  R[id]={toggled:ok,date:n?.task_date,assignee:who(n?.assignee_id),dataAssignee:who(n?.data?.assigneeId)};
}
if(R['task-rot-neg'].assignee!=='PARTNER'||R['task-rot-neg'].dataAssignee!=='PARTNER')bad.push('negative-week parity '+JSON.stringify(R['task-rot-neg']));
if(R['task-rot-nonmember'].assignee!=='ME'||R['task-rot-nonmember'].dataAssignee!=='ME')bad.push('non-member fallback '+JSON.stringify(R['task-rot-nonmember']));
// reassign to Anyone through the task sheet
R.editOpened=await q(()=>{const b=document.querySelector('.task[data-id="task-rot-anyone"] [data-action="edit"]')||document.querySelector('.task[data-id="task-rot-anyone"] [data-action="actions"]');b?.click();return b?.dataset.action||null});await W(800);
if(R.editOpened==='actions'){await q(()=>document.querySelector('[data-task-menu="edit"]')?.click());await W(800)}
await q(()=>document.querySelector('[data-more-options], #taskMoreToggle')?.click());await W(300);
R.anyoneBtn=await q(()=>{const b=document.querySelector('#taskAssigneeSegments [data-task-assignee=""]');b?.click();return !!b});await W(300);
await q(()=>document.getElementById('taskForm').requestSubmit());await W(5000);
const ra=MOCK.db.planly_tasks.find(r=>r.client_id==='task-rot-anyone');
R.anyoneRow={assignee:who(ra?.assignee_id),dataAssignee:who(ra?.data?.assigneeId),rotation:ra?.data?.rotation};
if(!R.anyoneBtn)bad.push('Anyone button not found');
if(R.anyoneRow.assignee!==null||R.anyoneRow.rotation?.enabled!==false)bad.push('Anyone reassignment kept rotation '+JSON.stringify(R.anyoneRow));
// the Rotate option is no longer offered on the Anyone chore
await q(()=>{document.querySelector('.task[data-id="task-rot-anyone"] [data-action="actions"]')?.click()});await W(600);
R.rotateOnAnyone=await q(()=>!!document.querySelector('[data-task-menu="rotate"]'));
if(R.rotateOnAnyone)bad.push('Rotate still offered after Anyone');
R.errors=h.errors;if(h.errors.length)bad.push('errors');
console.log(JSON.stringify(R));console.log(bad.length?'FAIL '+JSON.stringify(bad):'PASS t162b');await h.browser.close();
