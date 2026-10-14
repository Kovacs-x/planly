// Budget totals after deleting: deleting a category deletes all of its payments (any month, paid or not) so none of them
// count in a total (each at the version first seen, so an edit made meanwhile on another device is not overwritten), in Me and in Household; deleting or changing a payment changes the total; a category that was already
// deleted before this fix no longer counts in a total, on Today or in carry forward; carry forward skips £0 payments.
// Run: node tests/browser/budget-delete.test.mjs (see tests/browser/README.md).
import {startServer,launchBrowser,makeDb,newPhone,openApp,OWNER,PARTNER,HOUSEHOLD} from './harness.mjs';
const server=await startServer();const browser=await launchBrowser();
let pass=0,fail=0;const check=(n,c,d='')=>{console.log((c?'PASS ':'FAIL ')+n+(c?'':' — '+d));c?pass++:fail++};
const W=ms=>new Promise(r=>setTimeout(r,ms));
const d=new Date(),ym=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'),now=d.toISOString();
const prev=new Date(d.getFullYear(),d.getMonth()-1,5),pym=prev.getFullYear()+'-'+String(prev.getMonth()+1).padStart(2,'0');
const P='11111111-0000-4000-8000-000000000001',H='22222222-0000-4000-8000-000000000002';
const id=(p,n)=>p+'000000-0000-4000-8000-'+String(n).padStart(12,'0');
const scope=(sid,type,hh)=>({id:sid,owner_id:OWNER,scope_type:type,household_id:hh,name:type==='household'?'Home':'Me',currency:'GBP',created_at:now,updated_at:now,deleted_at:null,cloud_version:1});
const cat=(cid,sc,name,kind='expense',archived=false)=>({id:cid,scope_id:sc,owner_id:OWNER,client_id:'c-'+cid,kind,name,icon:'wallet',color:null,archived,sort_order:1,created_at:now,updated_at:now,deleted_at:null,cloud_version:1});
const ent=(eid,sc,c,desc,amt,{kind='expense',month=ym,status='planned',owner=OWNER,today=false}={})=>({id:eid,scope_id:sc,category_id:c,owner_id:owner,client_id:'e-'+eid,kind,amount_minor:amt,entry_date:month+'-05',description:desc,notes:'',allocation_status:status,due_day:5,recurring_monthly:true,show_on_today:today,today_lead_days:31,created_at:now,updated_at:now,deleted_at:null,cloud_version:1});
const db=makeDb();
const RENT=id('a1',1),PAY=id('a1',2),CAR=id('a1',3),PHONE=id('a1',4),OLD=id('a1',5),GROC=id('a1',6),WAGE=id('a1',7),FUN=id('a1',8),HOME=id('a1',9);
db.tables.planly_budget_scopes=[scope(P,'personal',null),scope(H,'household',HOUSEHOLD)];
db.tables.planly_budget_categories=[cat(RENT,P,'Rent'),cat(PAY,P,'Salary','income'),cat(CAR,P,'Car'),cat(PHONE,P,'Phone'),cat(OLD,P,'Old gym','expense',true),
  cat(GROC,H,'Groceries'),cat(WAGE,H,'Wages','income'),cat(FUN,H,'Fun'),cat(HOME,H,'Home')];
db.tables.planly_budget_targets=[];
db.tables.planly_budget_entries=[
  ent(id('b1',1),P,RENT,'Rent',95000),ent(id('b1',2),P,PAY,'Pay',250000,{kind:'income'}),
  ent(id('b1',3),P,CAR,'Car loan',20000),ent(id('b1',4),P,CAR,'Car insurance',5000,{status:'paid'}),ent(id('b1',5),P,CAR,'Car loan',20000,{month:pym}),
  ent(id('b1',6),P,PHONE,'Phone',2000),
  // Already stuck before this fix: the category was deleted but its payments were left behind.
  ent(id('b1',7),P,OLD,'Gym',3000,{today:true}),ent(id('b1',8),P,OLD,'Gym',3000,{month:pym}),
  ent(id('b2',1),H,GROC,'Tesco',8000),ent(id('b2',2),H,WAGE,'Wage',100000,{kind:'income'}),
  ent(id('b2',3),H,FUN,'Cinema',4000),ent(id('b2',4),H,FUN,'Bowling',3000,{owner:PARTNER,status:'paid'}),ent(id('b2',5),H,HOME,'Cleaner',6000)];
const {context,errors}=await newPhone(browser,db,OWNER);const page=await openApp(context,errors);
const dialogs=[];page.on('dialog',x=>{dialogs.push(x.message());x.accept()});
const view=()=>page.evaluate(()=>(document.getElementById('view')?.innerText||'').replace(/\s+/g,' '));
const left=async()=>((await view()).match(/Left to plan · [A-Za-z]+ \d+ (£[\d,.]+)/)||[])[1]||'';
const click=sel=>page.evaluate(sel=>{const e=document.querySelector(sel);e?.click();return !!e},sel);
const row=i=>db.tables.planly_budget_entries.find(x=>x.id===i);
const back=async()=>{await click('[data-act="back"]');await W(1200)};

await click('.nav button[data-section="budget"]');await W(2500);
// Me: 2500 in; Rent 950 + Car 200 + 50 + Phone 20 = 1220 out (the old Gym category is not counted).
check('a category deleted before this fix no longer counts in the total',await left()==='£1,280.00',await left());
await page.evaluate(()=>window.PlanlyBudget.refreshTodayBills({force:true}));
check('…nor shows its bills on Today',!(await page.evaluate(()=>window.PlanlyBudget.getTodayBills().map(x=>x.id))).includes(id('b1',7)));
await click('[data-month-next]');await W(1500);
let v=await view();
// Rent, Pay, Car loan, Car insurance and Phone repeat; the Gym bill of the deleted category does not.
check('…nor is offered in carry forward',/\b5 recurring items ready/.test(v),v.slice(0,200));
await click('[data-month-prev]');await W(1500);

// Delete a payment, then change one.
await click(`[data-cat="${PHONE}"]`);await W(1200);
await click(`[data-budget-delete-entry="${id('b1',6)}"]`);await W(2000);await back();
check('deleting a payment takes it off the total',await left()==='£1,300.00'&&!!row(id('b1',6)).deleted_at,await left());
await click(`[data-cat="${RENT}"]`);await W(1200);
await click(`[data-budget-edit-entry="${id('b1',1)}"]`);await W(1000);
await page.evaluate(()=>{document.getElementById('editPaymentAmount').value='900'});
await page.evaluate(()=>document.getElementById('budgetEditPaymentForm').requestSubmit());await W(2000);
await click('[data-edit-payment-back]');await W(800);await back();
check('changing a payment changes the total',await left()==='£1,350.00'&&row(id('b1',1)).amount_minor===90000,await left());

// Delete the Car category: its payments go — this month's and last month's. While the delete runs, another device edits
// the paid Car insurance (its cloud version moves on): that edit must not be overwritten, so that payment is left alone.
await click(`[data-cat="${CAR}"]`);await W(1200);dialogs.length=0;
db.hold=async({table,method})=>{if(table==='planly_budget_categories'&&method==='PATCH'){const r=row(id('b1',4));r.amount_minor=5500;r.cloud_version++;db.hold=null}};
await click('[data-budget-remove-category]');await W(3000);db.hold=null;
check('deleting a category says how many payments go with it',dialogs.some(m=>m.includes('Delete Car and its 3 payments?')),JSON.stringify(dialogs));
check('the category is deleted in the cloud',db.tables.planly_budget_categories.find(x=>x.id===CAR).archived===true);
check('its payments are deleted in the cloud, earlier months too',[3,5].every(n=>!!row(id('b1',n)).deleted_at),JSON.stringify([3,5].map(n=>row(id('b1',n)).deleted_at)));
check('a payment edited on another device meanwhile is not overwritten',!row(id('b1',4)).deleted_at&&row(id('b1',4)).amount_minor===5500,JSON.stringify(row(id('b1',4))));
check('…and the phone says it was not removed because it changed',dialogs.some(m=>m.includes('1 of its payments was not removed: 1 changed on another device.')),JSON.stringify(dialogs));
v=await view();
check('the total no longer counts them',await left()==='£1,600.00'&&!v.includes('Car loan'),await left());
await click('[data-month-next]');await W(1500);v=await view();
// Only Rent and Pay are left to repeat.
check('next month offers nothing from the deleted categories',/\b2 recurring items ready/.test(v),v.slice(0,200));
await click('[data-month-prev]');await W(1500);

// Household: delete a payment, then delete a category whose payments include one the partner added.
await click('[data-budget-scope="household"]');await W(2500);
check('Household starts with all its payments counted',await left()==='£790.00',await left());
await click(`[data-cat="${GROC}"]`);await W(1200);
await click(`[data-budget-delete-entry="${id('b2',1)}"]`);await W(2000);await back();
check('Household: deleting a payment takes it off the total',await left()==='£870.00',await left());
await click(`[data-cat="${FUN}"]`);await W(1200);
await click('[data-budget-remove-category]');await W(3000);
check('Household: deleting a category deletes all its payments, including the partner\'s',!!row(id('b2',3)).deleted_at&&!!row(id('b2',4)).deleted_at,JSON.stringify([row(id('b2',3)).deleted_at,row(id('b2',4)).deleted_at]));
check('Household: the total no longer counts them',await left()==='£940.00',await left());

// Manage categories › Remove goes through the same delete.
await click('[data-act="manage"]');await W(1200);dialogs.length=0;
await page.evaluate(h=>document.querySelector(`[data-manage-category="${h}"] [data-category-remove]`)?.click(),HOME);await W(3000);
check('Manage › Remove deletes the category and its payments too',dialogs.some(m=>m.includes('Delete Home and its 1 payment?'))&&!!row(id('b2',5)).deleted_at&&db.tables.planly_budget_categories.find(x=>x.id===HOME).archived===true,JSON.stringify(dialogs));
// Carry forward: a month whose repeating payments are all £0 has nothing to carry, so no button.
const db2=makeDb();db2.tables.planly_budget_scopes=[scope(P,'personal',null)];db2.tables.planly_budget_categories=[cat(RENT,P,'Rent')];db2.tables.planly_budget_targets=[];
db2.tables.planly_budget_entries=[ent(id('b3',1),P,RENT,'Parking',0,{month:pym})];
const two=await newPhone(browser,db2,OWNER);const page2=await openApp(two.context,two.errors);
await page2.evaluate(()=>document.querySelector('.nav button[data-section="budget"]').click());await W(2500);
const carry2=await page2.evaluate(()=>({button:!!document.querySelector('[data-month-carry]'),text:(document.getElementById('view')?.innerText||'').replace(/\s+/g,' ').slice(0,160)}));
check('no Carry forward button when everything to carry is £0',!carry2.button&&!/recurring items? ready/.test(carry2.text),JSON.stringify(carry2));
// Each payment left behind is reported with its own reason. Six payments in Pets end differently: Food is removed; Vet is
// edited on another device meanwhile (newer version: "changed on another device"); Insurance's delete request fails;
// Lead's delete matches no row although its version is unchanged (as when the server will not let this phone change it);
// Toys is deleted on another device meanwhile (already gone: counted as removed, not reported); Bed was added on this phone
// and has not reached the cloud yet (its upload fails until the delete is over: "not synced yet", not touched).
const db3=makeDb(),PETS=id('a3',1),pet=n=>id('b4',n);db3.tables.planly_budget_scopes=[scope(P,'personal',null)];db3.tables.planly_budget_categories=[cat(PETS,P,'Pets')];db3.tables.planly_budget_targets=[];
db3.tables.planly_budget_entries=[ent(pet(1),P,PETS,'Food',1000),ent(pet(2),P,PETS,'Vet',2000),ent(pet(3),P,PETS,'Insurance',3000),ent(pet(4),P,PETS,'Toys',400),ent(pet(5),P,PETS,'Lead',600)];
const three=await newPhone(browser,db3,OWNER);const page3=await openApp(three.context,three.errors);const dialogs3=[];page3.on('dialog',x=>{dialogs3.push(x.message());x.accept()});
await page3.evaluate(()=>document.querySelector('.nav button[data-section="budget"]').click());await W(2500);
const pr=n=>db3.tables.planly_budget_entries.find(x=>x.id===pet(n));
db3.hold=async({table,method})=>{
  if(table==='planly_budget_categories'&&method==='PATCH'){pr(2).amount_minor=2500;pr(2).cloud_version++;pr(4).deleted_at=new Date().toISOString();pr(4).cloud_version++}};
const unsyncedBed=({table,method})=>table==='planly_budget_entries'&&method==='POST'?[503,{message:'unavailable'}]:null;db3.fail=unsyncedBed;
await page3.evaluate(c=>window.PlanlyBudget.addEntry({kind:'expense',amountMinor:1500,categoryId:c,entryDate:new Date().toISOString().slice(0,10),description:'Bed',dueDay:5,recurringMonthly:false}),PETS);await W(800);
const bed=await page3.evaluate(()=>{const s=window.PlanlyBudget.getState(),r=s.entries.find(x=>x.description==='Bed');return r?{id:r.id,version:Number(s.versions?.entries?.[r.id]||0)}:null});
check('the test condition holds: Bed is on the phone but not yet in the cloud',bed&&bed.version===0&&!db3.tables.planly_budget_entries.some(x=>x.description==='Bed'),JSON.stringify(bed));
db3.fail=({table,method,query})=>unsyncedBed({table,method})||(table==='planly_budget_entries'&&method==='PATCH'&&query.includes(pet(3))?[500,{message:'server error'}]:
  table==='planly_budget_entries'&&method==='PATCH'&&query.includes(pet(5))?[200,null]:null);
await page3.evaluate(c=>document.querySelector(`[data-cat="${c}"]`).click(),PETS);await W(1200);
await page3.evaluate(()=>document.querySelector('[data-budget-remove-category]').click());await W(3500);db3.fail=null;
check('the delete counts the unsynced payment too',dialogs3.some(m=>m.includes('Delete Pets and its 6 payments?')),JSON.stringify(dialogs3));
check('each payment is deleted or kept for its own reason',!!pr(1).deleted_at&&!pr(2).deleted_at&&pr(2).amount_minor===2500&&!pr(3).deleted_at&&!pr(5).deleted_at,JSON.stringify([1,2,3,4,5].map(n=>[pr(n).description,pr(n).deleted_at?'deleted':'kept',pr(n).cloud_version])));
check('the message gives each reason its own count; the one already deleted elsewhere is not reported',dialogs3.some(m=>m.includes('Pets was deleted. 4 of its payments were not removed: 1 changed on another device, 1 not synced yet, 2 could not be removed. They no longer count in a total.')),JSON.stringify(dialogs3));
db3.hold=null;
check('no page errors',errors.length===0&&two.errors.length===0&&three.errors.length===0,[...errors,...two.errors,...three.errors].slice(0,3).join(' | '));
console.log(`${pass} passed, ${fail} failed`);await browser.close();server.close();process.exit(fail?1:0);
