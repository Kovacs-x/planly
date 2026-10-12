// Fitness › Food stage 3: barcode scanner. Chromium gets a fake camera that shows a real EAN-13 barcode (drawn here),
// so the bundled ZXing decoder runs end to end. Open Food Facts is answered locally.
// Run: node tests/browser/fitness-scan.test.mjs (see tests/browser/README.md).
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {startServer,chromium,makeDb,newPhone,openApp,OWNER} from './harness.mjs';
let pass=0,fail=0;const check=(n,c,d='')=>{console.log((c?'PASS ':'FAIL ')+n+(c?'':' — '+d));c?pass++:fail++};
const W=ms=>new Promise(r=>setTimeout(r,ms));

// ---- an EAN-13 barcode as a Y4M video (what Chromium's fake camera plays) ----
function ean13Modules(code){
  const L=['0001101','0011001','0010011','0111101','0100011','0110001','0101111','0111011','0110111','0001011'];
  const R=L.map(x=>[...x].map(b=>b==='1'?'0':'1').join('')),G=R.map(x=>[...x].reverse().join(''));
  const parity=['LLLLLL','LLGLGG','LLGGLG','LLGGGL','LGLLGG','LGGLLG','LGGGLL','LGLGLG','LGLGGL','LGGLGL'][+code[0]];
  let m='101';for(let i=1;i<=6;i++)m+=(parity[i-1]==='L'?L:G)[+code[i]];m+='01010';for(let i=7;i<=12;i++)m+=R[+code[i]];return m+'101';
}
function barcodeY4m(code,file){
  const w=640,h=480,mod=4,mods=ean13Modules(code),x0=Math.floor((w-mods.length*mod)/2),y0=140,y1=340;
  const Y=Buffer.alloc(w*h,235),UV=Buffer.alloc(w*h/4,128);
  for(let y=y0;y<y1;y++)for(let i=0;i<mods.length;i++)if(mods[i]==='1')for(let k=0;k<mod;k++)Y[y*w+x0+i*mod+k]=20;
  const frame=Buffer.concat([Buffer.from('FRAME\n'),Y,UV,UV]);
  fs.writeFileSync(file,Buffer.concat([Buffer.from(`YUV4MPEG2 W${w} H${h} F10:1 Ip A1:1 C420jpeg\n`),frame,frame,frame,frame,frame]));
}
const CODE='5000436589457',UNKNOWN='4006381333931',FAVCODE='5449000000996';
const y4m=path.join(os.tmpdir(),'planly-ean13.y4m');barcodeY4m(CODE,y4m);

const server=await startServer();
const browser=await chromium.launch({...(process.env.PLANLY_CHROMIUM?{executablePath:process.env.PLANLY_CHROMIUM}:{}),args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--use-file-for-fake-video-capture='+y4m]});
const db=makeDb();
db.tables.planly_food_profile=[];db.tables.planly_food_entries=[];
db.tables.planly_food_favourites=[{id:'f0000000-0000-4000-8000-0000000000f1',owner_id:OWNER,client_id:'fav1',name:'Cola Zero',brand:'Coca-Cola',barcode:FAVCODE,kcal_100:0.3,protein_100:0,carbs_100:0,fat_100:0,serving_g:330,serving_label:'1 can',use_count:2,cloud_version:1,deleted_at:null}];
const {context,errors}=await newPhone(browser,db,OWNER);
await context.grantPermissions(['camera'],{origin:'http://localhost:8765'});
const off=[];
await context.route('https://world.openfoodfacts.org/**',route=>{const u=route.request().url();off.push(u);
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

// 5. Typing a barcode into Search looks it up
await page.click('.fitActions [data-fit="search"]');await W(300);await page.fill('.fitSearchForm input',CODE);await page.click('.fitSearchForm button');await W(1200);
check('a barcode typed into Search opens the product',/Greek Style Yogurt/.test(await sheetTitle()));
await page.click('.fitSheetDone');
check('no page errors',errors.length===0,errors.join(' | '));
console.log(`${pass} passed, ${fail} failed`);await browser.close();server.close();fs.rmSync(y4m,{force:true});process.exit(fail?1:0);
