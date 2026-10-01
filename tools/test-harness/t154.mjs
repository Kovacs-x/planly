// Part 3b person colours: owner vs partner view (relative), chips/edges/avatars/groups/month dots/assign dots, contrast light+dark
import { launch } from './harness.mjs';
import { ME, PARTNER } from './mock.mjs';
await fetch('http://localhost:8802/__switch?to=pr');
const who=process.argv[2]||'owner', uid=who==='partner'?PARTNER:ME;
const h=await launch({uid}); const {page:p,W,MOCK}=h; const q=(f,a)=>p.evaluate(f,a); const R={who}; const bad=[];
for(const m of MOCK.db.planly_household_members)m.display_name=m.user_id===ME?'Musti':'Laki';
const bins=MOCK.db.planly_tasks.find(r=>r.title==='Clean bathroom');if(bins){bins.completed=true;bins.completed_by=PARTNER;bins.completed_at=new Date().toISOString();bins.data={...bins.data,completed:true,completedBy:PARTNER}}
await p.setViewportSize({width:390,height:844});
await p.goto('http://localhost:8802/planly/v2/'); await W(4000); await p.reload(); await W(10000);
const lum=c=>{let m=c.match(/[\d.]+/g).map(Number);if(/^color\(/.test(c))m=m.map(v=>v*255);const f=v=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4)};return .2126*f(m[0])+.7152*f(m[1])+.0722*f(m[2])};
const contrast=(a,b)=>{const x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)};
for(const theme of ['light','dark']){
  await q(t=>document.documentElement.dataset.theme=t,theme);
  await q(()=>document.querySelector('[data-section="home"]').click());await W(1000);
  const d=await q(()=>{const toneOf=el=>(el.className.match(/tone-(self|partner|anyone)/)||[])[1];const bgOf=el=>{let e=el;while(e){const c=getComputedStyle(e).backgroundColor;if(c&&!/rgba\(0, 0, 0, 0\)|transparent/.test(c))return c;e=e.parentElement}return 'rgb(255,255,255)'};
    return {rows:[...document.querySelectorAll('.task.personEdge')].map(t=>t.querySelector('.taskTitle')?.innerText+'|'+toneOf(t)+'|'+getComputedStyle(t.querySelector('.taskSurface')).boxShadow.slice(0,40)+'|'+bgOf(t.querySelector('.taskSurface'))),
      chips:[...document.querySelectorAll('.personChip')].map(c=>c.innerText.trim()+'|'+toneOf(c)+'|'+getComputedStyle(c).color+'|'+bgOf(c)),
      avatars:[...document.querySelectorAll('.homeAvatar')].map(a=>a.parentElement.innerText.trim().replace(/\n/g,' ')+'|'+toneOf(a)+'|'+getComputedStyle(a).color+'|'+bgOf(a)),
      groups:[...document.querySelectorAll('.homeChoreGroupHead')].map(g=>g.querySelector('strong').innerText+'|'+toneOf(g)+'|'+getComputedStyle(g.querySelector('strong')).color+'|'+bgOf(g))}});
  R['home_'+theme]=d;
  for(const list of ['chips','avatars','groups'])for(const x of d[list]){const [label,tone,fg,bg]=x.split('|');const c=contrast(fg,bg);if(c<4.5)bad.push(theme+' '+list+' contrast '+c.toFixed(2)+' '+label)}
  for(const x of d.rows){const [title,tone,shadow,bg]=x.split('|');const col=shadow.match(/rgba?\([^)]+\)/)?.[0];if(!col)bad.push('no edge '+title);else{const c=contrast(col,bg);if(c<3)bad.push(theme+' edge contrast '+c.toFixed(2)+' '+title)}}
}
const L=R.home_light;
// relative mapping checks
const expectSelfName=who==='owner'?'Musti':'Laki', partnerName=who==='owner'?'Laki':'Musti';
const av=Object.fromEntries(L.avatars.map(a=>[a.split('|')[0],a.split('|')[1]]));
R.avatarMap=av;
if(!Object.entries(av).some(([k,v])=>k.includes(expectSelfName)&&v==='self'))bad.push('self avatar not blue');
if(!Object.entries(av).some(([k,v])=>k.includes(partnerName)&&v==='partner'))bad.push('partner avatar not coral');
const gmap=L.groups.map(g=>g.split('|').slice(0,2).join(':'));R.groupMap=gmap;
if(!gmap.some(x=>/^Anyone:anyone$/.test(x)))bad.push('Anyone group not green');
const doneBy=L.chips.filter(c=>/^Done by/.test(c));R.doneBy=doneBy.map(c=>c.split('|').slice(0,2).join(':'));
for(const c of doneBy){const [label,tone]=c.split('|');if(/you$/i.test(label)&&tone!=='self')bad.push('Done by you not self');if(new RegExp(partnerName).test(label)&&tone!=='partner')bad.push('Done by partner not coral')}
// month dots
await q(()=>document.querySelector('[data-section="plan"]').click());await W(700);await q(()=>document.querySelector('[data-plan-segment="month"]')?.click());await W(900);
R.monthDots=await q(()=>[...new Set([...document.querySelectorAll('.calendarDot.personDot')].map(d=>(d.className.match(/tone-(\w+)/)||[])[1]))]);
if(!R.monthDots.includes('self'))bad.push('no self month dots');
// assign buttons in add sheet
await q(()=>document.querySelector('[data-section="today"]').click());await W(500);
await q(()=>document.querySelector('#addBtn').click());await W(700);
await q(()=>{const v=document.getElementById('taskVisibility');if(v){v.value='household';v.dispatchEvent(new Event('change',{bubbles:true}))}});await W(1200);
R.assign=await q(()=>[...document.querySelectorAll('#taskAssigneeSegments button')].map(b=>b.innerText.trim()+':'+((b.querySelector('.personDot')?.className.match(/tone-(\w+)/)||[])[1]||'none')));
if(!R.assign.length||R.assign.some(x=>/:none$/.test(x)))bad.push('assign dots '+R.assign);
R.errors=h.errors; if(h.errors.length)bad.push('page errors');
for(const [k,v] of Object.entries(R))console.log(k,JSON.stringify(v));
console.log(bad.length?'FAIL '+JSON.stringify(bad):'PASS t154 '+who); await h.browser.close();
