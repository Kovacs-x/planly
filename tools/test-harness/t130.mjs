import { launch } from './harness.mjs';
import { ME } from './mock.mjs';
await fetch('http://localhost:8802/__switch?to=pr');
const h=await launch({uid:ME}); const {page:p,W,MOCK}=h; const q=(f,a)=>p.evaluate(f,a); const R={};
await p.clock.setFixedTime(new Date('2026-10-01T08:30:00Z'));
const tiles=MOCK.db.planly_tasks.find(t=>t.client_id==='task-tiles');tiles.task_date='2026-09-26';tiles.data={...tiles.data,date:'2026-09-26'};
await p.goto('http://localhost:8802/planly/v2/'); await W(4000); await p.reload(); await W(10000);
const writes=[];p.on('request',r=>{if(['POST','PATCH','DELETE'].includes(r.method())&&r.url().includes('/rest/v1/planly_tasks'))writes.push((r.postData()||'').match(/"title":"[^"]*"|"date":"[^"]*"|"deferCount":\d+/g)?.join(' '))});
await q(()=>document.querySelector('[data-i2-tidy]')?.click());await W(500);
await q(()=>{const s=document.querySelector('[data-i2-tidy-choice="task-tiles"]');s.value='';s.dispatchEvent(new Event('change',{bubbles:true}))});
await q(()=>document.querySelector('[data-i2-accept-tidy]')?.click());await W(8000);
R.writes=writes;const row=id=>{const t=MOCK.db.planly_tasks.find(t=>t.client_id===id);return t&&(JSON.stringify(t.data?.date)+' defer'+t.data?.deferCount+' v'+t.cloud_version)};R.db={pay:row('task-overdue'),tiles:row('task-tiles')};
R.inbox=await q(async()=>{document.querySelector('[data-section="plan"]')?.click();await new Promise(r=>setTimeout(r,800));[...document.querySelectorAll('button')].find(b=>b.innerText.trim()==='Inbox')?.click();await new Promise(r=>setTimeout(r,800));return [...document.querySelectorAll('#view .taskTitle')].map(x=>x.innerText)});
await q(()=>document.querySelector('[data-section="today"]')?.click());await W(800);
await q(()=>document.querySelector('#planMyDayBtn')?.click());await W(800);for(let i=0;i<3;i++){await q(()=>document.querySelector('#planDayNext')?.click());await W(500)}
await q(()=>document.querySelector('#planDayContent [data-plan-why]')?.click());await W(500);
R.whyTask=await q(()=>document.querySelector('#intelligenceWhySheet.open')?.innerText.replace(/\n/g,' | '));
R.errors=h.errors;for(const [k,v] of Object.entries(R))console.log(k,JSON.stringify(v));await h.browser.close();
