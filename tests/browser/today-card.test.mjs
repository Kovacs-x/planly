// Today's summary card: a progress ring with the percentage done, what is left, and open / overdue / done counts. When
// everything for today is ticked it turns green with 🎉 and "All done for today!", and a short confetti burst plays once a
// day (not with reduced motion); the separate "All done" line is not shown twice.
// Run: node tests/browser/today-card.test.mjs (see tests/browser/README.md).
import {startServer,launchBrowser,makeDb,newPhone,openApp,OWNER} from './harness.mjs';
const server=await startServer();const browser=await launchBrowser();
let pass=0,fail=0;const check=(n,c,d='')=>{console.log((c?'PASS ':'FAIL ')+n+(c?'':' — '+d));c?pass++:fail++};
const W=ms=>new Promise(r=>setTimeout(r,ms));
const key=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
const today=key(new Date()),yesterday=key(new Date(Date.now()-864e5));
const T=(id,title,c,more={})=>({owner_id:OWNER,client_id:id,data:{id,title,date:today,time:'',category:'Personal',durationMinutes:30,priority:'normal',completed:c,recurrence:'none',reminder:'none',notes:'',subtasks:[],createdAt:1,updatedAt:Date.now(),visibility:'private',householdId:null,assigneeId:null,...more},visibility:'private',household_id:null,assignee_id:null,completed_by:null,completed_at:c?new Date().toISOString():null,cloud_version:1,deleted_at:null,task_date:more.date||today});
const db=makeDb();
db.tables.planly_tasks.push(T('a','Ring mum',true),T('b','Gym',true),T('c','Dentist',false,{time:'18:00',durationMinutes:90}),T('d','Shop',false),T('e','Bins',false),T('late','Return book',false,{date:yesterday}));
const {context,errors}=await newPhone(browser,db,OWNER);const page=await openApp(context,errors);
const card=()=>page.evaluate(()=>{const c=document.querySelector('.todayDashboard .dashCard');return c?{text:c.innerText.replace(/\s+/g,' ').trim(),pct:c.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow'),done:c.classList.contains('allDone'),celebrate:c.classList.contains('celebrate'),confetti:c.querySelectorAll('.dashConfetti i').length,confettiShown:(()=>{const x=c.querySelector('.dashConfetti');return !!x&&getComputedStyle(x).display!=='none'})(),statusDone:!!document.querySelector('.dayStatus.doneStatus')}:null});
await page.evaluate(()=>document.querySelector('.nav button[data-section="today"]').click());await W(1500);
let c=await card();
check('the card shows a ring with 40% done and 3 left today',c&&c.pct==='40'&&/40%/.test(c.text)&&/3 left today/.test(c.text),JSON.stringify(c));
check('…with 2 of 5 done, the time scheduled, and open / overdue / done counts',/2 of 5 done · 1h 30m scheduled/.test(c.text)&&/📋 3 open/.test(c.text)&&/⏰ 1 overdue/.test(c.text)&&/🎉 2 done/.test(c.text),c.text);
check('…and keeps Timeline and Suggest',await page.evaluate(()=>!!document.getElementById('timelineBtn')&&!!document.getElementById('suggestBtn')));
// tick the rest (and the overdue one)
for(const id of ['c','d','e','late']){await page.evaluate(id=>document.querySelector(`[data-id="${id}"] [data-action="toggle"]`)?.click(),id);await W(600)}
await W(1500);c=await card();
check('when everything is ticked the card turns green with 🎉 and "All done for today!"',c.done&&c.pct==='100'&&/🎉/.test(c.text)&&/All done for today!/.test(c.text)&&/5 of 5 done · nice work/.test(c.text),JSON.stringify(c));
check('…a confetti burst plays',c.celebrate&&c.confetti===6&&c.confettiShown,JSON.stringify(c));
check('…and the separate "All done" line is not shown as well',!c.statusDone,JSON.stringify(c));
await W(4500);await page.evaluate(()=>document.querySelector('.nav button[data-section="plan"]').click());await W(600);await page.evaluate(()=>document.querySelector('.nav button[data-section="today"]').click());await W(1200);c=await card();
check('the confetti plays only once a day',c.done&&!c.celebrate&&c.confetti===0,JSON.stringify(c));
await page.emulateMedia({reducedMotion:'reduce'});await page.evaluate(()=>localStorage.removeItem('planly-celebrated-v1'));
await page.evaluate(()=>document.querySelector('.nav button[data-section="plan"]').click());await W(600);await page.evaluate(()=>document.querySelector('.nav button[data-section="today"]').click());await W(1200);c=await card();
check('with reduced motion there is no confetti',c.done&&!c.confettiShown,JSON.stringify(c));
check('no page errors',errors.length===0,errors.slice(0,3).join(' | '));
console.log(`${pass} passed, ${fail} failed`);await browser.close();server.close();process.exit(fail?1:0);
