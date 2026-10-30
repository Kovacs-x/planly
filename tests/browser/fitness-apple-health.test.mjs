// Fitness › Body with a scale through Apple Health (fake body-import function). Before the function exists nothing
// about it shows; not linked shows "Connect Apple Health", which makes an import key and shows it once with the
// address, each with a Copy button; linked shows "Apple Health connected" with the last import time; readings that came
// in show as tiles (body fat, lean mass; numbers and trends only) and as "Apple Health" in Recent; Disconnect removes
// the key and shows Connect again.
// Run: node tests/browser/fitness-apple-health.test.mjs (see tests/browser/README.md).
import {startServer,launchBrowser,makeDb,newPhone,openApp,OWNER} from './harness.mjs';
const server=await startServer();const browser=await launchBrowser();
let pass=0,fail=0;const check=(n,c,d='')=>{console.log((c?'PASS ':'FAIL ')+n+(c?'':' — '+d));c?pass++:fail++};
const W=ms=>new Promise(r=>setTimeout(r,ms));
const ago=d=>new Date(Date.now()-d*864e5).toISOString(),now=new Date().toISOString();
const mk=()=>{const db=makeDb();db.tables.planly_food_entries=[];db.tables.planly_food_favourites=[];db.tables.planly_food_profile=[];
  let n=0;const R=(d,kg,more={})=>({id:'c0000000-0000-4000-8000-0000000000'+String(++n).padStart(2,'0'),owner_id:OWNER,client_id:'ah-'+n,measured_at:ago(d),weight_kg:kg,source:'apple_health',external_id:'ah-'+n,client_created_at:1,client_updated_at:1,cloud_version:1,created_at:now,updated_at:now,deleted_at:null,extra:{},...more});
  db.tables.planly_body_weights=[R(9,83,{fat_ratio_pct:22,fat_free_mass_kg:64.7}),R(5,82.8,{fat_ratio_pct:21.7,fat_free_mass_kg:64.8}),R(1,82.5,{fat_ratio_pct:21.4,fat_free_mass_kg:64.9})];
  return db};
const body=async page=>{await page.evaluate(()=>document.querySelector('.nav button[data-tab="fitness"]').click());await W(1500);await page.evaluate(()=>document.querySelector('[data-fit="section"][data-section="body"]')?.click());await W(1500)};
{const db=mk();const {context,errors}=await newPhone(browser,db,OWNER);const page=await openApp(context,errors);await body(page);
 check('before the import function exists, nothing about it shows',await page.evaluate(()=>!document.querySelector('.fitScaleBar,.fitScaleConnect')));
 check('…and Body still works with no page errors',await page.evaluate(()=>!!document.querySelector('.fitWeightCard'))&&errors.length===0,errors.join(' | '));await context.close()}
const db=mk();const {context,errors}=await newPhone(browser,db,OWNER);
let linked=false;const calls=[];
await context.route('**/functions/v1/body-import',async r=>{const b=JSON.parse(r.request().postData()||'{}');calls.push({...b,auth:!!r.request().headers()['authorization']});
  const ok=o=>r.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(o)});
  if(b.action==='status')return ok({linked,lastUsedAt:linked?now:null});
  if(b.action==='create-key'){linked=true;return ok({key:'pk_'+'A'.repeat(43),url:'https://sb.test/functions/v1/body-import'})}
  if(b.action==='remove-key'){linked=false;return ok({linked:false})}
  return ok({})});
const page=await openApp(context,errors);page.on('dialog',d=>d.accept());await body(page);
check('not linked: a "Connect Apple Health" button',await page.evaluate(()=>/Connect Apple Health/.test(document.querySelector('.fitScaleConnect')?.textContent||'')));
await page.evaluate(()=>document.querySelector('.fitScaleConnect').click());await W(800);
const sheet=await page.evaluate(()=>({title:document.getElementById('fitSheetTitle')?.textContent,key:document.querySelector('.fitSheet [data-key]')?.value,url:document.querySelector('.fitSheet [data-url]')?.value,copies:document.querySelectorAll('.fitSheet [data-copy]').length}));
check('Connect makes an import key and shows it once with the address, each with Copy',calls.some(c=>c.action==='create-key'&&c.auth)&&sheet.key==='pk_'+'A'.repeat(43)&&sheet.url==='https://sb.test/functions/v1/body-import'&&sheet.copies===2,JSON.stringify(sheet));
await page.evaluate(()=>document.querySelector('.fitSheet .fitSheetDone').click());await W(500);
check('linked: "Apple Health connected"',await page.evaluate(()=>/Apple Health connected/.test(document.querySelector('.fitScaleBar')?.textContent||'')));
await page.reload();await W(2500);await body(page);
{const bar=await page.evaluate(()=>document.querySelector('.fitScaleBar')?.textContent.replace(/\s+/g,' ').trim()||'');check('…and once the Shortcut has sent readings, the last import time',/Apple Health connected ?· last import \d\d:\d\d/.test(bar),bar)}
const tiles=await page.evaluate(()=>[...document.querySelectorAll('.fitMetric')].map(x=>x.innerText.replace(/\s+/g,' ').trim()));
check('readings show as body fat and lean mass tiles, numbers and trends only',tiles.length===2&&/^Body fat.*21\.4 %.*↓ 0\.3/.test(tiles[0])&&/^Lean mass.*64\.9 kg.*↑ 0\.1/.test(tiles[1])&&!/Healthy|Normal|Good/.test(tiles.join(' ')),JSON.stringify(tiles));
check('…and as "Apple Health" in Recent',await page.evaluate(()=>/Apple Health/.test(document.querySelector('.fitWeighIn small')?.textContent||'')));
await page.evaluate(()=>document.querySelector('.fitScaleBar').click());await W(400);await page.evaluate(()=>document.querySelector('.fitSheet [data-off]').click());await W(1500);
check('Disconnect removes the key and shows Connect again',calls.some(c=>c.action==='remove-key')&&await page.evaluate(()=>!!document.querySelector('.fitScaleConnect')&&!document.querySelector('.fitScaleBar')));
check('no page errors',errors.length===0,errors.slice(0,3).join(' | '));
console.log(`${pass} passed, ${fail} failed`);await browser.close();server.close();process.exit(fail?1:0);
