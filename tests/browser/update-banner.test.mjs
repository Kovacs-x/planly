// The "Planly update ready" banner: tapping Update while editing shows a warning (no page error) and does not update;
// after editing ends, Update applies the new version. A fake waiting service worker stands in for a real update.
// Run: node tests/browser/update-banner.test.mjs (see tests/browser/README.md).
import {startServer,launchBrowser,makeDb,newPhone,openApp,OWNER} from './harness.mjs';
const server=await startServer();const browser=await launchBrowser();
let pass=0,fail=0;const check=(n,c,d='')=>{console.log((c?'PASS ':'FAIL ')+n+(c?'':' — '+d));c?pass++:fail++};
const W=ms=>new Promise(r=>setTimeout(r,ms));
const db=makeDb();
const {context,errors}=await newPhone(browser,db,OWNER);
// The real registration is kept; only its `waiting` worker is replaced by a fake that records what it is told.
await context.addInitScript(()=>{
  window.__updateMessages=[];
  const fakeWaiting={postMessage:m=>window.__updateMessages.push(m)};
  const proto=window.ServiceWorkerContainer?.prototype;if(!proto)return;const orig=proto.register;
  proto.register=async function(...a){const reg=await orig.apply(this,a);
    return new Proxy(reg,{get(t,k){if(k==='waiting')return fakeWaiting;const v=Reflect.get(t,k);return typeof v==='function'?v.bind(t):v}})};
});
const page=await openApp(context,errors);
let shown=false;for(let i=0;i<20&&!shown;i++){await W(300);shown=await page.evaluate(()=>!!document.querySelector('.planlyUpdatePrompt'))}
check('the update banner appears when an update is waiting',shown);
check('the banner shows no explanation line',await page.evaluate(()=>!document.querySelector('.planlyUpdatePrompt span')));

// 1. Update while editing: a warning, no error, no update
await page.evaluate(()=>document.getElementById('addBtn').click());await W(700);
check('a sheet is open (editing)',await page.evaluate(()=>document.documentElement.classList.contains('sheetOpen')||!!document.querySelector('.sheetWrap.open')));
const e0=errors.length;
await page.evaluate(()=>document.querySelector('.planlyUpdatePrompt [data-update-now]').click());await W(300);
const warn=await page.evaluate(()=>document.querySelector('.planlyUpdatePrompt [data-update-warn]')?.textContent||'');
check('tapping Update while editing shows the warning',warn==='Finish or close what you are editing, then update.',warn);
check('and causes no page error',errors.length===e0,errors.slice(e0).join(' | '));
check('and does not apply the update',await page.evaluate(()=>window.__updateMessages.length===0));
await page.evaluate(()=>document.querySelector('.planlyUpdatePrompt [data-update-now]').click());await W(200);
check('tapping again while editing keeps one warning',await page.evaluate(()=>document.querySelectorAll('.planlyUpdatePrompt [data-update-warn]').length===1&&window.__updateMessages.length===0));

// 2. After editing ends, Update works
// close the sheet the way a person does: tap the dimmed backdrop
await page.evaluate(()=>{document.activeElement?.blur?.();document.getElementById('sheetWrap').click()});await W(600);
const stillEditing=await page.evaluate(()=>document.documentElement.classList.contains('sheetOpen')||!!document.querySelector('.sheetWrap.open,.projectsWrap.open,.taskActionWrap.open,.timelineWrap.open'));
check('the sheet is closed',!stillEditing);
await page.evaluate(()=>document.querySelector('.planlyUpdatePrompt [data-update-now]').click());await W(300);
const msgs=await page.evaluate(()=>window.__updateMessages);
check('after editing ends, Update applies the new version',msgs.length===1&&msgs[0]?.type==='SKIP_WAITING',JSON.stringify(msgs));
check('the warning is cleared',await page.evaluate(()=>!document.querySelector('.planlyUpdatePrompt [data-update-warn]')));
check('no page errors',errors.length===0,errors.join(' | '));
console.log(`${pass} passed, ${fail} failed`);await browser.close();server.close();process.exit(fail?1:0);
