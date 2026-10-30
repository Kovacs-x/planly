// Fitness › Body with a Withings scale (fake withings function). Before the function exists nothing scale-related
// shows; not linked shows "Connect Withings scale", which asks the function for the sign-in address and goes there;
// coming back with ?code&state hands them to the function at once, cleans the address and opens Body with "Scale
// connected"; scale readings show as tiles grouped Body composition / Heart (numbers and trends only, no health labels),
// only for readings the scale sent; a tile opens its chart and history; Manage → Disconnect asks the function and shows
// Connect again.
// Run: node tests/browser/fitness-scale.test.mjs (see tests/browser/README.md).
import {startServer,launchBrowser,makeDb,newPhone,openApp,OWNER} from './harness.mjs';
const server=await startServer();const browser=await launchBrowser();
let pass=0,fail=0;const check=(n,c,d='')=>{console.log((c?'PASS ':'FAIL ')+n+(c?'':' — '+d));c?pass++:fail++};
const W=ms=>new Promise(r=>setTimeout(r,ms));
const ago=d=>new Date(Date.now()-d*864e5).toISOString(),now=new Date().toISOString();
const mk=()=>{const db=makeDb();db.tables.planly_food_entries=[];db.tables.planly_food_favourites=[];db.tables.planly_food_profile=[];
  let n=0;const R=(d,kg,more={})=>({id:'c0000000-0000-4000-8000-0000000000'+String(++n).padStart(2,'0'),owner_id:OWNER,client_id:'w'+n,measured_at:ago(d),weight_kg:kg,source:'withings',external_id:'g'+n,client_created_at:1,client_updated_at:1,cloud_version:1,created_at:now,updated_at:now,deleted_at:null,extra:{},...more});
  db.tables.planly_body_weights=[R(9,83,{fat_ratio_pct:22,muscle_mass_kg:61,hydration_kg:45.6,heart_rate_bpm:66}),R(5,82.8,{fat_ratio_pct:21.7,muscle_mass_kg:61.1,hydration_kg:45.5,heart_rate_bpm:65}),R(1,82.5,{fat_ratio_pct:21.4,muscle_mass_kg:61.2,hydration_kg:45.4,heart_rate_bpm:64,fat_mass_kg:17.6,fat_free_mass_kg:64.9})];
  return db};
const body=async page=>{await page.evaluate(()=>document.querySelector('.nav button[data-tab="fitness"]').click());await W(1500);await page.evaluate(()=>document.querySelector('[data-fit="section"][data-section="body"]')?.click());await W(1500)};

// 1) the function is not deployed yet
{const db=mk();const {context,errors}=await newPhone(browser,db,OWNER);const page=await openApp(context,errors);await body(page);
 check('before the scale function exists, nothing scale-related shows',await page.evaluate(()=>!document.querySelector('.fitScaleBar,.fitScaleConnect')));
 check('…and Body still works with no page errors',await page.evaluate(()=>!!document.querySelector('.fitWeightCard'))&&errors.length===0,errors.join(' | '));await context.close()}

// 2) connect, come back, tiles, disconnect
const db=mk();const {context,errors}=await newPhone(browser,db,OWNER);
let linked=false;const calls=[];
await context.route('**/functions/v1/withings',async r=>{const b=JSON.parse(r.request().postData()||'{}');calls.push({...b,auth:!!r.request().headers()['authorization']});
  const ok=o=>r.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(o)});
  if(b.action==='status')return ok({linked,lastSync:linked?now:null});
  if(b.action==='sync')return ok({linked,saved:0});
  if(b.action==='start')return ok({url:'https://account.withings.com/oauth2_user/authorize2?client_id=cid&state=pw.test'});
  if(b.action==='exchange'){linked=b.code==='abc'&&b.state==='pw.signed.state';return ok({linked,imported:3})}
  if(b.action==='disconnect'){linked=false;return ok({linked:false})}
  return ok({})});
await context.route('https://account.withings.com/**',r=>r.fulfill({status:200,contentType:'text/html',body:'<title>Withings sign-in</title>'}));
let page=await openApp(context,errors);await body(page);
check('not linked: a "Connect Withings scale" button',await page.evaluate(()=>/Connect Withings scale/.test(document.querySelector('.fitScaleConnect')?.textContent||'')));
check('…and readings already saved show as tiles even before linking',await page.evaluate(()=>document.querySelectorAll('.fitMetric').length>0));
await page.evaluate(()=>document.querySelector('.fitScaleConnect').click());await page.waitForURL(/account\.withings\.com/,{timeout:8000}).catch(()=>{});
check('Connect asks the function for the sign-in and goes to Withings',/account\.withings\.com\/oauth2_user\/authorize2/.test(page.url())&&calls.some(c=>c.action==='start'&&c.auth),page.url());
// coming back from Withings
await page.goto(`http://localhost:8765/v2/?code=abc&state=pw.signed.state`);await W(4500);
const back=await page.evaluate(()=>({url:location.href,active:document.querySelector('.nav button.active')?.dataset.tab,section:document.querySelector('.fitSegments .active')?.textContent.trim(),bar:document.querySelector('.fitScaleBar')?.textContent.replace(/\s+/g,' ').trim()||''}));
check('coming back hands the code and signed state to the function',calls.some(c=>c.action==='exchange'&&c.code==='abc'&&c.state==='pw.signed.state'),JSON.stringify(calls.filter(c=>c.action==='exchange')));
check('…removes them from the address and opens Fitness › Body with "Scale connected"',!/code=|state=/.test(back.url)&&back.active==='fitness'&&back.section==='Body'&&/Scale connected/.test(back.bar),JSON.stringify(back));
const tiles=await page.evaluate(()=>({groups:[...document.querySelectorAll('.fitGroupHead .fitBodyLabel')].map(x=>x.textContent),tiles:[...document.querySelectorAll('.fitMetric')].map(x=>x.innerText.replace(/\s+/g,' ').trim())}));
check('readings show as tiles grouped Body composition / Heart, only for readings sent',JSON.stringify(tiles.groups)===JSON.stringify(['Body composition','Heart','History'].slice(0,2))&&tiles.tiles.length===4,JSON.stringify(tiles));
const fat=tiles.tiles.find(t=>/^Body fat/.test(t)),water=tiles.tiles.find(t=>/^Water/.test(t)),heart=tiles.tiles.find(t=>/^Heart rate/.test(t));
check('…with the latest value and change since last time (body fat 21.4 % ↓ 0.3; water as % of weight; heart 64 bpm ↓ 1)',/21\.4 %/.test(fat)&&/↓ 0\.3/.test(fat)&&/55\.0 %/.test(water)&&/64 bpm/.test(heart)&&/↓ 1/.test(heart),JSON.stringify(tiles.tiles));
check('…numbers and trends only: no health labels',!/Healthy|Normal|Good/.test(tiles.tiles.join(' ')));
await page.evaluate(()=>document.querySelector('.fitMetric[data-metric="fat"]').click());await W(500);
const det=await page.evaluate(()=>({title:document.getElementById('fitSheetTitle')?.textContent,chart:!!document.querySelector('.fitSheet .fitMetricChart'),rows:document.querySelectorAll('.fitSheet .fitMetricRow').length,hint:document.querySelector('.fitSheet .fitBodyHint')?.textContent||''}));
check('a tile opens its chart and history (body fat with fat and lean mass)',det.title==='Body fat'&&det.chart&&det.rows===3&&/17\.6 kg fat mass · 64\.9 kg lean mass/.test(det.hint),JSON.stringify(det));
await page.evaluate(()=>document.querySelector('.fitSheet [data-fit-close],.fitSheetDone')?.click());await W(400);
page.on('dialog',d=>d.accept());
await page.evaluate(()=>document.querySelector('.fitScaleBar').click());await W(400);await page.evaluate(()=>document.querySelector('.fitSheet [data-off]').click());await W(1500);
check('Manage → Disconnect asks the function and shows Connect again',calls.some(c=>c.action==='disconnect')&&await page.evaluate(()=>!!document.querySelector('.fitScaleConnect')&&!document.querySelector('.fitScaleBar')));
check('no page errors',errors.length===0,errors.slice(0,3).join(' | '));
console.log(`${pass} passed, ${fail} failed`);await browser.close();server.close();process.exit(fail?1:0);
