// Budget opens instantly from loaded data (0 blocking requests); after 60s it refreshes in the background and shows a partner's new entry; amber colours + contrast.
import { launch } from './harness.mjs';
import { PARTNER } from './mock.mjs';
const PORT=process.env.PORT||8802;
await fetch(`http://localhost:${PORT}/__switch?to=pr`);
const h=await launch({}); const {page:p,W,MOCK}=h; const q=(f,a)=>p.evaluate(f,a); const bad=[],R={};
await p.setViewportSize({width:390,height:844});
await p.goto(`http://localhost:${PORT}/planly/v2/`); await W(4000); await p.reload(); await W(9000);
const open=async()=>{await q(()=>document.querySelector('.nav button[data-section="today"]').click());await W(400);const n=MOCK.log.length;const ms=await q(()=>new Promise(r=>{const t0=performance.now();document.querySelector('.nav button[data-section="budget"]').click();const tick=()=>{if(document.querySelector('#view .budgetHero'))r(Math.round(performance.now()-t0));else if(performance.now()-t0>8000)r(-1);else requestAnimationFrame(tick)};tick()}));return {ms,n}};
let o=await open();await W(1500);R.first={ms:o.ms,req:MOCK.log.length-o.n};if(o.ms<0||o.ms>100)bad.push('first open slow '+o.ms);
// a partner adds a household-scope entry on the server; switch the mock's personal scope entry too: add to the scope currently shown
const scopeId=await q(()=>window.PlanlyBudget?.getState?.()?.scope?.id);const tmpl=MOCK.db.planly_budget_entries.find(e=>e.scope_id===scopeId);
if(!tmpl)bad.push('no entry template for scope');else MOCK.db.planly_budget_entries.push({...tmpl,id:crypto.randomUUID(),client_id:'e-new',description:'Window cleaner',amount_minor:2500,owner_id:tmpl.owner_id,created_at:new Date().toISOString(),updated_at:new Date().toISOString()});
o=await open();await W(800);R.within60={ms:o.ms,req:MOCK.log.length-o.n};if(R.within60.req!==0)bad.push('refetched within 60s');
R.hasNewBefore=await q(()=>/Window cleaner/.test(document.getElementById('view').innerText));
console.log('waiting 62s for staleness…');await W(62000);
o=await open();R.stale={ms:o.ms};await W(3000);R.stale.req=MOCK.log.length-o.n;if(o.ms<0||o.ms>100)bad.push('stale open blocked '+o.ms);if(R.stale.req<1)bad.push('no background refresh');
R.hasNewAfter=await q(()=>window.PlanlyBudget.getState().entries?.some?.(e=>e.description==='Window cleaner')||/Window cleaner/.test(document.getElementById('view').innerText));if(!R.hasNewAfter)bad.push('new entry not picked up');
R.stillBudget=await q(()=>!!document.querySelector('#view .budgetHero'));if(!R.stillBudget)bad.push('budget not rendered after refresh');
// amber colours
const lum=c=>{const m=c.match(/[\d.]+/g).map(Number);const f=v=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4)};return .2126*f(m[0])+.7152*f(m[1])+.0722*f(m[2])};const con=(a,b)=>{const x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)};
for(const theme of ['light','dark']){await q(t=>document.documentElement.dataset.theme=t,theme);await W(200);const c=await q(()=>{const b=document.querySelector('.nav button[data-section="budget"]');const cs=getComputedStyle(b);return {color:cs.color,bg:cs.backgroundColor,icon:getComputedStyle(b.querySelector('.pIcon')).color,primary:(()=>{const x=document.querySelector('.budgetPrimary');return x?[getComputedStyle(x).color,getComputedStyle(x).backgroundColor]:null})()}});R['amber_'+theme]=c;
 const k=con(c.color,c.bg);if(k<4.5)bad.push(theme+' budget tab label contrast '+k.toFixed(2));if(c.primary&&con(c.primary[0],c.primary[1])<4.5)bad.push(theme+' budget primary contrast');
 await p.screenshot({path:`t159-budget-${theme}.png`});}
R.errors=h.errors;if(h.errors.length)bad.push('page errors');
console.log(JSON.stringify(R));console.log(bad.length?'FAIL '+JSON.stringify(bad):'PASS t159');await h.browser.close();
