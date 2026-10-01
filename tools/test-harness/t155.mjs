// Part 4: "Completed (n)" folds (Today, Upcoming days, project detail, Lists, Home shared tasks), remembered per section; signed-out welcome screen.
import { launch } from './harness.mjs';
import { ME, PARTNER, HH } from './mock.mjs';
await fetch('http://localhost:8802/__switch?to='+(process.argv[2]||'pr'));
const bad=[],R={};
const dkey=n=>{const x=new Date();x.setDate(x.getDate()+n);return x.toLocaleDateString('en-CA')};
// ---------- A: signed in, folds ----------
{
const h=await launch({uid:ME}); const {page:p,W,MOCK}=h; const q=(f,a)=>p.evaluate(f,a);
const T=MOCK.db.planly_tasks, done=(r,by=ME)=>{r.completed=true;r.completed_by=by;r.completed_at=new Date().toISOString();r.data={...r.data,completed:true,completedBy:by,completedAt:r.completed_at}};
done(T.find(r=>r.title==='Laundry'));done(T.find(r=>r.title==='Order tiles'));
const shelf={...T.find(r=>r.title==='Clean bathroom'),cloud_id:crypto.randomUUID(),client_id:'task-shelf',title:'Fix shelf',task_date:dkey(-5)};shelf.data={...shelf.data,id:'task-shelf',title:'Fix shelf',date:dkey(-5)};done(shelf,PARTNER);T.push(shelf);
await p.setViewportSize({width:390,height:844});
await p.goto('http://localhost:8802/planly/v2/'); await W(4000); await p.reload(); await W(10000);
const fold=key=>q(k=>{const d=[...document.querySelectorAll('details.doneFold')].filter(x=>x.dataset.doneKey===k);return d.map(x=>{const s=x.querySelector('summary'),r=s.getBoundingClientRect(),vis=[...x.querySelector('.completedList').children].filter(e=>e.checkVisibility()).length;return {label:s.innerText.trim(),open:x.open,h:Math.round(r.height),visibleRows:vis,rows:x.querySelector('.completedList').textContent.replace(/\s+/g,' ').slice(0,80)}})},key);
const today=await fold('today');R.today=today;
if(today.length!==1||today[0].label!=='Completed (1)'||today[0].open||today[0].visibleRows)bad.push('today fold closed '+JSON.stringify(today));
if(today[0]&&today[0].h<44)bad.push('today summary <44');
if(await q(()=>!!document.getElementById('planlyWelcome')))bad.push('welcome shown while signed in');
await q(()=>document.querySelector('details.doneFold[data-done-key="today"] summary').click());await W(400);
const t2=await fold('today');if(!t2[0]?.open||!t2[0].visibleRows||!/Laundry/.test(t2[0].rows))bad.push('today fold did not open '+JSON.stringify(t2));
R.stored=await q(()=>localStorage.getItem('planly-completed-open-v1'));
await p.reload();await W(9000);
const t3=await fold('today');R.todayAfterReload=t3;if(!t3[0]?.open)bad.push('today open not remembered after reload');
// Upcoming
await q(()=>document.querySelector('[data-section="plan"]').click());await W(700);
await q(()=>document.querySelector('[data-plan-segment="upcoming"]')?.click());await W(900);
const up=await fold('upcoming');R.upcoming=up;
if(up.length!==1||up[0].label!=='Completed (1)'||up[0].open||!/Order tiles/.test(up[0].rows))bad.push('upcoming fold '+JSON.stringify(up));
R.upDayGroup=await q(()=>document.querySelector('details.doneFold[data-done-key="upcoming"]')?.closest('.upcomingDateGroup')?.querySelector('.upcomingDateLabel')?.innerText);
R.upSummary=await q(()=>document.querySelector('.upcomingSummary')?.innerText.replace(/\s+/g,' '));
// project detail
await q(()=>document.querySelector('[data-plan-segment="projects"]')?.click());await W(900);
await q(()=>{const b=[...document.querySelectorAll('[data-r1-project],[data-project-open]')].find(x=>/Kitchen renovation/.test(x.innerText));b?.click()});await W(1200);
const pr=await fold('project');R.project=pr;
if(pr.length!==1||pr[0].label!=='Completed (1)'||pr[0].open||!/Order tiles/.test(pr[0].rows))bad.push('project fold '+JSON.stringify(pr));
await q(()=>{document.querySelector('details.doneFold[data-done-key="project"] summary')?.click()});await W(300);
R.projectOpened=(await fold('project'))[0]?.open;
await q(()=>{document.querySelectorAll('.sheetWrap.open,#projectsWrap.open').forEach(()=>{});const b=document.querySelector('#projectsClose,[data-close-projects],#projectsWrap .close');b?.click()});await W(500);
await p.keyboard.press('Escape');await W(500);
// Home
await q(()=>document.querySelector('[data-section="home"]').click());await W(1000);
const hm=await fold('home');R.home=hm;
if(hm.length!==1||hm[0].label!=='Completed (1)'||hm[0].open||!/Fix shelf/.test(hm[0].rows))bad.push('home fold '+JSON.stringify(hm));
R.homeOpenRows=await q(()=>[...document.querySelectorAll('.homeSection')].find(s=>/Shared tasks/.test(s.innerText))?.innerText.split('\n').slice(0,8).join(' | '));
// Lists
await q(()=>{const b=[...document.querySelectorAll('[data-r1-list]')].find(x=>/Shopping/.test(x.innerText));b?.click()});await W(1500);
const ls=await fold('lists');R.lists=ls;
if(ls.length!==1||ls[0].label!=='Completed (1)'||ls[0].open||!/Bread/.test(ls[0].rows))bad.push('lists fold '+JSON.stringify(ls));
await q(()=>document.querySelector('details.doneFold[data-done-key="lists"] summary')?.click());await W(300);
R.listsOpened=(await fold('lists'))[0];
await p.screenshot({path:'t155-lists.png'});
R.storedFinal=await q(()=>localStorage.getItem('planly-completed-open-v1'));
if(!/"today":true/.test(R.storedFinal)||!/"lists":true/.test(R.storedFinal)||!/"project":true/.test(R.storedFinal))bad.push('stored state '+R.storedFinal);
R.errorsA=h.errors;if(h.errors.length)bad.push('A page errors');
await h.browser.close();
}
// ---------- B: signed out, welcome ----------
for(const theme of ['light','dark']){
const h=await launch({uid:ME}); const {page:p,W,ctx}=h; const q=(f,a)=>p.evaluate(f,a);
await ctx.addInitScript(()=>{try{localStorage.removeItem('sb-dtniwcwjucepsjzoojuc-auth-token')}catch{}});
await ctx.addInitScript(t=>{try{const k='planly-device-settings-v1',d=JSON.parse(localStorage.getItem(k)||'null')||{version:1};d.version=1;d.theme=t;localStorage.setItem(k,JSON.stringify(d))}catch{}},theme);
for(const w of [320,390]){
await p.setViewportSize({width:w,height:w===320?568:844});
await p.goto('http://localhost:8802/planly/v2/'); await W(4000); await p.reload(); await W(7000);
const wv=await q(()=>{const el=document.getElementById('planlyWelcome');if(!el)return null;const sl=el.querySelector('.welcomeSlides');const btns=[...el.querySelectorAll('button')].filter(b=>b.getBoundingClientRect().height>0).map(b=>[b.innerText.trim(),Math.round(b.getBoundingClientRect().height),Math.round(b.getBoundingClientRect().width)]);
 const small=[...el.querySelectorAll('*')].filter(e=>e.children.length===0&&e.innerText?.trim()&&e.getBoundingClientRect().height>0&&parseFloat(getComputedStyle(e).fontSize)<11).map(e=>e.innerText);
 return {theme:document.documentElement.dataset.theme,slides:el.querySelectorAll('.welcomeSlide').length,titles:[...el.querySelectorAll('.welcomeSlide h2')].map(x=>x.innerText),btns,role:el.getAttribute('role'),overflowX:document.documentElement.scrollWidth>innerWidth||el.scrollWidth>el.clientWidth,slideW:sl.scrollWidth,clientW:sl.clientWidth,small,google:el.querySelector('[data-provider-slot="google"]')?.hidden,focus:document.activeElement?.id,bottom:Math.round(el.querySelector('#planlyWelcomeEmail').getBoundingClientRect().bottom),vh:innerHeight}});
R['welcome_'+theme+'_'+w]=wv;
if(!wv)bad.push('no welcome signed out '+theme+w);else{if(wv.slides!==3)bad.push('slides '+wv.slides);if(wv.btns.some(b=>b[1]<44))bad.push('welcome tap target <44 '+JSON.stringify(wv.btns));if(wv.overflowX)bad.push('welcome overflow '+w);if(wv.small.length)bad.push('small text '+wv.small);if(wv.slideW!==wv.clientW*3)bad.push('slide widths '+wv.slideW+'/'+wv.clientW)}
await p.screenshot({path:`t155-welcome-${theme}-${w}.png`});
}
// swipe to slide 2
await q(()=>{const s=document.querySelector('.welcomeSlides');s.scrollTo({left:s.clientWidth,behavior:'instant'})});await W(500);
R['dot_'+theme]=await q(()=>[...document.querySelectorAll('.welcomeDots span')].findIndex(d=>d.classList.contains('active')));
if(R['dot_'+theme]!==1)bad.push('dots do not follow swipe');
await p.screenshot({path:`t155-welcome2-${theme}.png`});await q(()=>{const s=document.querySelector('.welcomeSlides');s.scrollTo({left:s.clientWidth*2,behavior:'instant'})});await W(900);await p.screenshot({path:`t155-welcome3-${theme}.png`});await q(()=>{const s=document.querySelector('.welcomeSlides');s.scrollTo({left:0,behavior:'instant'})});await W(300);
R['noGuest_'+theme]=await q(()=>!/without an account|not now/i.test(document.getElementById('planlyWelcome')?.innerText||''));
if(!R['noGuest_'+theme])bad.push('guest option still shown');
// Continue with email opens the form inside the welcome screen
await q(()=>document.getElementById('planlyWelcomeEmail').click());await W(500);
R['form_'+theme]=await q(()=>({form:!document.getElementById('planlyWelcomeForm').hidden,actions:document.getElementById('planlyWelcomeActions').hidden,focus:document.activeElement?.id,targets:[...document.querySelectorAll('#planlyWelcomeForm button,#planlyWelcomeForm input')].map(b=>(b.id||b.type)+':'+Math.round(b.getBoundingClientRect().height)),fonts:[...document.querySelectorAll('#planlyWelcomeForm input')].map(i=>getComputedStyle(i).fontSize)}));
const F=R['form_'+theme];if(!F.form||!F.actions||F.focus!=='planlyWelcomeEmailInput')bad.push('email form '+JSON.stringify(F));if(F.targets.some(t=>Number(t.split(':')[1])<44))bad.push('form target <44 '+F.targets);if(F.fonts.some(f=>parseFloat(f)<16))bad.push('input font <16 (iOS zoom)');
await p.screenshot({path:`t155-form-${theme}.png`});
if(theme==='light'){
 await q(()=>document.getElementById('planlyWelcomeForm').requestSubmit());await W(300);
 R.emptyMsg=await q(()=>document.getElementById('planlyWelcomeMsg').innerText);if(!/Enter your email/.test(R.emptyMsg))bad.push('empty validation');
 await q(()=>{document.getElementById('planlyWelcomeEmailInput').value='alex@example.test';document.getElementById('planlyWelcomePassword').value='password123'});
 await q(()=>document.getElementById('planlyWelcomeForm').requestSubmit());await W(4000);
 R.afterSignIn=await q(()=>({welcome:!!document.getElementById('planlyWelcome'),lock:document.body.classList.contains('welcomeOpen'),title:document.querySelector('#pageTitle')?.innerText}));
 if(R.afterSignIn.welcome||R.afterSignIn.lock)bad.push('welcome after sign in '+JSON.stringify(R.afterSignIn));
}else{
 await q(()=>document.getElementById('planlyWelcomeMode').click());await W(200);
 R.signUpMode=await q(()=>({title:document.getElementById('planlyWelcomeFormTitle').innerText,submit:document.getElementById('planlyWelcomeSubmit').innerText,ac:document.getElementById('planlyWelcomePassword').autocomplete}));
 if(R.signUpMode.submit!=='Create account'||R.signUpMode.ac!=='new-password')bad.push('sign-up mode '+JSON.stringify(R.signUpMode));
 await q(()=>{document.getElementById('planlyWelcomeEmailInput').value='new@example.test';document.getElementById('planlyWelcomePassword').value='short'});
 await q(()=>document.getElementById('planlyWelcomeForm').requestSubmit());await W(300);
 R.shortMsg=await q(()=>document.getElementById('planlyWelcomeMsg').innerText);if(!/8 characters/.test(R.shortMsg))bad.push('short password message');
 await p.screenshot({path:'t155-signup-dark.png'});
 await q(()=>document.getElementById('planlyWelcomeBack').click());await W(300);
 R.backOk=await q(()=>document.getElementById('planlyWelcomeForm').hidden&&!document.getElementById('planlyWelcomeActions').hidden);if(!R.backOk)bad.push('back button');
 // reload while signed out: welcome is always there (no dismissal)
 await p.reload();await W(7000);
 R.afterReload=await q(()=>!!document.getElementById('planlyWelcome'));if(!R.afterReload)bad.push('welcome missing after reload');
}
R['errorsB_'+theme]=h.errors;if(h.errors.length)bad.push('B page errors '+theme);
await h.browser.close();
}
console.log(JSON.stringify(R,null,1));
console.log(bad.length?'FAIL '+JSON.stringify(bad):'PASS t155');
