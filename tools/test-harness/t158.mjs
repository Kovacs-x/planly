// Polish: completing / reopening shows no pop-up, sync success shows no pop-up (chip only), completed rows have a working Undo (>=44px, contrast),
// profile initial is a true centred circle; light + dark; household task completion too.
import { launch } from './harness.mjs';
import { ME, PARTNER } from './mock.mjs';
const PORT=process.env.PORT||8802;
await fetch(`http://localhost:${PORT}/__switch?to=pr`);
const h=await launch({uid:ME}); const {page:p,W,MOCK}=h; const q=(f,a)=>p.evaluate(f,a); const bad=[],R={};
await p.setViewportSize({width:390,height:844});
await p.goto(`http://localhost:${PORT}/planly/v2/`); await W(4000); await p.reload(); await W(9000);
// record any pop-up that becomes visible
await q(()=>{window.__toasts=[];const seen=el=>{const t=el.textContent.trim();if(t)window.__toasts.push(t)};new MutationObserver(()=>{for(const id of ['planlyToast','planlyUndoToast']){const el=document.getElementById(id);if(el&&(el.style.opacity==='1'||el.classList.contains('show'))&&!el.__s){el.__s=1;seen(el);setTimeout(()=>el.__s=0,3000)}}}).observe(document.body,{subtree:true,childList:true,attributes:true,characterData:true})});
const lum=c=>{const m=c.match(/[\d.]+/g).map(Number);const f=v=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4)};return .2126*f(m[0])+.7152*f(m[1])+.0722*f(m[2])};
const contrast=(a,b)=>{const x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)};
// complete a personal task (Laundry)
const taskSel=title=>q(t=>{const el=[...document.querySelectorAll('.task')].find(x=>x.querySelector('.taskTitle')?.textContent.trim()===t);return el?el.dataset.id:null},title);
const id=await taskSel('Laundry');if(!id)bad.push('no Laundry');
await q(i=>document.querySelector('.task[data-id="'+i+'"] [data-action="toggle"]').click(),id);await W(6500);
R.toastsAfterComplete=await q(()=>window.__toasts.slice());
const writes=MOCK.log.filter(x=>/planly_tasks/.test(x)&&/POST|PATCH/.test(x)).length;R.taskWrites=writes;if(!writes)bad.push('completion not synced');
R.chip=await q(()=>document.getElementById('planlySyncChip')?.innerText.trim());if(!/Synced/.test(R.chip||''))bad.push('chip not Synced: '+R.chip);
// Undo inside the Completed fold
await q(()=>{const d=document.querySelector('details.doneFold[data-done-key="today"]');if(d)d.open=true});await W(400);
const u=await q(i=>{const b=document.querySelector('.completedList .task[data-id="'+i+'"] .undoDoneBtn');if(!b)return null;const r=b.getBoundingClientRect();const bg=getComputedStyle(b).backgroundColor,c=getComputedStyle(b).color;let o=1,e=b;while(e){o*=Number(getComputedStyle(e).opacity);e=e.parentElement}return {h:Math.round(r.height),w:Math.round(r.width),bg,c,opacity:o,label:b.getAttribute('aria-label')}},id);
R.undo=u;if(!u)bad.push('no Undo on completed row');else{if(u.h<44)bad.push('Undo <44');const k=contrast(u.c,u.bg);R.undoContrast=k.toFixed(2);if(k*1<4.5||u.opacity<0.95)bad.push('Undo contrast '+k.toFixed(2)+' opacity '+u.opacity)}
await q(i=>document.querySelector('.completedList .task[data-id="'+i+'"] .undoDoneBtn').click(),id);await W(4000);
R.afterUndo=await q(i=>{const el=document.querySelector('.task[data-id="'+i+'"]');return el?{done:el.classList.contains('done'),inFold:!!el.closest('.completedList')}:null},id);
if(!R.afterUndo||R.afterUndo.done||R.afterUndo.inFold)bad.push('Undo did not reopen '+JSON.stringify(R.afterUndo));
R.toastsAll=await q(()=>window.__toasts.slice());if(R.toastsAll.length)bad.push('pop-ups shown: '+R.toastsAll.join(' | '));
// household task completion (Clean bathroom) — also silent
const hid=await taskSel('Clean bathroom');if(hid){await q(i=>document.querySelector('.task[data-id="'+i+'"] [data-action="toggle"]').click(),hid);await W(6000);R.householdToasts=await q(()=>window.__toasts.slice());if(R.householdToasts.length)bad.push('household pop-up: '+R.householdToasts.join(' | '))}
// profile circle, light and dark, on Today and Settings
for(const theme of ['light','dark']){await q(t=>document.documentElement.dataset.theme=t,theme);
 for(const where of ['today','settings']){if(where==='settings'){await q(()=>document.getElementById('profileToggle').click());await W(600)}else{await q(()=>document.querySelector('.nav button[data-section="today"]').click());await W(500)}
  const pr=await q(()=>{const b=document.getElementById('profileToggle'),i=b.querySelector('.profileInitial'),r=b.getBoundingClientRect(),ri=i.getBoundingClientRect();return {btn:[Math.round(r.width),Math.round(r.height)],init:[Math.round(ri.width),Math.round(ri.height)],off:[Math.round(ri.x-r.x),Math.round(ri.y-r.y)],c:getComputedStyle(i).color,bg:getComputedStyle(i).backgroundColor}});
  R['profile_'+theme+'_'+where]=pr;if(pr.btn[0]<44||pr.btn[1]<44)bad.push('profile target <44');if(pr.init[0]!==pr.init[1]||pr.init[0]!==40)bad.push('profile not a 40px circle '+JSON.stringify(pr));if(pr.off[0]!==pr.off[1])bad.push('profile not centred '+pr.off);if(contrast(pr.c,pr.bg)<4.5)bad.push('profile initial contrast');
  const r=await q(()=>{const r=document.getElementById('profileToggle').getBoundingClientRect();return {x:r.x-10,y:Math.max(0,r.y-10),width:r.width+20,height:r.height+20}});await p.screenshot({path:`t158-profile-${theme}-${where}.png`,clip:r});}}
R.errors=h.errors;if(h.errors.length)bad.push('page errors');
console.log(JSON.stringify(R));console.log(bad.length?'FAIL '+JSON.stringify(bad):'PASS t158');await h.browser.close();
