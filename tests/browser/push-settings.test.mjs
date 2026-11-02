// Settings › Notifications (fake push RPCs; this phone is already signed up for notifications). With a server that has
// migration 061 it shows "0% deals ending" and "Quiet hours" with From/Until times (starting 22:00 to 07:00); changing
// each one saves it for this phone, the same time can't be picked for both ends, and turning Quiet hours off hides the
// times. With an older server none of these show and saving sends only the older settings. The test message note no
// longer says it takes 5 minutes.
// Run: node tests/browser/push-settings.test.mjs (see tests/browser/README.md).
import {startServer,launchBrowser,makeDb,newPhone,openApp,OWNER} from './harness.mjs';
const server=await startServer();const browser=await launchBrowser();
let pass=0,fail=0;const check=(n,c,d='')=>{console.log((c?'PASS ':'FAIL ')+n+(c?'':' — '+d));c?pass++:fail++};
const W=ms=>new Promise(r=>setTimeout(r,ms));
const fakePush=context=>context.addInitScript(()=>{
  try{Object.defineProperty(Notification,'permission',{get:()=>'granted'})}catch{}
  const sub={endpoint:'https://web.push.apple.com/fake',toJSON(){return {endpoint:this.endpoint,keys:{p256dh:'p'.repeat(87),auth:'a'.repeat(22)}}},unsubscribe:async()=>true};
  if(window.PushManager)PushManager.prototype.getSubscription=async()=>sub});
const mk=(newServer=true)=>{const db=makeDb();
  let prefs={notify_tasks:true,notify_chores:true,notify_summary:true,summary_time:'07:30',...(newServer?{notify_deals:true,quiet_on:true,quiet_start:'22:00',quiet_end:'07:00'}:{})};
  db.saves=[];
  db.rpcHandlers={
    planly_get_push_subscription:()=>[200,prefs],
    planly_save_push_subscription:b=>{db.saves.push(b);
      if(!newServer&&Object.keys(b).some(k=>/quiet|deals/.test(k)))return [404,{code:'PGRST202',message:'Could not find the function'}];
      const n={notify_tasks:b.p_notify_tasks,notify_chores:b.p_notify_chores,notify_summary:b.p_notify_summary,summary_time:b.p_summary_time};
      if(newServer){const qs=b.p_quiet_start??prefs.quiet_start,qe=b.p_quiet_end??prefs.quiet_end;if(qs===qe)return [400,{code:'22023',message:'Quiet hours need different start and end times'}];
        Object.assign(n,{notify_deals:b.p_notify_deals??prefs.notify_deals,quiet_on:b.p_quiet_on??prefs.quiet_on,quiet_start:qs,quiet_end:qe})}
      prefs=n;return [200,prefs]},
    planly_queue_test_push:()=>[200,true]};
  return db};
const open=async page=>{await page.evaluate(()=>document.querySelector('#profileToggle')?.click());await W(800);await page.evaluate(()=>document.querySelector('[data-settings-page="notifications"]')?.click());await W(1800)};
const panel=page=>page.evaluate(()=>document.getElementById('planlyPushPanel')?.innerText.replace(/\s+/g,' ').trim()||'');
const pick=(page,id,v)=>page.evaluate(([id,v])=>{const s=document.getElementById(id);s.value=v;s.dispatchEvent(new Event('change',{bubbles:true}))},[id,v]);
const tick=(page,id)=>page.evaluate(id=>document.getElementById(id)?.click(),id);
const last=db=>db.saves[db.saves.length-1]||{};

{const db=mk();const {context,errors}=await newPhone(browser,db,OWNER);await fakePush(context);const page=await openApp(context,errors);await open(page);
 const t=await panel(page);
 check('shows 0% deals ending and Quiet hours, both on',/0% deals ending/.test(t)&&/Quiet hours/.test(t)&&await page.evaluate(()=>document.getElementById('planlyPushDeals')?.checked&&document.getElementById('planlyPushQuiet')?.checked),t);
 const sel=await page.evaluate(()=>({from:document.getElementById('planlyPushQuietStart')?.value,until:document.getElementById('planlyPushQuietEnd')?.value,n:document.getElementById('planlyPushQuietStart')?.options.length,blocked:[...document.getElementById('planlyPushQuietEnd').options].filter(o=>o.disabled).map(o=>o.value)}));
 check('From 22:00 Until 07:00, every half hour, and Until can’t be 22:00',sel.from==='22:00'&&sel.until==='07:00'&&sel.n===48&&sel.blocked.join()==='22:00',JSON.stringify(sel));
 await pick(page,'planlyPushQuietStart','23:30');await W(900);
 check('changing From saves it for this phone, with everything else kept',last(db).p_quiet_start==='23:30'&&last(db).p_quiet_end==='07:00'&&last(db).p_quiet_on===true&&last(db).p_notify_deals===true&&last(db).p_notify_tasks===true&&last(db).p_endpoint==='https://web.push.apple.com/fake',JSON.stringify(last(db)));
 check('…and the screen shows it',await page.evaluate(()=>document.getElementById('planlyPushQuietStart')?.value==='23:30'&&[...document.getElementById('planlyPushQuietEnd').options].find(o=>o.value==='23:30')?.disabled));
 await pick(page,'planlyPushQuietEnd','06:00');await W(900);
 check('changing Until saves it',last(db).p_quiet_end==='06:00'&&last(db).p_quiet_start==='23:30');
 await tick(page,'planlyPushDeals');await W(900);
 check('turning off 0% deals ending saves it',last(db).p_notify_deals===false&&await page.evaluate(()=>document.getElementById('planlyPushDeals')?.checked===false));
 await tick(page,'planlyPushQuiet');await W(900);
 check('turning Quiet hours off saves it and hides the times',last(db).p_quiet_on===false&&await page.evaluate(()=>!document.getElementById('planlyPushQuietStart')));
 await tick(page,'planlyPushQuiet');await W(900);
 check('turning it back on shows the times as they were',last(db).p_quiet_on===true&&await page.evaluate(()=>document.getElementById('planlyPushQuietStart')?.value==='23:30'&&document.getElementById('planlyPushQuietEnd')?.value==='06:00'));
 await page.evaluate(()=>{const s=document.getElementById('planlyPushQuietStart');s.value='06:00';s.dispatchEvent(new Event('change',{bubbles:true}))});await W(900);
 check('if the same time reaches the server anyway, its message shows and nothing changes',/different start and end/.test(await panel(page))&&await page.evaluate(()=>document.getElementById('planlyPushQuietStart')?.value==='23:30'),await panel(page));
 await tick(page,'planlyPushTest');await W(900);
 check('test note says it arrives in a moment',/arrive in a moment/.test(await panel(page))&&!/5 minutes/.test(await panel(page)));
 await page.reload();await W(2500);await open(page);
 check('after a reload the saved settings show',await page.evaluate(()=>document.getElementById('planlyPushQuietStart')?.value==='23:30'&&document.getElementById('planlyPushQuietEnd')?.value==='06:00'&&document.getElementById('planlyPushDeals')?.checked===false));
 check('no page errors',errors.length===0,errors.slice(0,3).join(' | '));await context.close()}

{const db=mk(false);const {context,errors}=await newPhone(browser,db,OWNER);await fakePush(context);const page=await openApp(context,errors);await open(page);
 const t=await panel(page);
 check('older server: no 0% deals or Quiet hours rows',/Task reminders/.test(t)&&!/0% deals|Quiet hours/.test(t),t);
 await tick(page,'planlyPushTasks');await W(900);
 check('…and saving sends only the older settings, which works',db.saves.length===1&&!Object.keys(last(db)).some(k=>/quiet|deals/.test(k))&&last(db).p_notify_tasks===false&&!/went wrong|Could not/.test(await panel(page)),JSON.stringify(last(db)));
 check('no page errors',errors.length===0,errors.slice(0,3).join(' | '));await context.close()}

console.log(`${pass} passed, ${fail} failed`);await browser.close();server.close();process.exit(fail?1:0);
