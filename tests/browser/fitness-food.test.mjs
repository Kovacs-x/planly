// Fitness › Food (5.1): the fifth tab, a private calorie counter. Open Food Facts is answered locally.
// Run: node tests/browser/fitness-food.test.mjs (see tests/browser/README.md).
import {startServer,launchBrowser,makeDb,newPhone,openApp,OWNER,PARTNER} from './harness.mjs';
const server=await startServer();const browser=await launchBrowser();
let pass=0,fail=0;const check=(n,c,d='')=>{console.log((c?'PASS ':'FAIL ')+n+(c?'':' — '+d));c?pass++:fail++};
const W=ms=>new Promise(r=>setTimeout(r,ms));
const key=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
const today=key(new Date()),yest=key(new Date(Date.now()-864e5));
const db=makeDb();
db.tables.planly_food_profile=[];db.tables.planly_food_favourites=[];
db.tables.planly_food_entries=[
  // the other member's food: must never be requested or shown
  {id:'e0000000-0000-4000-8000-0000000000b1',owner_id:PARTNER,client_id:'p1',entry_date:today,meal:'lunch',name:'Partner salad',brand:'',barcode:null,source:'manual',amount:1,unit:'serving',kcal:400,protein_g:10,carbs_g:20,fat_g:30,client_created_at:1,client_updated_at:1,cloud_version:1,deleted_at:null},
  // yesterday, for the 7-day average and Recent
  {id:'e0000000-0000-4000-8000-0000000000a1',owner_id:OWNER,client_id:'o1',entry_date:yest,meal:'breakfast',name:'Overnight oats',brand:'',barcode:null,source:'search',amount:1,unit:'serving',kcal:1800,protein_g:20,carbs_g:60,fat_g:10,client_created_at:1,client_updated_at:1,cloud_version:1,deleted_at:null}];
const {context,errors}=await newPhone(browser,db,OWNER);
const offRequests=[];
await context.route('https://world.openfoodfacts.org/**',route=>{offRequests.push(route.request().url());route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({count:2,products:[
  {code:'5000436589457',product_name:'Greek Style Yogurt 0% Fat',brands:'Tesco',serving_quantity:150,serving_size:'1 pot (150 g)',nutriments:{'energy-kcal_100g':57,proteins_100g:10.2,carbohydrates_100g:4,fat_100g:0.2}},
  {code:'1',product_name:'<img src=x onerror=alert(1)>',brands:'X',nutriments:{'energy-kcal_100g':100}},
  {code:'2',product_name:'No energy',nutriments:{}}]})})});
const page=await openApp(context,errors);
const dialogs=[];page.on('dialog',d=>{dialogs.push(d.message());d.dismiss()});
const ui=()=>page.evaluate(()=>({tab:document.querySelector('.nav button.active')?.dataset.tab,title:document.querySelector('#pageTitle')?.textContent,add:getComputedStyle(document.querySelector('#addBtn')).display,fit:!!document.querySelector('.fitView'),left:document.querySelector('.fitRingText strong')?.textContent,eaten:document.querySelector('.fitSummaryFoot span strong')?.textContent,avg:[...document.querySelectorAll('.fitSummaryFoot span')].pop()?.textContent,entries:[...document.querySelectorAll('.fitEntry strong')].map(x=>x.textContent),setup:!!document.querySelector('.fitSetup'),notice:document.querySelector('.fitNotice')?.textContent||'',navRows:new Set([...document.querySelectorAll('.nav button')].map(b=>Math.round(b.getBoundingClientRect().top))).size}));
const mine=()=>db.tables.planly_food_entries.filter(r=>r.owner_id===OWNER&&!r.deleted_at);

// 1. The tab
await page.click('.nav button[data-tab="fitness"]');await W(1500);
let u=await ui();
check('Fitness tab opens the Food view',u.tab==='fitness'&&u.title==='Fitness'&&u.fit,JSON.stringify(u));
check('five tabs sit on one row',u.navRows===1,String(u.navRows));
check('no add-task button on Fitness',u.add==='none',u.add);
check('the other member\'s food is not shown',!u.entries.includes('Partner salad'),u.entries.join());
check('yesterday counts towards the 7-day average',/1,800/.test(u.avg),u.avg);
check('targets prompt shows until targets are set',u.setup);
const gets=db.log.filter(l=>l.table?.startsWith('planly_food_')&&l.method==='GET');
check('every food read asks for this person\'s rows only',gets.length>=3&&gets.every(l=>new URLSearchParams(l.query).get('owner_id')==='eq.'+OWNER),gets.map(l=>l.query).join(' | '));

// 2. Targets
await page.click('.fitSetup [data-fit="targets"]');await W(400);
await page.click('[data-seg="sex"] [data-v="male"]');
await page.fill('input[name="birth_year"]',String(new Date().getFullYear()-30));await page.fill('input[name="height_cm"]','180');await page.fill('input[name="weight_kg"]','85');
await page.selectOption('select[name="activity"]','moderate');await page.click('[data-seg="goal"] [data-v="lose"]');await page.click('[data-seg="pace_kg_week"] [data-v="0.5"]');await W(200);
const sugg=await page.textContent('[data-suggest]');
check('suggestion is worked out from the details',/2,290 kcal/.test(sugg),sugg);
await page.click('.fitSheet [data-save]');await W(1500);
const prof=db.tables.planly_food_profile[0];
check('targets are saved to this person\'s profile',prof&&prof.owner_id===OWNER&&prof.kcal_target===2290&&prof.protein_g===170&&prof.goal==='lose',JSON.stringify(prof));
u=await ui();check('summary uses the new target',u.left==='2,290'&&!u.setup,JSON.stringify(u));

// 3. Search, pick, save to favourites, add to Lunch
await page.click('.fitActions [data-fit="search"]');await W(400);
check('Recent lists foods eaten before',await page.locator('.fitResult strong',{hasText:'Overnight oats'}).count()===1);
await page.fill('.fitSearchForm input','greek yogurt');await page.click('.fitSearchForm button');await W(800);
const results=await page.$$eval('.fitResult strong',e=>e.map(x=>x.textContent));
check('Open Food Facts results are listed (no energy = skipped)',results.includes('Greek Style Yogurt 0% Fat')&&!results.includes('No energy'),results.join());
check('product names are shown as text, not HTML',results.includes('<img src=x onerror=alert(1)>')&&dialogs.length===0);
const offQ=new URL(offRequests[0]||'http://x');
check('only the search words go to Open Food Facts',offQ.searchParams.get('search_terms')==='greek yogurt'&&!offRequests[0].includes(OWNER)&&!offRequests[0].includes('@'),offRequests[0]);
await page.locator('.fitResult',{hasText:'Greek Style Yogurt'}).click();await W(300);
check('a product with a serving size starts at 1 serving',(await page.textContent('[data-preview]')).includes('86 kcal'),await page.textContent('[data-preview]'));
await page.click('[data-unit="g"]');await page.fill('input[name="amount"]','200');await W(100);
check('grams scale the nutrients',(await page.textContent('[data-preview]')).includes('114 kcal'));
await page.click('[data-meal-pick="lunch"]');await page.check('input[name="star"]');await page.click('[data-add]');await W(1500);
let yog=mine().find(r=>r.name==='Greek Style Yogurt 0% Fat');
check('the food is saved with its nutrients',yog&&yog.kcal===114&&yog.protein_g===20.4&&yog.meal==='lunch'&&yog.unit==='g'&&yog.amount===200&&yog.barcode==='5000436589457'&&yog.entry_date===today,JSON.stringify(yog));
const fav=db.tables.planly_food_favourites[0];
check('and saved to favourites per 100 g',fav&&fav.owner_id===OWNER&&fav.kcal_100===57&&fav.serving_g===150,JSON.stringify(fav));

// 4. Quick add
await page.click('.fitActions [data-fit="quick"]');await W(300);
await page.fill('input[name="name"]','Snack bar');await page.fill('input[name="kcal"]','300');await page.fill('input[name="p"]','12');await page.click('[data-meal-pick="snack"]');await page.click('[data-add]');await W(1500);
const bar=mine().find(r=>r.name==='Snack bar');
check('quick add saves just the numbers',bar&&bar.kcal===300&&bar.protein_g===12&&bar.source==='quick'&&bar.meal==='snack',JSON.stringify(bar));
u=await ui();check('summary adds up the day',u.eaten==='414'&&u.left==='1,876',JSON.stringify(u));

// 5. Edit and delete
await page.locator('.fitEntry',{hasText:'Greek Style Yogurt'}).click();await W(300);
await page.fill('.fitSheet input[name="amount"]','100');await page.click('[data-save]');await W(1500);
yog=mine().find(r=>r.name==='Greek Style Yogurt 0% Fat');
check('editing the amount rescales and bumps the version',yog.kcal===57&&yog.amount===100&&yog.cloud_version===2,JSON.stringify(yog));
await page.locator('.fitEntry',{hasText:'Snack bar'}).click();await W(300);await page.click('[data-delete]');await W(1500);
check('delete marks the row deleted',!!db.tables.planly_food_entries.find(r=>r.name==='Snack bar').deleted_at);
u=await ui();check('and it leaves the day',!u.entries.includes('Snack bar')&&u.eaten==='57',JSON.stringify(u));

// 6. Offline, then back online
db.offline=true;await context.setOffline(true);
await page.click('.fitActions [data-fit="quick"]');await W(300);await page.fill('input[name="name"]','Offline apple');await page.fill('input[name="kcal"]','80');await page.click('[data-add]');await W(800);
u=await ui();
check('offline: shows straight away, nothing sent yet',u.entries.includes('Offline apple')&&!db.tables.planly_food_entries.some(r=>r.name==='Offline apple'),JSON.stringify(u.entries));
db.offline=false;await context.setOffline(false);await page.evaluate(()=>window.dispatchEvent(new Event('online')));await W(2500);
check('back online: the change is sent',db.tables.planly_food_entries.some(r=>r.name==='Offline apple'&&r.owner_id===OWNER));

// 7. Changed on another device: the newer saved version wins and the app says so
yog=db.tables.planly_food_entries.find(r=>r.name==='Greek Style Yogurt 0% Fat');yog.cloud_version=9;yog.amount=300;yog.kcal=171;
await page.locator('.fitEntry',{hasText:'Greek Style Yogurt'}).click();await W(300);await page.fill('.fitSheet input[name="amount"]','50');await page.click('[data-save]');await W(2500);
u=await ui();
check('a conflicting edit is not written over the newer version',db.tables.planly_food_entries.find(r=>r.id===yog.id).amount===300);
check('the app shows the saved version and a notice',/couldn't be saved/.test(u.notice)&&/171/.test(await page.textContent('.fitMeal[data-meal="lunch"]')),u.notice);

// 7b. Editing a food while it is still being saved keeps the edit
db.delays.planly_food_entries=1500;
await page.click('.fitActions [data-fit="quick"]');await W(300);await page.fill('input[name="name"]','Slow toast');await page.fill('input[name="kcal"]','150');await page.click('[data-meal-pick="breakfast"]');await page.click('[data-add]');await W(200);
await page.locator('.fitEntry',{hasText:'Slow toast'}).click();await W(200);await page.click('[data-meal-pick="dinner"]');await page.click('[data-save]');await W(200);
await page.locator('.fitEntry',{hasText:'Slow toast'}).click();await W(200);await page.click('[data-meal-pick="snack"]');await page.click('[data-save]');
await W(6000);db.delays.planly_food_entries=0;
const toast=db.tables.planly_food_entries.filter(r=>r.name==='Slow toast');
check('an edit made while the first save is still sending is kept',toast.length===1&&toast[0].meal==='snack',JSON.stringify(toast.map(r=>[r.meal,r.cloud_version])));
// 8. Days and other tabs
await page.click('[data-fit="prev"]');await W(600);u=await ui();
check('previous day shows yesterday\'s food',u.entries.includes('Overnight oats')&&!u.entries.includes('Greek Style Yogurt 0% Fat'),JSON.stringify(u.entries));
await page.click('.nav button[data-tab="today"]');await W(900);u=await ui();
check('other tabs still work',u.tab==='today'&&u.add!=='none'&&!u.fit,JSON.stringify(u));
await page.click('.nav button[data-tab="fitness"]');await W(900);u=await ui();
check('coming back opens today again',u.entries.includes('Greek Style Yogurt 0% Fat'),JSON.stringify(u.entries));
check('no page errors',errors.length===0,errors.join(' | '));
const made=['planly_food_entries','planly_food_favourites','planly_food_profile'].flatMap(t=>db.tables[t]).filter(r=>r.client_id!=='p1');
check('every saved food row belongs to this person',made.length>=6&&made.every(r=>r.owner_id===OWNER),String(made.length));
check('the other member\'s row was never changed',JSON.stringify(db.tables.planly_food_entries.find(r=>r.client_id==='p1'))===JSON.stringify({...db.tables.planly_food_entries.find(r=>r.client_id==='p1')})&&db.tables.planly_food_entries.find(r=>r.client_id==='p1').cloud_version===1&&!db.log.some(l=>l.method!=='GET'&&(l.query||'').includes('e0000000-0000-4000-8000-0000000000b1')));

console.log(`${pass} passed, ${fail} failed`);await browser.close();server.close();process.exit(fail?1:0);
