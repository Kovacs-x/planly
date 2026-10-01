import { launch } from './harness.mjs';
import { ME } from './mock.mjs';
await fetch('http://localhost:8802/__switch?to=pr');
const h=await launch({uid:ME}); const {page:p,W}=h; const q=(f,a)=>p.evaluate(f,a);
await p.goto('http://localhost:8802/planly/v2/'); await W(4000); await p.reload(); await W(9000);
for(const theme of ['light','dark'])for(const w of [320,390,430]){await p.setViewportSize({width:w,height:800});await p.emulateMedia({colorScheme:theme});await W(300);
 await q(()=>{document.querySelector('#profileToggle')?.click()});await W(300);
 const sheet=await q(()=>{const s=document.querySelector('.profileSheet');const small=[...s.querySelectorAll('button')].filter(b=>{const r=b.getBoundingClientRect();return r.height>0&&(r.height<44||r.width<44)}).map(b=>b.innerText.slice(0,15)+' '+Math.round(b.getBoundingClientRect().width)+'x'+Math.round(b.getBoundingClientRect().height));return {small,overflow:s.scrollWidth>s.clientWidth}});
 await q(()=>document.querySelector('[data-profile-settings]')?.click());await W(900);
 const st=await q(()=>{const v=document.querySelector('#view');const small=[...v.querySelectorAll('button,input,select,a')].filter(b=>{const r=b.getBoundingClientRect();const cs=getComputedStyle(b);return r.height>0&&cs.visibility!=='hidden'&&!b.closest('details:not([open])')&&(r.height<44||r.width<44)&&b.type!=='checkbox'&&b.type!=='hidden'}).map(b=>(b.id||b.className||b.tagName).toString().slice(0,30)+' '+Math.round(b.getBoundingClientRect().width)+'x'+Math.round(b.getBoundingClientRect().height));return {title:document.querySelector('#pageTitle')?.innerText,overflow:document.documentElement.scrollWidth>innerWidth,small:[...new Set(small)].slice(0,8)}});
 console.log(theme,w,JSON.stringify({sheet,st}));
 await q(()=>document.querySelector('[data-section="today"]')?.click());await W(400)}
console.log('errors',JSON.stringify(h.errors));await h.browser.close();
