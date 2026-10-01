import { launch } from './harness.mjs';
import { ME, PARTNER } from './mock.mjs';
await fetch('http://localhost:8802/__switch?to=pr');
const who=process.argv[2]||'owner';const h=await launch({uid:who==='partner'?PARTNER:ME}); const {page:p,W,MOCK}=h; const q=(f,a)=>p.evaluate(f,a); const R={};
MOCK.db.planly_household_members.find(m=>m.user_id===ME).display_name='Musti';MOCK.db.planly_household_members.find(m=>m.user_id===PARTNER).display_name='Sarah';
p.on('dialog',d=>d.dismiss());
await p.setViewportSize({width:390,height:844});
await p.goto('http://localhost:8802/planly/v2/'); await W(4000); await p.reload(); await W(10000);
const nav=async s=>{await q(s=>{const b=document.querySelector(`.nav button[data-section="${s}"]`);if(b){b.click();return}if(s==='settings'){document.querySelector('#profileToggle')?.click();setTimeout(()=>document.querySelector('[data-profile-settings]')?.click(),200)}},s);await W(1100)};
await nav('today');
R.rows=await q(()=>[...document.querySelectorAll('#view .task')].slice(0,12).map(t=>{const r=t.getBoundingClientRect();const meta=t.querySelector('.compactTaskMeta');return Math.round(r.height)+'px '+(t.classList.contains('compactTask')?'C':'-')+' '+t.querySelector('.taskTitle')?.innerText.slice(0,18)+' | '+(meta?meta.innerText.replace(/\s+/g,' ').slice(0,70):'')}));
R.top3Handles=await q(()=>document.querySelectorAll('.top3DragHandle').length);
R.top3Section=await q(()=>{const s=[...document.querySelectorAll('#view .section,#view section')].find(x=>/Top 3|Priorities/i.test(x.innerText));return s?s.innerText.replace(/\s+/g,' ').slice(0,120):'none'});
R.glyphs=await q(()=>[...document.querySelectorAll('.compactTaskMeta')].map(m=>m.innerText).filter(t=>/[✓☑★☆⌂≡▦↻]/.test(t)).slice(0,3));
R.tapTargets=await q(()=>[...document.querySelectorAll('.compactTask button')].filter(b=>b.getBoundingClientRect().width>0).map(b=>{const r=b.getBoundingClientRect();return (b.getAttribute('aria-label')||b.innerText).slice(0,12)+':'+Math.round(r.width)+'x'+Math.round(r.height)}).filter(x=>{const m=x.match(/:(\d+)x(\d+)/);return +m[1]<44||+m[2]<44}).slice(0,6));
// density toggle
await nav('settings');await q(()=>{const s=document.getElementById('taskRowDensity');s.value='comfortable';s.dispatchEvent(new Event('change'))});await W(600);await nav('today');
R.comfortable=await q(()=>({compact:document.querySelectorAll('.compactTask').length,handles:document.querySelectorAll('.top3DragHandle').length,avgH:Math.round([...document.querySelectorAll('#view .task')].slice(0,8).reduce((s,t)=>s+t.getBoundingClientRect().height,0)/8)}));
await nav('settings');await q(()=>{const s=document.getElementById('taskRowDensity');s.value='compact';s.dispatchEvent(new Event('change'))});await W(600);
// chores
await nav('home');
R.chores=await q(()=>{const s=document.querySelector('.homeChores');return s?s.innerText.replace(/\s+/g,' ').slice(0,300):'none'});
R.choreChecks=await q(()=>[...document.querySelectorAll('.homeChore .check')].map(b=>(b.disabled?'dis ':'')+(b.dataset.householdCompletion?'b2 ':'')+(b.dataset.action||'')+' '+Math.round(b.getBoundingClientRect().width)+'x'+Math.round(b.getBoundingClientRect().height)));
MOCK.log=[];MOCK.rpcCalls=[];const target=await q(()=>{const c=[...document.querySelectorAll('.homeChore')].find(c=>!c.classList.contains('done')&&!c.querySelector('.check').disabled);if(!c)return 'none';const t=c.innerText.replace(/\s+/g,' ').slice(0,30);c.querySelector('.check').click();return t});await W(8000);
R.completeChore={target,rpc:(MOCK.rpcCalls||[]).length,writes:MOCK.log.filter(l=>!l.startsWith('GET')&&!l.includes('sync_state')).map(l=>l.split('?')[0]),after:await q(()=>document.querySelector('.homeChores')?.innerText.replace(/\s+/g,' ').slice(0,200))};
MOCK.log=[];await q(()=>document.querySelector('[data-add-chore]')?.click());await W(1200);
R.addChore=await q(()=>({vis:document.getElementById('taskVisibility')?.value,rec:document.getElementById('taskRecurrence')?.value||document.querySelector('[name=recurrence],#recurrence')?.value,assignVisible:!!document.getElementById('taskAssigneeSegments')?.offsetHeight,shareActive:[...document.querySelectorAll('[data-task-visibility].active')].map(b=>b.innerText).join()}));
R.errors=[...new Set(h.errors)].slice(0,4);R.errCount=h.errors.length;
for(const [k,v] of Object.entries(R))console.log(who,k,JSON.stringify(v));await h.browser.close();
