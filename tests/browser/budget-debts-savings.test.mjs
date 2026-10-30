// Budget › Debts and Savings (migration 059): Month / Debts / Savings tabs; adding a debt links its monthly bill; a
// debt's balance is its statement balance minus its linked bills marked paid since; "Pay off next" is the first debt in
// the order, with its 0% end date; an extra payment is added to the month as a bill linked to that debt; the plan clears
// every debt; savings add up, a money circle's payout sets it back to £0; Laki sees the same shared debts.
// Run: node tests/browser/budget-debts-savings.test.mjs (see tests/browser/README.md).
import {startServer,launchBrowser,makeDb,newPhone,openApp,OWNER,PARTNER,HOUSEHOLD} from './harness.mjs';
const server=await startServer();const browser=await launchBrowser();
let pass=0,fail=0;const check=(n,c,d='')=>{console.log((c?'PASS ':'FAIL ')+n+(c?'':' — '+d));c?pass++:fail++};
const W=ms=>new Promise(r=>setTimeout(r,ms));
const pad=n=>String(n).padStart(2,'0'),key=x=>x.getFullYear()+'-'+pad(x.getMonth()+1)+'-'+pad(x.getDate()),now=new Date().toISOString(),ym=key(new Date()).slice(0,7);
const H='22222222-0000-4000-8000-000000000001',BILLS='a2000000-0000-4000-8000-000000000001',SAVE='a2000000-0000-4000-8000-000000000002',INC='a2000000-0000-4000-8000-000000000003';
const V='d2000000-0000-4000-8000-000000000001',A='d2000000-0000-4000-8000-000000000002',HG='e2000000-0000-4000-8000-000000000001';
const later=new Date();later.setMonth(later.getMonth()+3);const zero=key(later);
function mk({money=true}={}){const db=makeDb();let n=0;
  const E=(cat,kind,desc,amt,day,more={})=>({id:'b2000000-0000-4000-8000-0000000000'+pad(++n),scope_id:H,category_id:cat,owner_id:OWNER,client_id:'e'+n,kind,amount_minor:amt,entry_date:ym+'-'+pad(day),description:desc,notes:'',allocation_status:'planned',due_day:day,recurring_monthly:true,show_on_today:false,today_lead_days:0,debt_id:null,saving_id:null,created_at:now,updated_at:now,deleted_at:null,cloud_version:1,...more});
  db.tables.planly_budget_scopes=[{id:H,owner_id:OWNER,scope_type:'household',household_id:HOUSEHOLD,name:'Household Budget',currency:'GBP',client_id:'h',created_at:now,updated_at:now,deleted_at:null,cloud_version:1}];
  const C=(id,name,kind,i)=>({id,scope_id:H,owner_id:OWNER,client_id:'c'+i,kind,name,icon_key:'🧾',color_key:'violet',archived:false,sort_order:i,created_at:now,updated_at:now,deleted_at:null,cloud_version:1});
  db.tables.planly_budget_categories=[C(BILLS,'Bills','expense',1),C(SAVE,'Savings','expense',2),C(INC,'Income','income',3)];db.tables.planly_budget_targets=[];
  db.tables.planly_budget_entries=[E(INC,'income','Musti Work',300000,1),E(BILLS,'expense','Vanquis',10000,10,money?{debt_id:V}:{}),E(BILLS,'expense','Amex',10000,12,money?{debt_id:A}:{}),E(SAVE,'expense','Hagbad 2',25000,14,money?{saving_id:HG}:{}),E(BILLS,'expense','Rent',100000,2)];
  const D=(id,name,bal,more)=>({id,scope_id:H,owner_id:OWNER,client_id:'d-'+name,name,person_id:OWNER,start_minor:bal,balance_minor:bal,balance_on:ym+'-01',apr_bp:null,zero_until:null,minimum_minor:10000,priority:50,notes:'',closed_on:null,client_created_at:1,client_updated_at:1,cloud_version:1,created_at:now,updated_at:now,deleted_at:null,...more});
  db.tables.planly_budget_debts=money?[D(V,'Vanquis',115511,{zero_until:zero,priority:1}),D(A,'Amex',132739,{apr_bp:3320,priority:2})]:[];
  db.tables.planly_budget_savings=money?[{id:HG,scope_id:H,owner_id:OWNER,client_id:'s-hg',name:'Hagbad 2',person_id:null,kind:'circle',balance_minor:50000,balance_on:ym+'-01',goal_minor:null,paused:false,sort_order:1,notes:'',client_created_at:1,client_updated_at:1,cloud_version:1,created_at:now,updated_at:now,deleted_at:null}]:[];
  return db}
const household=async (browser,db,user)=>{const p=await newPhone(browser,db,user);await p.context.addInitScript(u=>{try{localStorage.setItem('planly-budget-active-scope-v1:'+u,'"household"')}catch{}},user);return p};
const budget=async page=>{await page.evaluate(()=>document.querySelector('.nav button[data-tab="budget"]').click());await W(2600)};
const tab=async (page,name)=>{await page.evaluate(n=>[...document.querySelectorAll('.budgetMoneyTabs button')].find(b=>b.textContent.trim()===n)?.click(),name);await W(900)};
const tap=async (page,text)=>{await page.evaluate(t=>[...document.querySelectorAll('#view button')].find(b=>b.textContent.trim()===t||b.textContent.trim().startsWith(t))?.click(),text);await W(900)};
const fill=async (page,vals)=>{await page.evaluate(v=>{for(const [sel,val] of Object.entries(v)){const el=document.querySelector(sel);if(el){el.value=val;el.dispatchEvent(new Event('input',{bubbles:true}))}}},vals)};
const submit=async page=>{await page.evaluate(()=>document.querySelector('form[data-money-form] [type="submit"]').click());await W(2200)};
const tick=async (page,cat,id)=>{await page.evaluate(c=>document.querySelector(`[data-cat="${c}"]`)?.click(),cat);await W(1200);await page.evaluate(i=>document.querySelector(`[data-budget-paid="${i}"]`)?.click(),id);await W(2200);await page.evaluate(()=>document.querySelector('[data-act="back"]')?.click());await W(1200)};
const text=page=>page.evaluate(()=>document.getElementById('view').innerText.replace(/\s+/g,' '));

// 1. Adding a debt from scratch
{const db=mk({money:false});const {context,errors}=await household(browser,db,OWNER);const page=await openApp(context,errors);page.on('dialog',d=>d.accept());await budget(page);
 const t0=await page.evaluate(()=>({tabs:[...document.querySelectorAll('.budgetMoneyTabs button')].map(b=>b.textContent.trim()+':'+b.getAttribute('aria-selected')).join(','),month:!!document.querySelector('.budgetMonthBar'),hero:!!document.querySelector('.budgetHero')}));
 check('the tabs are easy to tap (44px) and sit above the month',await page.evaluate(()=>{const t=document.querySelector('.budgetMoneyTabs'),b=t?.querySelector('button');return !!b&&b.getBoundingClientRect().height>=44&&!!(t.compareDocumentPosition(document.querySelector('.budgetMonthBar'))&Node.DOCUMENT_POSITION_FOLLOWING)}));
 check('Budget has Month / Debts / Savings tabs, on Month with the month bar',t0.tabs==='Month:true,Debts:false,Savings:false'&&t0.month&&t0.hero,JSON.stringify(t0));
 await tab(page,'Debts');
 check('Debts with nothing added: Owed £0.00 and + Add debt',/Owed £0\.00/i.test(await text(page))&&await page.evaluate(()=>!!document.querySelector('[data-money="add-debt"]')&&!document.querySelector('.budgetMonthBar')));
 await tap(page,'+ Add debt');
 const opts=await page.evaluate(()=>({who:[...document.querySelectorAll('#moneyWho option')].map(o=>o.textContent).join(','),bills:[...document.querySelectorAll('#moneyBill option')].map(o=>o.textContent).join('|')}));
 check('the form offers whose (Shared, Musti, Laki) and this month\'s bills',opts.who==='Shared,Musti,Laki'&&/Amex · £100/.test(opts.bills)&&/Rent · £1,000/.test(opts.bills),JSON.stringify(opts));
 const amexBill=db.tables.planly_budget_entries.find(x=>x.description==='Amex').id;
 await fill(page,{'#moneyName':'Amex','#moneyWho':OWNER,'#moneyBalance':'1,327.39','#moneyApr':'33.2','#moneyMin':'100','#moneyBill':amexBill,'#moneyOrder':'1'});await submit(page);
 const row=db.tables.planly_budget_debts[0]||{};
 check('saved to the shared Household budget with the right numbers',db.tables.planly_budget_debts.length===1&&row.scope_id===H&&row.owner_id===OWNER&&row.person_id===OWNER&&row.balance_minor===132739&&row.start_minor===132739&&row.apr_bp===3320&&row.minimum_minor===10000&&row.priority===1,JSON.stringify(row));
 check('…and its monthly bill is linked to it',db.tables.planly_budget_entries.find(x=>x.id===amexBill)?.debt_id===row.id);
 const t1=await text(page);check('the debt page shows the balance, 33.2% and about £37 a month interest',/£1,327\.39/.test(t1)&&/33\.2%/.test(t1)&&/£36\.72 \/ month/.test(t1),t1.slice(0,300));
 // a second debt starts empty, even after leaving Budget and coming back; half-typed details are kept
 await tap(page,'‹ Debts');await tap(page,'+ Add debt');
 const away=async()=>{await page.evaluate(()=>document.querySelector('.nav button[data-tab="today"]').click());await W(1200);await budget(page)};
 await away();
 check('a new debt form is empty after saving one (also after leaving Budget)',await page.evaluate(()=>document.querySelector('#moneyName')?.value===''&&document.querySelector('#moneyBalance')?.value===''),await page.evaluate(()=>document.querySelector('#moneyName')?.value));
 await page.fill('#moneyName','Barc');await away();
 check('…but what you had typed is still there when you come back',await page.evaluate(()=>document.querySelector('#moneyName')?.value==='Barc'));
 await tap(page,'‹ Debts');await tap(page,'+ Add debt');
 check('…and going back out of the form clears it',await page.evaluate(()=>document.querySelector('#moneyName')?.value===''));
 check('no page errors',errors.length===0,errors.slice(0,3).join(' | '));await context.close()}

// 2. Debts and savings with their bills
{const db=mk();const {context,errors}=await household(browser,db,OWNER);const page=await openApp(context,errors);page.on('dialog',d=>d.accept());await budget(page);await tab(page,'Debts');
 let t=await text(page);
 check('Owed adds up both debts',/Owed £2,482\.50/i.test(t),t.slice(0,200));
 const focus=await page.evaluate(()=>document.querySelector('.budgetMoneyFocus')?.innerText.replace(/\s+/g,' ')||'');
 check('Pay off next is first in the order (Vanquis), with its 0% end date',/Pay off next/i.test(focus)&&/Vanquis/.test(focus)&&/0% ends/.test(focus),focus);
 check('a debt-free month is shown',/Debt-free \w+ \d{4}/.test(t),t.slice(0,300));
 // tick the Vanquis bill paid on the Month tab
 await tab(page,'Month');const vbill=db.tables.planly_budget_entries.find(x=>x.description==='Vanquis').id;
 await tick(page,BILLS,vbill);
 check('ticking the bill saved it as paid',db.tables.planly_budget_entries.find(x=>x.id===vbill)?.allocation_status==='paid');
 await tab(page,'Debts');t=await text(page);
 check('…and Vanquis is £100 lower (£1,055.11), Owed £2,382.50',/£1,055\.11/.test(t)&&/Owed £2,382\.50/i.test(t),t.slice(0,400));
 // extra payment
 await page.evaluate(()=>document.querySelector('.budgetMoneyFocus [data-money="extra"]').click());await W(800);
 await fill(page,{'#moneyAmount':'444'});await submit(page);
 const extra=db.tables.planly_budget_entries.find(x=>x.description==='Vanquis extra');
 check('an extra payment is added to this month as a one-off bill linked to Vanquis',!!extra&&extra.amount_minor===44400&&extra.debt_id===V&&extra.recurring_monthly===false&&extra.allocation_status==='planned'&&extra.entry_date.slice(0,7)===ym,JSON.stringify(extra));
 // plan
 await tap(page,'‹ Vanquis');await tap(page,'‹ Debts');await tap(page,'Plan');t=await text(page);
 check('the plan shows each month and when each debt is cleared',/Plan/i.test(t)&&/Vanquis cleared|Vanquis, Amex cleared/.test(t)&&/Amex cleared|Vanquis, Amex cleared/.test(t),t.slice(0,500));
 // update balance from a statement
 await tap(page,'‹ Debts');await page.evaluate(id=>document.querySelector(`[data-money="debt"][data-id="${id}"]`).click(),A);await W(800);await tap(page,'Update balance');
 await fill(page,{'#moneyBalance':'1300'});await submit(page);
 check('Update balance saves the statement balance and date',db.tables.planly_budget_debts.find(x=>x.id===A)?.balance_minor===130000&&db.tables.planly_budget_debts.find(x=>x.id===A)?.balance_on===key(new Date()));
 // savings
 await page.evaluate(()=>document.querySelector('.budgetBack')?.click());await W(600);await tab(page,'Savings');t=await text(page);
 check('Savings shows Hagbad 2 at £500 (Money circle, +£250 · 14th)',/Saved £500\.00/i.test(t)&&/Hagbad 2/.test(t)&&/\+£250 · 14th/.test(t),t.slice(0,300));
 await tab(page,'Month');const hbill=db.tables.planly_budget_entries.find(x=>x.description==='Hagbad 2').id;await tick(page,SAVE,hbill);
 await tab(page,'Savings');t=await text(page);
 check('ticking the saving adds it: £750, ↑ £250 this month',/Saved £750\.00/i.test(t)&&/↑ £250\.00 this month/.test(t),t.slice(0,300));
 await page.evaluate(id=>document.querySelector(`[data-money="saving"][data-id="${id}"]`).click(),HG);await W(800);await tap(page,'Payout received');await W(1500);
 const pot=db.tables.planly_budget_savings.find(x=>x.id===HG);
 check('Payout received sets the circle back to £0 from today',pot?.balance_minor===0&&pot.balance_on===key(new Date())&&/£0\.00/.test(await text(page)),JSON.stringify(pot));
 check('the tab is remembered: Budget reopens on Savings',await (async()=>{await page.reload();await W(2500);await budget(page);return page.evaluate(()=>document.querySelector('.budgetMoneyTabs button[aria-selected="true"]')?.textContent.trim()==='Savings')})());
 check('no page errors',errors.length===0,errors.slice(0,3).join(' | '));await context.close();
 // Laki sees the same shared debts
 const p2=await household(browser,db,PARTNER);const page2=await openApp(p2.context,p2.errors);await budget(page2);await tab(page2,'Debts');const t2=await text(page2);
 check('Laki sees the same shared debts',/Vanquis/.test(t2)&&/Amex/.test(t2)&&/Musti/.test(t2),t2.slice(0,300));await p2.context.close()}

console.log(`${pass} passed, ${fail} failed`);await browser.close();server.close();process.exit(fail?1:0);
