// Editing a Household income: Save changes goes back to Budget with the new amount, the typing field is let go (so the
// phone keyboard closes and the page is not left stuck), and the app can still be tapped. Delete income goes back too.
// Run: node tests/browser/budget-income-edit.test.mjs (see tests/browser/README.md).
import {startServer,launchBrowser,makeDb,newPhone,openApp,OWNER,HOUSEHOLD} from './harness.mjs';
const server=await startServer();const browser=await launchBrowser();
let pass=0,fail=0;const check=(n,c,d='')=>{console.log((c?'PASS ':'FAIL ')+n+(c?'':' — '+d));c?pass++:fail++};
const W=ms=>new Promise(r=>setTimeout(r,ms));
const d=new Date(),ym=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'),now=d.toISOString();
const P='11111111-0000-4000-8000-000000000001',H='22222222-0000-4000-8000-000000000002',INC='a1000000-0000-4000-8000-000000000008';
const income=(n,desc,amount)=>({id:'b1000000-0000-4000-8000-00000000000'+n,scope_id:H,category_id:INC,owner_id:OWNER,client_id:'i'+n,kind:'income',amount_minor:amount,entry_date:ym+'-01',description:desc,notes:'',allocation_status:'planned',due_day:null,recurring_monthly:true,show_on_today:false,created_at:now,updated_at:now,deleted_at:null,cloud_version:1});
const db=makeDb();
db.tables.planly_budget_scopes=[{id:P,owner_id:OWNER,scope_type:'personal',household_id:null,name:'Me',currency:'GBP',created_at:now,updated_at:now,deleted_at:null,cloud_version:1},{id:H,owner_id:OWNER,scope_type:'household',household_id:HOUSEHOLD,name:'Home',currency:'GBP',created_at:now,updated_at:now,deleted_at:null,cloud_version:1}];
db.tables.planly_budget_categories=[{id:INC,scope_id:H,owner_id:OWNER,client_id:'c8',kind:'income',name:'Income',icon_key:'wallet',color:null,archived:false,sort_order:1,created_at:now,updated_at:now,deleted_at:null,cloud_version:1}];
db.tables.planly_budget_targets=[];
db.tables.planly_budget_entries=[income(1,'Laki Work',225000),income(2,'Side job',10000)];
const {context,errors}=await newPhone(browser,db,OWNER);const page=await openApp(context,errors);
page.on('dialog',x=>x.accept());
const click=sel=>page.evaluate(sel=>{const e=document.querySelector(sel);e?.click();return !!e},sel);
const openIncome=name=>page.evaluate(name=>[...document.querySelectorAll('.budgetIncomeRow')].find(r=>r.textContent.includes(name))?.click(),name);

await click('.nav button[data-section="budget"]');await W(2500);
await click('[data-budget-scope="household"]');await W(2500);
await openIncome('Laki Work');await W(1200);
check('tapping a Household income opens Edit income',await page.evaluate(()=>!!document.getElementById('budgetLifecycleForm')));
await page.tap('#lifeAmount');await page.fill('#lifeAmount','2299');
await page.tap('[data-life-back]');await W(1500);
check('after typing, ‹ Budget still goes back (without saving)',await page.evaluate(()=>!document.getElementById('budgetLifecycleForm')&&!!document.querySelector('.budgetHero'))&&db.tables.planly_budget_entries[0].amount_minor===225000);
await openIncome('Laki Work');await W(1200);
check('opening it again shows the saved amount, not the abandoned typing',await page.evaluate(()=>Number(document.getElementById('lifeAmount')?.value))===2250);
await page.tap('#lifeAmount');await page.fill('#lifeAmount','2271');
await page.tap('#budgetLifecycleForm [type=submit]');await W(2500);
const after=await page.evaluate(()=>({form:!!document.getElementById('budgetLifecycleForm'),dash:!!document.querySelector('.budgetHero'),focus:document.activeElement?.tagName||'',rows:[...document.querySelectorAll('.budgetIncomeRow')].map(r=>r.textContent.replace(/\s+/g,' ').trim())}));
check('the change is saved',db.tables.planly_budget_entries[0].amount_minor===227100,String(db.tables.planly_budget_entries[0].amount_minor));
check('Save changes goes back to Budget',!after.form&&after.dash,JSON.stringify(after));
check('…showing the new amount',after.rows.some(r=>r.includes('Laki Work')&&r.includes('2,271')),JSON.stringify(after.rows));
check('…and the amount field is let go, so the keyboard closes',after.focus!=='INPUT',after.focus);
await page.tap('.nav button[data-section="today"]');await W(1200);
check('the app can still be tapped after saving',await page.evaluate(()=>document.querySelector('.nav button.active')?.dataset.section)==='today');

await click('.nav button[data-section="budget"]');await W(2000);
if(!await page.evaluate(()=>document.querySelector('[data-budget-scope].active')?.dataset.budgetScope==='household')){await click('[data-budget-scope="household"]');await W(2000)}
await openIncome('Side job');await W(1200);
await click('[data-life-delete]');await W(2500);
const del=await page.evaluate(()=>({form:!!document.getElementById('budgetLifecycleForm'),dash:!!document.querySelector('.budgetHero'),rows:[...document.querySelectorAll('.budgetIncomeRow')].map(r=>r.textContent)}));
check('Delete income removes it and goes back to Budget',!!db.tables.planly_budget_entries[1].deleted_at&&!del.form&&del.dash&&!del.rows.some(r=>r.includes('Side job')),JSON.stringify(del));
check('no page errors',errors.length===0,JSON.stringify(errors));
console.log(`\n${pass} passed, ${fail} failed`);await browser.close();server.close();process.exit(fail?1:0);
