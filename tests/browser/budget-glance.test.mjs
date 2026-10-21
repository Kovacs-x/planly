// Budget at a glance: Coming up says how soon each bill is due ("tomorrow", "in 3 days"), in amber within 3 days; the
// summary card says what is overdue (or On track); categories say what is left; the pace bar marks today only on the
// current month; section labels are small capitals.
// Run: node tests/browser/budget-glance.test.mjs (see tests/browser/README.md).
import {startServer,launchBrowser,makeDb,newPhone,openApp,OWNER} from './harness.mjs';
const server=await startServer();const browser=await launchBrowser();
let pass=0,fail=0;const check=(n,c,d='')=>{console.log((c?'PASS ':'FAIL ')+n+(c?'':' — '+d));c?pass++:fail++};
const W=ms=>new Promise(r=>setTimeout(r,ms));
const pad=n=>String(n).padStart(2,'0'),key=x=>x.getFullYear()+'-'+pad(x.getMonth()+1)+'-'+pad(x.getDate()),dd=n=>{const x=new Date();x.setDate(x.getDate()+n);return key(x)};
const now=new Date().toISOString(),ym=key(new Date()).slice(0,7);
const P='11111111-0000-4000-8000-000000000001',B='a1000000-0000-4000-8000-000000000001',I='a1000000-0000-4000-8000-000000000002';
let n=0;const E=(cat,kind,desc,amt,date,st='planned')=>({id:'b1000000-0000-4000-8000-0000000000'+pad(++n),scope_id:P,category_id:cat,owner_id:OWNER,client_id:'e'+n,kind,amount_minor:amt,entry_date:date,description:desc,notes:'',allocation_status:st,due_day:Number(date.slice(8)),recurring_monthly:true,show_on_today:false,today_lead_days:0,created_at:now,updated_at:now,deleted_at:null,cloud_version:1});
const inMonth=d=>d.slice(0,7)===ym;
const db=makeDb();
db.tables.planly_budget_scopes=[{id:P,owner_id:OWNER,scope_type:'personal',household_id:null,name:'Me',currency:'GBP',created_at:now,updated_at:now,deleted_at:null,cloud_version:1}];
db.tables.planly_budget_categories=[{id:B,scope_id:P,owner_id:OWNER,client_id:'c1',kind:'expense',name:'Bills',icon_key:'🧾',color:null,archived:false,sort_order:1,created_at:now,updated_at:now,deleted_at:null,cloud_version:1},{id:I,scope_id:P,owner_id:OWNER,client_id:'c2',kind:'income',name:'Income',icon_key:'💷',color:null,archived:false,sort_order:2,created_at:now,updated_at:now,deleted_at:null,cloud_version:1}];
db.tables.planly_budget_targets=[];
const rows=[E(I,'income','Salary',200000,ym+'-01','paid'),E(B,'expense','Phone',2500,dd(1)),E(B,'expense','Gym',3500,dd(5)),E(B,'expense','Paid already',1000,ym+'-01','paid')];
const late=dd(-2);if(inMonth(late))rows.push(E(B,'expense','Internet',3200,late));
db.tables.planly_budget_entries=rows.filter(r=>r.kind==='income'||inMonth(r.entry_date)||r.allocation_status==='paid');
const {context,errors}=await newPhone(browser,db,OWNER);const page=await openApp(context,errors);
await page.evaluate(()=>document.querySelector('.nav button[data-tab="budget"]').click());await W(2600);
const s=await page.evaluate(()=>{const coming=[...document.querySelectorAll('#view .budgetCard')].find(c=>/Coming up/i.test(c.querySelector('.budgetSectionHead strong')?.textContent||''));
  const due=coming?[...coming.querySelectorAll('.budgetPaymentRow')].map(r=>({name:r.querySelector('strong')?.textContent,due:r.querySelector('.budgetDueIn')?.textContent||'',soon:!!r.querySelector('.budgetDueIn.soon')})):[];
  const label=coming?.querySelector('.budgetSectionHead strong');
  return {due,caps:label?getComputedStyle(label).textTransform:'',status:document.querySelector('.budgetPaceStatus')?.textContent.trim(),today:!!document.querySelector('.budgetPaceToday'),cat:document.querySelector('[data-cat] .budgetCatAmount')?.innerText.replace(/\s+/g,' ').trim()}});
const phone=s.due.find(x=>x.name==='Phone'),gym=s.due.find(x=>x.name==='Gym');
if(inMonth(dd(1)))check('a bill due tomorrow says "tomorrow", in amber',phone?.due==='tomorrow'&&phone.soon,JSON.stringify(s.due));
if(inMonth(dd(5)))check('a bill due in 5 days says "in 5 days", not amber',gym?.due==='in 5 days'&&!gym.soon,JSON.stringify(s.due));
check('section labels are small capitals',s.caps==='uppercase',s.caps);
check(inMonth(late)?'an unpaid bill from 2 days ago shows as overdue':'with nothing overdue the card says On track',inMonth(late)?s.status==='£32 overdue':s.status==='On track',s.status);
const left=rows.filter(r=>r.kind==='expense'&&inMonth(r.entry_date)&&r.allocation_status!=='paid').reduce((a,r)=>a+r.amount_minor,0)/100;
check('a category says what is left, with a ›',s.cat===`£${left.toFixed(2)} left ›`,JSON.stringify({cat:s.cat,left}));
check('the pace bar marks today on the current month',s.today);
await page.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='›'&&b.closest('.budgetMonthBar'))?.click());await W(2000);
check('…but not on another month',await page.evaluate(()=>!document.querySelector('.budgetPaceToday')&&!!document.querySelector('.budgetPace')));
check('no page errors',errors.length===0,errors.slice(0,2).join(' | '));
console.log(`\n${pass} passed, ${fail} failed`);await browser.close();server.close();process.exit(fail?1:0);
