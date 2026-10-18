// Budget forms: Add payment asks "What for?" before the amount; a category's "+ Add a bill" sits at the top, above its
// bills; and what is typed into a form is not wiped when the app redraws (coming back to the app, a sync) or reloads,
// until the form is saved or left.
// Run: node tests/browser/budget-forms.test.mjs (see tests/browser/README.md).
import {startServer,launchBrowser,makeDb,newPhone,openApp,OWNER} from './harness.mjs';
const server=await startServer();const browser=await launchBrowser();
let pass=0,fail=0;const check=(n,c,d='')=>{console.log((c?'PASS ':'FAIL ')+n+(c?'':' — '+d));c?pass++:fail++};
const W=ms=>new Promise(r=>setTimeout(r,ms));
const d=new Date(),ym=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'),now=d.toISOString();
const P='11111111-0000-4000-8000-000000000001',BILLS='a1000000-0000-4000-8000-000000000001',FUN='a1000000-0000-4000-8000-000000000002';
const db=makeDb();
db.tables.planly_budget_scopes=[{id:P,owner_id:OWNER,scope_type:'personal',household_id:null,name:'Me',currency:'GBP',created_at:now,updated_at:now,deleted_at:null,cloud_version:1}];
db.tables.planly_budget_categories=[{id:BILLS,scope_id:P,owner_id:OWNER,client_id:'c-bills',kind:'expense',name:'Bills',icon_key:'wallet',color:null,archived:false,sort_order:1,created_at:now,updated_at:now,deleted_at:null,cloud_version:1},{id:FUN,scope_id:P,owner_id:OWNER,client_id:'c-fun',kind:'expense',name:'Fun',icon_key:'wallet',color:null,archived:false,sort_order:2,created_at:now,updated_at:now,deleted_at:null,cloud_version:1}];
db.tables.planly_budget_targets=[];
db.tables.planly_budget_entries=['Rent','Phone','Water','Gas','Electric','Internet','Council tax','Insurance'].map((n,i)=>({id:`b1000000-0000-4000-8000-00000000000${i}`,scope_id:P,category_id:BILLS,owner_id:OWNER,client_id:'e'+i,kind:'expense',amount_minor:1000*(i+1),entry_date:ym+'-05',description:n,notes:'',allocation_status:'planned',due_day:5,recurring_monthly:true,show_on_today:false,today_lead_days:2,created_at:now,updated_at:now,deleted_at:null,cloud_version:1}));
const {context,errors}=await newPhone(browser,db,OWNER);const page=await openApp(context,errors);
const click=sel=>page.evaluate(sel=>{const e=document.querySelector(sel);e?.click();return !!e},sel);
const type=(id,v)=>page.evaluate(([id,v])=>{const e=document.getElementById(id);e.focus();e.value=v;e.dispatchEvent(new Event('input',{bubbles:true}))},[id,v]);
const val=id=>page.evaluate(id=>document.getElementById(id)?.value??null,id);
const comeBack=()=>page.evaluate(async()=>{const set=v=>Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>v});set('hidden');document.dispatchEvent(new Event('visibilitychange'));await new Promise(r=>setTimeout(r,300));set('visible');document.dispatchEvent(new Event('visibilitychange'));window.dispatchEvent(new Event('pageshow'));delete document.visibilityState;
  window.dispatchEvent(new Event('planly-budget-sync-change'));window.PlanlyBudgetUI?.renderTab?.(document.getElementById('view'))});

await click('.nav button[data-section="budget"]');await W(2500);
await click(`[data-cat="${BILLS}"]`);await W(1200);
const top=await page.evaluate(()=>{const add=[...document.querySelectorAll('[data-act="allocation"]')].filter(b=>/Add a bill/.test(b.textContent)),first=document.querySelector('[data-budget-edit-entry]');
  return {count:add.length,above:add[0]&&first?add[0].getBoundingClientRect().bottom<=first.getBoundingClientRect().top:false,inView:add[0]?add[0].getBoundingClientRect().bottom<=innerHeight:false}});
check('a category\'s "+ Add a bill" is at the top, above its bills, without scrolling (and only once)',top.count===1&&top.above&&top.inView,JSON.stringify(top));
await page.evaluate(()=>[...document.querySelectorAll('[data-act="allocation"]')].find(b=>/Add a bill/.test(b.textContent))?.click());await W(1000);
const order=await page.evaluate(()=>[...document.querySelectorAll('#budgetAllocationForm label')].map(l=>l.textContent.trim()).slice(0,2));
check('Add payment asks "What for?" first, then the amount',JSON.stringify(order)==='["What for?","Amount"]',JSON.stringify(order));

// A choice made before anything is typed survives coming back to the app (or a sync redraw)
const chosen=()=>page.evaluate(()=>({cat:document.querySelector('[data-category-chip][aria-pressed="true"]')?.dataset.categoryChip||'',due:document.querySelector('.budgetDueRow .active')?.textContent.trim()||''}));
await page.evaluate(id=>document.querySelector(`[data-category-chip="${id}"]`)?.click(),FUN);await W(200);
await comeBack();await W(2500);
check('choosing only a category, then coming back to the app, keeps that category',(await chosen()).cat===FUN,JSON.stringify(await chosen()));
await click('[data-act="back"]');await W(800);await click('[data-act="allocation"]');await W(1000);
await click('[data-due="21"]');await W(200);
await page.evaluate(()=>window.dispatchEvent(new Event('planly-budget-sync-change')));await page.evaluate(()=>window.PlanlyBudgetUI?.renderTab?.(document.getElementById('view')));await W(1500);
check('choosing only a due day, then a sync redraw, keeps that day',(await chosen()).due==='21st',JSON.stringify(await chosen()));
await click('[data-act="back"]');await W(800);await click(`[data-cat="${BILLS}"]`);await W(1200);
await page.evaluate(()=>[...document.querySelectorAll('[data-act="allocation"]')].find(b=>/Add a bill/.test(b.textContent))?.click());await W(1000);

// Coming back to the app while typing
await type('allocName','Window cleaner');await type('allocAmount','12.50');await click('[data-due="15"]');await W(200);
await comeBack();await W(2500);
const kept=await page.evaluate(()=>({name:document.getElementById('allocName')?.value,amount:document.getElementById('allocAmount')?.value,due:document.querySelector('[data-due="15"]')?.classList.contains('active')}));
check('coming back to the app keeps what was typed and chosen',kept.name==='Window cleaner'&&Number(kept.amount)===12.5,JSON.stringify(kept));
check('…including the chosen due day',kept.due===true,JSON.stringify(kept));

// The app being reloaded: the typing comes back when Add payment is opened again
await page.reload();await W(2500);await click('.nav button[data-section="budget"]');await W(2500);
await click('[data-act="allocation"]');await W(1000);
check('after a reload, opening Add payment again brings the typing back',await val('allocName')==='Window cleaner'&&Number(await val('allocAmount'))===12.5,JSON.stringify([await val('allocName'),await val('allocAmount')]));

// Saving clears it
await page.evaluate(id=>document.querySelector(`[data-category-chip="${id}"]`)?.click(),BILLS);
await page.evaluate(()=>document.getElementById('budgetAllocationForm').requestSubmit());await W(2000);
check('saving adds the payment',db.tables.planly_budget_entries.some(r=>r.description==='Window cleaner'&&r.amount_minor===1250));
await click('[data-act="back"]');await W(800);await click('[data-act="allocation"]');await W(1000);
check('…and the next Add payment starts empty',await val('allocName')===''&&await val('allocAmount')==='',JSON.stringify([await val('allocName'),await val('allocAmount')]));

// Leaving with Back clears it too
await type('allocName','Milk');await click('[data-act="back"]');await W(800);await click('[data-act="allocation"]');await W(1000);
check('leaving the form with Back drops what was typed',await val('allocName')==='',await val('allocName'));
await click('[data-act="back"]');await W(800);

// Edit payment keeps its typing too
await click(`[data-cat="${BILLS}"]`);await W(1200);await click('[data-budget-edit-entry]');await W(1000);
await type('editPaymentName','Rent (new flat)');await comeBack();await W(2500);
check('Edit payment keeps what was typed when coming back to the app',await val('editPaymentName')==='Rent (new flat)',await val('editPaymentName'));
check('no page errors',errors.length===0,errors.slice(0,3).join(' | '));
console.log(`${pass} passed, ${fail} failed`);await browser.close();server.close();process.exit(fail?1:0);
