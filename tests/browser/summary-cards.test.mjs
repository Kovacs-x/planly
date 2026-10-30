// Budget and Home summary cards. Budget shows what is left to plan, what is still to pay and how many are due soon, a
// pace bar of how much is paid with today marked, and On track / All paid 🎉; Home shows the same ring card as Today
// with this week's chores done, who has done what, and to do / late / done. Each turns green with 🎉 when everything is done, and Home plays its confetti once a week.
// Run: node tests/browser/summary-cards.test.mjs (see tests/browser/README.md).
import {startServer,launchBrowser,makeDb,newPhone,openApp,OWNER,PARTNER,HOUSEHOLD} from './harness.mjs';
const server=await startServer();const browser=await launchBrowser();
let pass=0,fail=0;const check=(n,c,d='')=>{console.log((c?'PASS ':'FAIL ')+n+(c?'':' — '+d));c?pass++:fail++};
const W=ms=>new Promise(r=>setTimeout(r,ms));
const key=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
const n=new Date(),now=n.toISOString(),ym=key(n).slice(0,7),today=key(n);
// this week (Mon–Sun) holds today; a late chore needs a day of this week before today, so use Monday unless today is Monday
const monday=key(new Date(n.getFullYear(),n.getMonth(),n.getDate()-((n.getDay()+6)%7))),lateDay=monday<today?monday:null;
const C=(owner,id,title,date,done,who)=>({owner_id:owner,client_id:id,data:{id,title,date,time:'',category:'Home',durationMinutes:30,priority:'normal',completed:done,recurrence:'none',reminder:'none',notes:'',subtasks:[],createdAt:1,updatedAt:1,visibility:'household',householdId:HOUSEHOLD,assigneeId:owner,completedBy:done?who:null,completedAt:done?now:null},visibility:'household',household_id:HOUSEHOLD,assignee_id:owner,completed_by:done?who:null,completed_at:done?now:null,cloud_version:1,deleted_at:null,task_date:date});
const P='11111111-0000-4000-8000-000000000001',BILLS='a1000000-0000-4000-8000-000000000001',PAY='a1000000-0000-4000-8000-000000000009';
const E=(i,name,amt,kind,status,due)=>({id:`b1000000-0000-4000-8000-00000000000${i}`,scope_id:P,category_id:kind==='income'?PAY:BILLS,owner_id:OWNER,client_id:'e'+i,kind,amount_minor:amt,entry_date:ym+'-'+String(due).padStart(2,'0'),description:name,notes:'',allocation_status:status,due_day:due,recurring_monthly:kind!=='income',show_on_today:false,today_lead_days:2,created_at:now,updated_at:now,deleted_at:null,cloud_version:1});
// due tomorrow, or today from the 28th on, so it is never in the past (it used to land on the 28th, overdue on the 29th–31st)
const soon=n.getDate()<28?n.getDate()+1:n.getDate(),inMonth=soon>=n.getDate();
const db=makeDb();
db.tables.planly_tasks.push(C(OWNER,'b','Bathroom',lateDay||today,false),C(OWNER,'k','Kitchen',today,false),C(OWNER,'h','Hall',today,true,OWNER),C(OWNER,'s','Stairs',today,true,OWNER),C(PARTNER,'bi','Bins',today,true,PARTNER));
db.tables.planly_budget_scopes=[{id:P,owner_id:OWNER,scope_type:'personal',household_id:null,name:'Me',currency:'GBP',created_at:now,updated_at:now,deleted_at:null,cloud_version:1}];
db.tables.planly_budget_categories=[[BILLS,'expense','Bills'],[PAY,'income','Pay']].map(([id,kind,name],i)=>({id,scope_id:P,owner_id:OWNER,client_id:'c'+i,kind,name,icon_key:'wallet',color:null,archived:false,sort_order:i,created_at:now,updated_at:now,deleted_at:null,cloud_version:1}));
db.tables.planly_budget_targets=[];
db.tables.planly_budget_entries=[E(0,'Salary',210000,'income','paid',1),E(1,'Rent',90000,'expense','paid',1),E(2,'Electric',10000,'expense','planned',soon)];
const {context,errors}=await newPhone(browser,db,OWNER);const page=await openApp(context,errors);
const nav=s=>page.evaluate(s=>document.querySelector(`.nav button[data-section="${s}"]`).click(),s);
const card=sel=>page.evaluate(sel=>{const c=document.querySelector(sel);if(!c)return null;const r=c.querySelector('.dashRing');return {all:c.classList.contains('allDone'),burst:c.classList.contains('celebrate'),confetti:c.querySelectorAll('.dashConfetti i').length,pct:r?.getAttribute('aria-valuenow'),ring:c.querySelector('.dashRingText')?.textContent,head:c.querySelector('.dashHead')?.innerText.replace(/\s+/g,' ').trim(),stats:[...c.querySelectorAll('.dashStat')].map(s=>s.textContent.trim())}},sel);

// Budget
await nav('budget');await W(2800);
const glance=()=>page.evaluate(()=>{const c=document.querySelector('#view .budgetHero');if(!c)return null;const p=c.querySelector('.budgetPace');return {all:c.classList.contains('allDone'),head:[...c.querySelectorAll('.budgetHeroLabel,.budgetHeroBalance,.budgetHeroIncome')].map(e=>e.innerText.trim()).join(' '),line:c.querySelector('.budgetGlanceLine')?.innerText.trim(),pace:p?.getAttribute('aria-valuenow'),fill:c.querySelector('.budgetPaceFill')?.style.width,today:!!c.querySelector('.budgetPaceToday'),paid:c.querySelector('.budgetPaceRow span')?.innerText.trim(),status:c.querySelector('.budgetPaceStatus')?.innerText.trim()}});
let b=await glance();
check('Budget card: what is left to plan this month, of what comes in',/Left to plan · [A-Za-z]+ \d{4} £1,100\.00 of £2,100\.00 coming in/.test(b?.head||''),b?.head);
check('…what is still to pay and how many are due soon',b?.line===`⏳ £100 still to pay · ${inMonth?1:0} due soon`,b?.line);
check('…a pace bar of how much is paid (£900 of £1,000 = 90%) with today marked',b?.pace==='90'&&b.fill==='90%'&&b.today&&b.paid==='£900.00 of £1,000.00 paid',JSON.stringify(b));
check('…and On track while nothing is overdue',b?.status==='On track',b?.status);
await page.evaluate(()=>document.querySelector('#view .budgetHero [data-act="allocation"]').click());await W(900);
check('+ Payment opens Add payment',await page.evaluate(()=>!!document.getElementById('budgetAllocationForm')));
await page.evaluate(()=>document.querySelector('[data-act="back"]').click());await W(900);
await page.evaluate(()=>document.querySelector('[data-budget-paid="b1000000-0000-4000-8000-000000000002"]')?.click());await W(2200);
b=await glance();
check('paying the last payment fills the bar and says All paid 🎉',b?.all&&b.pace==='100'&&b.status==='All paid 🎉',JSON.stringify(b));

// Home
await nav('home');await W(2200);
let h=await card('#view .homeChoreCard');
check('Home card: a ring of this week\'s chores done (3/5)',h?.ring==='3/5'&&h.pct==='60',JSON.stringify(h));
check('…how many are left and who has done what',/2 chores left 🏠 Musti 2 · Laki 1 done/.test(h?.head||''),h?.head);
check('…and to do / late / done',JSON.stringify(h?.stats)===JSON.stringify(['🧽 2 to do',`⏰ ${lateDay?1:0} late`,'🎉 3 done']),JSON.stringify(h?.stats));
await page.evaluate(()=>document.querySelector('#view .homeChoreCard [data-home-lists]').click());await W(900);
{const r=await page.evaluate(()=>({top:Math.round(document.querySelector("#view .homeListsSection").getBoundingClientRect().top),y:scrollY,h:innerHeight,doc:document.scrollingElement.scrollHeight}));check("🛒 Lists scrolls down to the Lists",r.y>0&&r.top>=0&&r.top<r.h-150,JSON.stringify(r))}
await page.evaluate(()=>scrollTo(0,0));
await page.evaluate(()=>document.querySelector('#view .homeChoreCard [data-add-chore]').click());await W(900);
check('+ Add chore opens a shared chore',await page.evaluate(()=>{const f=document.getElementById('taskForm'),r=f?.getBoundingClientRect();return document.getElementById('taskVisibility')?.value==='household'&&!!r&&r.height>0&&r.top<innerHeight&&getComputedStyle(f).visibility!=='hidden'}));
await page.keyboard.press('Escape');await page.evaluate(()=>document.querySelector('#closeSheet,[data-close-sheet]')?.click());await W(600);await nav('home');await W(1200);

// Ticking the last two chores: green, 🎉, confetti once this week
for(const id of ['b','k']){await page.evaluate(id=>document.querySelector(`#view .homeChore[data-id="${id}"] [data-action="toggle"]`)?.click(),id);await W(1500)}
h=await card('#view .homeChoreCard');
check('ticking the last chore turns the Home card green with 🎉 and a confetti burst',h?.all&&h.ring==='🎉'&&/All chores done!/.test(h.head)&&h.burst&&h.confetti===6,JSON.stringify(h));
await page.evaluate(()=>window.dispatchEvent(new Event('planly:household-ready')));await W(400);
check('a redraw straight after keeps the burst playing',(await card('#view .homeChoreCard'))?.burst===true);
await page.emulateMedia({reducedMotion:'reduce'});await W(200);
check('with reduced motion on the phone, the confetti is not shown and the ring does not pop',await page.evaluate(()=>{const c=document.querySelector('#view .homeChoreCard .dashConfetti'),r=document.querySelector('#view .homeChoreCard .dashRing');return !!c&&getComputedStyle(c).display==='none'&&getComputedStyle(r).animationName==='none'}));
await page.emulateMedia({reducedMotion:'no-preference'});
// dark mode: the card is dark and the ring keeps its colour
await page.evaluate(()=>{document.documentElement.dataset.theme='dark'});await W(200);
{const d=await page.evaluate(()=>{const c=document.querySelector('#view .homeChoreCard'),lum=s=>{const [r,g,b]=s.match(/\d+(\.\d+)?/g).map(Number);return (r*299+g*587+b*114)/1000};return {card:(h=>parseInt(h.slice(1,3),16)*.299+parseInt(h.slice(3,5),16)*.587+parseInt(h.slice(5,7),16)*.114)(getComputedStyle(c).getPropertyValue('--card').trim()),text:lum(getComputedStyle(c.querySelector('.dashHead strong')).color),ring:getComputedStyle(c.querySelector('.dashRingFill')).stroke}});
check('in dark mode the card is dark with light text, and the done ring stays green',d.card<60&&d.text>180&&/47, 191, 113/.test(d.ring),JSON.stringify(d))}
await page.evaluate(()=>{delete document.documentElement.dataset.theme});
await page.reload();await W(3000);await nav('home');await W(2000);
h=await card('#view .homeChoreCard');
check('…and only once a week: opening the app again shows 🎉 without confetti',h?.all&&!h.burst&&h.confetti===0,JSON.stringify(h));
check('no page errors',errors.length===0,errors.slice(0,3).join(' | '));
console.log(`${pass} passed, ${fail} failed`);await browser.close();server.close();process.exit(fail?1:0);
