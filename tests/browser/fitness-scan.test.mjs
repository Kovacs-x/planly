// Fitness › Food stage 3: barcode scanner. Chromium gets a fake camera that shows a real EAN-13 barcode (drawn here),
// so the bundled ZXing decoder runs end to end. Open Food Facts is answered locally.
// Run: node tests/browser/fitness-scan.test.mjs (see tests/browser/README.md).
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {startServer,chromium,makeDb,newPhone,openApp,OWNER} from './harness.mjs';
import {ean13Modules,writeY4m} from './barcodes.mjs';
let pass=0,fail=0;const check=(n,c,d='')=>{console.log((c?'PASS ':'FAIL ')+n+(c?'':' — '+d));c?pass++:fail++};
const W=ms=>new Promise(r=>setTimeout(r,ms));

const CODE='5000436589457',UNKNOWN='4006381333931',FAVCODE='5449000000996',UPCE='04252614',UPCE_AS_A='042100005264';
const y4m=path.join(os.tmpdir(),'planly-ean13.y4m');writeY4m(ean13Modules(CODE),y4m);

const server=await startServer();
const browser=await chromium.launch({...(process.env.PLANLY_CHROMIUM?{executablePath:process.env.PLANLY_CHROMIUM}:{}),args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--use-file-for-fake-video-capture='+y4m]});
const db=makeDb();
db.tables.planly_food_profile=[];db.tables.planly_food_entries=[];
db.tables.planly_food_favourites=[{id:'f0000000-0000-4000-8000-0000000000f1',owner_id:OWNER,client_id:'fav1',name:'Cola Zero',brand:'Coca-Cola',barcode:FAVCODE,kcal_100:0.3,protein_100:0,carbs_100:0,fat_100:0,serving_g:330,serving_label:'1 can',use_count:2,cloud_version:1,deleted_at:null}];
const {context,errors}=await newPhone(browser,db,OWNER);
await context.grantPermissions(['camera'],{origin:'http://localhost:8765'});
const off=[];
await context.route('https://world.openfoodfacts.org/**',route=>{const u=route.request().url();off.push(u);
  if(u.includes('/api/v2/product/'+UPCE_AS_A+'.json'))return route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({status:1,code:UPCE_AS_A,product:{code:UPCE_AS_A,product_name:'Small Gum',brands:'Test',serving_quantity:3,nutriments:{'energy-kcal_100g':200,proteins_100g:0,carbohydrates_100g:60,fat_100g:0}}})});
  if(u.includes('/api/v2/product/'+CODE+'.json'))return route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({status:1,code:CODE,product:{code:CODE,product_name:'Greek Style Yogurt 0% Fat',brands:'Tesco',serving_quantity:150,serving_size:'1 pot (150 g)',nutriments:{'energy-kcal_100g':57,proteins_100g:10.2,carbohydrates_100g:4,fat_100g:0.2}}})});
  return route.fulfill({status:404,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({status:0,status_verbose:'product not found'})})});
// record every camera stream so the test can check it was switched off
await context.addInitScript(()=>{const md=navigator.mediaDevices;if(!md)return;const orig=md.getUserMedia.bind(md);window.__streams=[];md.getUserMedia=async c=>{const s=await orig(c);window.__streams.push(s);return s}});
const page=await openApp(context,errors);
const live=()=>page.evaluate(()=>(window.__streams||[]).flatMap(s=>s.getTracks()).filter(t=>t.readyState==='live').length);
const sheetTitle=()=>page.evaluate(()=>document.querySelector('#fitSheetTitle')?.textContent||'');
await page.click('.nav button[data-tab="fitness"]');await W(1200);

// 1. Scan a real barcode through the camera
check('Scan is the main action',await page.evaluate(()=>document.querySelector('.fitActions .fitPrimary')?.dataset.fit)==='scan');
await page.click('.fitActions [data-fit="scan"]');
let t='';for(let i=0;i<40&&!/Greek Style Yogurt/.test(t);i++){await W(500);t=await sheetTitle()}
check('the camera barcode is read and the product opens',/Greek Style Yogurt 0% Fat/.test(t),t+' | '+(await page.evaluate(()=>document.querySelector('.fitScanStatus')?.textContent)));
check('the bundled scanner was used (no other site)',await page.evaluate(()=>!!window.ZXing?.MultiFormatReader&&[...document.scripts].some(s=>s.src.endsWith('/v2/vendor/zxing-library-0.23.0.min.js'))));
check('the camera is switched off once the barcode is found',(await live())===0,String(await live()));
check('only the barcode number goes to Open Food Facts',off.length===1&&new URL(off[0]).pathname==='/api/v2/product/'+CODE+'.json'&&!off[0].includes(OWNER),off.join(' | '));
check('a product with a pot size starts at 1 pot',(await page.textContent('[data-preview]')).includes('86 kcal'));
await page.click('[data-meal-pick="lunch"]');await page.click('[data-add]');await W(1500);
const e=db.tables.planly_food_entries.find(r=>r.barcode===CODE);
check('the food is saved with its barcode',e&&e.source==='barcode'&&e.kcal===85.5&&e.meal==='lunch'&&e.owner_id===OWNER,JSON.stringify(e));

// 2. Closing the scanner turns the camera off
await page.click('.fitActions [data-fit="scan"]');let before=0;for(let i=0;i<50&&!before;i++){await W(40);before=await live()}await page.click('.fitSheetDone');await W(400);
check('closing the scanner turns the camera off',before>=1&&(await live())===0,before+' → '+(await live()));

// 3. Type a barcode that is not in Open Food Facts
await page.evaluate(()=>{navigator.mediaDevices.getUserMedia=()=>Promise.reject(new DOMException('denied','NotAllowedError'))});
await page.click('.fitActions [data-fit="scan"]');await W(600);
check('camera refused: says how to allow it, typing still works',/Allow it in Settings/.test(await page.textContent('.fitScanStatus')));
off.length=0;await page.fill('input[name="code"]','4006381333932');await page.click('[data-code-form] button');await W(300);
check('a mistyped barcode is caught before any lookup',/isn't valid/.test(await page.textContent('.fitScanStatus'))&&off.length===0);
await page.fill('input[name="code"]',UNKNOWN);await page.click('[data-code-form] button');await W(1200);
check('an unknown barcode says so and offers other ways',/not in Open Food Facts yet/.test(await page.textContent('.fitScanStatus'))&&await page.locator('[data-miss] button').count()===3);
await page.click('[data-miss] [data-quick]');await W(300);
check('Quick add opens from there',(await sheetTitle())==='Quick add');
await page.click('.fitSheetDone');await W(300);

// 4. A saved favourite works offline
db.offline=true;await context.setOffline(true);off.length=0;
await page.click('.fitActions [data-fit="scan"]');await W(500);await page.fill('input[name="code"]',FAVCODE);await page.click('[data-code-form] button');await W(800);
check('a barcode saved in favourites opens offline, with no lookup',(await sheetTitle())==='Cola Zero'&&off.length===0,await sheetTitle());
await page.click('.fitSheetDone');db.offline=false;await context.setOffline(false);await W(300);

// 4b. A short UPC-E code is checked as UPC-E and looked up under its full UPC-A number
await page.click('.fitActions [data-fit="scan"]');await W(500);off.length=0;await page.fill('input[name="code"]','04252615');await page.click('[data-code-form] button');await W(300);
check('a UPC-E with a wrong check digit is caught',/isn't valid/.test(await page.textContent('.fitScanStatus'))&&off.length===0);
await page.fill('input[name="code"]',UPCE);await page.click('[data-code-form] button');await W(1200);
check('a valid UPC-E is looked up as its UPC-A number',(await sheetTitle())==='Small Gum'&&new URL(off[0]||'http://x').pathname==='/api/v2/product/'+UPCE_AS_A+'.json',off.join(' | '));
await page.click('[data-add]');await W(1200);
check('and saved with the full number',db.tables.planly_food_entries.some(r=>r.name==='Small Gum'&&r.barcode===UPCE_AS_A));
// 5. Typing a barcode into Search looks it up
await page.click('.fitActions [data-fit="search"]');await W(300);await page.fill('.fitSearchForm input',CODE);await page.click('.fitSearchForm button');await W(1200);
check('a barcode typed into Search opens the product',/Greek Style Yogurt/.test(await sheetTitle()));
await page.click('.fitSheetDone');
check('no page errors',errors.length===0,errors.join(' | '));
// 6. Android path: the built-in BarcodeDetector reports a UPC-E; it is validated as UPC-E and looked up as UPC-A.
// (A stand-in detector: headless Chromium on Linux has no built-in reader, and ZXing's UPC-E reader is off.)
{const db2=makeDb();db2.tables.planly_food_entries=[];db2.tables.planly_food_favourites=[];const p2=await newPhone(browser,db2,OWNER);
 await p2.context.grantPermissions(['camera'],{origin:'http://localhost:8765'});
 const off2=[];await p2.context.route('https://world.openfoodfacts.org/**',route=>{off2.push(route.request().url());const ok=route.request().url().includes('/api/v2/product/'+UPCE_AS_A+'.json');
  route.fulfill({status:ok?200:404,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(ok?{status:1,product:{code:UPCE_AS_A,product_name:'Small Gum',brands:'Test',nutriments:{'energy-kcal_100g':200}}}:{status:0})})});
 await p2.context.addInitScript(()=>{window.BarcodeDetector=class{static async getSupportedFormats(){return ['ean_13','ean_8','upc_a','upc_e']}constructor(o){this.formats=o.formats}async detect(){return this.formats.includes('upc_e')?[{rawValue:'04252614',format:'upc_e'}]:[]}}});
 const pg=await openApp(p2.context,p2.errors);await pg.click('.nav button[data-tab="fitness"]');await W(1000);await pg.click('.fitActions [data-fit="scan"]');
 let t2='';for(let i=0;i<20&&t2!=='Small Gum';i++){await W(400);t2=await pg.evaluate(()=>document.querySelector('#fitSheetTitle')?.textContent||'')}
 check('Android: a UPC-E from the built-in reader opens the product',t2==='Small Gum'&&off2.length===1&&off2[0].includes('/'+UPCE_AS_A+'.json'),t2+' | '+off2.join(' | '));
 check('Android: ZXing is not loaded when the built-in reader works',await pg.evaluate(()=>!window.ZXing));
 check('Android path: no page errors',p2.errors.length===0,p2.errors.join(' | '));await p2.context.close()}
console.log(`${pass} passed, ${fail} failed`);await browser.close();server.close();fs.rmSync(y4m,{force:true});process.exit(fail?1:0);
