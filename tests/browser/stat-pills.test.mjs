// Summary pills (Today, Home, project page) keep long text inside the pill, and the Budget summary card keeps its big
// figure, still-to-pay line and pace row inside the card, at a normal and a narrow phone width, with ordinary and very
// large amounts (pill text used to run past the pill's edge).
// Run: node tests/browser/stat-pills.test.mjs (see tests/browser/README.md).
import {startServer,launchBrowser,makeDb,newPhone,openApp,OWNER} from './harness.mjs';
let pass=0,fail=0;const check=(n,c,d='')=>{console.log((c?'PASS ':'FAIL ')+n+(c?'':' — '+d));c?pass++:fail++};
const server=await startServer();const browser=await launchBrowser();const W=ms=>new Promise(r=>setTimeout(r,ms));
const d=new Date(),ym=d.toISOString().slice(0,7),now=d.toISOString();
const P='11111111-0000-4000-8000-000000000001',B='a1000000-0000-4000-8000-000000000001',I='a1000000-0000-4000-8000-000000000002';
const E=(n,cat,kind,amt,st='planned')=>({id:'b1000000-0000-4000-8000-0000000000'+String(n).padStart(2,'0'),scope_id:P,category_id:cat,owner_id:OWNER,client_id:'e'+n,kind,amount_minor:amt,entry_date:ym+'-05',description:'X'+n,notes:'',allocation_status:st,due_day:5,recurring_monthly:true,show_on_today:false,today_lead_days:0,created_at:now,updated_at:now,deleted_at:null,cloud_version:1});
for(const [label,entries] of [['yours',[E(1,B,'expense',308400),E(2,I,'income',527100)]],['big',[E(1,B,'expense',1234567,'paid'),E(3,B,'expense',9876543),E(2,I,'income',527100)]]]){
const db=makeDb();db.tables.planly_budget_scopes=[{id:P,owner_id:OWNER,scope_type:'personal',household_id:null,name:'Me',currency:'GBP',created_at:now,updated_at:now,deleted_at:null,cloud_version:1}];
db.tables.planly_budget_categories=[{id:B,scope_id:P,owner_id:OWNER,client_id:'c1',kind:'expense',name:'Bills',icon_key:'wallet',color:null,archived:false,sort_order:1,created_at:now,updated_at:now,deleted_at:null,cloud_version:1},{id:I,scope_id:P,owner_id:OWNER,client_id:'c2',kind:'income',name:'Income',icon_key:'wallet',color:null,archived:false,sort_order:2,created_at:now,updated_at:now,deleted_at:null,cloud_version:1}];
db.tables.planly_budget_targets=[];db.tables.planly_budget_entries=entries;
for(const width of [390,320]){
const {context,errors}=await newPhone(browser,db,OWNER);const page=await openApp(context,errors);await page.setViewportSize({width,height:844});
await page.evaluate(()=>document.querySelector('.nav button[data-tab="budget"]').click());await W(2500);
const card=await page.evaluate(()=>{const c=document.querySelector('#view .budgetHero');if(!c)return null;const b=c.getBoundingClientRect();return [...c.querySelectorAll('.budgetHeroBalance,.budgetGlanceLine,.budgetPaceRow span')].map(e=>{const r=document.createRange();r.selectNodeContents(e);const t=r.getBoundingClientRect();return {text:e.innerText,fits:t.left>=b.left-0.5&&t.right<=b.right+0.5}})});
check(`${label==='big'?'very large':'ordinary'} amounts at ${width}px: the Budget card's figure, line and pace row stay inside the card`,!!card&&card.length>=4&&card.every(x=>x.fits),JSON.stringify(card));
await page.evaluate(()=>{const v=document.getElementById('view');v.insertAdjacentHTML('afterbegin','<div class="dashStats" id="pillProbe" style="margin:12px"><span class="dashStat done">✅ £12,346 paid</span><span class="dashStat late">⏳ £98,765 to pay</span><span class="dashStat open">📅 12 due soon</span></div>')});
const r=await page.evaluate(()=>[...document.querySelectorAll('#pillProbe .dashStat')].map(e=>{const b=e.getBoundingClientRect(),rng=document.createRange();rng.selectNodeContents(e);const t=rng.getBoundingClientRect();return {text:e.innerText.replace(/\n/g,' / '),fits:t.left>=b.left-0.5&&t.right<=b.right+0.5&&e.scrollWidth<=e.clientWidth,h:Math.round(b.height)}}));
check(`long pill text at ${width}px (${label}): every pill's text stays inside the pill`,r.length===3&&r.every(x=>x.fits),JSON.stringify(r));
check(`…the three pills are the same height (${label}, ${width}px)`,new Set(r.map(x=>x.h)).size===1,JSON.stringify(r));
check(`…no page errors (${label}, ${width}px)`,errors.length===0,errors.slice(0,2).join(' | '));
await context.close()}}
console.log(`\n${pass} passed, ${fail} failed`);await browser.close();server.close();process.exit(fail?1:0);
