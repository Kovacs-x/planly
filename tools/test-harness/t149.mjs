// Stage 4 Part 2 targeted checks (#106 P1.1-P1.5, #108 F1-F3/F6)
import { launch } from './harness.mjs';
import { ME, PARTNER } from './mock.mjs';
await fetch('http://localhost:8802/__switch?to=pr');
const h=await launch({uid:ME}); const {page:p,W,MOCK}=h; const q=(f,a)=>p.evaluate(f,a); const R={}; const bad=[];
const base=MOCK.db.planly_projects[0]; const now=Date.now();
const iso=o=>{const x=new Date();x.setDate(x.getDate()+o);return x.toISOString().slice(0,10)};
const mk=(id,name,due)=>({...base,cloud_id:crypto.randomUUID(),client_id:id,name,due_date:due,data:{...base.data,id,name,dueDate:due||''}});
MOCK.db.planly_projects.push(mk('proj-empty-due','Test Project',iso(8)),mk('proj-empty-nodue','Someday idea',null));
const pm=MOCK.db.planly_household_members.find(m=>m.user_id===PARTNER); if(pm)pm.display_name='Samantha-Longname-20';
await p.goto('http://localhost:8802/planly/v2/'); await W(4000); await p.reload(); await W(10000);
const go=async sec=>{await q(s=>document.querySelector('[data-section="'+s+'"]')?.click(),sec);await W(900)};
for(const w of [320,390,430]){
  await p.setViewportSize({width:w,height:800}); await go('today');
  R['day'+w]=await q(()=>{const c=document.querySelector('.todayDayCheck');if(!c)return null;const r=el=>{const b=el.getBoundingClientRect();return Math.round(b.width)+'x'+Math.round(b.height)};const s=c.querySelector('.dayCheckText strong');return {box:r(c),main:r(c.querySelector('.dayCheckMain')),links:[...c.querySelectorAll('.dayCheckLink')].map(b=>b.innerText+':'+r(b)+':'+getComputedStyle(b).fontSize),text:s?.innerText,fs:getComputedStyle(s).fontSize,overflowX:c.scrollWidth>c.clientWidth+1}});
  const d=R['day'+w]; if(!d)bad.push('no day check '+w); else { if(d.overflowX)bad.push('daycheck overflow '+w); if(parseInt(d.box.split('x')[1])>64)bad.push('daycheck too tall '+w+' '+d.box); for(const l of d.links){const [,sz]=l.split(':');const [lw,lh]=sz.split('x').map(Number);if(lw<44||lh<44)bad.push('link target '+w+' '+l)} }
  // compact meta: icons inline (no line wrap inside meta)
  R['meta'+w]=await q(()=>[...document.querySelectorAll('.compactTaskMeta')].slice(0,6).map(m=>{const ic=m.querySelector('.pIcon');const t=m.getBoundingClientRect();return Math.round(t.height)+(ic?':icon@'+Math.round(ic.getBoundingClientRect().top-t.top):'')+':'+m.innerText.replace(/\n/g,'⏎')}));
  R['metaCut'+w]=await q(()=>[...document.querySelectorAll('.compactTaskMeta>*')].filter(c=>getComputedStyle(c).display!=='none'&&c.scrollWidth>c.getBoundingClientRect().width+1).map(c=>c.innerText));if(R['metaCut'+w].length)bad.push('meta cut '+w+' '+R['metaCut'+w]);
  await go('plan'); await q(()=>document.querySelector('[data-plan-segment="projects"]')?.click()); await W(700);
  R['proj'+w]=await q(()=>[...document.querySelectorAll('.planProjectCard[data-r1-project]')].map(c=>{const chip=c.querySelector('.projectIntelStatus');const cr=chip?.getBoundingClientRect(),hr=c.querySelector('.planProjectHead')?.getBoundingClientRect();return c.querySelector('strong').innerText+' | chip='+(chip?chip.innerText+' '+Math.round(cr.width)+'w inline='+(Math.abs(cr.top+cr.height/2-(hr.top+hr.height/2))<4):'none')+' | '+c.querySelector('.planProjectMeta')?.innerText}));
  for(const line of R['proj'+w]){const m=line.match(/chip=.* (\d+)w/);if(m&&+m[1]>160)bad.push('chip stretched '+w+' '+line);if(/inline=false/.test(line))bad.push('chip not inline '+w+' '+line)}
  const tp=R['proj'+w].find(x=>x.startsWith('Test Project'));if(!tp||!/No tasks yet/.test(tp)||!/Due \w{3} \d{1,2} \w{3}/.test(tp)||/Not scheduled/.test(tp))bad.push('empty project wording '+w+' '+tp);
  const sd=R['proj'+w].find(x=>x.startsWith('Someday idea'));if(!sd||!/chip=none/.test(sd))bad.push('no-due empty project should have no chip '+w+' '+sd);
  await q(()=>document.querySelector('[data-plan-segment="upcoming"]')?.click()); await W(700);
  R['upc'+w]=await q(()=>{const g=document.querySelector('.upcomingDateGroup');if(!g)return null;const l=g.querySelector('.upcomingDateLabel'),t=g.querySelector('.task');return {disp:getComputedStyle(g).display,labelAbove:t?l.getBoundingClientRect().bottom<=t.getBoundingClientRect().top+1:null,fs:getComputedStyle(l).fontSize,taskW:t?Math.round(t.getBoundingClientRect().width):0,groupW:Math.round(g.getBoundingClientRect().width)}});
  if(R['upc'+w]&&(R['upc'+w].disp!=='block'||R['upc'+w].labelAbove===false))bad.push('upcoming heading '+w);
  await q(()=>document.querySelector('[data-plan-segment="month"]')?.click()); await W(900);
  R['month'+w]=await q(()=>{const t=document.querySelector('.day.isToday>span');const r=t?.getBoundingClientRect();return {today:t?Math.round(r.width)+'x'+Math.round(r.height)+' '+getComputedStyle(t).backgroundColor:null,shifts:[...new Set([...document.querySelectorAll('.calendarShiftLabel')].map(x=>x.className.replace('calendarShiftLabel','').trim()+':'+x.innerText))].slice(0,6),done:document.querySelectorAll('.calendarDoneMark').length}});
  await go('home');
  R['home'+w]=await q(()=>{const np=document.querySelector('.homeNamePrompt');const shared=[...document.querySelectorAll('.homeSection')].find(s=>/Shared tasks/.test(s.querySelector('h2')?.innerText||''));return {prompt:np?np.innerText.replace(/\n/g,' | '):null,promptBtns:np?[...np.querySelectorAll('button')].map(b=>Math.round(b.getBoundingClientRect().height)):[],shared:shared?shared.innerText.replace(/\n/g,' | ').slice(0,200):null,balance:[...document.querySelectorAll('.homeBalanceCount')].map(c=>{const r=c.getBoundingClientRect(),s=c.querySelector('strong'),sp=c.querySelector('span');return s.innerText+'/'+sp.innerText+' '+Math.round(r.width)+'x'+Math.round(r.height)+' spill='+(sp.getBoundingClientRect().right>r.right+1||s.scrollWidth>s.clientWidth+1&&getComputedStyle(s).textOverflow!=='ellipsis')+' fs='+getComputedStyle(s).fontSize+'/'+getComputedStyle(sp).fontSize})}});
  for(const b of R['home'+w].balance)if(/spill=true/.test(b))bad.push('balance spill '+w+' '+b);
  if(R['home'+w].shared&&/Take bins out/.test(R['home'+w].shared))bad.push('shared repeats chore '+w);
}
// status strip present and opaque
R.strip=await q(()=>{const s=getComputedStyle(document.body,'::after');return s.position+' '+s.backgroundColor+' z'+s.zIndex});
// chore balance on (Settings toggle) at 320 with a 20-char partner name
await p.setViewportSize({width:320,height:800});
await q(()=>document.querySelector('#profileToggle')?.click()); await W(400); await q(()=>document.querySelector('[data-profile-settings]')?.click()); await W(800);
R.balToggle=await q(()=>{const c=document.getElementById('intelligenceChoreBalance');if(!c)return 'missing';if(!c.checked){c.click();c.dispatchEvent(new Event('change',{bubbles:true}))}return c.checked});
await W(600); await go('home');
R.balance320=await q(()=>[...document.querySelectorAll('.homeBalanceCount')].map(c=>{const r=c.getBoundingClientRect(),s=c.querySelector('strong'),sp=c.querySelector('span');return s.innerText+'/'+sp.innerText+' '+Math.round(r.width)+'x'+Math.round(r.height)+' strongRight='+Math.round(s.getBoundingClientRect().right)+' cardRight='+Math.round(r.right)+' fs='+getComputedStyle(s).fontSize+'/'+getComputedStyle(sp).fontSize+' lines='+Math.round(s.getBoundingClientRect().height)}));
for(const b of R.balance320){const m=b.match(/strongRight=(\d+) cardRight=(\d+)/);if(m&&+m[1]>+m[2])bad.push('balance name spills '+b);if(!/ done /.test(b))bad.push('balance wording '+b)}
if(!R.balance320.length)bad.push('chore balance cards not shown');
// name prompt: open goes to name field; dismiss persists
if(R.home390?.prompt){await q(()=>document.querySelector('[data-name-prompt-dismiss]')?.click());await W(500);R.promptAfterDismiss=await q(()=>!!document.querySelector('.homeNamePrompt'));await p.reload();await W(9000);await go('home');R.promptAfterReload=await q(()=>!!document.querySelector('.homeNamePrompt'));if(R.promptAfterDismiss||R.promptAfterReload)bad.push('name prompt dismiss not remembered')} else bad.push('name prompt not shown when names unset');
// Hide today
await go('today'); await q(()=>document.querySelector('.dayCheckLink[data-i2-snooze]')?.click()); await W(600);
R.hidden=await q(()=>!document.querySelector('.dayCheckMain')&&!!document.querySelector('.dayCheckHidden [data-i2-unsnooze]')); if(!R.hidden)bad.push('Hide today did not hide');
R.errors=h.errors; if(h.errors.length)bad.push('page errors');
for(const [k,v] of Object.entries(R))console.log(k,JSON.stringify(v));
console.log(bad.length?'FAIL '+JSON.stringify(bad):'PASS t149'); await h.browser.close();
