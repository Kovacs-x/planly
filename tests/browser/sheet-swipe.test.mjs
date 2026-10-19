// Closing the add-task sheet by swiping down: a downward swipe that starts anywhere on the sheet closes it when the form
// is scrolled to the top (not only on the small grab strip); when the form is scrolled down, a downward swipe scrolls it
// instead. The blurred backdrop is switched off while dragging and while the sheet slides away, so dragging stays smooth
// and no blur is left behind; a short drag springs back with the blur back on.
// Run: node tests/browser/sheet-swipe.test.mjs (see tests/browser/README.md).
import {startServer,launchBrowser,makeDb,newPhone,openApp,OWNER} from './harness.mjs';
const server=await startServer();const browser=await launchBrowser();
let pass=0,fail=0;const check=(n,c,d='')=>{console.log((c?'PASS ':'FAIL ')+n+(c?'':' — '+d));c?pass++:fail++};
const W=ms=>new Promise(r=>setTimeout(r,ms));
const db=makeDb();
const {context,errors}=await newPhone(browser,db,OWNER);const page=await openApp(context,errors);
const cdp=await context.newCDPSession(page);
const touch=(type,x,y)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'?[]:[{x,y}]});
const swipe=async(x,y0,y1,steps=10,stepMs=16,probe=null)=>{let seen=null;await touch('touchStart',x,y0);for(let i=1;i<=steps;i++){await touch('touchMove',x,y0+(y1-y0)*i/steps);await W(stepMs);if(i===Math.ceil(steps/2)&&probe)seen=await probe()}await touch('touchEnd',x,y1);return seen};
const open=async()=>{await page.evaluate(()=>document.getElementById('addBtn').click());await W(700)};
const state=()=>page.evaluate(()=>{const w=document.getElementById('sheetWrap');return {open:w.classList.contains('open'),dragging:w.classList.contains('dragging'),closing:w.classList.contains('closing'),blur:getComputedStyle(w).backdropFilter||getComputedStyle(w).webkitBackdropFilter||''}});
const point=sel=>page.evaluate(sel=>{const r=document.querySelector(sel).getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)}},sel);

await open();let s=await state();
check('the sheet opens with its blurred backdrop',s.open&&/blur/.test(s.blur),JSON.stringify(s));
// swipe down from the middle of the form (the Priority label), not the grab strip
let p=await point('#taskPriority');
const mid=await swipe(p.x,p.y-60,p.y+260,12,16,state);
check('while dragging, the backdrop blur is off (smooth dragging)',mid&&mid.dragging&&mid.blur==='none',JSON.stringify(mid));
await W(500);s=await state();
check('a downward swipe from the middle of the sheet closes it',!s.open,JSON.stringify(s));
check('…and leaves no blur or closing state behind',!s.closing&&!s.dragging,JSON.stringify(s));
// a short drag springs back, blur back on
await open();p=await point('#taskPriority');
await swipe(p.x,p.y-40,p.y-10,4,16);await W(400);s=await state();
check('a short drag springs back and the blur comes back',s.open&&!s.dragging&&/blur/.test(s.blur),JSON.stringify(s));
// form scrolled down: a downward swipe scrolls the form instead of closing
// (make the form taller than the sheet, as it is with More options open on a phone)
await page.evaluate(()=>{const sh=document.querySelector('#sheetWrap .sheet');if(!sh.querySelector('#testSpacer'))sh.insertAdjacentHTML('beforeend','<div id="testSpacer" style="height:900px"></div>');sh.scrollTop=300});await W(200);
const top0=await page.evaluate(()=>document.querySelector('#sheetWrap .sheet').scrollTop);
p=await point('#sheetWrap .sheet');
await swipe(p.x,p.y-100,p.y+80,8,16);await W(500);s=await state();
check('when the form is scrolled down, swiping down scrolls it instead of closing',s.open&&top0>0,JSON.stringify({s,top0}));
await page.evaluate(()=>{document.getElementById('testSpacer')?.remove();document.querySelector('#sheetWrap .sheet').scrollTop=0});await W(100);
await page.keyboard.press('Escape');await page.evaluate(()=>{if(document.getElementById('sheetWrap').classList.contains('open'))(document.getElementById('cancelBtn')||document.querySelector('#closeSheet'))?.click()});await W(400);
// the grab strip still works
await open();p=await point('#sheetDragZone');
await swipe(p.x,p.y,p.y+300,10,16);await W(500);s=await state();
check('a swipe on the grab strip still closes it',!s.open,JSON.stringify(s));
check('no page errors',errors.length===0,errors.slice(0,3).join(' | '));
console.log(`${pass} passed, ${fail} failed`);await browser.close();server.close();process.exit(fail?1:0);
