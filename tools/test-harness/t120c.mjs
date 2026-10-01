import { launch } from './harness.mjs';
import { ME } from './mock.mjs';
await fetch('http://localhost:8802/__switch?to='+(process.env.TREE||'pr'));
const W0=Number(process.env.VW||390);
const h=await launch({uid:ME}); const {page:p,W}=h; const q=(f,a)=>p.evaluate(f,a); const R={};
await p.setViewportSize({width:W0,height:844});
await p.goto('http://localhost:8802/planly/v2/'); await W(4000); await p.reload(); await W(10000);
if(process.env.DENS){await q(d=>{const b=[...document.querySelectorAll('button,[role=radio]')].find(b=>b.textContent.trim()===d);b?.click()},process.env.DENS)}
for(const name of ['Laundry','Dentist']){await q(n=>{const t=[...document.querySelectorAll('.top3List .task')].some(t=>t.innerText.includes(n));if(t)return;const x=[...document.querySelectorAll('#view .task')].find(t=>t.innerText.includes(n));x?.querySelector('[data-action="pin"]')?.click()},name);await W(1200)}
R.where=await q(()=>[...document.querySelectorAll('.top3DragHandle')].map(h=>{const s=h.closest('section');const t=h.closest('.task');return (h.closest('.top3List')?'top3List':'OTHER')+' | section:'+(s?.querySelector('h2')?.innerText||s?.className||'-')+' | task:'+t?.querySelector('.taskTitle')?.innerText+' | visible:'+(h.getBoundingClientRect().height>0)+' | inView:'+!!h.closest('#view')}));
R.before=await q(()=>[...document.querySelectorAll('.top3List .task')].map(t=>t.querySelector('.taskTitle').innerText+(t.classList.contains('compactTask')?' [compact]':' [comfortable]')));
R.drag=await q(async()=>{const sleep=ms=>new Promise(r=>setTimeout(r,ms));const list=document.querySelector('.top3List');const rows=[...list.querySelectorAll('.task')];const hd=rows[0].querySelector('.top3DragHandle');if(!hd)return 'no handle';const r0=hd.getBoundingClientRect(),r1=rows[1].getBoundingClientRect();const x=r0.x+r0.width/2;let y=r0.y+r0.height/2;const mk=(type,yy)=>{const t=new Touch({identifier:1,target:hd,clientX:x,clientY:yy});hd.dispatchEvent(new TouchEvent(type,{bubbles:true,cancelable:true,touches:type==='touchend'?[]:[t],targetTouches:type==='touchend'?[]:[t],changedTouches:[t]}))};mk('touchstart',y);const endY=r1.bottom+20;for(let i=1;i<=10;i++){await sleep(30);mk('touchmove',y+(endY-y)*i/10)}mk('touchend',endY);await sleep(50);return 'ok'});
await W(1500);
R.afterDrag=await q(()=>[...document.querySelectorAll('.top3List .task .taskTitle')].map(t=>t.innerText));
R.stateOrder=await q(()=>JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k=>{try{const v=JSON.parse(localStorage.getItem(k));return Array.isArray(v?.tasks)}catch{return false}}))||'{}').tasks?.filter(t=>t.pinned).map(t=>t.title+':'+t.top3Order));
R.patches=h.reqs?h.reqs.filter(r=>r.method==='PATCH'||r.method==='POST').slice(-6).map(r=>r.method+' '+r.url.split('/rest/v1/')[1]?.slice(0,80)):'n/a';
await p.reload(); await W(9000);
R.afterReload=await q(()=>[...document.querySelectorAll('.top3List .task')].map(t=>t.querySelector('.taskTitle').innerText+' handle:'+!!t.querySelector('.top3DragHandle')));
R.errors=h.errors;for(const [k,v] of Object.entries(R))console.log(k,JSON.stringify(v));await h.browser.close();
