// Fitness › Apple Health (fake body-import function). The connection lives in Settings › Fitness, not on Body: when the
// function can't be reached it says so; not linked shows "Connect Apple Health", which makes an import key and shows it
// once with the address, each with a Copy button; linked shows "Connected" with the last import time and what has come
// in; New import key and Disconnect work, even with no weigh-ins yet. Imported readings show on Body as body fat, fat mass
// and lean mass tiles (numbers and trends only) and as "Apple Health" in the history.
// Run: node tests/browser/fitness-apple-health.test.mjs (see tests/browser/README.md).
import {startServer,launchBrowser,makeDb,newPhone,openApp,OWNER} from './harness.mjs';
const server=await startServer();const browser=await launchBrowser();
let pass=0,fail=0;const check=(n,c,d='')=>{console.log((c?'PASS ':'FAIL ')+n+(c?'':' — '+d));c?pass++:fail++};
const W=ms=>new Promise(r=>setTimeout(r,ms));
const ago=d=>new Date(Date.now()-d*864e5).toISOString(),now=new Date().toISOString();
const mk=({rows=true}={})=>{const db=makeDb();db.tables.planly_food_entries=[];db.tables.planly_food_favourites=[];db.tables.planly_food_profile=[];
  let n=0;const R=(d,kg,more={})=>({id:'c0000000-0000-4000-8000-0000000000'+String(++n).padStart(2,'0'),owner_id:OWNER,client_id:'ah-'+n,measured_at:ago(d),weight_kg:kg,source:'apple_health',external_id:'ah-'+n,client_created_at:1,client_updated_at:1,cloud_version:1,created_at:now,updated_at:now,deleted_at:null,extra:{},...more});
  db.tables.planly_body_weights=rows?[R(9,83,{fat_ratio_pct:22,fat_free_mass_kg:64.7}),R(5,82.8,{fat_ratio_pct:21.7,fat_free_mass_kg:64.8}),R(1,82.5,{fat_ratio_pct:21.4,fat_free_mass_kg:64.9})]:[];
  return db};
const fakeLink=async(context,calls,start=false)=>{let linked=start;await context.route('**/functions/v1/body-import',async r=>{const b=JSON.parse(r.request().postData()||'{}');calls.push({...b,auth:!!r.request().headers()['authorization']});
  const ok=o=>r.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(o)});
  if(b.action==='status')return ok({linked,lastUsedAt:linked?now:null});
  if(b.action==='create-key'){linked=true;return ok({key:'pk_'+'A'.repeat(43),url:'https://sb.test/functions/v1/body-import'})}
  if(b.action==='remove-key'){linked=false;return ok({linked:false})}
  return ok({})})};
const body=async page=>{await page.evaluate(()=>document.querySelector('.nav button[data-tab="fitness"]').click());await W(1500);await page.evaluate(()=>document.querySelector('[data-fit="section"][data-section="body"]')?.click());await W(1200)};
const settings=async page=>{await page.evaluate(()=>document.querySelector('#profileToggle')?.click());await W(800);await page.evaluate(()=>document.querySelector('[data-settings-page="fitness"]')?.click());await W(1800)};
const panel=page=>page.evaluate(()=>document.getElementById('planlyFitnessSettings')?.innerText.replace(/\s+/g,' ').trim()||'');
const tap=(page,sel)=>page.evaluate(s=>document.querySelector(s)?.click(),sel);

// the link can't be reached
{const db=mk();const {context,errors}=await newPhone(browser,db,OWNER);const page=await openApp(context,errors);await body(page);
 check('Body has no Apple Health bar any more',await page.evaluate(()=>!document.querySelector('.fitScaleBar,.fitScaleConnect')&&!!document.querySelector('.fitWeightCard')));
 await settings(page);
 check('Settings has a Fitness page, which says when Apple Health can’t be reached',/can’t be reached/.test(await panel(page)),await panel(page));
 check('…with no page errors',errors.length===0,errors.join(' | '));await context.close()}

// connect, readings, disconnect
{const db=mk();const {context,errors}=await newPhone(browser,db,OWNER);const calls=[];await fakeLink(context,calls);
 const page=await openApp(context,errors);page.on('dialog',d=>d.accept());await settings(page);
 check('not linked: a "Connect Apple Health" button',await page.evaluate(()=>/Connect Apple Health/.test(document.querySelector('#planlyFitnessSettings [data-scale="connect"]')?.textContent||'')));
 await tap(page,'#planlyFitnessSettings [data-scale="connect"]');await W(900);
 const sheet=await page.evaluate(()=>({key:document.querySelector('.fitSheet [data-key]')?.value,url:document.querySelector('.fitSheet [data-url]')?.value,copies:document.querySelectorAll('.fitSheet [data-copy]').length}));
 check('Connect makes an import key and shows it once with the address, each with Copy',calls.some(c=>c.action==='create-key'&&c.auth)&&sheet.key==='pk_'+'A'.repeat(43)&&sheet.url==='https://sb.test/functions/v1/body-import'&&sheet.copies===2,JSON.stringify(sheet));
 await tap(page,'.fitSheet .fitSheetDone');await W(500);
 check('linked: "Connected"',/^Connected/.test(await panel(page)),await panel(page));
 await page.reload();await W(2500);await settings(page);
 const t=await panel(page);
 check('…after a reload: the last import time and what has come in (weight, body fat, lean mass)',/Last import Today \d\d:\d\d/.test(t)&&/Weight ✓ Body fat ✓ Lean mass ✓/.test(t),t);
 await body(page);
 const tiles=await page.evaluate(()=>[...document.querySelectorAll('.fitMetric')].map(x=>x.innerText.replace(/\s+/g,' ').trim()));
 check('readings show as body fat, fat mass and lean mass tiles, numbers and trends only',tiles.length===3&&/^Body fat.*21\.4 %.*↓ 0\.6/.test(tiles[0])&&/^Fat mass.*17\.7 kg/.test(tiles[1])&&/^Lean mass.*64\.9 kg.*↑ 0\.2/.test(tiles[2])&&!/Healthy|Normal|Good/.test(tiles.join(' ')),JSON.stringify(tiles));
 check('…and as "Apple Health" in the history',await page.evaluate(()=>/Apple Health/.test(document.querySelector('.fitHistoryCard .fitDayRow small')?.textContent||'')));
 await settings(page);await tap(page,'#planlyFitnessSettings [data-scale="off"]');await W(1500);
 check('Disconnect removes the key and shows Connect again',calls.some(c=>c.action==='remove-key')&&/Connect Apple Health/.test(await panel(page)));
 check('no page errors',errors.length===0,errors.slice(0,3).join(' | '));await context.close()}

// no weigh-ins yet: the connection is still there to manage
{const db=mk({rows:false});const {context,errors}=await newPhone(browser,db,OWNER);const calls=[];await fakeLink(context,calls);
 const page=await openApp(context,errors);page.on('dialog',d=>d.accept());await settings(page);
 await tap(page,'#planlyFitnessSettings [data-scale="connect"]');await W(900);await tap(page,'.fitSheet .fitSheetDone');await W(500);
 await page.reload();await W(2500);await settings(page);
 check('no weigh-ins yet: after connecting and a reload, Connected (nothing received yet) with New import key and Disconnect',/^Connected.*Weight – Body fat – Lean mass –/.test(await panel(page))&&await page.evaluate(()=>!!document.querySelector('#planlyFitnessSettings [data-scale="new"]')&&!!document.querySelector('#planlyFitnessSettings [data-scale="off"]')),await panel(page));
 await tap(page,'#planlyFitnessSettings [data-scale="new"]');await W(900);
 check('…New import key makes and shows a new key',calls.filter(c=>c.action==='create-key').length===2&&await page.evaluate(()=>document.querySelector('.fitSheet [data-key]')?.value==='pk_'+'A'.repeat(43)));
 await tap(page,'.fitSheet .fitSheetDone');await W(500);await tap(page,'#planlyFitnessSettings [data-scale="off"]');await W(1500);
 check('…and Disconnect removes it',calls.some(c=>c.action==='remove-key')&&/Connect Apple Health/.test(await panel(page)));
 check('…with no page errors',errors.length===0,errors.slice(0,3).join(' | '));await context.close()}

console.log(`${pass} passed, ${fail} failed`);await browser.close();server.close();process.exit(fail?1:0);
