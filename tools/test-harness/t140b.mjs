import { launch } from './harness.mjs';
import { ME } from './mock.mjs';
await fetch('http://localhost:8802/__switch?to=pr');
const h=await launch({uid:ME}); const {page:p,W}=h; const q=(f,a)=>p.evaluate(f,a); const R={};
await p.clock.setFixedTime(new Date('2026-10-01T10:00:00Z'));
await p.goto('http://localhost:8802/planly/v2/'); await W(4000); await p.reload(); await W(10000);
const samples=()=>q(()=>{try{return JSON.parse(localStorage.getItem('planly-intelligence-history-v1')||'{}').samples?.length||0}catch{return -1}});
// Monday review
await q(()=>document.querySelector('[data-section="plan"]')?.click());await W(800);await q(()=>document.querySelector('[data-plan-segment="upcoming"]')?.click());await W(800);
R.review=await q(()=>document.querySelector('.weeklyReview')?.innerText.replace(/\n/g,' | '));
R.reviewBtn=await q(()=>{const b=document.querySelector('[data-plan-week-review]');if(!b)return null;const r=b.getBoundingClientRect();return Math.round(r.width)+'x'+Math.round(r.height)});
await q(()=>document.querySelector('[data-plan-week-review]')?.click());await W(700);R.weekOpened=await q(()=>!!document.querySelector('#planWeekSheet.open'));
await q(()=>document.querySelector('[data-week-close]')?.click());await W(300);
// Focus learning
await q(()=>document.querySelector('[data-section="today"]')?.click());await W(800);
R.s0=await samples();
const opened=await q(()=>{const b=document.querySelector('[data-dashboard-focus]');b?.click();return !!b});await W(600);
await q(()=>document.querySelector('[data-focus-action="timer"]')?.click());await W(300);
await p.clock.setFixedTime(new Date('2026-10-01T10:42:00Z'));await W(300);
await q(()=>document.querySelector('[data-focus-action="complete"]')?.click());await W(800);
R.focusOpened=opened;R.s1=await samples();
await q(()=>{const b=[...document.querySelectorAll('button')].find(b=>/^Undo$/.test(b.innerText.trim())&&b.offsetParent);b?.click()});await W(800);
R.s2=await samples();
// non-Monday: no review
R.errors=h.errors;for(const [k,v] of Object.entries(R))console.log(k,JSON.stringify(v));await h.browser.close();
