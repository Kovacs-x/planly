// Reproduce user's iPhone row: overdue "Mustafa WFH" 09:00 2h Work every 2 weeks, in both densities at 390/320
import { launch } from './harness.mjs';
import { ME } from './mock.mjs';
await fetch('http://localhost:8802/__switch?to=pr');
const h=await launch({uid:ME}); const {page:p,W,MOCK}=h; const q=(f,a)=>p.evaluate(f,a);
const base=MOCK.db.planly_tasks.find(r=>r.recurrence==='weekly'&&r.visibility!=='household');
const d=new Date();d.setDate(d.getDate()-1);const y=d.toISOString().slice(0,10);
const cfg={...base.recurrence_config,interval:2};
MOCK.db.planly_tasks.push({...base,cloud_id:crypto.randomUUID(),client_id:'wfh',title:'Mustafa WFH',task_date:y,task_time:'09:00:00',duration_minutes:120,category:'Work',recurrence:'weekly',recurrence_config:cfg,occurrence_number:1,data:{...base.data,id:'wfh',title:'Mustafa WFH',date:y,time:'09:00',category:'Work',durationMinutes:120,recurrence:'weekly',recurrenceConfig:cfg,occurrenceNumber:1}});
await p.goto('http://localhost:8802/planly/v2/'); await W(4000); await p.reload(); await W(10000);
for(const dens of ['compact','comfortable']){
  await q(dn=>{try{const k='planly-device-settings-v1';const s=JSON.parse(localStorage.getItem(k)||'{}');s.version=1;s.taskRowDensity=dn;localStorage.setItem(k,JSON.stringify(s))}catch{}},dens);
  await p.reload(); await W(9000);
  for(const w of [390,320]){
    await p.setViewportSize({width:w,height:844}); await W(600);
    const r=await q(()=>{const t=[...document.querySelectorAll('.task')].find(x=>/Mustafa WFH/.test(x.innerText));if(!t)return null;t.scrollIntoView({block:'center'});const meta=t.querySelector('.compactTaskMeta, .meta, .taskMeta');return {cls:t.className,metaCls:meta?.className,html:meta?.outerHTML.slice(0,900),segs:meta?[...meta.children].map(c=>c.className+'|'+c.innerText+'|'+Math.round(c.getBoundingClientRect().width)+'/'+c.scrollWidth+(c.scrollWidth>c.getBoundingClientRect().width+1?' CUT':'')+'|'+getComputedStyle(c).fontSize):[]}});
    console.log(dens,w,JSON.stringify(r));
    await p.screenshot({path:`shot-wfh-${dens}-${w}.png`,clip:await q(()=>{const t=[...document.querySelectorAll('.task')].find(x=>/Mustafa WFH/.test(x.innerText));const b=t.getBoundingClientRect();return {x:0,y:Math.max(0,b.top-10),width:innerWidth,height:b.height+20}})});
  }
}
await p.setViewportSize({width:390,height:844});
await q(()=>{document.querySelector('[data-section="today"]')?.click()});await W(800);
const before=await q(()=>document.querySelector('.todayDayCheck')?.innerText.replace(/\n/g,' | '));
await q(()=>document.querySelector('[data-i2-snooze]')?.click());await W(600);
const hidden=await q(()=>document.querySelector('.todayDayCheck')?.innerText.replace(/\n/g,' | '));
const showBtn=await q(()=>{const b=document.querySelector('[data-i2-unsnooze]');const r=b?.getBoundingClientRect();return b?Math.round(r.width)+'x'+Math.round(r.height):null});
await q(()=>document.querySelector('[data-i2-unsnooze]')?.click());await W(600);
const after=await q(()=>document.querySelector('.todayDayCheck')?.innerText.replace(/\n/g,' | '));
await p.reload();await W(9000);const afterReload=await q(()=>document.querySelector('.todayDayCheck')?.innerText.replace(/\n/g,' | '));
console.log('daycheck',JSON.stringify({before,hidden,showBtn,after,afterReload}));
console.log('errors',JSON.stringify(h.errors)); await h.browser.close();
