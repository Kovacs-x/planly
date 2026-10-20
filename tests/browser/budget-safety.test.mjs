// Budget does not get stuck or draw in the wrong place: a double tap on a bill's tick (in Budget or on Today), Edit
// category's Save, a payment's Delete or Delete category saves once
// with no false "changed on another device"; a save that finishes after leaving Budget does not draw Budget over the
// other tab; tapping Budget on a Budget page (a category, a form, Edit income) goes back to the Budget home; Edit payment
// saves once on a double tap; Manage's Create starts with an empty name again.
// Run: node tests/browser/budget-safety.test.mjs (see tests/browser/README.md).
import {startServer,launchBrowser,makeDb,newPhone,openApp,OWNER} from './harness.mjs';
const server=await startServer();const browser=await launchBrowser();
let pass=0,fail=0;const check=(n,c,d='')=>{console.log((c?'PASS ':'FAIL ')+n+(c?'':' — '+d));c?pass++:fail++};
const W=ms=>new Promise(r=>setTimeout(r,ms));
const d=new Date(),today=d.toISOString().slice(0,10),ym=today.slice(0,7),now=d.toISOString();
const P='11111111-0000-4000-8000-000000000001',BILLS='a1000000-0000-4000-8000-000000000001',INC='a1000000-0000-4000-8000-000000000002',CAR='a1000000-0000-4000-8000-000000000003';
const E=(n,cat,kind,desc,amount,more={})=>({id:'b1000000-0000-4000-8000-00000000000'+n,scope_id:P,category_id:cat,owner_id:OWNER,client_id:'e'+n,kind,amount_minor:amount,entry_date:ym+'-05',description:desc,notes:'',allocation_status:'planned',due_day:5,recurring_monthly:true,show_on_today:false,today_lead_days:0,created_at:now,updated_at:now,deleted_at:null,cloud_version:1,...more});
const db=makeDb();
db.tables.planly_budget_scopes=[{id:P,owner_id:OWNER,scope_type:'personal',household_id:null,name:'Me',currency:'GBP',created_at:now,updated_at:now,deleted_at:null,cloud_version:1}];
db.tables.planly_budget_categories=[{id:BILLS,scope_id:P,owner_id:OWNER,client_id:'c1',kind:'expense',name:'Bills',icon_key:'wallet',color:null,archived:false,sort_order:1,created_at:now,updated_at:now,deleted_at:null,cloud_version:1},{id:INC,scope_id:P,owner_id:OWNER,client_id:'c2',kind:'income',name:'Income',icon_key:'wallet',color:null,archived:false,sort_order:2,created_at:now,updated_at:now,deleted_at:null,cloud_version:1},{id:CAR,scope_id:P,owner_id:OWNER,client_id:'c3',kind:'expense',name:'Car',icon_key:'wallet',color:null,archived:false,sort_order:3,created_at:now,updated_at:now,deleted_at:null,cloud_version:1}];
db.tables.planly_budget_targets=[];
db.tables.planly_budget_entries=[E(1,BILLS,'expense','Rent',90000),E(2,BILLS,'expense','Phone',2000),E(3,INC,'income','Salary',200000),E(4,BILLS,'expense','Water',3000,{entry_date:today,due_day:Number(today.slice(8)),show_on_today:true}),E(5,CAR,'expense','Fuel',6000),E(6,BILLS,'expense','Spare',500)];
db.delays.planly_budget_entries=700;db.delays.planly_budget_categories=700;
const {context,errors}=await newPhone(browser,db,OWNER);const page=await openApp(context,errors);
const dialogs=[];page.on('dialog',x=>{dialogs.push(x.message());x.accept()});
const tab=t=>page.evaluate(t=>document.querySelector(`.nav button[data-tab="${t}"]`).click(),t);
const row=n=>db.tables.planly_budget_entries.find(r=>r.client_id==='e'+n);
const look=()=>page.evaluate(()=>({active:document.querySelector('.nav button.active')?.dataset.tab,hero:!!document.querySelector('#view .budgetHero'),budgetBits:!!document.querySelector('#view .budgetHero,#view [data-budget-paid],#view .budgetScopeBar,#view .budgetMonthBar'),cat:!!document.querySelector('#view [data-act="allocation"][data-category]'),form:document.querySelector('#view form')?.id||''}));
const openBills=async()=>{await page.evaluate(id=>document.querySelector(`[data-cat="${id}"]`)?.click(),BILLS);await W(1000)};

// Today's bill tick, double tap
await page.waitForFunction(()=>!!document.querySelector('[data-budget-bill-paid]'),null,{timeout:8000}).catch(()=>{});
const todayBill=await page.evaluate(()=>{const b=document.querySelector('[data-budget-bill-paid]');if(!b)return false;b.click();b.click();return true});
await W(2500);
const toast=await page.evaluate(()=>document.getElementById('planlyToast')?.textContent||'');
check('a double tap on a bill tick on Today marks it paid once, with no "changed" message',todayBill&&row(4).allocation_status==='paid'&&row(4).cloud_version===2&&!/changed|refresh/i.test(toast),JSON.stringify({todayBill,status:row(4).allocation_status,v:row(4).cloud_version,toast}));
await page.evaluate(()=>document.querySelector('#planlyUndoToast .undoButton')?.click());await W(1500);

// Budget tick, double tap
await tab('budget');await W(2500);await openBills();
await page.evaluate(()=>{const b=document.querySelector('[data-budget-paid]');b.click();b.click()});await W(3000);
check('a double tap on a bill tick in Budget saves once with no "changed on another device"',!dialogs.some(m=>/another device|changed/i.test(m))&&row(1).allocation_status==='paid'&&row(1).cloud_version===2,JSON.stringify({dialogs,status:row(1).allocation_status,v:row(1).cloud_version}));
dialogs.length=0;

// A tick that finishes after switching to Home does not draw Budget over Home
await page.evaluate(()=>[...document.querySelectorAll('[data-budget-paid]')].at(-1)?.click());await W(120);
await tab('home');await W(3000);
let s=await look();
check('ticking a bill then going to Home: Home is not covered by Budget',s.active==='home'&&!s.budgetBits,JSON.stringify(s));
await tab('budget');await W(2000);s=await look();
check('…and Budget is there again when you come back',s.active==='budget'&&(s.cat||s.hero),JSON.stringify(s));

// Tapping Budget on a Budget page goes to the Budget home
if(!s.cat)await openBills();
await tab('budget');await W(1200);s=await look();
check('tapping Budget inside a category goes back to the Budget home',s.hero&&!s.cat,JSON.stringify(s));
await page.evaluate(()=>document.querySelector('[data-act="allocation"]')?.click());await W(900);
if(await page.evaluate(()=>!!document.getElementById('allocName')))await page.fill('#allocName','Half typed');await W(200);
await tab('budget');await W(1200);s=await look();
check('tapping Budget on Add payment after typing goes back to the Budget home',s.hero&&!s.form,JSON.stringify(s));
await page.evaluate(()=>document.querySelector('.budgetIncomeRow')?.click());await W(1000);
const incomeForm=(await look()).form;if(incomeForm==='budgetLifecycleForm')await page.fill('#lifeAmount','2100');
await tab('budget');await W(1200);s=await look();
check('tapping Budget on Edit income after typing goes back to the Budget home (nothing saved)',incomeForm==='budgetLifecycleForm'&&s.hero&&!s.form&&row(3).amount_minor===200000,JSON.stringify({incomeForm,s,amount:row(3).amount_minor}));
check('…and no field is left focused',await page.evaluate(()=>!/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName||'')));

// Edit payment: double tap Save
await openBills();
await page.evaluate(()=>{const r=[...document.querySelectorAll('details[data-budget-row]')].find(x=>/Phone/.test(x.textContent));if(r)r.open=true});await W(200);
await page.evaluate(()=>[...document.querySelectorAll('[data-budget-edit-entry]')].find(b=>b.closest('details')?.textContent.includes('Phone'))?.click());await W(900);
const hasEdit=await page.evaluate(()=>!!document.getElementById('editPaymentAmount'));
if(hasEdit){await page.fill('#editPaymentAmount','25');await page.evaluate(()=>{const f=document.querySelector('#editPaymentAmount').form;f.requestSubmit();f.requestSubmit()});await W(3000)}
check('Edit payment: a double tap on Save saves once with no "changed on another device"',hasEdit&&row(2).amount_minor===2500&&row(2).cloud_version===2&&!dialogs.some(m=>/another device|changed/i.test(m)),JSON.stringify({hasEdit,amount:row(2).amount_minor,v:row(2).cloud_version,dialogs}));

// Manage: after Create the name is empty and the Budget tab still works
await tab('budget');await W(1000);
await page.evaluate(()=>document.querySelector('[data-act="manage"]')?.click());await W(900);
if(await page.evaluate(()=>!!document.getElementById('catName')))await page.fill('#catName','Groceries');await page.evaluate(()=>document.getElementById('budgetCategoryForm').requestSubmit());await W(1500);
const left=await page.evaluate(()=>document.getElementById('catName')?.value);check('Manage: after Create the name field is empty again (no accidental duplicate)',left==='',JSON.stringify(left));
await tab('budget');await W(1200);s=await look();
check('…and tapping Budget goes back to the Budget home',s.hero&&!s.form,JSON.stringify(s));
await W(2500);
check('…one Groceries category was made',db.tables.planly_budget_categories.filter(c=>c.name==='Groceries').length===1,String(db.tables.planly_budget_categories.filter(c=>c.name==='Groceries').length));

// Edit category: double tap Save
const cat=id=>db.tables.planly_budget_categories.find(c=>c.id===id);
const noConflict=()=>!dialogs.some(m=>/another device|changed/i.test(m));
dialogs.length=0;await tab('budget');await W(1000);await openBills();
await page.evaluate(()=>document.querySelector('[data-budget-category-edit]')?.click());await W(800);
const hasCatEdit=await page.evaluate(()=>!!document.getElementById('budgetCategoryEditName'));
if(hasCatEdit){await page.fill('#budgetCategoryEditName','Bills & rent');await page.evaluate(()=>{const f=document.getElementById('budgetCategoryEditName').form;f.requestSubmit();f.requestSubmit()});await W(3000)}
check('Edit category: a double tap on Save saves once with no "changed on another device"',hasCatEdit&&cat(BILLS).name==='Bills & rent'&&cat(BILLS).cloud_version===2&&noConflict(),JSON.stringify({hasCatEdit,name:cat(BILLS).name,v:cat(BILLS).cloud_version,dialogs}));

// Payment row: double tap Delete
dialogs.length=0;await tab('budget');await W(1000);await openBills();
const delTapped=await page.evaluate(()=>{const r=[...document.querySelectorAll('details[data-budget-row]')].find(x=>/Spare/.test(x.textContent));if(!r)return false;r.open=true;const b=r.querySelector('[data-budget-delete-entry]');if(!b)return false;b.click();b.click();return true});
await W(3000);
check('Payment row: a double tap on Delete deletes once with no "changed on another device"',delTapped&&!!row(6).deleted_at&&row(6).cloud_version===2&&noConflict(),JSON.stringify({delTapped,deleted:row(6).deleted_at,v:row(6).cloud_version,dialogs}));

// Category: double tap Delete category
dialogs.length=0;await tab('budget');await W(1000);
await page.evaluate(id=>document.querySelector(`[data-cat="${id}"]`)?.click(),CAR);await W(1000);
const catTapped=await page.evaluate(()=>{const b=document.querySelector('[data-budget-remove-category]');if(!b)return false;b.click();b.click();return true});
await W(4000);
const carRow=cat(CAR);
check('Category: a double tap on Delete category removes it and its payment once, with no "changed on another device"',catTapped&&(carRow.archived||carRow.deleted_at)&&carRow.cloud_version===2&&!!row(5).deleted_at&&row(5).cloud_version===2&&noConflict(),JSON.stringify({catTapped,archived:carRow.archived,deleted:carRow.deleted_at,v:carRow.cloud_version,fuel:{d:row(5).deleted_at,v:row(5).cloud_version},dialogs}));

check('no page errors',errors.length===0,errors.slice(0,3).join(' | '));
console.log(`\n${pass} passed, ${fail} failed`);await browser.close();server.close();process.exit(fail?1:0);
