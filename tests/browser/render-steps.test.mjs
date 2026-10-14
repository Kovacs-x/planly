// The view's render steps (tidy-up 2b-ii part B): renderCore with the stable, diagnostics (opt-in), budget, fitness and
// r1 steps around it. Every tab draws through its step, two renders in the same turn draw once (stable step), and the
// opt-in diagnostics step still logs renders.
// Run: node tests/browser/render-steps.test.mjs (see tests/browser/README.md).
import {startServer,launchBrowser,makeDb,newPhone,openApp,OWNER} from './harness.mjs';
const server=await startServer();const browser=await launchBrowser();
let pass=0,fail=0;const check=(n,c,d='')=>{console.log((c?'PASS ':'FAIL ')+n+(c?'':' — '+d));c?pass++:fail++};
const W=ms=>new Promise(r=>setTimeout(r,ms));
const d=new Date(),today=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
const db=makeDb();
db.tables.planly_tasks.push({owner_id:OWNER,client_id:'r1',data:{id:'r1',title:'Gym',date:today,time:'18:00',category:'Personal',durationMinutes:30,priority:'normal',completed:false,recurrence:'none',reminder:'none',notes:'',subtasks:[],createdAt:1,updatedAt:1,visibility:'private'},visibility:'private',household_id:null,assignee_id:null,completed_by:null,completed_at:null,cloud_version:1,deleted_at:null});
const {context,errors}=await newPhone(browser,db,OWNER);const page=await openApp(context,errors);
const nav=s=>page.evaluate(s=>document.querySelector(`.nav button[data-section="${s}"]`).click(),s);
const look=()=>page.evaluate(()=>({title:document.getElementById('pageTitle')?.textContent||'',eyebrow:document.getElementById('eyebrow')?.textContent||'',text:(document.getElementById('view')?.innerText||'').replace(/\s+/g,' ').slice(0,160),
  active:document.querySelector('.nav button.active')?.dataset.section||'',add:getComputedStyle(document.getElementById('addBtn')).display,segments:!!document.querySelector('.planSegments')}));
let s;
await nav('today');await W(1200);s=await look();
check('Today draws through the core step with the task and the add button',s.active==='today'&&s.text.includes('Gym')&&s.add!=='none',JSON.stringify(s));
await nav('plan');await W(1200);s=await look();
check('Plan draws with its segments (r1 step) and the Plan header',s.active==='plan'&&s.segments&&s.title==='Plan',JSON.stringify(s));
await page.evaluate(()=>document.querySelector('[data-plan-segment="month"]').click());await W(1000);s=await look();
check('a Plan segment redraws through the r1 step',s.eyebrow==='Month'&&s.segments,JSON.stringify(s));
await page.evaluate(()=>document.querySelector('[data-plan-segment="upcoming"]').click());await W(800);
await nav('home');await W(1200);s=await look();
check('Home draws through the r1 step without the add button',s.active==='home'&&s.add==='none'&&!s.segments,JSON.stringify(s));
await nav('budget');await W(2500);s=await look();
check('Budget draws through the budget step with its header',s.active==='budget'&&s.title==='Budget'&&s.add==='none'&&/Budget|Set up|Left to plan|Personal/.test(s.text+s.eyebrow),JSON.stringify(s));
await nav('fitness');await W(1500);s=await look();
check('Fitness draws through the fitness step',s.active==='fitness'&&s.title==='Fitness'&&s.add==='none'&&await page.evaluate(()=>!!document.querySelector('.fitView')),JSON.stringify(s));

// Stable step: two renders in the same turn draw the view once.
await nav('today');await W(1200);
const draws=await page.evaluate(async()=>{const v=document.getElementById('view');let n=0;const mo=new MutationObserver(rs=>{for(const r of rs)if(r.removedNodes.length)n++});mo.observe(v,{childList:true});
  const b=document.querySelector('.nav button[data-section="today"]');b.click();b.click();await new Promise(r=>setTimeout(r,300));mo.disconnect();return n});
check('two renders in the same turn draw the view once (stable step)',draws===1,'view replaced '+draws+' times');
const later=await page.evaluate(async()=>{const v=document.getElementById('view');let n=0;const mo=new MutationObserver(rs=>{for(const r of rs)if(r.removedNodes.length)n++});mo.observe(v,{childList:true});
  const b=document.querySelector('.nav button[data-section="today"]');b.click();await new Promise(r=>setTimeout(r,50));b.click();await new Promise(r=>setTimeout(r,300));mo.disconnect();return n});
check('renders in separate turns each draw',later===2,'view replaced '+later+' times');

// Diagnostics step (opt-in): ?planlydiag=1 logs renders (window.PlanlyDiagnostics).
const p2=await context.newPage();p2.on('pageerror',e=>errors.push(String(e)));
await p2.goto('http://localhost:8765/v2/?planlydiag=1',{waitUntil:'load'});await W(3000);
await p2.evaluate(()=>document.querySelector('.nav button[data-section="plan"]').click());await W(800);
await p2.evaluate(()=>document.querySelector('.nav button[data-section="today"]').click());await W(800);
const diag=await p2.evaluate(()=>{const e=window.PlanlyDiagnostics?.events||[];return {on:!!window.PlanlyDiagnostics,renders:e.filter(x=>x.type==='render:start').length,tabs:[...new Set(e.filter(x=>x.type==='render:start').map(x=>x.tab))]}});
check('?planlydiag=1 logs every render (diagnostics step)',diag.on&&diag.renders>=2&&diag.tabs.includes('today'),JSON.stringify(diag));
const off=await page.evaluate(()=>!!window.PlanlyDiagnostics);
check('without ?planlydiag=1 there is no diagnostics step',!off);
check('no page errors',errors.length===0,errors.slice(0,3).join(' | '));
console.log(`${pass} passed, ${fail} failed`);await browser.close();server.close();process.exit(fail?1:0);
