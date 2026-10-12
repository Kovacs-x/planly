// Fitness › Food search through Planly's food-search function, end to end: the real Edge Function code runs here (with
// a fake Supabase Auth and a fake Open Food Facts), the app talks to it, and the phone itself cannot read Open Food Facts
// (as on iPhone). Run: node tests/browser/fitness-search-proxy.test.mjs (see tests/browser/README.md).
import {startServer,chromium,makeDb,newPhone,openApp,OWNER} from './harness.mjs';
let pass=0,fail=0;const check=(n,c,d='')=>{console.log((c?'PASS ':'FAIL ')+n+(c?'':' — '+d));c?pass++:fail++};
const W=ms=>new Promise(r=>setTimeout(r,ms));

// ---- the real function, with a fake Supabase Auth and a fake Open Food Facts (whole-word matching, like the real one)
const SB='https://dtniwcwjucepsjzoojuc.supabase.co';
let handler;globalThis.Deno={env:{get:k=>({SUPABASE_URL:SB,SUPABASE_ANON_KEY:'anon'})[k]},serve:h=>{handler=h}};
const off={down:false,asked:[]},realFetch=globalThis.fetch;
const P=(code,name,brand,kcal,uk)=>({code,product_name:name,brands:[brand],nutriments:{'energy-kcal_100g':kcal,proteins_100g:1,carbohydrates_100g:10,fat_100g:0.1},serving_quantity:250,uk});
const catalogue=[P('5000000000011','Apple Juice','Tropicana',46,true),P('5000000000028','Apple Pie','Mr Kipling',370,true),P('3000000000017','Apple Crumble','Bonne Maman',260,false),P('3000000000024','Chausson aux pommes','U',251,false),P('5000436589457','Greek Style Yogurt 0% Fat','Tesco',57,true)];
const tok=t=>String(t).toLowerCase().replace(/[^a-z0-9%]+/g,' ').trim().split(' ').filter(Boolean);
globalThis.fetch=async(url,init={})=>{url=String(url);const h=init.headers||{},j=(s,o)=>new Response(JSON.stringify(o),{status:s,headers:{'content-type':'application/json'}});
  if(url===SB+'/auth/v1/user')return /^Bearer ey/.test(h.Authorization||'')?j(200,{id:OWNER}):j(401,{});
  const u=new URL(url);off.asked.push(url);if(off.down)throw new TypeError('fetch failed');
  if(u.host==='search.openfoodfacts.org'){const q=u.searchParams.get('q'),uk=q.includes('countries:"en:united-kingdom"'),terms=tok(q.replace(' countries:"en:united-kingdom"',''));
    const hits=catalogue.filter(p=>(!uk||p.uk)&&terms.every(t=>tok(p.product_name+' '+p.brands[0]).includes(t))).map(({uk,...p})=>p);return j(200,{hits})}
  if(u.host==='world.openfoodfacts.org'&&u.pathname.startsWith('/api/v2/product/')){const code=u.pathname.split('/').pop().replace('.json',''),p=catalogue.find(x=>x.code===code);return p?j(200,{status:1,product:p}):j(404,{status:0})}
  if(u.host==='world.openfoodfacts.org')return j(200,{products:[]});
  return realFetch(url,init)};
await import('../../supabase/functions/food-search/index.ts');

const server=await startServer();
const browser=await chromium.launch(process.env.PLANLY_CHROMIUM?{executablePath:process.env.PLANLY_CHROMIUM}:{});
const db=makeDb();db.tables.planly_food_profile=[];db.tables.planly_food_entries=[];db.tables.planly_food_favourites=[];
const {context,errors}=await newPhone(browser,db,OWNER);
// the phone cannot read Open Food Facts directly (as on iPhone)
const direct=[];await context.route(/openfoodfacts\.org/,route=>{direct.push(route.request().url());return route.abort('failed')});
// registered after the harness, so checked first: the app's calls to the function go to the real function code above
const fnCalls=[];
await context.route(SB+'/functions/v1/food-search',async route=>{const req=route.request();
  if(req.method()==='OPTIONS')return route.fulfill({status:200,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'}});
  fnCalls.push({auth:req.headers()['authorization']||'',body:req.postData()});
  const res=await handler(new Request('https://fn.test',{method:req.method(),headers:{authorization:req.headers()['authorization']||'','content-type':'application/json'},body:req.postData()}));
  route.fulfill({status:res.status,headers:{'access-control-allow-origin':'*','content-type':'application/json'},body:await res.text()})});
const page=await openApp(context,errors);
await page.click('.nav button[data-tab="fitness"]');await W(1200);
const list=()=>page.$$eval('.fitResult strong',e=>e.map(x=>x.textContent));

// 1. Suggestions while typing, through the function
await page.click('.fitActions [data-fit="search"]');await W(300);await page.focus('.fitSearchForm input');await page.keyboard.type('apple ju',{delay:40});await W(1200);
let names=await list();
check('suggestions arrive through Planly\'s function although the phone cannot reach Open Food Facts',names[0]==='Apple Juice'&&!names.includes('Chausson aux pommes')&&!names.includes('Apple Pie'),JSON.stringify(names));
const last=fnCalls.at(-1),body=JSON.parse(last?.body||'{}');
check('the app sends only the mode and the search words, with its own sign-in',JSON.stringify(Object.keys(body).sort())==='["mode","q"]'&&body.mode==='suggest'&&body.q==='apple ju'&&/^Bearer ey/.test(last.auth),JSON.stringify(last));
check('the function asks for the finished words too, UK-only and everywhere',['apple','apple ju'].every(q=>off.asked.some(u=>new URL(u).searchParams.get('q')===q))&&off.asked.some(u=>/united-kingdom/.test(u)));
check('the app did not need to ask Open Food Facts directly',direct.length===0,direct.join(' | '));

// 2. Pressing Search: UK products first
fnCalls.length=0;await page.fill('.fitSearchForm input','apple');await page.click('.fitSearchForm button');await W(1500);
names=await list();
check('Search goes through the function and UK products rank first',JSON.parse(fnCalls[0]?.body||'{}').mode==='search'&&names.indexOf('Apple Crumble')>names.indexOf('Apple Juice')&&names.indexOf('Apple Crumble')>names.indexOf('Apple Pie')&&names.includes('Apple Crumble')&&!names.includes('Chausson aux pommes'),JSON.stringify(names));
await page.locator('.fitResult strong',{hasText:/^Apple Juice$/}).click();await W(400);
check('a result opens with its details',(await page.textContent('#fitSheetTitle'))==='Apple Juice'&&/46 kcal|115 kcal/.test(await page.textContent('[data-preview]')),await page.textContent('[data-preview]'));
await page.click('[data-add]');await W(1500);
check('and is saved to the food log',db.tables.planly_food_entries.some(r=>r.name==='Apple Juice'&&r.owner_id===OWNER));

// 3. Barcode typed into the scanner, through the function
fnCalls.length=0;await page.click('.fitActions [data-fit="scan"]');await W(600);await page.fill('input[name="code"]','5000436589457');await page.click('[data-code-form] button');await W(1500);
check('a barcode is looked up through the function',(await page.textContent('#fitSheetTitle'))==='Greek Style Yogurt 0% Fat'&&JSON.parse(fnCalls[0]?.body||'{}').mode==='product'&&direct.length===0,await page.textContent('#fitSheetTitle'));
await page.click('.fitSheetDone');await W(300);

// 4. When Open Food Facts is down, the small print says where it failed
off.down=true;await page.click('.fitActions [data-fit="search"]');await W(300);await page.focus('.fitSearchForm input');await page.keyboard.type('melon',{delay:30});await W(1200);
const note=await page.textContent('.fitSearchList');
check('a failed suggestion names the reason from Planly\'s function and from the direct try',/via Planly: Open Food Facts: could not connect; direct: could not connect/.test(note),note);
off.down=false;await page.click('.fitSheetDone');
check('no page errors',errors.length===0,errors.join(' | '));
console.log(`${pass} passed, ${fail} failed`);await browser.close();server.close();process.exit(fail?1:0);
