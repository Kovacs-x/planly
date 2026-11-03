// Budget months that start on payday (migration 062, month_start_day = 26). Today is fixed at 3 Nov 2026.
// "November" runs 26 Oct – 25 Nov: it holds the pay dated 1 Nov, the bills dated 28 Oct and 1 Nov, not the bills dated
// 28 Nov, which belong to December (26 Nov – 25 Dec). Carry forward puts each bill on its due day inside the new
// month and the pay on payday. The household owner can change payday; changing it to the 1st goes back to calendar
// months. Laki sees the payday but can't change it. On 27 Nov the budget opens on December. A server without 062 still
// shows calendar months.
// Run: node tests/browser/budget-payday.test.mjs (see tests/browser/README.md).
import {startServer,launchBrowser,makeDb,newPhone,openApp,OWNER,PARTNER,HOUSEHOLD} from './harness.mjs';
const server=await startServer();const browser=await launchBrowser();
let pass=0,fail=0;const check=(n,c,d='')=>{console.log((c?'PASS ':'FAIL ')+n+(c?'':' — '+d));c?pass++:fail++};
const W=ms=>new Promise(r=>setTimeout(r,ms));
const pad=n=>String(n).padStart(2,'0'),now='2026-11-01T09:00:00.000Z';
const H='22222222-0000-4000-8000-000000000001',BILLS='a2000000-0000-4000-8000-000000000001',INC='a2000000-0000-4000-8000-000000000003';
function mk({sd=26}={}){const db=makeDb();let n=0;
  const E=(cat,kind,desc,amt,date,day,more={})=>({id:'b2000000-0000-4000-8000-0000000000'+pad(++n),scope_id:H,category_id:cat,owner_id:OWNER,client_id:'e'+n,kind,amount_minor:amt,entry_date:date,description:desc,notes:'',allocation_status:'planned',due_day:day,recurring_monthly:true,show_on_today:false,today_lead_days:0,debt_id:null,saving_id:null,created_at:now,updated_at:now,deleted_at:null,cloud_version:1,...more});
  const scope={id:H,owner_id:OWNER,scope_type:'household',household_id:HOUSEHOLD,name:'Household Budget',currency:'GBP',client_id:'h',created_at:now,updated_at:now,deleted_at:null,cloud_version:1};
  if(sd!==null)scope.month_start_day=sd;
  db.tables.planly_budget_scopes=[scope];
  const C=(id,name,kind,i)=>({id,scope_id:H,owner_id:OWNER,client_id:'c'+i,kind,name,icon_key:'🧾',color_key:'violet',archived:false,sort_order:i,created_at:now,updated_at:now,deleted_at:null,cloud_version:1});
  db.tables.planly_budget_categories=[C(BILLS,'Bills','expense',1),C(INC,'Income','income',2)];db.tables.planly_budget_targets=[];
  db.tables.planly_budget_entries=[
    E(INC,'income','Musti Work',285800,'2026-10-01',null),E(INC,'income','Musti Work',285800,'2026-11-01',null),
    E(BILLS,'expense','Rent',106200,'2026-10-30',31,{allocation_status:'paid'}),E(BILLS,'expense','Rent',106200,'2026-11-30',31),
    E(BILLS,'expense','Groceries',40000,'2026-11-01',1),E(BILLS,'expense','Spotify',599,'2026-10-19',19,{allocation_status:'paid'}),E(BILLS,'expense','Spotify',599,'2026-11-19',19)];
  db.tables.planly_budget_debts=[];db.tables.planly_budget_savings=[];
  return db}
const phone=async (db,user,when)=>{const p=await newPhone(browser,db,user);await p.context.addInitScript(u=>{try{localStorage.setItem('planly-budget-active-scope-v1:'+u,'"household"');const k='sb-dtniwcwjucepsjzoojuc-auth-token',s=JSON.parse(localStorage.getItem(k)||'null');if(s){s.expires_at=Math.floor(Date.parse('2027-06-01')/1000);localStorage.setItem(k,JSON.stringify(s))}}catch{}},user);
  const page=await openApp(p.context,p.errors);await page.clock.setFixedTime(new Date(when));await page.reload();await W(3000);return {...p,page}};
const budget=async page=>{await page.evaluate(()=>document.querySelector('.nav button[data-tab="budget"]').click());await W(2600)};
const view=page=>page.evaluate(()=>{const v=document.getElementById('view');v.querySelectorAll('.budgetFoldBody[hidden]').forEach(b=>b.hidden=false);return {label:v.querySelector('.budgetMonthLabel')?.innerText.replace(/\s+/g,' ').trim()||'',text:v.innerText.replace(/\s+/g,' '),payday:v.querySelector('#budgetPayday')?.value||null,paydayRow:v.querySelector('.budgetPaydayRow')?.innerText.replace(/\s+/g,' ').trim()||''}});
const go=async (page,d)=>{await page.evaluate(d=>document.querySelector(d<0?'[data-month-prev]':'[data-month-next]').click(),d);await W(1500)};
const dates=(db,desc)=>db.tables.planly_budget_entries.filter(x=>x.description===desc&&!x.deleted_at).map(x=>x.entry_date).sort();

// Musti on 3 Nov: November is 26 Oct – 25 Nov
{const db=mk();const {context,errors,page}=await phone(db,OWNER,'2026-11-03T12:00:00');await budget(page);
 let v=await view(page);
 check('opens on November, shown as 26 Oct – 25 Nov',v.label==='November 2026 26 Oct – 25 Nov',v.label);
 check('November holds the pay dated 1 Nov and rent paid 30 Oct + groceries + Spotify (£1,467.99), not the rent due 30 Nov',/Musti Work 1 Nov \+£2,858\.00/.test(v.text)&&/£1,062\.00 of £1,467\.99 paid · 3 bills/.test(v.text)&&/£1,390\.01 of £2,858\.00 coming in/.test(v.text),v.text.slice(0,600));
 check('the owner sees Payday set to the 26th',v.payday==='26',JSON.stringify(v));
 await go(page,1);v=await view(page);
 check('December is 26 Nov – 25 Dec and holds the rent due 30 Nov (£1,062, 1 bill)',v.label==='December 2026 26 Nov – 25 Dec'&&/£0\.00 of £1,062\.00 paid · 1 bill/.test(v.text),v.label+' | '+v.text.slice(0,400));
 check('…December has no pay yet, so it offers to carry forward',/recurring items? ready/.test(v.text),v.text.slice(0,300));
 await page.evaluate(()=>document.querySelector('[data-month-carry]')?.click());await W(2500);
 check('carry forward: pay lands on payday (26 Nov), groceries on 1 Dec, Spotify on 19 Dec, and rent is not doubled',dates(db,'Musti Work').includes('2026-11-26')&&dates(db,'Groceries').includes('2026-12-01')&&dates(db,'Spotify').includes('2026-12-19')&&dates(db,'Rent').length===2,JSON.stringify({p:dates(db,'Musti Work'),g:dates(db,'Groceries'),s:dates(db,'Spotify'),r:dates(db,'Rent')}));
 await go(page,1);await page.evaluate(()=>document.querySelector('[data-month-carry]')?.click());await W(2500);
 check('January carry forward puts rent on 31 Dec (due 31st, inside 26 Dec – 25 Jan)',dates(db,'Rent').includes('2026-12-31'),JSON.stringify(dates(db,'Rent')));
 await go(page,-1);await go(page,-1);
 // change payday back to the 1st: calendar months
 await page.evaluate(()=>{const s=document.getElementById('budgetPayday');s.value='1';s.dispatchEvent(new Event('change',{bubbles:true}))});await W(2500);
 v=await view(page);
 check('changing payday to the 1st saves it on the budget',db.tables.planly_budget_scopes[0].month_start_day===1&&db.log.some(l=>l.table==='planly_budget_scopes'&&l.method==='PATCH'),JSON.stringify(db.tables.planly_budget_scopes[0].month_start_day));
 check('…and the budget goes back to calendar November: rent due 30 Nov + groceries + Spotify, both pays dated in November, no date range',v.label==='November 2026'&&/£0\.00 of £1,467\.99 paid · 3 bills/.test(v.text)&&/of £5,716\.00 coming in/.test(v.text),v.label+' | '+v.text.slice(0,300));
 check('no page errors',errors.length===0,errors.slice(0,3).join(' | '));await context.close()}

// Laki: sees the payday, can't change it
{const db=mk();const {context,errors,page}=await phone(db,PARTNER,'2026-11-03T12:00:00');await budget(page);const v=await view(page);
 check('Laki sees November as 26 Oct – 25 Nov',v.label==='November 2026 26 Oct – 25 Nov',v.label);
 check('…and Payday 26th, without a picker',v.payday===null&&v.paydayRow==='Payday 26th',JSON.stringify(v.paydayRow));
 check('no page errors',errors.length===0,errors.slice(0,3).join(' | '));await context.close()}

// 27 Nov: the new pay month has started
{const db=mk();const {context,errors,page}=await phone(db,OWNER,'2026-11-27T09:00:00');await budget(page);const v=await view(page);
 check('on 27 Nov the budget opens on December (26 Nov – 25 Dec)',v.label==='December 2026 26 Nov – 25 Dec',v.label);
 check('no page errors',errors.length===0,errors.slice(0,3).join(' | '));await context.close()}

// a server without 062: calendar months, nothing breaks
{const db=mk({sd:null});const {context,errors,page}=await phone(db,OWNER,'2026-11-03T12:00:00');await budget(page);const v=await view(page);
 check('without the payday column: calendar November (rent due 30 Nov + groceries + Spotify), payday shows the 1st',v.label==='November 2026'&&/£0\.00 of £1,467\.99 paid · 3 bills/.test(v.text)&&v.payday==='1',JSON.stringify({l:v.label,p:v.payday,t:v.text.slice(0,300)}));
 check('no page errors',errors.length===0,errors.slice(0,3).join(' | '));await context.close()}

console.log(`${pass} passed, ${fail} failed`);await browser.close();server.close();process.exit(fail?1:0);
