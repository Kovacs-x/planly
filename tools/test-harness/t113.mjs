import { launch } from './harness.mjs';
import { ME, PARTNER } from './mock.mjs';
await fetch('http://localhost:8802/__switch?to=pr');
const h=await launch({uid:ME}); const {page:p,W,MOCK}=h; const q=(f,a)=>p.evaluate(f,a); const R={};
const lk=o=>{const x=new Date();x.setDate(x.getDate()+o);return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0')};
const elec=MOCK.db.planly_budget_entries.find(e=>e.description==='Electricity');elec.entry_date=lk(1);elec.show_on_today=true;
p.on('dialog',d=>d.dismiss());
await p.goto('http://localhost:8802/planly/v2/'); await W(4000); await p.reload(); await W(10000);
const nav=async s=>{await q(s=>document.querySelector(`.nav button[data-section="${s}"]`).click(),s);await W(900)};
const bills=()=>q(()=>[...document.querySelectorAll('.billsDueSection .billDueRow')].map(r=>r.innerText.replace(/\s+/g,' ').trim()));
R.fresh=await bills();
await nav('budget');await q(()=>document.querySelector('[data-budget-scope="household"]').click());await W(2500);await q(()=>document.querySelector('[data-budget-scope="personal"]').click());await W(2500);
await nav('today');R.afterOpeningBoth=await bills();
// partner (server-side) marks Electricity paid, and adds a new household bill due today
elec.allocation_status='paid';elec.cloud_version++;
MOCK.db.planly_budget_entries.push({...elec,id:crypto.randomUUID(),client_id:'e-new',description:'Partner new bill',allocation_status:'planned',entry_date:lk(0),owner_id:PARTNER,cloud_version:1});
await p.reload();await W(10000);R.afterPartnerChangesAndReload=await bills();
// resume
await q(()=>{Object.defineProperty(document,'visibilityState',{value:'hidden',configurable:true});document.dispatchEvent(new Event('visibilitychange'))});await W(500);
await q(()=>{Object.defineProperty(document,'visibilityState',{value:'visible',configurable:true});document.dispatchEvent(new Event('visibilitychange'))});await W(6000);
R.afterResume=await bills();
// tick the stale bill
MOCK.log=[];await q(()=>{const r=[...document.querySelectorAll('.billDueRow')].find(r=>/Electricity/.test(r.innerText));r?.querySelector('[data-budget-bill-paid]')?.click()});await W(2500);
R.tickStale={writes:MOCK.log.filter(l=>!l.startsWith('GET')&&!l.includes('sync_state')).map(l=>l.split('?')[0]),toast:await q(()=>document.getElementById('planlyToast')?.textContent||''),bills:await bills()};
R.errors=h.errors;for(const [k,v] of Object.entries(R))console.log(k,JSON.stringify(v));await h.browser.close();
