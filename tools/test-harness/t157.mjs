// Tab switching starts at the top; re-tapping the current tab scrolls smoothly to the top; Plan segment switches reset; no errors.
import { launch } from './harness.mjs';
const PORT=process.env.PORT||8802;
await fetch(`http://localhost:${PORT}/__switch?to=`+(process.argv[2]||'pr'));
const h=await launch({}); const {page:p,W}=h; const q=(f,a)=>p.evaluate(f,a); const bad=[],out=[];
await p.setViewportSize({width:390,height:844});
await p.goto(`http://localhost:${PORT}/planly/v2/`); await W(4000); await p.reload(); await W(9000);
const tabs=['today','plan','home','budget'];
const half=async()=>{const max=await q(()=>document.documentElement.scrollHeight-innerHeight);await q(y=>window.scrollTo(0,y),Math.round(max/2));await W(250);return q(()=>scrollY)};
for(const from of tabs)for(const to of tabs){if(from===to)continue;
 await q(s=>document.querySelector('.nav button[data-section="'+s+'"]').click(),from);await W(700);
 const y0=await half();
 await q(s=>document.querySelector('.nav button[data-section="'+s+'"]').click(),to);
 const f1=await q(()=>new Promise(r=>requestAnimationFrame(()=>r(scrollY))));await W(1000);const y1=await q(()=>scrollY);
 out.push(`${from}->${to} before=${y0} firstFrame=${f1} 1s=${y1}`);if(f1!==0||y1!==0)bad.push(`${from}->${to} not at top (${f1}/${y1})`);
 await q(()=>window.scrollTo(0,0));await W(150);
}
// re-tap current tab: smooth scroll to top
for(const t of ['today','home']){await q(s=>document.querySelector('.nav button[data-section="'+s+'"]').click(),t);await W(600);const y0=await half();
 await q(s=>document.querySelector('.nav button[data-section="'+s+'"]').click(),t);const mid=await q(()=>new Promise(r=>setTimeout(()=>r(scrollY),60)));await W(1200);const y1=await q(()=>scrollY);
 out.push(`retap ${t} before=${y0} 60ms=${mid} 1.2s=${y1}`);if(y1!==0)bad.push('retap '+t+' not at top');if(y0>200&&!(mid>0&&mid<y0))bad.push('retap '+t+' not smooth ('+mid+')');}
// Plan segments
await q(()=>document.querySelector('.nav button[data-section="plan"]').click());await W(600);
for(const [a,b] of [['upcoming','month'],['month','inbox'],['inbox','projects'],['projects','upcoming']]){await q(s=>document.querySelector('[data-plan-segment="'+s+'"]').click(),a);await W(600);const y0=await half();
 await q(s=>document.querySelector('[data-plan-segment="'+s+'"]').click(),b);const f1=await q(()=>new Promise(r=>requestAnimationFrame(()=>r(scrollY))));await W(800);const y1=await q(()=>scrollY);
 out.push(`segment ${a}->${b} before=${y0} firstFrame=${f1} 0.8s=${y1}`);if(y1!==0)bad.push('segment '+a+'->'+b+' not at top');}
console.log(out.join('\n'));if(h.errors.length)bad.push('errors '+h.errors);
console.log(bad.length?'FAIL '+JSON.stringify(bad):'PASS t157');await h.browser.close();
