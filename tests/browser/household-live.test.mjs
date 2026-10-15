// Household live updates (tidy-up 2c part B): the phone joins its household's private realtime channel, a broadcast on it
// brings the other phone's change in straight away, leaving the page closes the channel, and coming back to the app joins
// it again. The realtime websocket is answered by a small fake Phoenix server. Written before part B so that refactor can
// be shown to change nothing.
// Run: node tests/browser/household-live.test.mjs (see tests/browser/README.md).
import {startServer,launchBrowser,makeDb,newPhone,openApp,OWNER,PARTNER,HOUSEHOLD} from './harness.mjs';
const server=await startServer();const browser=await launchBrowser();
let pass=0,fail=0;const check=(n,c,d='')=>{console.log((c?'PASS ':'FAIL ')+n+(c?'':' — '+d));c?pass++:fail++};
const W=ms=>new Promise(r=>setTimeout(r,ms));
const d=new Date(),today=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
const chore=(id,title)=>({owner_id:OWNER,client_id:id,data:{id,title,date:today,time:'',category:'Home',durationMinutes:30,priority:'normal',completed:false,recurrence:'none',reminder:'none',notes:'',subtasks:[],createdAt:1,updatedAt:1,visibility:'household',householdId:HOUSEHOLD,assigneeId:null},visibility:'household',household_id:HOUSEHOLD,assignee_id:null,completed_by:null,completed_at:null,cloud_version:1,deleted_at:null,task_date:today});
const db=makeDb();db.tables.planly_tasks.push(chore('k1','Dishes'));
const TOPIC='realtime:household:'+HOUSEHOLD;
const {context,errors}=await newPhone(browser,db,PARTNER);

// Fake realtime server: records what the phone sends, answers joins and heartbeats, and can push a broadcast.
const sockets=[],sent=[];
const decode=raw=>{try{const m=JSON.parse(String(raw));return Array.isArray(m)?{join_ref:m[0],ref:m[1],topic:m[2],event:m[3],payload:m[4],array:true}:{...m,array:false}}catch{return null}};
const encode=(m,array)=>JSON.stringify(array?[m.join_ref??null,m.ref??null,m.topic,m.event,m.payload]:m);
await context.routeWebSocket(/\/realtime\/v1\/websocket/,ws=>{const conn={ws,array:false,joins:{},closed:false};sockets.push(conn);ws.onClose(()=>{conn.closed=true});
  ws.onMessage(raw=>{const m=decode(raw);if(!m)return;conn.array=m.array;sent.push(m);
    if(m.event==='phx_join'){conn.joins[m.topic]=m.join_ref??m.ref;ws.send(encode({join_ref:m.join_ref,ref:m.ref,topic:m.topic,event:'phx_reply',payload:{status:'ok',response:{postgres_changes:[]}}},m.array))}
    else if(m.event==='heartbeat'||m.event==='phx_leave'||m.event==='access_token')ws.send(encode({join_ref:m.join_ref,ref:m.ref,topic:m.topic,event:'phx_reply',payload:{status:'ok',response:{}}},m.array))})});
const broadcast=()=>{for(const c of sockets){const jr=c.joins[TOPIC];if(jr===undefined||c.closed)continue;try{c.ws.send(encode({join_ref:jr,ref:null,topic:TOPIC,event:'broadcast',payload:{type:'broadcast',event:'tasks_changed',payload:{}}},c.array))}catch{}}};
const joins=()=>sent.filter(m=>m.event==='phx_join'&&m.topic===TOPIC);
const page=await openApp(context,errors);
await page.evaluate(()=>document.querySelector('.nav button[data-section="today"]').click());
for(let i=0;i<30&&!joins().length;i++)await W(300);
const j=joins()[0];
check('the phone joins its household\'s private channel',!!j&&j.payload?.config?.private===true,JSON.stringify(sent.map(m=>m.event+':'+m.topic)));

// The other phone adds a chore. Without a signal nothing reloads; the broadcast brings it in.
const remoteChanges=await page.evaluate(()=>{window.__remote=0;window.addEventListener('planly:household-remote-change',()=>window.__remote++);return true});
db.tables.planly_tasks.push(chore('k2','Bins'));await W(2500);
const before=await page.evaluate(()=>!!document.querySelector('[data-id="k2"]'));
broadcast();
let after=false;for(let i=0;i<20&&!after;i++){await W(300);after=await page.evaluate(()=>!!document.querySelector('[data-id="k2"]'))}
check('a broadcast on the channel signals a household change',remoteChanges&&await page.evaluate(()=>window.__remote)>=1,String(await page.evaluate(()=>window.__remote)));
check('…and the other phone\'s new chore shows straight away',!before&&after,JSON.stringify({before,after}));

// Leaving the page closes the channel; coming back to the app joins it again. (The realtime library also closes its
// connection on pagehide; the app's own leave is what clears its channel so that a return joins again — the last check.)
const n0=sent.length;
// A real return comes seconds after leaving; within the first second the closing connection can swallow a new join.
await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));await W(4000);
const left=sent.slice(n0).some(m=>m.event==='phx_leave'&&m.topic===TOPIC),closed=sockets.filter(c=>c.joins[TOPIC]!==undefined).every(c=>c.closed);
const r0=await page.evaluate(()=>window.__remote);broadcast();await W(1500);const r1=await page.evaluate(()=>window.__remote);
check('leaving the page leaves the channel: no more household changes reach the app',(left||closed)&&r1===r0,JSON.stringify({left,closed,r0,r1,sent:sent.slice(n0).map(m=>m.event+':'+m.topic)}));
const j0=joins().length;
await page.evaluate(()=>{const set=v=>Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>v});set('hidden');document.dispatchEvent(new Event('visibilitychange'));set('visible');document.dispatchEvent(new Event('visibilitychange'));delete document.visibilityState});
for(let i=0;i<20&&joins().length===j0;i++)await W(300);
check('coming back to the app joins the channel again',joins().length>j0,JSON.stringify({before:j0,after:joins().length}));
check('no page errors',errors.length===0,errors.slice(0,3).join(' | '));
console.log(`${pass} passed, ${fail} failed`);await browser.close();server.close();process.exit(fail?1:0);
