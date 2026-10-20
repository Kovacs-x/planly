// Me and Household look different: on the Budget tab, Me keeps the Budget amber and Household turns violet (the selected
// tab, + Payment, the summary card's soft gradient and the chips inside), and the title's Personal / Household label is a
// coloured badge with a person or house icon. Off the Budget tab nothing changes.
// Run: node tests/browser/budget-scope-colour.test.mjs (see tests/browser/README.md).
import {startServer,launchBrowser,makeDb,newPhone,openApp,OWNER,HOUSEHOLD} from './harness.mjs';
const server=await startServer();const browser=await launchBrowser();
let pass=0,fail=0;const check=(n,c,d='')=>{console.log((c?'PASS ':'FAIL ')+n+(c?'':' — '+d));c?pass++:fail++};
const W=ms=>new Promise(r=>setTimeout(r,ms));
const now=new Date().toISOString(),P='11111111-0000-4000-8000-000000000001',H='22222222-0000-4000-8000-000000000002';
const db=makeDb();
db.tables.planly_budget_scopes=[{id:P,owner_id:OWNER,scope_type:'personal',household_id:null,name:'Me',currency:'GBP',created_at:now,updated_at:now,deleted_at:null,cloud_version:1},{id:H,owner_id:OWNER,scope_type:'household',household_id:HOUSEHOLD,name:'Home',currency:'GBP',created_at:now,updated_at:now,deleted_at:null,cloud_version:1}];
db.tables.planly_budget_categories=[{id:'a1000000-0000-4000-8000-000000000009',scope_id:H,owner_id:OWNER,client_id:'c9',kind:'expense',name:'Groceries',icon:'wallet',color:null,archived:false,sort_order:1,created_at:now,updated_at:now,deleted_at:null,cloud_version:1}];
db.tables.planly_budget_targets=[];db.tables.planly_budget_entries=[];
const AMBER=['rgb(251, 191, 36)','rgb(180, 83, 9)'],VIOLET=['rgb(161, 140, 242)','rgb(85, 64, 184)'];
const {context,errors}=await newPhone(browser,db,OWNER);const page=await openApp(context,errors);
const click=sel=>page.evaluate(sel=>{const e=document.querySelector(sel);e?.click();return !!e},sel);
const look=()=>page.evaluate(()=>{const cs=(sel,p)=>{const e=document.querySelector(sel);return e?getComputedStyle(e)[p]:''};
  const eb=document.getElementById('eyebrow'),mask=eb?getComputedStyle(eb,'::before').webkitMaskImage||getComputedStyle(eb,'::before').maskImage:'';
  return {badge:eb?.textContent||'',badgeBg:eb?getComputedStyle(eb).backgroundColor:'',badgeColor:eb?getComputedStyle(eb).color:'',icon:/circle/.test(decodeURIComponent(mask))?'person':/M3 11l9-7/.test(decodeURIComponent(mask))?'house':'none',pay:cs('[data-act="allocation"]','backgroundColor'),tab:cs('[data-budget-scope].active','color'),hero:cs('.budgetHero','backgroundImage'),heroInk:(()=>{const h=document.querySelector('.budgetHero');if(!h)return '';const c=document.createElement('i');c.style.color='var(--budget)';h.appendChild(c);const v=getComputedStyle(c).color;c.remove();return v})(),nav:cs('.nav button[data-section="budget"] .pIcon','color')}});
const is=(c,set)=>set.includes(c);

await click('.nav button[data-section="budget"]');await W(2500);
let s=await look();
check('Me: + Payment and the selected tab are amber',is(s.pay,AMBER)&&is(s.tab,AMBER),JSON.stringify(s));
check('Me: the title badge says Personal, amber, with a person icon',s.badge==='Personal'&&is(s.badgeColor,AMBER)&&s.icon==='person'&&s.badgeBg!=='rgba(0, 0, 0, 0)',JSON.stringify(s));
check('Me: the summary card is a soft amber gradient',/gradient/.test(s.hero)&&is(s.heroInk,AMBER),JSON.stringify({hero:s.hero.slice(0,80),ink:s.heroInk}));
await click('[data-budget-scope="household"]');await W(2500);s=await look();
check('Household: + Payment and the selected tab are violet',is(s.pay,VIOLET)&&is(s.tab,VIOLET),JSON.stringify(s));
check('Household: the title badge says Household, violet, with a house icon',s.badge==='Household'&&is(s.badgeColor,VIOLET)&&s.icon==='house',JSON.stringify(s));
check('Household: the summary card is a soft violet gradient',/gradient/.test(s.hero)&&is(s.heroInk,VIOLET),JSON.stringify({hero:s.hero.slice(0,80),ink:s.heroInk}));
await click('[data-act="allocation"]');await W(1000);await click('[data-due="15"]');await W(300);
const chip=await page.evaluate(()=>getComputedStyle(document.querySelector('[data-due="15"]')).color);
check('Household: a chosen chip inside is violet too',is(chip,VIOLET),chip);
await click('.budgetBack');await W(1000);
await click('.nav button[data-section="today"]');await W(1200);s=await look();
check('off the Budget tab, the Budget icon stays amber and the title has no badge',is(s.nav,AMBER)&&s.badgeBg==='rgba(0, 0, 0, 0)'&&s.icon==='none',JSON.stringify(s));
await click('.nav button[data-section="budget"]');await W(2500);s=await look();
check('back on Budget it is still Household and violet',is(s.pay,VIOLET)&&await page.evaluate(()=>document.querySelector('[data-budget-scope].active')?.dataset.budgetScope)==='household',JSON.stringify(s));
await click('[data-budget-scope="personal"]');await W(2500);s=await look();
check('switching back to Me returns to amber',is(s.pay,AMBER)&&is(s.tab,AMBER),JSON.stringify(s));
check('no page errors',errors.length===0,errors.slice(0,3).join(' | '));
console.log(`${pass} passed, ${fail} failed`);await browser.close();server.close();process.exit(fail?1:0);
