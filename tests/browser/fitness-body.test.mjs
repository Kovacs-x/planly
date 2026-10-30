// Fitness › Body: a private weight log in kg. With no weigh-ins it asks for the first one; then it shows the latest
// weight, the 30-day change, a trend chart (1M / 3M / 1Y) with the goal line, progress to the goal, this week (days
// logged, change since a week ago, BMI from the Food profile's height) and recent weigh-ins. Logging, editing and deleting a weigh-in
// save to the account (own rows only); a silly weight is refused; the goal and height save to the profile; Body stays
// chosen after reopening the app; Food still works.
// Run: node tests/browser/fitness-body.test.mjs (see tests/browser/README.md).
import {startServer,launchBrowser,makeDb,newPhone,openApp,OWNER} from './harness.mjs';
const server=await startServer();const browser=await launchBrowser();
let pass=0,fail=0;const check=(n,c,d='')=>{console.log((c?'PASS ':'FAIL ')+n+(c?'':' — '+d));c?pass++:fail++};
const W=ms=>new Promise(r=>setTimeout(r,ms));
const ago=d=>new Date(Date.now()-d*864e5).toISOString(),now=new Date().toISOString();
const db=makeDb();
db.tables.planly_food_entries=[];db.tables.planly_food_favourites=[];
db.tables.planly_food_profile=[{owner_id:OWNER,sex:'male',birth_year:1995,height_cm:180,weight_kg:84,activity:'light',goal:'lose',pace_kg_week:0.5,kcal_target:2200,protein_g:160,carbs_g:220,fat_g:70,targets_custom:false,goal_weight_kg:78,client_updated_at:1,cloud_version:1,created_at:now,updated_at:now}];
let n=0;const R=(d,kg,more={})=>({id:'c0000000-0000-4000-8000-0000000000'+String(++n).padStart(2,'0'),owner_id:OWNER,client_id:'w'+n,measured_at:ago(d),weight_kg:kg,source:'manual',external_id:null,client_created_at:1,client_updated_at:1,cloud_version:1,created_at:now,updated_at:now,deleted_at:null,...more});
db.tables.planly_body_weights=[R(40,85),R(30,84),R(20,83.4),R(10,83),R(6,82.8),R(3,82.6),R(1,82.4,{source:'withings',external_id:'g1'})];
const {context,errors}=await newPhone(browser,db,OWNER);let page=await openApp(context,errors);
page.on('dialog',x=>x.accept());
const body=async()=>{await page.evaluate(()=>document.querySelector('.nav button[data-tab="fitness"]').click());await W(1800);await page.evaluate(()=>document.querySelector('[data-fit="section"][data-section="body"]')?.click());await W(600)};
const look=()=>page.evaluate(()=>{const v=document.querySelector('.fitView'),t=s=>v?.querySelector(s)?.textContent.replace(/\s+/g,' ').trim()||'';return {active:document.querySelector('.fitSegments .active')?.textContent.trim(),now:t('.fitWeightNow strong'),change:t('.fitWeightChange'),chart:!!v?.querySelector('.fitWeightChart .fitWeightLine'),goalLine:!!v?.querySelector('.fitWeightGoal'),goal:t('.fitWeightGoalRow'),stats:[...(v?.querySelectorAll('.fitBodyStats>*')||[])].map(x=>x.querySelector('strong')?.textContent.trim()+' '+x.querySelector('small')?.textContent.trim()),recent:[...(v?.querySelectorAll('.fitWeighIn')||[])].map(x=>x.textContent.replace(/\s+/g,' ').trim()),empty:!!v?.querySelector('.fitBodyEmpty'),range:v?.querySelector('.fitRange .on')?.textContent}});
await body();let s=await look();
check('Body opens from the Fitness tabs (Gym still says Soon)',s.active==='Body'&&await page.evaluate(()=>/Soon/.test(document.querySelector('.fitSegments button:disabled')?.textContent||'')),JSON.stringify(s));
check('the latest weight is shown in kg with the 30-day change',s.now==='82.4 kg'&&s.change==='↓ 1.6 kg · 30 days',JSON.stringify(s));
check('a trend chart with the goal line, and progress to the goal',s.chart&&s.goalLine&&/Start 85\.0 · Goal 78\.0/.test(s.goal)&&/4\.4 kg to go/.test(s.goal),JSON.stringify(s));
check('this week: days logged, change and BMI from the profile height',s.stats[0]==='3 of 7 days logged'&&s.stats[1]==='↓ 0.6 kg this week'&&s.stats[2]==='25.4 BMI',JSON.stringify(s.stats));
check('recent weigh-ins, newest first, a scale reading marked',s.recent.length===7&&/82\.4 kg$/.test(s.recent[0])&&/Scale/.test(s.recent[0]),JSON.stringify(s.recent.slice(0,2)));
await page.evaluate(()=>document.querySelector('[data-fit="range"][data-range="90"]').click());await W(300);s=await look();
check('the chart switches to 3 months',s.range==='3M'&&s.chart,JSON.stringify(s));
// sheets: the page behind holds still, and dragging the sheet down closes it
await page.evaluate(()=>document.querySelector('[data-fit="log-weight"]').click());await W(500);
check('with a sheet open the page behind is held still',await page.evaluate(()=>getComputedStyle(document.body).position==='fixed'));
check('dragging the sheet down closes it and frees the page',await page.evaluate(async()=>{const p=document.querySelector('.fitSheet'),r=p.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+30,T=yy=>new Touch({identifier:1,target:p,clientX:x,clientY:yy});p.dispatchEvent(new TouchEvent('touchstart',{touches:[T(y)],bubbles:true}));for(let i=1;i<=10;i++){p.dispatchEvent(new TouchEvent('touchmove',{touches:[T(y+i*20)],bubbles:true,cancelable:true}));await new Promise(r=>setTimeout(r,16))}p.dispatchEvent(new TouchEvent('touchend',{touches:[],bubbles:true}));await new Promise(r=>setTimeout(r,500));return !document.querySelector('.fitSheetWrap.open')&&getComputedStyle(document.body).position!=='fixed'}));
check('Body buttons are easy to tap (44px)',await page.evaluate(()=>[...document.querySelectorAll('.fitSegments button,.fitRange button')].every(b=>b.getBoundingClientRect().height>=44)));
// log a weight
await page.evaluate(()=>document.querySelector('[data-fit="log-weight"]').click());await W(500);
await page.fill('.fitSheet [name="weight"]','500');await page.evaluate(()=>document.querySelector('.fitSheet [data-save]').click());await W(200);
check('a silly weight is refused with a message',/between 25 and 400/.test(await page.evaluate(()=>document.querySelector('.fitSheet [data-err]').textContent)));
await page.fill('.fitSheet [name="weight"]','81.9');await page.evaluate(()=>document.querySelector('.fitSheet [data-save]').click());await W(200);s=await look();
check('logging a weight shows it at once',s.now==='81.9 kg'&&/81\.9 kg$/.test(s.recent[0]),JSON.stringify(s));
await W(2000);const added=db.tables.planly_body_weights.find(r=>Number(r.weight_kg)===81.9);
check('…and saves it to the account as my own manual reading',!!added&&added.owner_id===OWNER&&added.source==='manual'&&!added.deleted_at,JSON.stringify(added));
// edit and delete
await page.evaluate(()=>document.querySelector('.fitWeighIn').click());await W(500);
await page.fill('.fitSheet [name="weight"]','82.0');await page.evaluate(()=>document.querySelector('.fitSheet [data-save]').click());await W(2500);
const edited=db.tables.planly_body_weights.find(r=>r.id===added.id);
check('editing a weigh-in saves the new value',Number(edited.weight_kg)===82&&edited.cloud_version===2,JSON.stringify(edited));
await page.evaluate(()=>document.querySelector('.fitWeighIn').click());await W(500);await page.evaluate(()=>document.querySelector('.fitSheet [data-delete]').click());await W(2500);s=await look();
check('deleting a weigh-in removes it',!!db.tables.planly_body_weights.find(r=>r.id===added.id).deleted_at&&s.now==='82.4 kg',JSON.stringify(s));
// goal
await page.evaluate(()=>document.querySelector('[data-fit="goal"]').click());await W(500);
await page.fill('.fitSheet [name="goal"]','80');await page.evaluate(()=>document.querySelector('.fitSheet [data-save]').click());await W(2500);
const prof=db.tables.planly_food_profile[0];s=await look();
check('changing the goal saves it to the profile and updates the card',Number(prof.goal_weight_kg)===80&&prof.cloud_version===2&&/2\.4 kg to go/.test(s.goal),JSON.stringify({g:prof.goal_weight_kg,v:prof.cloud_version,goal:s.goal}));
// remembered, and Food still works
await page.reload();await W(2500);await page.evaluate(()=>document.querySelector('.nav button[data-tab="fitness"]').click());await W(1500);
check('Body stays chosen after opening the app again',(await look()).active==='Body');
await page.evaluate(()=>document.querySelector('[data-fit="section"][data-section="food"]').click());await W(500);
check('…and Food is one tap away and still works',await page.evaluate(()=>document.querySelector('.fitSegments .active')?.textContent.trim()==='Food'&&!!document.querySelector('.fitSummary')));
// a new person with no weigh-ins
const db2=makeDb();db2.tables.planly_food_profile=[];db2.tables.planly_food_entries=[];db2.tables.planly_food_favourites=[];db2.tables.planly_body_weights=[];
const p2=await newPhone(browser,db2,OWNER);page=await openApp(p2.context,p2.errors);await body();
check('with no weigh-ins it asks for the first one',(await look()).empty);
errors.push(...p2.errors);
check('no page errors',errors.length===0,errors.slice(0,3).join(' | '));
console.log(`${pass} passed, ${fail} failed`);await browser.close();server.close();process.exit(fail?1:0);
