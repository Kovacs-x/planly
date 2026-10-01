// Review #113: Top 3 limit is 2 on a work day, 3 otherwise, on every surface (manual star, Today counter, Plan My Day step 4 summary)
import { launch } from './harness.mjs';
import { ME } from './mock.mjs';
const PORT=process.env.PORT||'8802', B='http://localhost:'+PORT+'/planly/v2/';
const mode=process.argv[2]||'work'; const bad=[]; const R={mode};
const h=await launch({uid:ME}); const {page:p,W,MOCK}=h; const q=(f,a)=>p.evaluate(f,a);
const today=new Date().toISOString().slice(0,10);
if(mode==='work'){MOCK.db.external_calendar_events.push({...MOCK.db.external_calendar_events[0],id:crypto.randomUUID(),external_uid:'t150-long',title:'Long day',starts_at:today+'T07:30:00+00:00',ends_at:today+'T20:00:00+00:00',start_date:today,end_date:today})}
else MOCK.db.external_calendar_events.length=0;
// make sure there are at least 4 unpinned personal tasks today
for(const r of MOCK.db.planly_tasks){if(r.task_date===today&&r.visibility!=='household'){r.pinned=false;r.top3_order=null;if(r.data){r.data.pinned=false;r.data.top3Order=null}}}
await p.goto(B); await W(4000); await p.reload(); await W(10000);
const alerts=[]; p.on('dialog',async d=>{alerts.push(d.message());await d.dismiss()});
R.counter0=await q(()=>document.querySelector('.prioritySection .sectionHead .muted')?.innerText);
const ids=await q(()=>[...document.querySelectorAll('.task[data-id]')].filter(el=>el.querySelector('[data-action="pin"]')&&!el.closest('.prioritySection')).map(el=>el.dataset.id).filter((v,i,a)=>a.indexOf(v)===i));
R.candidates=ids.length; if(ids.length<4)bad.push('need 4 candidates, got '+ids.length);
for(const id of ids.slice(0,4)){await q(id=>{const b=[...document.querySelectorAll('.task[data-id="'+id+'"] [data-action="pin"]')].find(x=>!x.closest('.prioritySection'));b?.click()},id);await W(500)}
R.alerts=alerts; R.counter=await q(()=>document.querySelector('.prioritySection .sectionHead .muted')?.innerText);
R.pinnedToday=await q(t=>document.querySelectorAll('.prioritySection .task').length,today);
const want=mode==='work'?2:3;
if(R.pinnedToday!==want)bad.push('pinned '+R.pinnedToday+' want '+want);
if(R.counter!==want+'/'+want)bad.push('counter '+R.counter);
if(!alerts.length)bad.push('no limit alert on 4th star');
// Plan My Day summary denominator
await q(()=>document.querySelector('#planMyDayBtn')?.click());await W(900);
for(let i=0;i<6;i++){if(await q(()=>!!document.querySelector('.planSummaryGrid')))break;R['stepIntro'+i]=await q(()=>document.querySelector('.planDayIntro')?.innerText||null);await q(()=>document.querySelector('#planDayNext')?.click());await W(800)}
R.step3=await q(()=>document.querySelector('.planDayIntro')?.innerText||null);
R.summary=await q(()=>document.querySelector('.planSummaryGrid')?.innerText.replace(/\n/g,' | ')||null);
if(!R.summary)bad.push('summary not reached');else if(!new RegExp('^\\d/'+want+' \\| Top priorities').test(R.summary))bad.push('summary denominator '+R.summary);
R.errors=h.errors; if(h.errors.length)bad.push('page errors');
for(const [k,v] of Object.entries(R))console.log(k,JSON.stringify(v));
console.log(bad.length?'FAIL '+JSON.stringify(bad):'PASS t150 '+mode); await h.browser.close();
