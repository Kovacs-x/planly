// Budget tab: the composed Budget screen (core-budget-ui and the scope, lifecycle, monthly, month-state, actions and
// scroll layers) — Me/Household, month bar, category detail, add/pay/delete a payment, scroll kept on redraw, and the
// Household set-up card. Written before tidy-up 2b-ii so that refactor can be shown to change nothing.
// Run: node tests/browser/budget-tab.test.mjs (see tests/browser/README.md).
import {startServer,launchBrowser,makeDb,newPhone,openApp,OWNER,PARTNER,HOUSEHOLD} from './harness.mjs';
const server=await startServer();const browser=await launchBrowser();
let pass=0,fail=0;const check=(n,c,d='')=>{console.log((c?'PASS ':'FAIL ')+n+(c?'':' — '+d));c?pass++:fail++};
const W=ms=>new Promise(r=>setTimeout(r,ms));
const d=new Date(),ym=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'),now=d.toISOString();
const monthName=x=>x.toLocaleString('en-GB',{month:'long',year:'numeric'});
const thisMonth=monthName(d),nextMonth=monthName(new Date(d.getFullYear(),d.getMonth()+1,1));
const P='11111111-0000-4000-8000-000000000001',H='22222222-0000-4000-8000-000000000002';
const id=(p,n)=>p+'000000-0000-4000-8000-'+String(n).padStart(12,'0');
const scope=(sid,type,hh)=>({id:sid,owner_id:OWNER,scope_type:type,household_id:hh,name:type==='household'?'Home':'Me',currency:'GBP',created_at:now,updated_at:now,deleted_at:null,cloud_version:1});
const cat=(cid,sc,name,kind='expense',n=1)=>({id:cid,scope_id:sc,owner_id:OWNER,client_id:'c-'+cid,kind,name,icon:'wallet',color:null,archived:false,sort_order:n,created_at:now,updated_at:now,deleted_at:null,cloud_version:1});
const ent=(eid,sc,c,desc,amt,kind='expense')=>({id:eid,scope_id:sc,category_id:c,owner_id:OWNER,client_id:'e-'+eid,kind,amount_minor:amt,entry_date:ym+'-05',description:desc,notes:'',allocation_status:'planned',due_day:5,recurring_monthly:true,show_on_today:false,today_lead_days:2,created_at:now,updated_at:now,deleted_at:null,cloud_version:1});
const seed=(withHousehold)=>{const db=makeDb();
  db.tables.planly_budget_scopes=[scope(P,'personal',null),...(withHousehold?[scope(H,'household',HOUSEHOLD)]:[])];
  const extra=['Bills','Car','Phone','Gym','Pets','Gifts','Travel','Kids','Health','Fun'];
  db.tables.planly_budget_categories=[cat(id('a1',1),P,'Rent'),cat(id('a1',2),P,'Salary','income'),cat(id('a1',3),H,'Groceries'),...extra.map((n,i)=>cat(id('a2',i+1),P,n,'expense',i+2))];
  db.tables.planly_budget_targets=[];
  db.tables.planly_budget_entries=[ent(id('b1',1),P,id('a1',1),'Rent',95000),ent(id('b1',2),P,id('a1',2),'Pay',250000,'income'),ent(id('b1',3),H,id('a1',3),'Tesco',8000),...extra.map((n,i)=>ent(id('b2',i+1),P,id('a2',i+1),n+' bill',1000+i))];
  return db};
const db=seed(true);
const {context,errors}=await newPhone(browser,db,OWNER);const page=await openApp(context,errors);
page.on('dialog',x=>x.accept());
const view=()=>page.evaluate(()=>document.getElementById('view')?.innerText||'');
const click=sel=>page.evaluate(sel=>{const e=document.querySelector(sel);if(!e)return false;e.click();return true},sel);
const active=()=>page.evaluate(()=>document.querySelector('[data-budget-scope].active')?.dataset.budgetScope||'');
const eyebrow=()=>page.evaluate(()=>document.getElementById('eyebrow')?.textContent||'');
const rows=()=>db.tables.planly_budget_entries;

await click('.nav button[data-section="budget"]');await W(2500);
let v=await view();
check('Budget opens on Me with the month bar, the plan and the categories',await active()==='personal'&&v.includes(thisMonth)&&v.includes('Left to plan')&&v.includes('Rent')&&v.includes('Pay'),v.slice(0,160));
check('the header says Personal',await eyebrow()==='Personal',await eyebrow());
check('left to plan is income minus bills',v.includes('£1,449.55'),v.slice(0,200));

// Scroll position is kept when the Budget redraws in place (scroll step). To prove the step is needed, the redraw is made
// to move the page: a watcher jumps to the top the moment the Budget view is replaced, inside the redraw.
await page.evaluate(()=>window.scrollTo(0,400));await W(300);
const y0=await page.evaluate(()=>Math.round(window.scrollY));
await page.evaluate(()=>{window.__budgetJump=0;const v=document.getElementById('view');const mo=new MutationObserver(()=>{if(window.__budgetJump)return;window.__budgetJump=Math.round(window.scrollY)||-1;window.scrollTo(0,0);mo.disconnect()});mo.observe(v,{childList:true});
  window.dispatchEvent(new CustomEvent('planly:budget-invalidated',{detail:{reason:'test'}}))});await W(1500);
const jumped=await page.evaluate(()=>window.__budgetJump),y1=await page.evaluate(()=>Math.round(window.scrollY)),same=(await view()).includes('Left to plan');
check('the redraw really moved the page (the test condition holds)',jumped>200,JSON.stringify({jumped}));
check('a redraw of the same Budget screen puts the scroll position back',y0>200&&same&&Math.abs(y1-y0)<=2,JSON.stringify({y0,y1,same}));
await page.evaluate(()=>window.scrollTo(0,0));await W(200);

// Category detail.
await click(`[data-cat="${id('a1',1)}"]`);await W(1200);v=await view();
check('a category opens its bills',v.includes('Rent')&&v.includes('Monthly')&&v.includes('£950.00')&&await page.evaluate(()=>!!document.querySelector('[data-budget-paid]')),v.slice(0,160));
check('the Me/Household bar stays on the category page',await active()==='personal');

// Mark the bill paid (actions layer).
await click(`[data-budget-paid="${id('b1',1)}"]`);await W(1500);
check('ticking a bill marks it paid in the cloud',rows().find(r=>r.id===id('b1',1))?.allocation_status==='paid',rows().find(r=>r.id===id('b1',1))?.allocation_status);
await click('[data-act="back"]');await W(1200);

// Add a payment.
await click('[data-act="allocation"]');await W(1000);
await page.evaluate(()=>{const s=(i,v)=>{const e=document.getElementById(i);e.value=v;e.dispatchEvent(new Event('input',{bubbles:true}))};s('allocAmount','12.50');s('allocName','Window cleaner')});
await page.evaluate(id=>document.querySelector(`[data-category-chip="${id}"]`)?.click(),id('a1',1));await click('[data-due="7"]');
await page.evaluate(()=>document.getElementById('budgetAllocationForm').requestSubmit());await W(2000);
const added=rows().find(r=>r.description==='Window cleaner'&&!r.deleted_at);
check('a new payment is saved to the Me budget',added&&added.amount_minor===1250&&added.scope_id===P&&added.category_id===id('a1',1)&&added.due_day===7,JSON.stringify(added));
v=await view();check('and it shows in its category straight away',v.includes('Window cleaner')&&v.includes('£12.50'),v.replace(/\s+/g,' ').slice(0,300));

// Delete it (we are on its category page).
if(added)await click(`[data-budget-delete-entry="${added.id}"]`);await W(1800);
check('deleting a payment removes it in the cloud',added&&!!rows().find(r=>r.id===added.id)?.deleted_at,JSON.stringify(rows().find(r=>r.id===added?.id)));
await click('[data-act="back"]');await W(1000);

// Household and back.
await click('[data-budget-scope="household"]');await W(2500);v=await view();
check('Household shows the shared budget',await active()==='household'&&v.includes('Groceries')&&!v.includes('Rent'),v.slice(0,200));
check('the header says Household',await eyebrow()==='Household',await eyebrow());
await click('[data-budget-scope="personal"]');await W(2500);v=await view();
check('Me comes back with its own budget',await active()==='personal'&&v.includes('Rent')&&!v.includes('Groceries'),v.slice(0,200));

// Month bar (monthly + month-state layers).
await click('[data-month-next]');await W(1500);v=await view();
check('the month bar moves to next month',v.includes(nextMonth),v.slice(0,120));
await click('[data-month-prev]');await W(1500);v=await view();
check('and back to this month',v.includes(thisMonth)&&!v.includes(nextMonth),v.slice(0,120));
await click('.nav button[data-section="today"]');await W(1200);await click('.nav button[data-section="budget"]');await W(2000);v=await view();
check('leaving and returning to Budget shows it complete again',v.includes('Left to plan')&&v.includes(thisMonth),v.slice(0,120));

// Household with no shared budget yet: the set-up card (scope layer's early exit).
const db2=seed(false);const two=await newPhone(browser,db2,OWNER);const page2=await openApp(two.context,two.errors);
await page2.evaluate(()=>document.querySelector('.nav button[data-section="budget"]').click());await W(2500);
await page2.evaluate(()=>document.querySelector('[data-budget-scope="household"]')?.click());await W(2500);
const v2=await page2.evaluate(()=>document.getElementById('view')?.innerText||'');
check('Household without a shared budget offers to set one up',v2.includes('Set up Household Budget')&&await page2.evaluate(()=>!!document.querySelector('[data-budget-create-household]')),v2.slice(0,160));
const stages=await page.evaluate(()=>window.PlanlyBudgetUI?.stages?.()||null);
check('Budget draws through its six steps in order',JSON.stringify(stages)===JSON.stringify(['scope','lifecycle','monthly','month-state','actions','scroll']),JSON.stringify(stages));
check('no page errors',errors.length===0&&two.errors.length===0,[...errors,...two.errors].slice(0,3).join(' | '));
console.log(`${pass} passed, ${fail} failed`);await browser.close();server.close();process.exit(fail?1:0);
