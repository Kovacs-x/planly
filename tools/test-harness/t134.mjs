import { launch } from './harness.mjs';
import { ME } from './mock.mjs';
await fetch('http://localhost:8802/__switch?to=pr');
const h=await launch({uid:ME}); const {page:p,W,MOCK}=h; const q=(f,a)=>p.evaluate(f,a); const R={};
await p.clock.setFixedTime(new Date('2026-10-01T10:00:00Z'));
// completed project: clone renovation project + a completed task
const pr=MOCK.db.planly_projects.find(x=>x.client_id==='proj-renov');const done={...structuredClone(pr),cloud_id:crypto.randomUUID(),client_id:'proj-done',name:'Finished project',due_date:null};done.data={...(pr.data||{}),id:'proj-done',name:'Finished project',dueDate:''};MOCK.db.planly_projects.push(done);
const tt=MOCK.db.planly_tasks.find(x=>x.client_id==='task-done');tt.project_client_id='proj-done';tt.data={...tt.data,projectId:'proj-done'};
// inbox task for plan week
await p.goto('http://localhost:8802/planly/v2/'); await W(4000); await p.reload(); await W(10000);
const writes=[];p.on('request',r=>{if(['POST','PATCH','DELETE'].includes(r.method())&&r.url().includes('/rest/v1/planly_tasks'))writes.push((r.postData()||'').match(/"title":"[^"]*"|"date":"[^"]*"|"time":"[^"]*"/g)?.slice(0,3).join(' '))});
await q(()=>document.querySelector('[data-section="plan"]')?.click());await W(800);
await q(()=>[...document.querySelectorAll('button')].find(b=>b.innerText.trim()==='Projects')?.click());await W(1000);
R.cards=await q(()=>[...document.querySelectorAll('.projectCard')].map(c=>c.innerText.replace(/\n/g,' | ')+' {'+([...c.querySelectorAll('.projectIntelStatus')].map(s=>s.title+' '+getComputedStyle(s).fontSize).join(';'))+'}'));
// open Exam revision
await q(()=>[...document.querySelectorAll('.projectCard')].find(c=>/Exam revision/.test(c.innerText))?.click());await W(800);
R.examDetail=await q(()=>document.querySelector('.projectIntelligence')?.innerText.replace(/\n/g,' | '));
R.planBlockBtn=await q(()=>!!document.querySelector('[data-project-action="plan-block"]'));
await q(()=>document.querySelector('[data-project-action="plan-block"]')?.click());await W(6500);
R.blockWrites=writes.slice();writes.length=0;
// kitchen renovation
await q(()=>{const b=[...document.querySelectorAll('button')].find(b=>/Back|‹/.test(b.innerText)&&b.offsetParent);b?.click()});await W(600);
// Plan my week
await q(()=>{document.querySelectorAll('.intelligenceWhySheet.open').forEach(e=>e.classList.remove('open'));document.querySelector('#projectsWrap')?.classList.remove('open')});
await q(()=>[...document.querySelectorAll('button')].find(b=>b.innerText.trim()==='Upcoming')?.click());await W(800);
R.weekBtn=await q(()=>{const b=document.querySelector('[data-plan-week]');if(!b)return null;const r=b.getBoundingClientRect();return Math.round(r.width)+'x'+Math.round(r.height)});
await q(()=>document.querySelector('[data-plan-week]')?.click());await W(800);
R.week=await q(()=>[...document.querySelectorAll('#planWeekSheet .planWeekDays section')].map(s=>s.innerText.replace(/\n/g,' | ')));
await q(()=>document.querySelector('[data-week-save]')?.click());await W(700);await q(()=>{const b=[...document.querySelectorAll('button')].find(b=>/^Undo$/.test(b.innerText.trim())&&b.offsetParent);b?.click()});await W(7000);{const row=id=>{const t=MOCK.db.planly_tasks.find(t=>t.client_id===id);return t&&(JSON.stringify(t.data?.date)+' v'+t.cloud_version)};R.dbAfterUndo={pay:row('task-overdue'),plumber:row('task-inbox')}}
R.weekWrites=writes.slice();
R.errors=h.errors;for(const [k,v] of Object.entries(R))console.log(k,JSON.stringify(v));await h.browser.close();
