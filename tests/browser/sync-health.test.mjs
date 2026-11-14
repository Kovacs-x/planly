// The header chip says "Not syncing" when Planly's server refuses or fails its data requests while the phone is online
// (as on 7–14 Nov 2026, when every request got 401 and the chip still said "Synced"). Three failures in a row turn it on;
// the next request that works turns it off. A single failed request does not. Offline still says "Offline". Tapping
// "Not syncing" explains it in one line.
// Run: node tests/browser/sync-health.test.mjs (see tests/browser/README.md).
import {startServer,launchBrowser,makeDb,newPhone,openApp,OWNER} from './harness.mjs';
const server=await startServer();const browser=await launchBrowser();
let pass=0,fail=0;const check=(n,c,d='')=>{console.log((c?'PASS ':'FAIL ')+n+(c?'':' — '+d));c?pass++:fail++};
const W=ms=>new Promise(r=>setTimeout(r,ms));
const chip=page=>page.evaluate(()=>{const c=document.getElementById('planlySyncChip');return {text:c?.querySelector('.syncChipText')?.textContent||'',trouble:!!c?.classList.contains('trouble'),role:c?.getAttribute('role')||''}});
const nav=(page,s)=>page.evaluate(s=>document.querySelector(`.nav button[data-section="${s}"]`)?.click(),s);
const toast=page=>page.evaluate(()=>document.getElementById('planlyToast')?.textContent||'');

const db=makeDb();const {context,errors}=await newPhone(browser,db,OWNER);const page=await openApp(context,errors);
let c=await chip(page);
check('a working server: Synced',c.text==='Synced'&&!c.trouble,JSON.stringify(c));

// one failed request on its own does not change the chip
let once=true;db.fail=()=>{if(once){once=false;return [500,{message:'boom'}]}return null};
await nav(page,'budget');await W(1500);await nav(page,'today');await W(1500);
c=await chip(page);
check('a single failed request: still Synced',c.text==='Synced'&&!c.trouble,JSON.stringify(c));

// the server refuses everything (expired keys / 401), while the phone is online
db.fail=()=>[401,{code:'PGRST301',message:'JWT invalid'}];
await page.reload();await W(4000);
c=await chip(page);
check('server refusing every request: Not syncing, in red',c.text.startsWith('Not syncing')&&c.trouble,JSON.stringify(c));
await page.evaluate(()=>document.getElementById('planlySyncChip')?.click());await W(400);
check('…tapping it says why in one line',/can’t reach its server/.test(await toast(page)),await toast(page));

// the server works again: Planly asks again by itself every 20 seconds, so the chip clears without doing anything
db.fail=null;await W(22000);
c=await chip(page);
check('server back: Synced again within 20 seconds, on its own',c.text==='Synced'&&!c.trouble,JSON.stringify(c));
// …and tapping the chip asks straight away
db.fail=()=>[401,{message:'JWT invalid'}];await page.reload();await W(4000);
check('(refusing again)',(await chip(page)).trouble);
db.fail=null;await page.evaluate(()=>document.getElementById('planlySyncChip')?.click());await W(1500);
check('server back, chip tapped: Synced straight away',(await chip(page)).text==='Synced');

// offline wins over "Not syncing"
db.fail=()=>[503,{message:'down'}];await page.reload();await W(4000);
check('server errors (5xx) also show Not syncing',(await chip(page)).text.startsWith('Not syncing'));
await context.setOffline(true);await page.evaluate(()=>window.dispatchEvent(new Event('offline')));await W(500);
c=await chip(page);
check('offline: says Offline, not Not syncing',c.text.startsWith('Offline')&&!c.trouble,JSON.stringify(c));
await context.setOffline(false);db.fail=null;await page.evaluate(()=>window.dispatchEvent(new Event('online')));await W(2500);
await nav(page,'budget');await W(2000);
check('back online with a working server: Synced',(await chip(page)).text==='Synced');

check('no page errors',errors.length===0,errors.slice(0,3).join(' | '));
console.log(`${pass} passed, ${fail} failed`);await browser.close();server.close();process.exit(fail?1:0);
