// A bill's tick responds at once: on a slow connection the circle turns green the moment it is tapped (not after the
// save) and stays fully visible while it saves, in Budget and on Today; if the save fails it turns back.
// Run: node tests/browser/bill-tick.test.mjs (see tests/browser/README.md).
import {startServer,launchBrowser,makeDb,newPhone,openApp,OWNER} from './harness.mjs';
const server=await startServer();const browser=await launchBrowser();
let pass=0,fail=0;const check=(n,c,d='')=>{console.log((c?'PASS ':'FAIL ')+n+(c?'':' — '+d));c?pass++:fail++};
const W=ms=>new Promise(r=>setTimeout(r,ms));
const d=new Date(),today=d.toISOString().slice(0,10),ym=today.slice(0,7),now=d.toISOString();
const P='11111111-0000-4000-8000-000000000001',BILLS='a1000000-0000-4000-8000-000000000001';
const E=(n,desc,more={})=>({id:'b1000000-0000-4000-8000-00000000000'+n,scope_id:P,category_id:BILLS,owner_id:OWNER,client_id:'e'+n,kind:'expense',amount_minor:2000,entry_date:ym+'-05',description:desc,notes:'',allocation_status:'planned',due_day:5,recurring_monthly:true,show_on_today:false,today_lead_days:0,created_at:now,updated_at:now,deleted_at:null,cloud_version:1,...more});
const db=makeDb();
db.tables.planly_budget_scopes=[{id:P,owner_id:OWNER,scope_type:'personal',household_id:null,name:'Me',currency:'GBP',created_at:now,updated_at:now,deleted_at:null,cloud_version:1}];
db.tables.planly_budget_categories=[{id:BILLS,scope_id:P,owner_id:OWNER,client_id:'c1',kind:'expense',name:'Bills',icon_key:'wallet',color:null,archived:false,sort_order:1,created_at:now,updated_at:now,deleted_at:null,cloud_version:1}];
db.tables.planly_budget_targets=[];
db.tables.planly_budget_entries=[E(1,'Rent'),E(2,'Phone'),E(3,'Water',{entry_date:today,due_day:Number(today.slice(8)),show_on_today:true})];
const {context,errors}=await newPhone(browser,db,OWNER);const page=await openApp(context,errors);
const dialogs=[];page.on('dialog',x=>{dialogs.push(x.message());x.accept()});
const row=n=>db.tables.planly_budget_entries.find(r=>r.client_id==='e'+n);
// Today's bill tick on a slow connection
await page.waitForFunction(()=>!!document.querySelector('[data-budget-bill-paid]'),null,{timeout:8000}).catch(()=>{});
db.delays.planly_budget_entries=1500;
const t=await page.evaluate(async()=>{const b=document.querySelector('[data-budget-bill-paid]');if(!b)return null;b.click();await new Promise(r=>setTimeout(r,80));return {ticking:b.classList.contains('ticking'),bg:getComputedStyle(b,'::before').backgroundColor}});
check('Today: the bill tick fills green the moment it is tapped, before the save finishes',t?.ticking&&t.bg!=='rgba(0, 0, 0, 0)'&&row(3).allocation_status==='planned',JSON.stringify({t,status:row(3).allocation_status}));
await W(2500);check('…and the save goes through',row(3).allocation_status==='paid',row(3).allocation_status);
// Budget tick on a slow connection
await page.evaluate(()=>document.querySelector('.nav button[data-tab="budget"]').click());await W(2500);
await page.evaluate(id=>document.querySelector(`[data-cat="${id}"]`)?.click(),BILLS);await W(1200);
const id1=row(1).id;
const s=await page.evaluate(async id=>{const b=document.querySelector(`[data-budget-paid="${id}"]`);if(!b)return null;b.click();await new Promise(r=>setTimeout(r,80));return {paid:b.classList.contains('paid'),opacity:getComputedStyle(b).opacity,bg:getComputedStyle(b,'::before').backgroundColor}},id1);
check('Budget: the circle turns green the moment it is tapped, before the save finishes',s?.paid&&s.bg!=='rgba(0, 0, 0, 0)'&&row(1).allocation_status==='planned',JSON.stringify({s,status:row(1).allocation_status}));
check('…and stays fully visible while it saves (not faded)',s?.opacity==='1',JSON.stringify(s));
await W(3000);check('…and the save goes through once',row(1).allocation_status==='paid'&&row(1).cloud_version===2,JSON.stringify({st:row(1).allocation_status,v:row(1).cloud_version}));
// A failed save turns it back
db.delays.planly_budget_entries=400;let failed=false;
db.fail=({table,method})=>{if(!failed&&table==='planly_budget_entries'&&method!=='GET'){failed=true;return [500,{message:'boom'}]}return null};
await page.evaluate(()=>document.querySelector('.budgetUndo')?.remove());
const id2=row(2).id;
const f1=await page.evaluate(async id=>{const b=document.querySelector(`[data-budget-paid="${id}"]`);b.click();return b.classList.contains('paid')},id2);
await W(2500);
const f2=await page.evaluate(id=>document.querySelector(`[data-budget-paid="${id}"]`)?.classList.contains('paid'),id2);
check('if the save fails the circle turns back (and says so)',failed&&f1===true&&f2===false&&row(2).allocation_status==='planned'&&dialogs.length>0,JSON.stringify({failed,f1,f2,st:row(2).allocation_status,dialogs}));
db.fail=null;
check('no page errors',errors.length===0,errors.slice(0,3).join(' | '));
console.log(`${pass} passed, ${fail} failed`);await browser.close();server.close();process.exit(fail?1:0);
