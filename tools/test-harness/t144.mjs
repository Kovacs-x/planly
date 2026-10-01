import { launch } from './harness.mjs';
import { ME, PARTNER } from './mock.mjs';
await fetch('http://localhost:8802/__switch?to=pr');
const R={};
// ---- OFFLINE: Plan My Day + Tidy up while offline, then reconnect
{const h=await launch({uid:ME}); const {page:p,W,MOCK,ctx}=h; const q=(f,a)=>p.evaluate(f,a);
 await p.clock.setFixedTime(new Date('2026-10-01T08:30:00Z'));
 const tiles=MOCK.db.planly_tasks.find(t=>t.client_id==='task-tiles');tiles.task_date='2026-09-26';tiles.data={...tiles.data,date:'2026-09-26'};
 await p.goto('http://localhost:8802/planly/v2/'); await W(4000); await p.reload(); await W(10000);
 await ctx.setOffline(true);await W(500);
 await q(()=>document.querySelector('[data-i2-tidy]')?.click());await W(500);
 await q(()=>document.querySelector('[data-i2-accept-tidy]')?.click());await W(6500);
 R.offlineAfterTidy=await q(()=>[...document.querySelectorAll('.overdueSection .taskTitle')].map(x=>x.innerText));
 await q(()=>document.querySelector('#planMyDayBtn')?.click());await W(700);for(let i=0;i<3;i++){await q(()=>document.querySelector('#planDayNext')?.click());await W(400)}
 await q(()=>document.querySelector('[data-plan-intelligence="top3"]')?.click());await W(300);await q(()=>document.querySelector('#planDayNext')?.click());await W(400);await q(()=>document.querySelector('#planDayNext')?.click());await W(1500);
 R.offlineTop3=await q(()=>[...document.querySelectorAll('.top3List .taskTitle')].map(x=>x.innerText));
 R.offlineChip=await q(()=>document.querySelector('#planlySyncChip')?.innerText);
 const dbBefore=MOCK.db.planly_tasks.filter(t=>['task-overdue','task-tiles','task-dentist','task-rev4'].includes(t.client_id)).map(t=>t.client_id+':'+t.data?.date+':'+t.data?.pinned+':v'+t.cloud_version);
 R.dbWhileOffline=dbBefore;
 await ctx.setOffline(false);await q(()=>window.dispatchEvent(new Event('online')));await W(9000);
 R.dbAfterOnline=MOCK.db.planly_tasks.filter(t=>['task-overdue','task-tiles','task-dentist','task-rev4'].includes(t.client_id)).map(t=>t.client_id+':'+t.data?.date+':'+t.data?.pinned+':v'+t.cloud_version);
 R.onlineChip=await q(()=>document.querySelector('#planlySyncChip')?.innerText);
 R.offlineErrors=h.errors;await h.browser.close()}
// ---- TWO PHONES: owner + partner tick the same Anyone chore at once
{const a=await launch({uid:ME}),b=await launch({uid:PARTNER});const [pa,pb]=[a.page,b.page];
 for(const pg of [pa,pb]){await pg.clock.setFixedTime(new Date('2026-10-01T10:00:00Z'));await pg.goto('http://localhost:8802/planly/v2/');}
 await a.W(4000);for(const pg of [pa,pb])await pg.reload();await a.W(11000);
 for(const pg of [pa,pb])await pg.evaluate(()=>document.querySelector('[data-section="home"]')?.click());await a.W(1200);
 const tick=pg=>pg.evaluate(()=>{const row=[...document.querySelectorAll('.homeChoreRow,.choreRow,#view .task,#view [data-chore-open]')].find(r=>/Clean bathroom/.test(r.innerText)&&!/Done by/.test(r.innerText));const btn=row?.querySelector('button.check,[data-action="toggle"],[data-household-completion],.choreCheck,button');btn?.click();return !!btn});
 R.ticks=await Promise.all([tick(pa),tick(pb)]);await a.W(9000);
 const row=a.MOCK.db.planly_tasks.find(t=>t.client_id==='task-bathroom');R.dbBathroom={completed:row.completed,by:String(row.completed_by||'').slice(0,4),v:row.cloud_version};
 for(const pg of [pa,pb]){await pg.evaluate(()=>{Object.defineProperty(document,'visibilityState',{value:'hidden',configurable:true});document.dispatchEvent(new Event('visibilitychange'))});await a.W(400);await pg.evaluate(()=>{Object.defineProperty(document,'visibilityState',{value:'visible',configurable:true});document.dispatchEvent(new Event('visibilitychange'))})}await a.W(4000);
 R.viewA=await pa.evaluate(()=>[...document.querySelectorAll('#view *')].map(e=>e.childElementCount===0?e.textContent:'').join(' ').match(/Clean bathroom[^A-Z]{0,40}/g)?.slice(0,2));
 R.viewB=await pb.evaluate(()=>[...document.querySelectorAll('#view *')].map(e=>e.childElementCount===0?e.textContent:'').join(' ').match(/Clean bathroom[^A-Z]{0,40}/g)?.slice(0,2));
 R.twoPhoneErrors=[...a.errors,...b.errors];await a.browser.close();await b.browser.close()}
// ---- LARGE DATASET: 600 tasks
{const h=await launch({uid:ME}); const {page:p,W,MOCK}=h; const q=(f,a)=>p.evaluate(f,a);
 await p.clock.setFixedTime(new Date('2026-10-01T10:00:00Z'));
 const base=MOCK.db.planly_tasks.find(t=>t.client_id==='task-groceries');
 for(let i=0;i<600;i++){const r=structuredClone(base);const id='big'+i,date=['2026-10-01','2026-09-20','','2026-10-03'][i%4];r.cloud_id=crypto.randomUUID();r.client_id=id;r.title=(i%50===0?'🧺 '+'Very long task title that keeps going and going to test truncation in compact rows '.repeat(2):'Task '+i);r.task_date=date||null;r.pinned=false;r.data={...r.data,id,title:r.title,date,time:i%7===0?'1'+(i%10)+':00':'',pinned:false,durationMinutes:15+(i%4)*15,category:['Health','Home','Personal'][i%3]};MOCK.db.planly_tasks.push(r)}
 await p.setViewportSize({width:320,height:700});
 const t0=Date.now();await p.goto('http://localhost:8802/planly/v2/'); await W(4000); await p.reload(); await W(12000);
 R.bigTodayRender=await q(()=>{const t=performance.now();for(let i=0;i<5;i++)document.querySelector('[data-section="today"]')?.click();return ((performance.now()-t)/5).toFixed(0)+'ms per Today render'});
 R.bigOverflow=await q(()=>document.documentElement.scrollWidth>innerWidth);
 R.bigPmd=await q(async()=>{const t=performance.now();document.querySelector('#planMyDayBtn')?.click();await new Promise(r=>setTimeout(r,50));return (performance.now()-t).toFixed(0)+'ms to open Plan My Day'});
 await W(500);R.bigPmdTitle=await q(()=>document.querySelector('#planDayTitle')?.innerText);
 R.bigErrors=h.errors;await h.browser.close()}
for(const [k,v] of Object.entries(R))console.log(k,JSON.stringify(v));
