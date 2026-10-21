// Budget's Coming up, Categories and Money in open and close like the chores on Home: Coming up and Money in start
// closed and say how many and how much ("8 bills · £356", "£2,600"), Categories starts open; tapping the header opens
// and closes it (Edit only shows while Categories is open); the phone remembers what was left open, across leaving
// Budget and opening the app again; a bill ticked inside Coming up still saves.
// Run: node tests/browser/budget-folds.test.mjs (see tests/browser/README.md).
import {startServer,launchBrowser,makeDb,newPhone,openApp,OWNER} from './harness.mjs';
const server=await startServer();const browser=await launchBrowser();
let pass=0,fail=0;const check=(n,c,d='')=>{console.log((c?'PASS ':'FAIL ')+n+(c?'':' — '+d));c?pass++:fail++};
const W=ms=>new Promise(r=>setTimeout(r,ms));
const pad=n=>String(n).padStart(2,'0'),key=x=>x.getFullYear()+'-'+pad(x.getMonth()+1)+'-'+pad(x.getDate()),dd=n=>{const x=new Date();x.setDate(x.getDate()+n);return key(x)};
const now=new Date().toISOString(),ym=key(new Date()).slice(0,7);
const P='11111111-0000-4000-8000-000000000001',B='a1000000-0000-4000-8000-000000000001',I='a1000000-0000-4000-8000-000000000002';
let n=0;const E=(cat,kind,desc,amt,date,st='planned')=>({id:'b1000000-0000-4000-8000-0000000000'+pad(++n),scope_id:P,category_id:cat,owner_id:OWNER,client_id:'e'+n,kind,amount_minor:amt,entry_date:date,description:desc,notes:'',allocation_status:st,due_day:Number(date.slice(8)),recurring_monthly:true,show_on_today:false,today_lead_days:0,created_at:now,updated_at:now,deleted_at:null,cloud_version:1});
const db=makeDb();
db.tables.planly_budget_scopes=[{id:P,owner_id:OWNER,scope_type:'personal',household_id:null,name:'Me',currency:'GBP',created_at:now,updated_at:now,deleted_at:null,cloud_version:1}];
db.tables.planly_budget_categories=[{id:B,scope_id:P,owner_id:OWNER,client_id:'c1',kind:'expense',name:'Bills',icon_key:'🧾',color:null,archived:false,sort_order:1,created_at:now,updated_at:now,deleted_at:null,cloud_version:1},{id:I,scope_id:P,owner_id:OWNER,client_id:'c2',kind:'income',name:'Income',icon_key:'💷',color:null,archived:false,sort_order:2,created_at:now,updated_at:now,deleted_at:null,cloud_version:1}];
db.tables.planly_budget_targets=[];
const due=dd(3).slice(0,7)===ym?dd(3):dd(0);
db.tables.planly_budget_entries=[E(I,'income','Salary',260000,ym+'-01','paid'),...['Electric','Internet','IKEA 1','IKEA 2','DFS','HSBC','EE Sim','Water'].map((x,i)=>E(B,'expense',x,2000+i*700,due))];
const {context,errors}=await newPhone(browser,db,OWNER);const page=await openApp(context,errors);
const budget=async()=>{await page.evaluate(()=>document.querySelector('.nav button[data-tab="budget"]').click());await W(2400)};
const look=()=>page.evaluate(()=>Object.fromEntries(['coming','cats','income'].map(k=>{const b=document.querySelector(`#view [data-budget-fold="${k}"]`),body=b?.closest('.budgetFoldCard')?.querySelector('.budgetFoldBody');
  return [k,b?{open:b.getAttribute('aria-expanded')==='true',shown:!!body&&!body.hidden&&body.getBoundingClientRect().height>0,summary:b.querySelector('.budgetFoldSummary')?.firstChild?.textContent.trim(),rows:body?.querySelectorAll('.budgetPaymentRow,[data-cat],.budgetIncomeRow').length||0,edit:(()=>{const e=b.parentElement.querySelector('[data-act="manage"]');return !!e&&e.getBoundingClientRect().height>0})()}:null]})));
const tap=k=>page.evaluate(k=>document.querySelector(`#view [data-budget-fold="${k}"]`).click(),k);
await budget();let s=await look();
check('Coming up starts closed and says how many bills and how much',s.coming&&!s.coming.open&&!s.coming.shown&&s.coming.summary==='8 bills · £356',JSON.stringify(s.coming));
check('Money in starts closed with the total',s.income&&!s.income.open&&!s.income.shown&&s.income.summary==='£2,600',JSON.stringify(s.income));
check('Categories starts open, with Edit',s.cats?.open&&s.cats.shown&&s.cats.rows===1&&s.cats.edit,JSON.stringify(s.cats));
await tap('coming');await W(300);s=await look();
check('tapping Coming up opens it and shows the bills',s.coming.open&&s.coming.shown&&s.coming.rows===8,JSON.stringify(s.coming));
await tap('cats');await W(300);s=await look();
check('tapping Categories closes it, and its Edit goes with it',!s.cats.open&&!s.cats.shown&&!s.cats.edit,JSON.stringify(s.cats));
// a tick inside Coming up still saves, and the section stays open after the redraw
const first=db.tables.planly_budget_entries.find(r=>r.description==='Electric');
await page.evaluate(()=>document.querySelector('#view .budgetFoldCard [data-budget-paid]')?.click());await W(2500);
s=await look();
check('ticking a bill inside Coming up saves it, and Coming up stays open',first.allocation_status==='paid'&&s.coming.open&&s.coming.shown&&s.coming.summary==='7 bills · £336',JSON.stringify({status:first.allocation_status,coming:s.coming}));
await page.evaluate(()=>document.querySelector('.nav button[data-tab="today"]').click());await W(800);await budget();s=await look();
check('leaving Budget and coming back keeps what was open and closed',s.coming.open&&!s.cats.open&&!s.income.open,JSON.stringify(s));
await page.reload();await W(3000);await budget();s=await look();
check('…and so does opening the app again',s.coming.open&&!s.cats.open&&!s.income.open,JSON.stringify(s));
check('the header row is a real button you can reach (44px tall, says if it is open)',await page.evaluate(()=>{const b=document.querySelector('#view [data-budget-fold="income"]');return b.tagName==='BUTTON'&&b.getBoundingClientRect().height>=44&&b.hasAttribute('aria-expanded')}));
check('no page errors',errors.length===0,errors.slice(0,3).join(' | '));
console.log(`${pass} passed, ${fail} failed`);await browser.close();server.close();process.exit(fail?1:0);
