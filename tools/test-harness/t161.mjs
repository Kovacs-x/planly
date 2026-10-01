// Stage 4b: account management + password recovery.
import { launch } from './harness.mjs';
import { ME, session } from './mock.mjs';
const PORT=process.env.PORT||8802, BASE=`http://localhost:${PORT}/planly/v2/`;
await fetch(`http://localhost:${PORT}/__switch?to=pr`);
const bad=[],R={};
const bodies=(MOCK,re)=>MOCK.bodies.filter(b=>re.test(b.path));
// ---------- A/B: signed in with Google + email ----------
{globalThis.__mockProviders=['google','email'];
const h=await launch({}); const {page:p,W,MOCK}=h; const q=(f,a)=>p.evaluate(f,a);
await p.setViewportSize({width:390,height:844});
await p.goto(BASE); await W(4000); await p.reload(); await W(9000);
await q(()=>document.getElementById('profileToggle').click());await W(500);
await q(()=>document.querySelector('.settingsHubRow[data-settings-page="account"]').click());await W(700);
R.methods=await q(()=>[...document.querySelectorAll('.accountMethod')].map(x=>x.innerText.replace(/\s+/g,' ').trim()));
if(R.methods.length!==2||!/Google/.test(R.methods[0])||!/Email and password/.test(R.methods[1]))bad.push('methods '+R.methods);
R.pwSummary=await q(()=>document.querySelector('#planlyPasswordSection summary')?.innerText);if(R.pwSummary!=='Change password')bad.push('pw summary '+R.pwSummary);
await q(()=>{document.getElementById('planlyPasswordSection').open=true;document.getElementById('planlyEmailSection').open=true});await W(200);
R.targets=await q(()=>[...document.querySelectorAll('#planlyPasswordSection summary,#planlyEmailSection summary,#planlyChangePasswordForm button,#planlyChangeEmailForm button,#planlySignOutBtn,#planlySignOutAllBtn')].map(b=>Math.round(b.getBoundingClientRect().height)));
if(R.targets.some(h=>h<44))bad.push('account target <44 '+R.targets);
// password mismatch, then valid
await q(()=>{document.getElementById('planlyNewPassword').value='newpassword1';document.getElementById('planlyNewPassword2').value='different';document.getElementById('planlyChangePasswordForm').requestSubmit()});await W(500);
R.pwMismatch=await q(()=>document.getElementById('planlyPasswordMsg').innerText);if(!/do not match/.test(R.pwMismatch))bad.push('mismatch msg');
let n=MOCK.bodies.length;
await q(()=>{document.getElementById('planlyNewPassword2').value='newpassword1';document.getElementById('planlyChangePasswordForm').requestSubmit()});await W(1500);
R.pwPut=MOCK.bodies.slice(n).filter(b=>/\/auth\/v1\/user/.test(b.path)).map(b=>b.method+' '+b.body);R.pwOk=await q(()=>document.getElementById('planlyPasswordMsg').innerText);
if(!R.pwPut.some(x=>/^PUT .*"password":"newpassword1"/.test(x))||!/Password saved/.test(R.pwOk))bad.push('password change '+JSON.stringify([R.pwPut,R.pwOk]));
// email
await q(()=>{document.getElementById('planlyNewEmail').value='alex@example.test';document.getElementById('planlyChangeEmailForm').requestSubmit()});await W(400);
R.emailSame=await q(()=>document.getElementById('planlyEmailMsg').innerText);if(!/already your email/.test(R.emailSame))bad.push('same email msg');
n=MOCK.bodies.length;
await q(()=>{document.getElementById('planlyNewEmail').value='alex.new@example.test';document.getElementById('planlyChangeEmailForm').requestSubmit()});await W(1500);
R.emailPut=MOCK.bodies.slice(n).filter(b=>/\/auth\/v1\/user/.test(b.path)).map(b=>b.method+' '+b.path+' '+b.body);R.emailOk=await q(()=>document.getElementById('planlyEmailMsg').innerText);
if(!R.emailPut.some(x=>/^PUT .*"email":"alex.new@example.test"/.test(x))||!/Check your inbox/.test(R.emailOk))bad.push('email change '+JSON.stringify([R.emailPut,R.emailOk]));
if(!R.emailPut.some(x=>/redirect_to=https%3A%2F%2Fkovacs-x.github.io%2Fplanly%2Fv2%2F/.test(x)))bad.push('email redirect missing '+R.emailPut);
await p.screenshot({path:'t161-account.png',fullPage:true});
// sign out this device → scope=local, welcome shows
n=MOCK.log.length;await q(()=>document.getElementById('planlySignOutBtn').click());await W(2500);
R.logout=MOCK.log.slice(n).filter(x=>/logout/.test(x));R.welcomeAfter=await q(()=>!!document.getElementById('planlyWelcome'));
if(!R.logout.some(x=>/scope=local/.test(x)))bad.push('sign out not local '+R.logout);if(!R.welcomeAfter)bad.push('welcome not shown after sign out');
if(h.errors.length)bad.push('errors A '+h.errors);await h.browser.close();}
// ---------- B: sign out on all devices, Google-only user sees "Set a password" ----------
{globalThis.__mockProviders=['google'];
const h=await launch({}); const {page:p,W,MOCK}=h; const q=(f,a)=>p.evaluate(f,a);p.on('dialog',d=>d.accept());
await p.setViewportSize({width:390,height:844});await p.goto(BASE); await W(4000); await p.reload(); await W(9000);
await q(()=>document.getElementById('profileToggle').click());await W(500);await q(()=>document.querySelector('.settingsHubRow[data-settings-page="account"]').click());await W(700);
R.googleOnly=await q(()=>({methods:[...document.querySelectorAll('.accountMethod strong')].map(x=>x.innerText),pw:document.querySelector('#planlyPasswordSection summary')?.innerText}));
if(R.googleOnly.methods.join()!=='Google'||R.googleOnly.pw!=='Set a password')bad.push('google-only '+JSON.stringify(R.googleOnly));
const n=MOCK.log.length;await q(()=>document.getElementById('planlySignOutAllBtn').click());await W(2500);
R.logoutAll=MOCK.log.slice(n).filter(x=>/logout/.test(x));if(!R.logoutAll.some(x=>/scope=global/.test(x)))bad.push('all devices not global '+R.logoutAll);
if(h.errors.length)bad.push('errors B '+h.errors);await h.browser.close();globalThis.__mockProviders=['email'];}
// ---------- C/D/E: signed out ----------
async function signedOut(hash=''){const h=await launch({});const {page:p,W,ctx}=h;await ctx.addInitScript(()=>{try{if(!sessionStorage.getItem('t161-keep'))localStorage.removeItem('sb-dtniwcwjucepsjzoojuc-auth-token')}catch{}});await p.setViewportSize({width:390,height:844});await p.goto(BASE);await W(4000);await p.reload();await W(5000);if(hash){await p.goto('about:blank');await p.goto(BASE+hash);await W(7000)}return h}
{const h=await signedOut();const {page:p,W,MOCK}=h;const q=(f,a)=>p.evaluate(f,a);
await q(()=>document.getElementById('planlyWelcomeEmail').click());await W(300);await q(()=>document.getElementById('planlyWelcomeForgot').click());await W(200);
R.reset=await q(()=>({title:document.getElementById('planlyWelcomeFormTitle').innerText,pwHidden:document.getElementById('planlyWelcomePassword').closest('label').hidden,submit:document.getElementById('planlyWelcomeSubmit').innerText,forgotH:Math.round(document.getElementById('planlyWelcomeForgot').getBoundingClientRect().height)}));
if(R.reset.title!=='Reset your password'||!R.reset.pwHidden||R.reset.submit!=='Send reset link')bad.push('reset mode '+JSON.stringify(R.reset));
const n=MOCK.bodies.length;await q(()=>{document.getElementById('planlyWelcomeEmailInput').value='alex@example.test';document.getElementById('planlyWelcomeForm').requestSubmit()});await W(1500);
R.recover=MOCK.bodies.slice(n).filter(b=>/recover/.test(b.path)).map(b=>b.path+' '+b.body);R.resetMsg=await q(()=>document.getElementById('planlyWelcomeMsg').innerText);
if(!R.recover.some(x=>/redirect_to=https%3A%2F%2Fkovacs-x.github.io%2Fplanly%2Fv2%2F/.test(x)&&/alex@example.test/.test(x))||!/reset link is on its way/.test(R.resetMsg))bad.push('recover '+JSON.stringify([R.recover,R.resetMsg]));
await p.screenshot({path:'t161-forgot.png'});if(h.errors.length)bad.push('errors C '+h.errors);await h.browser.close();}
{const h=await signedOut('#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired');const {page:p,W}=h;const q=(f,a)=>p.evaluate(f,a);
R.expired=await q(()=>({form:!document.getElementById('planlyWelcomeForm')?.hidden,title:document.getElementById('planlyWelcomeFormTitle')?.innerText,msg:document.getElementById('planlyWelcomeMsg')?.innerText}));
if(!R.expired.form||R.expired.title!=='Reset your password'||!/expired\. Enter your email to get a new link\./.test(R.expired.msg||''))bad.push('expired link '+JSON.stringify(R.expired));
if(h.errors.length)bad.push('errors D '+h.errors);await h.browser.close();}
{const s=session(ME);const hash=`#access_token=${s.access_token}&expires_at=${s.expires_at}&expires_in=3600&refresh_token=${s.refresh_token}&token_type=bearer&type=recovery`;
const h=await launch({});const {page:p,W,MOCK,ctx}=h;const q=(f,a)=>p.evaluate(f,a);
await ctx.addInitScript(()=>{try{if(location.hash.includes('type=recovery')||sessionStorage.getItem('planly-recovery-pending'))return;localStorage.removeItem('sb-dtniwcwjucepsjzoojuc-auth-token')}catch{}});
await p.setViewportSize({width:390,height:844});await p.goto(BASE);await W(4000);await p.reload();await W(5000);
await p.goto('about:blank');await p.goto(BASE+hash);await W(9000);
R.recovery=await q(()=>({dialog:!!document.getElementById('planlyRecovery'),welcome:!!document.getElementById('planlyWelcome'),hash:location.hash.slice(0,20),focus:document.activeElement?.id}));
if(!R.recovery.dialog||R.recovery.welcome)bad.push('recovery dialog '+JSON.stringify(R.recovery));
await p.screenshot({path:'t161-recovery.png'});
if(R.recovery.dialog){await q(()=>{document.getElementById('planlyRecoveryPassword').value='short';document.getElementById('planlyRecoveryPassword2').value='short';document.getElementById('planlyRecoveryForm').requestSubmit()});await W(400);
 R.recShort=await q(()=>document.getElementById('planlyRecoveryMsg').innerText);if(!/8 characters/.test(R.recShort))bad.push('recovery short msg');
 const n=MOCK.bodies.length;await q(()=>{document.getElementById('planlyRecoveryPassword').value='brandnew123';document.getElementById('planlyRecoveryPassword2').value='brandnew123';document.getElementById('planlyRecoveryForm').requestSubmit()});await W(2500);
 R.recPut=MOCK.bodies.slice(n).filter(b=>/\/auth\/v1\/user/.test(b.path)).map(b=>b.method+' '+b.body);R.recAfter=await q(()=>({dialog:!!document.getElementById('planlyRecovery'),flag:sessionStorage.getItem('planly-recovery-pending'),signedIn:!document.getElementById('planlyWelcome')}));
 if(!R.recPut.some(x=>/"password":"brandnew123"/.test(x))||R.recAfter.dialog||R.recAfter.flag||!R.recAfter.signedIn)bad.push('recovery save '+JSON.stringify([R.recPut,R.recAfter]));}
if(h.errors.length)bad.push('errors E '+h.errors);await h.browser.close();}
console.log(JSON.stringify(R));console.log(bad.length?'FAIL '+JSON.stringify(bad):'PASS t161');
