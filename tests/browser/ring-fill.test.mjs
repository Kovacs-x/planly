// Today's ring moves: ticking a task fills it smoothly from where it was to the new % (the number counts up with it);
// ticking the last one fills it to the end first, and only then it turns green with 🎉 and the confetti; unticking runs it
// back down smoothly; a redraw part way through carries on; with reduced motion it just jumps; at 0% there is no dot.
// Run: node tests/browser/ring-fill.test.mjs (see tests/browser/README.md).
import {startServer,launchBrowser,makeDb,newPhone,openApp,OWNER} from './harness.mjs';
const server=await startServer();const browser=await launchBrowser();
let pass=0,fail=0;const check=(n,c,d='')=>{console.log((c?'PASS ':'FAIL ')+n+(c?'':' — '+d));c?pass++:fail++};
const W=ms=>new Promise(r=>setTimeout(r,ms));
const key=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
const today=key(new Date());
const T=(id,c)=>({owner_id:OWNER,client_id:id,data:{id,title:'Task '+id,date:today,time:'',category:'Personal',durationMinutes:30,priority:'normal',completed:c,recurrence:'none',reminder:'none',notes:'',subtasks:[],createdAt:1,updatedAt:1,visibility:'private',householdId:null,assigneeId:null},visibility:'private',household_id:null,assignee_id:null,completed_by:null,completed_at:c?new Date().toISOString():null,cloud_version:1,deleted_at:null,task_date:today});
const db=makeDb();db.tables.planly_tasks.push(T('a',true),T('b',true),T('c',false),T('d',false),T('e',false));
const {context,errors}=await newPhone(browser,db,OWNER);const page=await openApp(context,errors);
await page.evaluate(()=>document.querySelector('.nav button[data-section="today"]').click());await W(1500);
// tick a task, then watch the ring for a second
const tickAndWatch=id=>page.evaluate(async id=>{document.querySelector(`[data-id="${id}"] [data-action="toggle"]`)?.click();const out=[];const t0=performance.now();
  while(performance.now()-t0<1100){const c=document.querySelector('.todayDashboard .dashCard'),f=c?.querySelector('.dashRingFill');if(f)out.push({v:Math.round(parseFloat(getComputedStyle(f).strokeDasharray)),text:c.querySelector('.dashRingText').textContent,filling:c.classList.contains('ringFilling'),green:getComputedStyle(f).stroke==='rgb(47, 191, 113)',confetti:(()=>{const x=c.querySelector('.dashConfetti');return !!x&&getComputedStyle(x).display!=='none'})()});await new Promise(r=>setTimeout(r,40))}
  return out},id);
const smooth=(s,from,to)=>{const vs=s.map(x=>x.v),mids=new Set(vs.filter(v=>v>Math.min(from,to)+2&&v<Math.max(from,to)-2));let mono=true;for(let i=1;i<vs.length;i++)if(to>from?vs[i]<vs[i-1]-1:vs[i]>vs[i-1]+1)mono=false;return mids.size>=3&&mono&&Math.abs(vs.at(-1)-to)<=1};
let s=await tickAndWatch('c');
check('ticking a task fills the ring smoothly from 40% to 60% (not a jump)',smooth(s,88,132),JSON.stringify(s.map(x=>x.v)));
const texts=[...new Set(s.map(x=>x.text))];
check('…the number counts up with it and ends on 60%',texts.length>=3&&texts.at(-1)==='60%'&&texts.every(t=>/^\d+%$/.test(t)),JSON.stringify(texts));
await W(500);s=await tickAndWatch('d');
check('the next tick carries on from 60% to 80%',smooth(s,132,176),JSON.stringify(s.map(x=>x.v)));
await W(500);s=await tickAndWatch('e');
check('ticking the last one fills the ring smoothly to the end',smooth(s,176,220),JSON.stringify(s.map(x=>x.v)));
const during=s.filter(x=>x.filling),after=s.at(-1);
check('…while it fills there is no green, no 🎉 and no confetti yet',during.length>=3&&during.every(x=>!x.green&&x.text!=='🎉'&&!x.confetti),JSON.stringify(during.slice(0,4)));
check('…and once it gets there it turns green with 🎉 and the confetti',!after.filling&&after.text==='🎉'&&after.confetti&&await page.evaluate(()=>document.querySelector('.todayDashboard .dashCard').classList.contains('celebrate')),JSON.stringify(after));
await W(600);s=await tickAndWatch('e');
check('unticking runs the ring back down smoothly to 80%',smooth(s,220,176)&&s.at(-1).text==='80%',JSON.stringify(s.map(x=>x.v)));
// a redraw in the middle of a fill carries on from where the ring got to
await W(600);
s=await page.evaluate(async()=>{const ring=()=>parseFloat(getComputedStyle(document.querySelector('.todayDashboard .dashRingFill')).strokeDasharray);
  document.querySelector('[data-id="e"] [data-action="toggle"]')?.click();await new Promise(r=>setTimeout(r,220));
  const old=document.querySelector('.todayDashboard .dashRingFill'),mid=ring();window.dispatchEvent(new CustomEvent('planly:budget-today-bills-refreshed'));
  const redrawn=document.querySelector('.todayDashboard .dashRingFill')!==old,after=ring();
  await new Promise(r=>setTimeout(r,1200));return {mid,redrawn,after,end:ring()}});
check('a redraw part way through does not jump back or skip ahead',s.redrawn&&s.mid>178&&s.mid<218&&Math.abs(s.after-s.mid)<=3&&Math.round(s.end)===220,JSON.stringify(s));
// reduced motion: no fill, it is just there
await page.emulateMedia({reducedMotion:'reduce'});await W(300);
await W(1000);
s=await page.evaluate(async()=>{const before=parseFloat(getComputedStyle(document.querySelector('.todayDashboard .dashRingFill')).strokeDasharray);document.querySelector('[data-id="d"] [data-action="toggle"]')?.click();await new Promise(r=>setTimeout(r,60));const c=document.querySelector('.todayDashboard .dashCard');return {before,v:parseFloat(getComputedStyle(c.querySelector('.dashRingFill')).strokeDasharray),filling:c.classList.contains('ringFilling'),text:c.querySelector('.dashRingText').textContent}});
check('with reduced motion the ring just moves, with no fill',!s.filling&&Math.round(s.v)!==Math.round(s.before)&&/^\d+%$|🎉/.test(s.text),JSON.stringify(s));
// nothing for today: the ring is empty, with no dot from the rounded line end (Today and Home)
{const e=await newPhone(browser,makeDb(),OWNER);const p=await openApp(e.context,e.errors);
  await p.evaluate(()=>document.querySelector('.nav button[data-section="today"]').click());await W(1500);
  const t=await p.evaluate(()=>{const f=document.querySelector('.todayDashboard .dashRingFill');return f?getComputedStyle(f).strokeOpacity:null});
  await p.evaluate(()=>document.querySelector('.nav button[data-section="home"]').click());await W(1800);
  const h=await p.evaluate(()=>{const f=document.querySelector('#view .homeChoreCard .dashRingFill');return f?{pct:f.getAttribute('stroke-dasharray'),op:getComputedStyle(f).strokeOpacity}:null});
  check('at 0% the ring shows no dot (Today and Home)',t==='0'&&(!h||!h.pct.startsWith('0 ')||h.op==='0'),JSON.stringify({t,h}));errors.push(...e.errors);await e.context.close()}
check('no page errors',errors.length===0,errors.slice(0,3).join(' | '));
console.log(`${pass} passed, ${fail} failed`);await browser.close();server.close();process.exit(fail?1:0);
