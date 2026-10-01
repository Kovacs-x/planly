import { launch } from './harness.mjs';
import { ME, PARTNER } from './mock.mjs';
const B='http://localhost:8802/planly/v2/'; const w=process.argv[2]||'pr'; await fetch('http://localhost:8802/__switch?to='+w);
const who=process.argv[3]==='partner'?PARTNER:ME;
const h=await launch({uid:who}); const {page:p,W,MOCK,ctx}=h; const q=f=>p.evaluate(f);
const answers=[];p.on('dialog',async d=>{const a=answers.shift();R.dialogs.push(d.type()+':'+d.message().slice(0,60));if(d.type()==='alert')return d.accept();a===false?d.dismiss():d.accept(a??undefined)});
const R={dialogs:[]};
await p.goto(B); await W(4000); await p.reload(); await W(9000);
const txt=()=>q(()=>document.getElementById('view').innerText.replace(/\s+/g,' '));
const writes=()=>MOCK.log.filter(l=>!l.startsWith('GET')&&!l.includes('sync_state')).map(l=>l.split('?')[0]+(l.includes('cloud_version')?' [cv]':''));
MOCK.log=[];await q(()=>document.querySelector('.nav button[data-section="budget"]').click());await W(1500);
R.openReqs=MOCK.log.map(l=>l.split('?')[0]);
const t=await txt();R.text=t.slice(0,700);
R.sections=['Left to plan','coming in','Paid','To pay','Unplanned','Coming up','Categories','Money in','+ Payment','+ Income','Edit'].map(s=>s+':'+t.includes(s));
R.removed=['Monthly snapshot','Left to budget','pending sync','Derived from','Planned','Budgeted'].map(s=>s+':'+t.includes(s));
R.iso=(t.match(/\d{4}-\d{2}-\d{2}/g)||[]);R.emoji=(t.match(/\p{Extended_Pictographic}/gu)||[]);
R.coming=await q(()=>[...document.querySelectorAll('.budgetPaymentRow')].map(r=>r.innerText.replace(/\s+/g,' ')));
// tick paid + undo
MOCK.log=[];await q(()=>document.querySelector('[data-budget-paid]')?.click());await W(2000);
R.afterTick={writes:writes(),undoBar:await q(()=>document.querySelector('.budgetUndo')?.innerText.replace(/\s+/g,' ')),db:MOCK.db.planly_budget_entries.filter(e=>e.description==='Rent').map(e=>e.allocation_status+'/v'+e.cloud_version)};
MOCK.log=[];await q(()=>document.querySelector('.budgetUndo button')?.click());await W(2000);
R.afterUndo={writes:writes(),db:MOCK.db.planly_budget_entries.filter(e=>e.description==='Rent').map(e=>e.allocation_status+'/v'+e.cloud_version)};
// category detail
await q(()=>document.querySelector('.budgetCat[data-cat]')?.click());await W(1000);
R.category=(await txt()).slice(0,400);
R.catRowActions=await q(()=>[...document.querySelectorAll('.budgetPaymentRow')].map(r=>r.innerText.split('\n')[0]+' edit:'+!!r.querySelector('[data-budget-edit-entry]')+' del:'+!!r.querySelector('[data-budget-delete-entry]')));
R.catButtons=await q(()=>[...document.querySelectorAll('#view button')].map(b=>b.getAttribute('aria-label')||b.innerText.trim()).filter(Boolean));
// edit entry via prompts
MOCK.log=[];await q(()=>document.querySelector('.budgetPaymentRow [data-budget-edit-entry]')?.click());await W(900);await q(()=>{document.getElementById('editPaymentName').value='Rent (flat)';document.getElementById('editPaymentAmount').value='975.00';document.getElementById('budgetEditPaymentForm').requestSubmit()});await W(2000);await q(()=>document.querySelector('[data-edit-payment-back]')?.click());await W(900);
R.edit={writes:writes(),db:MOCK.db.planly_budget_entries.filter(e=>/Rent/.test(e.description)).map(e=>e.description+'/'+e.amount_minor)};
// add payment
await q(()=>document.querySelector('[data-act="allocation"]')?.click());await W(800);
R.addForm=await q(()=>({labels:[...document.querySelectorAll('#view label')].map(l=>l.innerText.trim()),chips:[...document.querySelectorAll('#view [data-category-chip]')].map(b=>b.innerText.trim()),due:[...document.querySelectorAll('#view [data-due]')].map(b=>b.innerText.trim()),first:document.querySelector('#view input')?.id}));
MOCK.log=[];await q(()=>{document.getElementById('allocAmount').value='42.50';document.getElementById('allocName').value='Broadband';document.querySelector('[data-due="15"]')?.click();document.getElementById('budgetAllocationForm').requestSubmit()});await W(3000);
R.add={writes:writes(),view:(await txt()).slice(0,300),db:MOCK.db.planly_budget_entries.filter(e=>e.description==='Broadband').map(e=>e.amount_minor+'/due'+e.due_day+'/'+e.entry_date)};
// delete entry
answers.push('');MOCK.log=[];await q(()=>{const r=[...document.querySelectorAll('.budgetPaymentRow')].find(r=>/Broadband/.test(r.innerText));r?.querySelector('[data-budget-delete-entry]')?.click()});await W(2000);
R.del={writes:writes(),db:MOCK.db.planly_budget_entries.filter(e=>e.description==='Broadband').map(e=>'deleted:'+!!e.deleted_at)};
// back, month nav
await q(()=>document.querySelector('[data-act="back"]')?.click());await W(800);
MOCK.log=[];await q(()=>document.querySelector('[data-month-next]')?.click());await W(1500);R.nextMonth={label:await q(()=>document.querySelector('.budgetMonthLabel')?.innerText),reqs:MOCK.log.length,hero:(await txt()).slice(0,160)};
await q(()=>document.querySelector('[data-month-prev]')?.click());await W(1500);R.prevMonth=await q(()=>document.querySelector('.budgetMonthLabel')?.innerText);
// household scope
await q(()=>document.querySelector('[data-budget-scope="household"]')?.click());await W(2500);
R.household=(await txt()).slice(0,400);
MOCK.log=[];await q(()=>document.querySelector('[data-budget-paid]')?.click());await W(2000);
R.hhTick={writes:writes(),db:MOCK.db.planly_budget_entries.filter(e=>e.description==='Electricity').map(e=>e.allocation_status+'/owner'+e.owner_id.slice(0,4))};
await q(()=>document.querySelector('.budgetUndo button')?.click());await W(1500);
R.hhCatButtons=await q(async()=>{document.querySelector('.budgetCat[data-cat]')?.click();await new Promise(r=>setTimeout(r,800));return [...document.querySelectorAll('#view button')].map(b=>b.innerText.trim()).filter(Boolean)});
await q(()=>document.querySelector('[data-act="back"]')?.click());await W(800);
// offline tick
await ctx.setOffline(true);await q(()=>window.dispatchEvent(new Event('offline')));await W(400);
MOCK.log=[];await q(()=>document.querySelector('[data-budget-paid]')?.click());await W(1500);R.offlineTick={dialogs:R.dialogs.slice(-1),writes:writes()};
await ctx.setOffline(false);await q(()=>window.dispatchEvent(new Event('online')));await W(3000);
MOCK.log=[];await q(()=>document.querySelector('.nav button[data-section="today"]').click());await W(800);await q(()=>document.querySelector('.nav button[data-section="budget"]').click());await W(1500);R.reopenReqs=MOCK.log.map(l=>l.split('?')[0]);
MOCK.log=[];await W(15000);R.idle=MOCK.log.length;
R.errors=h.errors;for(const [k,v] of Object.entries(R))console.log(k,JSON.stringify(v));
await h.browser.close();
