// Closing the add-task sheet by swiping down: a downward swipe that starts anywhere on the sheet closes it when the form
// is scrolled to the top (not only on the small grab strip); when the form is scrolled down, a downward swipe scrolls it
// instead. The blurred backdrop is switched off while dragging and while the sheet slides away, so dragging stays smooth
// and no blur is left behind; a short drag springs back with the blur back on. Opening the sheet again straight after a
// swipe-close keeps it open; taps, typing, chips and sideways swipes inside the sheet work and do not drag it; the form
// still scrolls both ways; and the same holds in dark mode and with reduced motion.
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
const top1=await page.evaluate(()=>document.querySelector('#sheetWrap .sheet').scrollTop);
check('when the form is scrolled down, swiping down scrolls it up instead of closing',s.open&&!s.dragging&&top0>0&&top1<top0-40,JSON.stringify({s,top0,top1}));
await swipe(p.x,p.y+120,p.y-120,8,16);await W(500);
const top2=await page.evaluate(()=>document.querySelector('#sheetWrap .sheet').scrollTop);
check('…and swiping up scrolls it down (the form scrolls normally)',top2>top1+40&&(await state()).open,JSON.stringify({top1,top2}));
await page.evaluate(()=>{document.getElementById('testSpacer')?.remove();document.querySelector('#sheetWrap .sheet').scrollTop=0});await W(100);
await page.keyboard.press('Escape');await page.evaluate(()=>{if(document.getElementById('sheetWrap').classList.contains('open'))(document.getElementById('cancelBtn')||document.querySelector('#closeSheet'))?.click()});await W(400);
// the grab strip still works
await open();p=await point('#sheetDragZone');
await swipe(p.x,p.y,p.y+300,10,16);await W(500);s=await state();
check('a swipe on the grab strip still closes it',!s.open,JSON.stringify(s));

// Reopening straight after a swipe-close: the old slide-away timer must not close the new sheet
const tap=async(x,y)=>{await touch('touchStart',x,y);await W(30);await touch('touchEnd',x,y)};
const swipeCloseThenReopen=async()=>{await open();p=await point('#taskPriority');await swipe(p.x,p.y-60,p.y+260,8,10);await page.evaluate(()=>document.getElementById('addBtn').click());await W(600);return state()};
s=await swipeCloseThenReopen();
check('opening the sheet again straight after a swipe-close keeps it open (well past the slide-away time)',s.open&&!s.closing&&!s.dragging&&/blur/.test(s.blur),JSON.stringify(s));
await page.evaluate(()=>document.getElementById('taskTitle').focus());await page.keyboard.type('After reopen');
check('…and it can be typed in',await page.evaluate(()=>document.getElementById('taskTitle').value)==='After reopen');
await page.keyboard.press('Escape');await W(400);

// Taps, typing and chips inside the sheet work and do not start a drag
await open();
p=await point('#taskTitle');await tap(p.x,p.y);await page.keyboard.type('Buy milk');
p=await page.evaluate(()=>{const m=document.querySelector('#taskMoreOptions summary');const r=m.getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)}});await tap(p.x,p.y);await W(300);
await page.evaluate(()=>document.getElementById('taskNotes').scrollIntoView({block:'center'}));await W(200);
p=await point('#taskNotes');await tap(p.x,p.y);await W(100);await page.keyboard.type('Semi-skimmed');
s=await state();
const typed=await page.evaluate(()=>({title:document.getElementById('taskTitle').value,notes:document.getElementById('taskNotes').value,notesShown:!!document.getElementById('taskNotes').offsetParent}));
check('tapping and typing in the title and notes works, without starting a drag',s.open&&!s.dragging&&typed.title==='Buy milk'&&typed.notes==='Semi-skimmed',JSON.stringify({s,typed}));
await page.evaluate(()=>document.querySelector('#sheetWrap .sheet').scrollTop=0);await W(100);
const chipAt=t=>page.evaluate(t=>{const b=[...document.querySelectorAll('#quickDates .chip')].find(x=>x.textContent.trim()===t);const r=b.getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)}},t);
p=await chipAt('Tomorrow');await tap(p.x,p.y);await W(250);
check('tapping a date chip selects it',await page.evaluate(()=>document.querySelector('#quickDates .chip.active')?.textContent.trim())==='Tomorrow');
const seg=await page.evaluate(()=>{const b=[...document.querySelectorAll('#taskVisibilitySegments button')].find(x=>!x.disabled&&!x.classList.contains('active'))||document.querySelector('#taskVisibilitySegments button');const r=b.getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2),label:b.textContent.trim()}});
await tap(seg.x,seg.y);await W(250);
check('tapping a sharing choice selects it',await page.evaluate(()=>document.querySelector('#taskVisibilitySegments button.active')?.textContent.trim())===seg.label,seg.label);
const slide=async(x0,y0,x1,y1,steps=8)=>{await touch('touchStart',x0,y0);for(let i=1;i<=steps;i++){await touch('touchMove',x0+(x1-x0)*i/steps,y0+(y1-y0)*i/steps);await W(16)}await touch('touchEnd',x1,y1)};
p=await chipAt('Today');const sideMid=page.evaluate(()=>new Promise(r=>setTimeout(()=>r(document.getElementById('sheetWrap').classList.contains('dragging')),70)));
await slide(p.x+130,p.y,p.x-130,p.y+40);const sideDragged=await sideMid;await W(400);s=await state();
check('a sideways swipe across the chip rows (slightly downward) does not drag or close the sheet',s.open&&!s.dragging&&!sideDragged&&await page.evaluate(()=>document.querySelector('.sheet').style.transform==='')&&await page.evaluate(()=>document.getElementById('taskTitle').value)==='Buy milk',JSON.stringify({s,sideDragged}));
await page.keyboard.press('Escape');await W(400);

// Dark mode: blur off while dragging, the sheet closes cleanly, and opens again with its blur
await page.emulateMedia({colorScheme:'dark'});await page.evaluate(()=>document.documentElement.dataset.theme='dark');await W(200);
await open();p=await point('#taskPriority');
const darkMid=await swipe(p.x,p.y-60,p.y+260,12,16,state);await W(500);const darkClosed=await state();
await open();const darkReopen=await state();
check('dark mode: blur off while dragging, closes cleanly, reopens with its blur',darkMid?.dragging&&darkMid.blur==='none'&&!darkClosed.open&&!darkClosed.closing&&darkReopen.open&&/blur/.test(darkReopen.blur),JSON.stringify({darkMid,darkClosed,darkReopen}));
await page.keyboard.press('Escape');await W(400);
await page.emulateMedia({colorScheme:'light'});await page.evaluate(()=>delete document.documentElement.dataset.theme);

// Reduced motion: a swipe closes without a delayed close, and an immediate reopen stays open with no gesture left over
await page.emulateMedia({reducedMotion:'reduce'});
await open();p=await point('#taskPriority');await swipe(p.x,p.y-60,p.y+260,8,10);await W(60);const rmClosed=await state();
s=await swipeCloseThenReopen();
check('reduced motion: the swipe closes straight away, and reopening straight after stays open with nothing left over',!rmClosed.open&&!rmClosed.closing&&s.open&&!s.closing&&!s.dragging&&await page.evaluate(()=>document.querySelector('.sheet').style.transform===''),JSON.stringify({rmClosed,s}));
await page.keyboard.press('Escape');await W(300);await page.emulateMedia({reducedMotion:'no-preference'});
check('no page errors',errors.length===0,errors.slice(0,3).join(' | '));
console.log(`${pass} passed, ${fail} failed`);await browser.close();server.close();process.exit(fail?1:0);
