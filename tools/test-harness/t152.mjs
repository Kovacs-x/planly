// iPhone follow-up: 4 tabs fill the bar, Why?/Hide today aligned, Show on Today toggles (persist, Timeline/Plan my day kept)
import { launch } from './harness.mjs';
import { ME } from './mock.mjs';
await fetch('http://localhost:8802/__switch?to=pr');
const h=await launch({uid:ME}); const {page:p,W,MOCK}=h; const q=(f,a)=>p.evaluate(f,a); const R={}; const bad=[];
await p.goto('http://localhost:8802/planly/v2/'); await W(4000); await p.reload(); await W(10000);
for(const w of [320,390,430]){
  await p.setViewportSize({width:w,height:844}); await W(500);
  R['nav'+w]=await q(()=>{const n=document.querySelector('.nav').getBoundingClientRect();const b=[...document.querySelectorAll('.nav button')].filter(x=>x.offsetParent).map(x=>x.getBoundingClientRect());return {navL:Math.round(n.left),navR:Math.round(n.right),widths:b.map(r=>Math.round(r.width)),lastGap:Math.round(n.right-b[b.length-1].right),firstGap:Math.round(b[0].left-n.left)}});
  const n=R['nav'+w]; if(Math.max(...n.widths)-Math.min(...n.widths)>2||Math.abs(n.lastGap-n.firstGap)>4)bad.push('nav uneven '+w+' '+JSON.stringify(n));
  R['links'+w]=await q(()=>[...document.querySelectorAll('.dayCheckLink')].map(b=>{const r=b.getBoundingClientRect(),t=document.createRange();t.selectNodeContents(b);const tr=t.getBoundingClientRect();return b.innerText+':'+Math.round(r.top)+'-'+Math.round(r.bottom)+' text@'+Math.round(tr.top+tr.height/2)}));
  const mids=R['links'+w].map(x=>+x.split('text@')[1]); if(mids.length!==2||Math.abs(mids[0]-mids[1])>1)bad.push('links misaligned '+w+' '+R['links'+w]);
}
const present=()=>q(()=>({summary:!!document.querySelector('.dashboardHero'),deadlines:!!document.querySelector('.dashboardDeadlines'),dayCheck:!!document.querySelector('.todayDayCheck'),top3:!!document.querySelector('.prioritySection'),household:!!document.querySelector('.householdCard'),timeline:!!document.querySelector('#timelineBtn'),plan:!!document.querySelector('#planMyDayBtn')}));
R.before=await present();
await q(()=>document.querySelector('#profileToggle')?.click());await W(400);await q(()=>document.querySelector('[data-profile-settings]')?.click());await W(900);await q(()=>document.querySelector('.settingsHubRow[data-settings-page="appearance"]')?.click());await W(700);
R.toggles=await q(()=>[...document.querySelectorAll('[data-today-card]')].map(c=>c.dataset.todayCard+':'+c.checked+':'+Math.round(c.closest('label').getBoundingClientRect().height)));
for(const t of R.toggles){if(!/:true:/.test(t))bad.push('default off '+t);if(+t.split(':')[2]<44)bad.push('toggle row small '+t)}
await q(()=>document.querySelectorAll('[data-today-card]').forEach(c=>{if(c.checked)c.click()}));await W(500);
await q(()=>document.querySelector('[data-section="today"]')?.click());await W(900);
R.allOff=await present();
await p.reload();await W(9000);await q(()=>document.querySelector('[data-section="today"]')?.click());await W(800);
R.afterReload=await present();
R.planBtnWorks=await q(async()=>{document.querySelector('#planMyDayBtn')?.click();await new Promise(r=>setTimeout(r,900));const o=!!document.querySelector('#planDayWrap.open, .planDayWrap.open, [aria-labelledby="planDayTitle"]');document.querySelector('#planDayClose, [data-plan-close]')?.click();return o});
for(const k of ['summary','deadlines','dayCheck','top3','household'])if(R.allOff[k]||R.afterReload[k])bad.push(k+' still shown when off');
if(!R.allOff.timeline||!R.allOff.plan)bad.push('Timeline/Plan my day lost');
R.length=await q(()=>Math.round(document.querySelector('#view').scrollHeight));
// back on
await q(()=>document.querySelector('#profileToggle')?.click());await W(400);await q(()=>document.querySelector('[data-profile-settings]')?.click());await W(900);await q(()=>document.querySelector('.settingsHubRow[data-settings-page="appearance"]')?.click());await W(700);
await q(()=>document.querySelectorAll('[data-today-card]').forEach(c=>{if(!c.checked)c.click()}));await W(400);
await q(()=>document.querySelector('[data-section="today"]')?.click());await W(900);
R.backOn=await present(); R.lengthOn=await q(()=>Math.round(document.querySelector('#view').scrollHeight));
for(const k of ['summary','dayCheck','top3'])if(!R.backOn[k])bad.push(k+' not restored');
R.errors=h.errors; if(h.errors.length)bad.push('page errors');
for(const [k,v] of Object.entries(R))console.log(k,JSON.stringify(v));
console.log(bad.length?'FAIL '+JSON.stringify(bad):'PASS t152'); await h.browser.close();
