// Fitness › Food servings: one can or pack is offered from the product's pack size (one item of a multipack), drinks are
// in ml, a "serving" of exactly 100 is not offered, and a serving size can be set by hand (kept with a favourite).
// Open Food Facts answers through the real food-search function code, as on iPhone.
// Run: node tests/browser/fitness-servings.test.mjs (see tests/browser/README.md).
import {startServer,chromium,makeDb,newPhone,openApp,OWNER} from './harness.mjs';
let pass=0,fail=0;const check=(n,c,d='')=>{console.log((c?'PASS ':'FAIL ')+n+(c?'':' — '+d));c?pass++:fail++};
const W=ms=>new Promise(r=>setTimeout(r,ms));

const SB='https://dtniwcwjucepsjzoojuc.supabase.co';
let handler;globalThis.Deno={env:{get:k=>({SUPABASE_URL:SB,SUPABASE_ANON_KEY:'anon'})[k]},serve:h=>{handler=h}};
const realFetch=globalThis.fetch;
const P=(code,name,kcal,carbs,more)=>({code,product_name:name,brands:['Brand'],nutriments:{'energy-kcal_100g':kcal,proteins_100g:0,carbohydrates_100g:carbs,fat_100g:0},...more});
const catalogue=[
  P('5000000000101','Pepsi 330ml Can',18,4.6,{serving_quantity:100,serving_size:'100 ml',serving_quantity_unit:'ml',quantity:'330 ml',product_quantity:330,product_quantity_unit:'ml'}),
  P('5000000000118','Cola cans multipack',42,10.6,{quantity:'6 x 330 ml',product_quantity:1980,product_quantity_unit:'ml'}),
  P('5000000000125','Crunchy granola',450,60,{serving_quantity:45,serving_size:'45 g',quantity:'500 g',product_quantity:500,product_quantity_unit:'g'}),
  P('5000000000132','Ready salted crisps',520,50,{})];
const tok=t=>String(t).toLowerCase().replace(/[^a-z0-9%]+/g,' ').trim().split(' ').filter(Boolean);
globalThis.fetch=async(url,init={})=>{url=String(url);const h=init.headers||{},j=(s,o)=>new Response(JSON.stringify(o),{status:s,headers:{'content-type':'application/json'}});
  if(url===SB+'/auth/v1/user')return /^Bearer ey/.test(h.Authorization||'')?j(200,{id:OWNER}):j(401,{});
  const u=new URL(url);
  if(u.host==='search.openfoodfacts.org'){const terms=tok(u.searchParams.get('q').replace(' countries:"en:united-kingdom"',''));return j(200,{hits:catalogue.filter(p=>terms.every(t=>tok(p.product_name).includes(t)))})}
  if(u.host==='world.openfoodfacts.org')return j(200,{products:[]});
  return realFetch(url,init)};
await import('../../supabase/functions/food-search/index.ts');

const server=await startServer();
const browser=await chromium.launch(process.env.PLANLY_CHROMIUM?{executablePath:process.env.PLANLY_CHROMIUM}:{});
const db=makeDb();db.tables.planly_food_profile=[];db.tables.planly_food_entries=[];db.tables.planly_food_favourites=[];
const {context,errors}=await newPhone(browser,db,OWNER);
await context.route(/openfoodfacts\.org/,route=>route.abort('failed'));
await context.route(SB+'/functions/v1/food-search',async route=>{const req=route.request();
  if(req.method()==='OPTIONS')return route.fulfill({status:200,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'}});
  const res=await handler(new Request('https://fn.test',{method:'POST',headers:{authorization:req.headers()['authorization']||'','content-type':'application/json'},body:req.postData()}));
  route.fulfill({status:res.status,headers:{'access-control-allow-origin':'*','content-type':'application/json'},body:await res.text()})});
const page=await openApp(context,errors);
await page.click('.nav button[data-tab="fitness"]');await W(1200);
const open=async(q,name)=>{await page.click('.fitActions [data-fit="search"]');await W(300);await page.fill('.fitSearchForm input',q);await page.click('.fitSearchForm button');await W(1500);
  await page.locator('.fitResult strong',{hasText:new RegExp('^'+name+'$')}).first().click();await W(400)};
const sheet=()=>page.evaluate(()=>{const q=s=>document.querySelector(s),g=q('[data-units]'),body=q('.fitSheet');
  return {head:q('.fitFoodHead small')?.textContent||'',amount:q('input[name="amount"]')?.value,preview:q('[data-preview] strong')?.textContent||'',
    chips:[...(g?.children||[])].map(c=>c.textContent.trim()||c.getAttribute('aria-label')),on:[...(g?.querySelectorAll('[aria-pressed="true"]')||[])].map(c=>c.textContent.trim()),
    fits:!g||[...g.children].every(c=>c.getBoundingClientRect().right<=body.getBoundingClientRect().right+1),box:!q('[data-serving-box]')?.hidden,expanded:q('[data-serving-edit]')?.getAttribute('aria-expanded')}});
const entry=n=>db.tables.planly_food_entries.find(r=>r.name===n&&!r.deleted_at);

// 1. A can of Pepsi: the "serving" of 100 ml is ignored and one can is offered, chosen at the start
await open('pepsi','Pepsi 330ml Can');let s=await sheet();
check('a drink shows per 100 ml',/18 kcal per 100 ml/.test(s.head),s.head);
check('one can is offered and chosen at the start, in ml; no "servings of 100"',JSON.stringify(s.chips)==='["ml","1 can · 330 ml","Serving"]'&&JSON.stringify(s.on)==='["1 can · 330 ml"]'&&s.amount==='330'&&s.preview==='59 kcal'&&s.fits,JSON.stringify(s));
await page.click('[data-unit="g"]');await W(100);s=await sheet();
check('ml can be chosen instead (100 ml)',s.amount==='100'&&JSON.stringify(s.on)==='["ml"]'&&s.preview==='18 kcal',JSON.stringify(s));
await page.fill('input[name="amount"]','500');await W(100);s=await sheet();
check('typing another amount switches from the can to ml',JSON.stringify(s.on)==='["ml"]'&&s.preview==='90 kcal',JSON.stringify(s));
await page.click('[data-pack]');await W(100);s=await sheet();
check('tapping the can puts 330 ml back',s.amount==='330'&&JSON.stringify(s.on)==='["1 can · 330 ml"]',JSON.stringify(s));
await page.check('input[name="star"]');await page.click('[data-add]');await W(1500);
const pepsi=entry('Pepsi 330ml Can');
check('it is saved as 330 ml with the can\'s nutrients',pepsi&&pepsi.unit==='ml'&&pepsi.amount===330&&pepsi.kcal===59.4&&pepsi.carbs_g===15.2,JSON.stringify(pepsi));
let fav=db.tables.planly_food_favourites.find(f=>f.name==='Pepsi 330ml Can');
check('the favourite keeps one can as its serving, in ml',fav&&fav.serving_g===330&&fav.serving_label==='330 ml'&&fav.kcal_100===18,JSON.stringify(fav));

// 2. A multipack offers one can
await open('multipack','Cola cans multipack');s=await sheet();
check('a multipack offers one can, not the whole pack',s.chips.includes('1 can · 330 ml')&&s.amount==='330'&&s.preview==='139 kcal',JSON.stringify(s));
await page.click('.fitSheetDone');await W(300);

// 3. A food with a real serving keeps it, and also offers the whole pack
await open('granola','Crunchy granola');s=await sheet();
check('a real serving still comes first, with the whole pack offered too',JSON.stringify(s.chips)==='["grams","servings of 45 g","1 pack · 500 g",null]'.replace('null','"Set serving size"')&&JSON.stringify(s.on)==='["servings of 45 g"]'&&s.amount==='1'&&s.preview==='203 kcal',JSON.stringify(s));
await page.click('[data-pack]');await W(100);s=await sheet();
check('tapping the pack switches to 500 g',s.amount==='500'&&JSON.stringify(s.on)==='["1 pack · 500 g"]'&&s.preview==='2,250 kcal',JSON.stringify(s));
await page.click('[data-unit="g"]');await W(100);s=await sheet();
check('and grams go back to 100 g',s.amount==='100'&&JSON.stringify(s.on)==='["grams"]',JSON.stringify(s));
await page.click('.fitSheetDone');await W(300);

// 4. No serving size at all: set one by hand
await open('crisps','Ready salted crisps');s=await sheet();
check('a food with no serving or pack size offers grams and a way to set a serving',JSON.stringify(s.chips)==='["grams","Serving"]'&&s.amount==='100'&&!s.box,JSON.stringify(s));
await page.click('[data-serving-edit]');await W(100);s=await sheet();
check('the pencil opens the serving size box',s.box&&s.expanded==='true'&&await page.isDisabled('[data-serving-save]'),JSON.stringify(s));
await page.fill('input[name="serving"]','25');await page.click('[data-serving-save]');await W(150);s=await sheet();
check('saving it switches to 1 serving of 25 g',!s.box&&JSON.stringify(s.chips)==='["grams","servings of 25 g","Set serving size"]'&&JSON.stringify(s.on)==='["servings of 25 g"]'&&s.amount==='1'&&s.preview==='130 kcal',JSON.stringify(s));
await page.check('input[name="star"]');await page.click('[data-add]');await W(1500);
const crisps=entry('Ready salted crisps');fav=db.tables.planly_food_favourites.find(f=>f.name==='Ready salted crisps');
check('the entry and the favourite use that serving',crisps&&crisps.unit==='serving'&&crisps.amount===1&&crisps.kcal===130&&fav&&fav.serving_g===25,JSON.stringify({crisps,fav}));

// 5. Changing a favourite's serving is saved to the favourite
await page.click('.fitActions [data-fit="search"]');await W(400);
await page.locator('.fitResult strong',{hasText:/^Pepsi 330ml Can$/}).first().click();await W(400);s=await sheet();
check('the favourite opens at 1 can, in ml',/per 100 ml/.test(s.head)&&s.chips.includes('servings of 330 ml')&&s.amount==='1'&&s.preview==='59 kcal',JSON.stringify(s));
await page.click('[data-serving-edit]');await page.fill('input[name="serving"]','500');await page.click('[data-serving-save]');await W(1500);
fav=db.tables.planly_food_favourites.find(f=>f.name==='Pepsi 330ml Can');
check('a new serving size is saved to the favourite',fav&&fav.serving_g===500&&fav.serving_label==='500 ml'&&(await sheet()).preview==='90 kcal',JSON.stringify(fav));
await page.click('.fitSheetDone');
check('no page errors',errors.length===0,errors.join(' | '));
console.log(`${pass} passed, ${fail} failed`);await browser.close();server.close();process.exit(fail?1:0);
