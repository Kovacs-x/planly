import { launch } from './harness.mjs';
import { ME } from './mock.mjs';
await fetch('http://localhost:8802/__switch?to=pr');
const h=await launch({uid:ME}); const {page:p,W}=h; const q=(f,a)=>p.evaluate(f,a);
await p.goto('http://localhost:8802/planly/v2/'); await W(4000); await p.reload(); await W(9000);
for(const w of [320,390,430]){await p.setViewportSize({width:w,height:800});await W(400);
console.log(w,JSON.stringify(await q(()=>{const r=s=>{const e=document.querySelector(s);if(!e)return null;const b=e.getBoundingClientRect();return [Math.round(b.x),Math.round(b.y),Math.round(b.width),Math.round(b.height)]};return {topbar:r('.topbar'),title:r('#pageTitle'),actions:r('.topActions'),chip:r('#planlySyncChip'),profile:r('#profileToggle'),search:r('#searchToggle'),actionsCss:getComputedStyle(document.querySelector('.topActions')).display+' '+getComputedStyle(document.querySelector('.topActions')).gridTemplateColumns,proj:[...document.querySelectorAll('.compactProjectLink')].map(b=>Math.round(b.getBoundingClientRect().width)+':'+b.innerText).slice(0,3),suggest:r('[data-i2-suggest3]'),docW:document.documentElement.scrollWidth}})))}
await h.browser.close();
