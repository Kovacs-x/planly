// Stage 4a (D10): a calendar marked "partner" never counts as busy time (Top 3 limit stays 3 on her long shift; 2 when it is mine);
// Settings "Whose calendar is this?" saves represents; Today card title; neutral wording; duplicate hint; 0 errors.
import { launch } from './harness.mjs';
const PORT=process.env.PORT||8802;
await fetch(`http://localhost:${PORT}/__switch?to=pr`);
const bad=[],R={};
async function run(represents,{twin=false}={}){
 const h=await launch({}); const {page:p,W,MOCK}=h; const q=(f,a)=>p.evaluate(f,a);
 const today=new Date().toISOString().slice(0,10);
 await p.clock.setFixedTime(new Date(today+'T10:00:00Z'));
 const src=MOCK.db.calendar_sources[0];src.represents=represents;src.name='NHS Rota';
 MOCK.db.external_calendar_events.push({...MOCK.db.external_calendar_events[0],id:crypto.randomUUID(),external_uid:'t160-long',title:'Long day',starts_at:today+'T07:30:00+00:00',ends_at:today+'T20:00:00+00:00',start_date:today,end_date:today,is_all_day:false});
 if(twin){const s2={...src,id:crypto.randomUUID(),name:'Rota copy',represents:'self'};MOCK.db.calendar_sources.push(s2);for(const e of MOCK.db.external_calendar_events.filter(e=>e.source_id===src.id).slice())MOCK.db.external_calendar_events.push({...e,id:crypto.randomUUID(),source_id:s2.id})}
 for(const r of MOCK.db.planly_tasks){if(r.task_date===today&&r.visibility!=='household'){r.pinned=false;r.top3_order=null;if(r.data){r.data.pinned=false;r.data.top3Order=null}}}
 await p.setViewportSize({width:390,height:844});
 await p.goto(`http://localhost:${PORT}/planly/v2/`); await W(4000); await p.reload(); await W(10000);
 const out={};
 out.counter=await q(()=>document.querySelector('.prioritySection .sectionHead .muted')?.innerText);
 out.card=await q(()=>{const c=document.querySelector('.householdCard');return c?c.querySelector('h2')?.innerText+' | '+c.querySelector('.householdEyebrow')?.innerText:null});
 out.bodyHasWife=await q(()=>/\bWife\b|Rota items|Rota \/ all day/.test(document.body.innerText));
 // Settings > Calendars
 await q(()=>document.getElementById('profileToggle').click());await W(600);
 await q(()=>document.querySelector('.settingsHubRow[data-settings-page="calendars"]').click());await W(800);
 await q(()=>document.querySelectorAll('.calendarSourceDetails').forEach(d=>d.open=true));await W(300);
 out.select=await q(()=>[...document.querySelectorAll('[data-planly-calendar-represents]')].map(s=>s.value+':'+[...s.options].map(o=>o.text).join('/')+':'+Math.round(s.getBoundingClientRect().height)));
 out.twin=await q(()=>[...document.querySelectorAll('.calendarTwinHint')].map(x=>x.innerText));
 await p.screenshot({path:`t160-settings-${represents}${twin?'-twin':''}.png`,fullPage:true});
 out.errors=h.errors;
 return {out,h,p,q,W,MOCK,today};
}
// 1. partner rota: long shift must NOT make it a work day → 3
let r=await run('partner');R.partner=r.out;
if(!/\/3$/.test(r.out.counter||''))bad.push('partner shift counted as busy: counter '+r.out.counter);
if(!/^Partner’s schedule \| Calendar$/.test(r.out.card||''))bad.push('partner card title '+r.out.card);
if(r.out.bodyHasWife)bad.push('Wife/Rota wording still shown');
if(!r.out.select[0]?.startsWith('partner:Mine/My partner’s'))bad.push('select '+r.out.select);
if(r.out.select.some(s=>Number(s.split(':').pop())<44))bad.push('select <44');
// switch it to Mine via Settings → saved, and Today now treats it as my work day (2)
const n=r.MOCK.log.length;
await r.q(()=>{const s=document.querySelector('[data-planly-calendar-represents]');s.value='self';s.dispatchEvent(new Event('change',{bubbles:true}))});await r.W(1500);
R.patch=r.MOCK.log.slice(n).filter(x=>/calendar_sources/.test(x));R.dbAfter=r.MOCK.db.calendar_sources[0].represents;
if(R.dbAfter!=='self')bad.push('represents not saved: '+R.dbAfter);
await r.q(()=>document.querySelector('.nav button[data-section="today"]').click());await r.W(1200);
R.counterAfterMine=await r.q(()=>document.querySelector('.prioritySection .sectionHead .muted')?.innerText);
if(!/\/2$/.test(R.counterAfterMine||''))bad.push('own long shift should limit Top 3 to 2: '+R.counterAfterMine);
R.cardAfterMine=await r.q(()=>document.querySelector('.householdCard h2')?.innerText);if(R.cardAfterMine!=='Your calendar')bad.push('own card title '+R.cardAfterMine);
if(r.h.errors.length)bad.push('errors A '+r.h.errors);await r.h.browser.close();
// 2. self rota from the start → 2
r=await run('self');R.self=r.out;if(!/\/2$/.test(r.out.counter||''))bad.push('self shift not counted: '+r.out.counter);if(r.h.errors.length)bad.push('errors B');await r.h.browser.close();
// 3. duplicate hint
r=await run('partner',{twin:true});R.twin=r.out.twin;if(r.out.twin.length<2||!/same calendar as/.test(r.out.twin[0]))bad.push('twin hint '+JSON.stringify(r.out.twin));if(r.h.errors.length)bad.push('errors C');await r.h.browser.close();
console.log(JSON.stringify(R));console.log(bad.length?'FAIL '+JSON.stringify(bad):'PASS t160');
