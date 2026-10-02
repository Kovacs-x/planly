import { launch } from './harness.mjs';
import { ME } from './mock.mjs';
await fetch('http://localhost:8802/__switch?to=pr');
const h=await launch({uid:ME}); const {page:p,W,MOCK}=h; const q=(f,a)=>p.evaluate(f,a); const R={};
await p.clock.setFixedTime(new Date(process.env.CLOCK||(new Date().toISOString().slice(0,10)+'T08:30:00Z')));
const tiles=MOCK.db.planly_tasks.find(t=>t.client_id==='task-tiles');tiles.task_date='2026-09-26';tiles.data={...tiles.data,date:'2026-09-26'};
await p.setViewportSize({width:Number(process.env.VW||390),height:844});
await p.goto('http://localhost:8802/planly/v2/'); await W(4000); await p.reload(); await W(10000);
const writes=[];p.on('request',r=>{if(['POST','PATCH','DELETE'].includes(r.method())&&r.url().includes('/rest/v1/'))writes.push(r.method()+' '+r.url().split('/rest/v1/')[1].split('?')[0]+' '+(r.postData()||'').slice(0,2000))});
const box=s=>q(s=>[...document.querySelectorAll(s)].map(b=>(b.innerText||'').replace(/\n/g,' | ').slice(0,90)+' '+Math.round(b.getBoundingClientRect().width)+'x'+Math.round(b.getBoundingClientRect().height)),s);
R.dayCheck=await box('.todayDayCheck button');
R.top3Empty=await q(()=>document.querySelector('.prioritySection')?.innerText.replace(/\n/g,' | '));
R.suggestBtn=await box('[data-i2-suggest3]');
R.tidyBtn=await box('[data-i2-tidy]');
// Why sheet
await q(()=>document.querySelector('[data-i2-why]')?.click());await W(500);
R.why=await q(()=>document.querySelector('#intelligenceWhySheet.open')?.innerText.replace(/\n/g,' | '));
await q(()=>document.querySelector('[data-i2-close-why]')?.click());await W(300);
// Suggest 3
writes.length=0;await q(()=>document.querySelector('[data-i2-suggest3]')?.click());await W(800);
R.afterSuggest=await q(()=>[...document.querySelectorAll('.top3List .taskTitle')].map(x=>x.innerText));
R.toast=await q(()=>document.querySelector('.toast,#toast,[class*=undo]')?.innerText?.replace(/\n/g,' | '));
await q(()=>{const b=[...document.querySelectorAll('button')].find(b=>/^Undo$/i.test(b.innerText.trim())&&b.offsetParent);b?.click()});await W(800);
R.afterUndo=await q(()=>[...document.querySelectorAll('.top3List .taskTitle')].map(x=>x.innerText));
await W(5000);R.suggestWrites=writes.slice();
// Tidy
writes.length=0;await q(()=>document.querySelector('[data-i2-tidy]')?.click());await W(500);
R.tidy=await q(()=>[...document.querySelectorAll('#tidyOverdueSheet .tidyRows label')].map(l=>l.querySelector('strong').innerText+' = '+l.querySelector('select').selectedOptions[0].text+' ('+(l.querySelector('.tidyReason')?.innerText||'')+') ['+[...l.querySelectorAll('option')].map(o=>o.text).join('/')+'] '+Math.round(l.querySelector('select').getBoundingClientRect().height)+'px'));R.closeBtn=await q(()=>{const b=document.querySelector('[data-i2-close-tidy]');const r=b.getBoundingClientRect();return Math.round(r.width)+'x'+Math.round(r.height)+' '+getComputedStyle(b.querySelector('svg')).transform});
R.tidyText=await q(()=>document.querySelector('#tidyOverdueSheet')?.innerText.replace(/\n/g,' | ').slice(0,300));
await q(()=>document.querySelector('[data-i2-accept-tidy]')?.click());await W(800);
R.toastTidy=await q(()=>[...document.querySelectorAll('button')].filter(b=>/^Undo$/i.test(b.innerText.trim())&&b.offsetParent).length);
await q(()=>{const b=[...document.querySelectorAll('button')].find(b=>/^Undo$/i.test(b.innerText.trim())&&b.offsetParent);b?.click()});await W(800);
R.overdueAfterUndo=await q(()=>[...document.querySelectorAll('.overdueSection .taskTitle')].map(x=>x.innerText));
await W(6000);R.tidyWrites=writes.map(w=>w.replace(/.*"title":"([^"]*)".*"date":"([^"]*)".*?("deferCount":\d+)?.*/,'$1 $2 $3').slice(0,120));
R.tidyRaw=writes.map(w=>(w.match(/"title":"[^"]*"|"date":"[^"]*"|"deferCount":\d+/g)||[]).join(' '));
{const row=id=>{const t=MOCK.db.planly_tasks.find(t=>t.client_id===id);return t&&(t.data?.date+' v'+t.cloud_version)};R.dbAfterTidyUndo={pay:row('task-overdue'),tiles:row('task-tiles')};R.localAfterTidyUndo=await q(()=>{const v=Object.keys(localStorage).filter(k=>k.startsWith('planly-cloud-cache')).map(k=>localStorage.getItem(k)).join('');return (v.match(/Order tiles[^}]{0,80}/)||[''])[0].slice(0,90)})}
// Next up: complete a task
await q(()=>{const t=[...document.querySelectorAll('#view .task')].find(t=>/Team stand-up/.test(t.innerText));t?.querySelector('[data-action="toggle"]')?.click()});await W(700);
R.nextToast=await q(()=>[...document.querySelectorAll('div,span')].filter(e=>e.offsetParent&&/Task completed/.test(e.innerText)&&e.childElementCount<4).map(e=>e.innerText.replace(/\n/g,' | ')).slice(0,1));
// snooze
await W(5000);await q(()=>document.querySelector('[data-i2-snooze]')?.click());await W(600);
R.afterSnooze={dayCheck:await q(()=>!!document.querySelector('.todayDayCheck')),suggest:await q(()=>!!document.querySelector('[data-i2-suggest3]'))};
await q(()=>document.querySelector('#planMyDayBtn')?.click());await W(800);for(let i=0;i<3;i++){await q(()=>document.querySelector('#planDayNext')?.click());await W(500)}
R.planDayAfterSnooze=await q(()=>!!document.querySelector('.planSuggestedTag,[data-plan-intelligence]'));
R.perf=await q(()=>{const tasks=[];for(let i=0;i<500;i++)tasks.push({id:'x'+i,title:'t'+i,date:i%3?'2026-09-30':'2026-09-2'+(i%9),visibility:'private',durationMinutes:30,completed:false,createdAt:i});const t0=performance.now();for(let k=0;k<10;k++)window.PlanlyIntelligence.analyse({today:'2026-09-30',realToday:'2026-09-30',nowMinutes:480,planningStart:'08:00',planningEnd:'23:00',tasks,busy:[]});return ((performance.now()-t0)/10).toFixed(1)+'ms'});
R.errors=h.errors;for(const [k,v] of Object.entries(R))console.log(k,JSON.stringify(v));await h.browser.close();
