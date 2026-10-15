// Budget due date picker: the five quick days plus a calendar chip that opens a 1–31 grid for any other day, on Add
// payment and Edit payment, in Me and Household. A custom day shows on the calendar chip with a pencil; days past the end of a shorter month
// fall on its last day.
// Run: node tests/browser/budget-due-date.test.mjs (see tests/browser/README.md).
import {startServer,launchBrowser,makeDb,newPhone,openApp,OWNER,HOUSEHOLD} from './harness.mjs';
const server=await startServer();const browser=await launchBrowser();
let pass=0,fail=0;const check=(n,c,d='')=>{console.log((c?'PASS ':'FAIL ')+n+(c?'':' — '+d));c?pass++:fail++};
const W=ms=>new Promise(r=>setTimeout(r,ms));
const d=new Date(),ym=x=>x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0'),now=d.toISOString();
// The next month with 30 days (or fewer), and how many times to press › to reach it.
let ahead=1,short=new Date(d.getFullYear(),d.getMonth()+1,1);while(new Date(short.getFullYear(),short.getMonth()+1,0).getDate()===31){ahead++;short=new Date(d.getFullYear(),d.getMonth()+ahead,1)}
const shortLast=new Date(short.getFullYear(),short.getMonth()+1,0).getDate();
const P='11111111-0000-4000-8000-000000000001',RENT='a1000000-0000-4000-8000-000000000001',PAY='a1000000-0000-4000-8000-000000000002',GYM='b1000000-0000-4000-8000-000000000003';
const db=makeDb();
const H='22222222-0000-4000-8000-000000000002',GROC='a1000000-0000-4000-8000-000000000009',TESCO='b1000000-0000-4000-8000-000000000009';
db.tables.planly_budget_scopes=[{id:P,owner_id:OWNER,scope_type:'personal',household_id:null,name:'Me',currency:'GBP',created_at:now,updated_at:now,deleted_at:null,cloud_version:1},{id:H,owner_id:OWNER,scope_type:'household',household_id:HOUSEHOLD,name:'Home',currency:'GBP',created_at:now,updated_at:now,deleted_at:null,cloud_version:1}];
const cat=(id,name,kind)=>({id,scope_id:P,owner_id:OWNER,client_id:'c-'+id,kind,name,icon:'wallet',color:null,archived:false,sort_order:1,created_at:now,updated_at:now,deleted_at:null,cloud_version:1});
db.tables.planly_budget_categories=[cat(RENT,'Rent','expense'),cat(PAY,'Salary','income'),{...cat(GROC,'Groceries','expense'),scope_id:H}];
db.tables.planly_budget_targets=[];
db.tables.planly_budget_entries=[{id:GYM,scope_id:P,category_id:RENT,owner_id:OWNER,client_id:'e-gym',kind:'expense',amount_minor:3000,entry_date:ym(short)+'-05',description:'Gym',notes:'',allocation_status:'planned',due_day:5,recurring_monthly:false,show_on_today:false,today_lead_days:2,created_at:now,updated_at:now,deleted_at:null,cloud_version:1},{id:TESCO,scope_id:H,category_id:GROC,owner_id:OWNER,client_id:'e-tesco',kind:'expense',amount_minor:5000,entry_date:ym(d)+'-05',description:'Tesco',notes:'',allocation_status:'planned',due_day:5,recurring_monthly:true,show_on_today:false,today_lead_days:2,created_at:now,updated_at:now,deleted_at:null,cloud_version:1}];
const {context,errors}=await newPhone(browser,db,OWNER);const page=await openApp(context,errors);
const click=sel=>page.evaluate(sel=>{const e=document.querySelector(sel);e?.click();return !!e},sel);
const picker=()=>page.evaluate(()=>{const row=document.querySelector('.budgetDueRow'),chips=[...(row?.querySelectorAll('.budgetChip')||[])],custom=row?.querySelector('[data-due-custom]'),grid=document.querySelector('[data-due-grid]');
  return {chips:chips.map(c=>c.textContent.trim()||'icon'),oneRow:new Set(chips.map(c=>Math.round(c.getBoundingClientRect().top))).size===1,fits:chips.every(c=>c.getBoundingClientRect().right<=row.getBoundingClientRect().right+1),
    active:chips.filter(c=>c.classList.contains('active')).map(c=>c.textContent.trim()),customIcon:!!custom?.querySelector('.budgetDueIcon'),customPen:!!custom?.querySelector('.budgetDuePen'),customText:custom?.textContent.trim()||'',
    gridOpen:!!grid&&!grid.hidden,days:grid?grid.querySelectorAll('[data-due-day]').length:0,gridActive:grid?.querySelector('.active')?.textContent||''}});

await click('.nav button[data-section="budget"]');await W(2500);
await click('[data-act="allocation"]');await W(1000);
let s=await picker();
check('Add payment shows the five days and a calendar chip on one row',JSON.stringify(s.chips)==='["1st","7th","15th","21st","28th","icon"]'&&s.oneRow&&s.fits&&s.customIcon&&!s.gridOpen,JSON.stringify(s));
await click('[data-due-custom]');await W(300);s=await picker();
check('the calendar chip opens a grid of every day',s.gridOpen&&s.days===31,JSON.stringify(s));
await click('[data-due-day="9"]');await W(300);s=await picker();
check('picking the 9th closes the grid and shows "9th" with a pencil on the calendar chip',!s.gridOpen&&s.customText==='9th'&&s.customPen&&JSON.stringify(s.active)==='["9th"]'&&s.oneRow&&s.fits,JSON.stringify(s));
await click('[data-due="15"]');await W(300);s=await picker();
check('a quick day puts the calendar chip back',JSON.stringify(s.active)==='["15th"]'&&s.customIcon&&!s.customPen,JSON.stringify(s));
await click('[data-due-custom]');await W(300);await click('[data-due-day="9"]');await W(300);
await page.evaluate(()=>{const v=(i,x)=>{const e=document.getElementById(i);e.value=x;e.dispatchEvent(new Event('input',{bubbles:true}))};v('allocAmount','40');v('allocName','Phone')});
await page.evaluate(id=>document.querySelector(`[data-category-chip="${id}"]`)?.click(),RENT);
await page.evaluate(()=>document.getElementById('budgetAllocationForm').requestSubmit());await W(2000);
const phone=db.tables.planly_budget_entries.find(r=>r.description==='Phone');
check('saving keeps the custom day',phone&&phone.due_day===9&&phone.entry_date===ym(d)+'-09',JSON.stringify(phone&&{due:phone.due_day,date:phone.entry_date}));

// Edit payment: a month with 30 days or fewer; the 31st falls on its last day.
await click('[data-act="back"]');await W(800);
for(let i=0;i<ahead;i++){await click('[data-month-next]');await W(1200)}
await click(`[data-cat="${RENT}"]`);await W(1200);
await click(`[data-budget-edit-entry="${GYM}"]`);await W(1000);
s=await picker();
check('Edit payment shows the due date with the payment\'s day chosen',JSON.stringify(s.chips)==='["1st","7th","15th","21st","28th","5th"]'&&JSON.stringify(s.active)==='["5th"]'&&s.customPen,JSON.stringify(s));
await click('[data-due-custom]');await W(300);
check('…and the grid marks that day',(await picker()).gridActive==='5');
await click('[data-due-day="31"]');await W(300);
await page.evaluate(()=>document.getElementById('budgetEditPaymentForm').requestSubmit());await W(2000);
const gym=db.tables.planly_budget_entries.find(r=>r.id===GYM);
check('changing it to the 31st saves the 31st, dated the last day of that shorter month',gym.due_day===31&&gym.entry_date===ym(short)+'-'+shortLast,JSON.stringify({due:gym.due_day,date:gym.entry_date,expected:ym(short)+'-'+shortLast}));

// Household uses the same screens.
await click('[data-act="back"]');await W(800);for(let i=0;i<ahead;i++){await click('[data-month-prev]');await W(1200)}
await click('[data-budget-scope="household"]');await W(2500);
await click('[data-act="allocation"]');await W(1000);s=await picker();
check('Household Add payment has the same picker',JSON.stringify(s.chips)==='["1st","7th","15th","21st","28th","icon"]'&&s.oneRow&&s.fits&&s.customIcon,JSON.stringify(s));
await click('[data-due-custom]');await W(300);await click('[data-due-day="12"]');await W(300);
await page.evaluate(()=>{const v=(i,x)=>{const e=document.getElementById(i);e.value=x;e.dispatchEvent(new Event('input',{bubbles:true}))};v('allocAmount','20');v('allocName','Milkman')});
await page.evaluate(id=>document.querySelector(`[data-category-chip="${id}"]`)?.click(),GROC);
await page.evaluate(()=>document.getElementById('budgetAllocationForm').requestSubmit());await W(2000);
const milk=db.tables.planly_budget_entries.find(r=>r.description==='Milkman');
check('…and saves a custom day to the Household budget',milk&&milk.scope_id===H&&milk.due_day===12&&milk.entry_date===ym(d)+'-12',JSON.stringify(milk&&{h:milk.scope_id===H,due:milk.due_day,date:milk.entry_date}));
await click('[data-act="back"]');await W(800);await click(`[data-cat="${GROC}"]`);await W(1200);await click(`[data-budget-edit-entry="${TESCO}"]`);await W(1000);
s=await picker();
check('Household Edit payment shows the bill\'s day',JSON.stringify(s.active)==='["5th"]',JSON.stringify(s));
await click('[data-due-custom]');await W(300);await click('[data-due-day="19"]');await W(300);
await page.evaluate(()=>document.getElementById('budgetEditPaymentForm').requestSubmit());await W(2000);
const tesco=db.tables.planly_budget_entries.find(r=>r.id===TESCO);
check('…and saves a changed day',tesco.due_day===19&&tesco.entry_date===ym(d)+'-19',JSON.stringify({due:tesco.due_day,date:tesco.entry_date}));
check('no page errors',errors.length===0,errors.slice(0,3).join(' | '));
console.log(`${pass} passed, ${fail} failed`);await browser.close();server.close();process.exit(fail?1:0);
