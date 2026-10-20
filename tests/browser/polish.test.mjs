// Smaller fixes: typing in Settings (a calendar name) survives leaving the app and coming back; the task actions sheet
// keeps the page behind in place, has no double blur, swipes down to close (no blur while dragging) and returns the
// page to where it was; a double tap on "Create invitation link" or "Create household" sends one request.
// Run: node tests/browser/polish.test.mjs (see tests/browser/README.md).
import {startServer,launchBrowser,makeDb,newPhone,openApp,OWNER} from './harness.mjs';
const server=await startServer();const browser=await launchBrowser();
let pass=0,fail=0;const check=(n,c,d='')=>{console.log((c?'PASS ':'FAIL ')+n+(c?'':' — '+d));c?pass++:fail++};
const W=ms=>new Promise(r=>setTimeout(r,ms));
const day=new Date().toISOString().slice(0,10);
const T=n=>({owner_id:OWNER,client_id:'t'+n,data:{id:'t'+n,title:'Task '+n,date:day,time:'',category:'Personal',durationMinutes:30,priority:'normal',completed:false,recurrence:'none',reminder:'none',notes:'',subtasks:[],createdAt:1,updatedAt:1,visibility:'private',projectId:''},visibility:'private',cloud_version:1,deleted_at:null,task_date:day});
const db=makeDb();for(let i=1;i<=16;i++)db.tables.planly_tasks.push(T(i));
db.delays.planly_create_household_invite=900;
const {context,errors}=await newPhone(browser,db,OWNER);const page=await openApp(context,errors);
const dialogs=[];page.on('dialog',x=>{dialogs.push(x.message());x.accept()});
const cdp=await context.newCDPSession(page);
const touch=(type,x,y)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'?[]:[{x,y}]});
const comeBack=()=>page.evaluate(async()=>{const set=v=>Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>v});set('hidden');document.dispatchEvent(new Event('visibilitychange'));await new Promise(r=>setTimeout(r,300));set('visible');document.dispatchEvent(new Event('visibilitychange'));window.dispatchEvent(new Event('focus'));window.dispatchEvent(new Event('pageshow'));delete document.visibilityState});

// Task actions sheet
await page.evaluate(()=>window.scrollTo(0,500));await W(300);
const y0=await page.evaluate(()=>Math.round(scrollY));
await page.evaluate(()=>{const b=[...document.querySelectorAll('.task [data-action="actions"]')].find(x=>{const r=x.getBoundingClientRect();return r.top>80&&r.bottom<innerHeight-100});b?.click()});await W(500);
let st=await page.evaluate(()=>({open:document.getElementById('taskActionWrap').classList.contains('open'),locked:document.body.classList.contains('sheetOpen'),backdropBlur:getComputedStyle(document.querySelector('.taskActionBackdrop')).backdropFilter}));
check('opening the task actions keeps the page behind in place (locked, no scrolling behind)',st.open&&st.locked,JSON.stringify(st));
check('…with a single blur (the backdrop layer adds none)',st.backdropBlur==='none'||st.backdropBlur==='',JSON.stringify(st));
const g=await page.evaluate(()=>{const r=document.querySelector('.taskActionSheet').getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+40)}});
await touch('touchStart',g.x,g.y);let mid=null;for(let i=1;i<=10;i++){await touch('touchMove',g.x,g.y+i*25);await W(16);if(i===5)mid=await page.evaluate(()=>({dragging:document.getElementById('taskActionWrap').classList.contains('dragging'),blur:getComputedStyle(document.getElementById('taskActionWrap')).backdropFilter}))}
await touch('touchEnd',g.x,g.y+250);await W(500);
check('…while dragging it down the blur is off',mid?.dragging&&mid.blur==='none',JSON.stringify(mid));
st=await page.evaluate(()=>({open:document.getElementById('taskActionWrap').classList.contains('open'),locked:document.body.classList.contains('sheetOpen'),y:Math.round(scrollY)}));
check('…a swipe down closes it and the page is back where it was',!st.open&&!st.locked&&Math.abs(st.y-y0)<=2&&y0>100,JSON.stringify({st,y0}));
// open again and a short drag springs back
await page.evaluate(()=>{const b=[...document.querySelectorAll('.task [data-action="actions"]')].find(x=>{const r=x.getBoundingClientRect();return r.top>80&&r.bottom<innerHeight-100});b?.click()});await W(500);
await touch('touchStart',g.x,g.y);for(let i=1;i<=3;i++){await touch('touchMove',g.x,g.y+i*15);await W(16)}await touch('touchEnd',g.x,g.y+45);await W(400);
st=await page.evaluate(()=>({open:document.getElementById('taskActionWrap').classList.contains('open'),t:document.querySelector('.taskActionSheet').style.transform}));
check('…a short drag springs back and stays open',st.open&&!st.t,JSON.stringify(st));
await page.evaluate(()=>document.getElementById('taskActionClose').click());await W(400);
check('…closing with × also unlocks the page',await page.evaluate(()=>!document.body.classList.contains('sheetOpen')&&!document.body.style.top));

// Settings typing survives coming back to the app
await page.evaluate(()=>document.getElementById('profileToggle')?.click());await W(500);await page.evaluate(()=>document.querySelector('[data-profile-settings]')?.click());await W(1200);
await page.evaluate(()=>document.querySelector('[data-settings-page="calendars"]')?.click());await W(800);
const hasCal=await page.evaluate(()=>{const d=document.getElementById('addCalendarDetails');if(!d)return false;d.open=true;return true});
if(hasCal){await page.locator('#planlyCalendarName').tap();await page.keyboard.type('Work rota')}
await comeBack();await W(500);await page.evaluate(()=>window.dispatchEvent(new CustomEvent('planly:foreground-resume')));await W(2500);
const cal=await page.evaluate(()=>({v:document.getElementById('planlyCalendarName')?.value,open:document.getElementById('addCalendarDetails')?.open}));
check('Settings: a calendar name typed survives leaving the app and coming back (section stays open)',hasCal&&cal.v==='Work rota'&&cal.open===true,JSON.stringify({hasCal,cal}));

// Double tap on "Create invitation link"
await page.evaluate(()=>document.getElementById('profileToggle')?.click());await W(500);await page.evaluate(()=>document.querySelector('[data-profile-household]')?.click());await W(1500);
await page.evaluate(()=>document.querySelectorAll('#view details').forEach(d=>d.open=true));await W(200);
const before=db.log.filter(l=>l.rpc==='planly_create_household_invite').length;
await page.evaluate(()=>{const i=document.getElementById('planlyHouseholdInviteEmail');if(i){i.value='laki@example.com';i.dispatchEvent(new Event('input',{bubbles:true}))}});
const tapped=await page.evaluate(()=>{const b=document.getElementById('planlyCreateHouseholdInviteBtn');if(!b)return false;b.click();b.click();return true});
await W(2500);
const sent=db.log.filter(l=>l.rpc==='planly_create_household_invite').length-before;
check('a double tap on "Create invitation link" sends one request',tapped&&sent===1,JSON.stringify({tapped,sent,dialogs}));

// Double tap on "Create household" (a phone with no household yet)
const db2=makeDb();db2.tables.planly_household_members=[];db2.tables.planly_households=[];db2.delays.planly_create_household=900;
const p2=await newPhone(browser,db2,OWNER);const page2=await openApp(p2.context,p2.errors);page2.on('dialog',x=>x.accept());
await page2.evaluate(()=>document.getElementById('profileToggle')?.click());await W(500);await page2.evaluate(()=>document.querySelector('[data-profile-household]')?.click());await W(1500);
await page2.evaluate(()=>document.querySelectorAll('#view details').forEach(d=>d.open=true));await W(200);
await page2.evaluate(()=>{const i=document.getElementById('planlyHouseholdName');if(i){i.value='Home';i.dispatchEvent(new Event('input',{bubbles:true}))}});
const hhTapped=await page2.evaluate(()=>{const b=document.getElementById('planlyCreateHouseholdBtn');if(!b)return false;b.click();b.click();return true});
await W(2500);
const hhSent=db2.log.filter(l=>l.rpc==='planly_create_household').length;
check('a double tap on "Create household" sends one request',hhTapped&&hhSent===1,JSON.stringify({hhTapped,hhSent}));
errors.push(...p2.errors);

check('no page errors',errors.length===0,errors.slice(0,3).join(' | '));
console.log(`\n${pass} passed, ${fail} failed`);await browser.close();server.close();process.exit(fail?1:0);
