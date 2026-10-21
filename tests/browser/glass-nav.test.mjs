// Glass tab bar: a compact capsule floating in the middle above the bottom edge (centred, at most 300px wide, fully
// rounded, frosted with a blur, hairline edge), and a
// strip of the page's own background sits between the page and the bar, so nothing shows under the bar; the tabs still
// work, the + button stays above the bar, and the same holds in dark mode and on a narrow phone.
// Run: node tests/browser/glass-nav.test.mjs (see tests/browser/README.md).
import {startServer,launchBrowser,makeDb,newPhone,openApp,OWNER} from './harness.mjs';
const server=await startServer();const browser=await launchBrowser();
let pass=0,fail=0;const check=(n,c,d='')=>{console.log((c?'PASS ':'FAIL ')+n+(c?'':' — '+d));c?pass++:fail++};
const W=ms=>new Promise(r=>setTimeout(r,ms));
const day=new Date().toISOString().slice(0,10);
const db=makeDb();for(let i=1;i<=16;i++)db.tables.planly_tasks.push({owner_id:OWNER,client_id:'t'+i,data:{id:'t'+i,title:'Task '+i,date:day,time:'',category:'Personal',durationMinutes:30,priority:'normal',completed:false,recurrence:'none',reminder:'none',notes:'',subtasks:[],createdAt:1,updatedAt:1,visibility:'private',projectId:''},visibility:'private',cloud_version:1,deleted_at:null,task_date:day});
for(const [theme,width] of [['light',390],['dark',390],['light',320]]){
  const {context,errors}=await newPhone(browser,db,OWNER);const page=await openApp(context,errors);
  await page.setViewportSize({width,height:844});await page.emulateMedia({colorScheme:theme});await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
  await page.evaluate(()=>window.scrollTo(0,400));await W(500);
  const s=await page.evaluate(()=>{const n=document.querySelector('.nav'),ns=getComputedStyle(n),r=n.getBoundingClientRect(),st=getComputedStyle(document.body,'::after'),bg=getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
    const probe=document.createElement('i');probe.style.color=bg;document.body.appendChild(probe);const bgRgb=getComputedStyle(probe).color;probe.remove();
    const add=document.getElementById('addBtn')?.getBoundingClientRect();
    return {gapBottom:Math.round(innerHeight-r.bottom),left:Math.round(r.left),right:Math.round(innerWidth-r.right),w:Math.round(r.width),h:Math.round(r.height),radius:parseFloat(ns.borderTopLeftRadius),blur:ns.backdropFilter,navZ:Number(ns.zIndex),
      strip:{content:st.content,pos:st.position,z:Number(st.zIndex),bottom:st.bottom,h:parseFloat(st.height),bg:st.backgroundColor,pe:st.pointerEvents},bgRgb,navTop:Math.round(r.top),ih:innerHeight,addBottom:add?Math.round(add.bottom):null}});
  const tag=`${theme}, ${width}px`;
  check(`the bar is a compact capsule floating in the middle: centred, at most 300px wide and 60px tall, inset from the bottom, fully rounded (${tag})`,s.gapBottom>=12&&Math.abs(s.left-s.right)<=1&&s.left>=20&&s.w<=300&&s.h<=60&&s.radius>=s.h/2,JSON.stringify(s));
  check(`…and is frosted glass (${tag})`,/blur\(/.test(s.blur),s.blur);
  check(`a page-coloured strip sits behind the bar, below it in the stack, from above the bar to the screen edge (${tag})`,s.strip.content!=='none'&&s.strip.pos==='fixed'&&s.strip.z<s.navZ&&s.strip.bottom==='0px'&&s.ih-s.strip.h<s.navTop-8&&s.strip.bg===s.bgRgb&&s.strip.pe==='none',JSON.stringify(s));
  check(`the + button stays above the bar (${tag})`,s.addBottom===null||s.addBottom<=s.navTop,JSON.stringify({add:s.addBottom,navTop:s.navTop}));
  await page.locator('.nav button[data-tab="upcoming"]').tap();await W(800);
  check(`the tabs still work (${tag})`,await page.evaluate(()=>document.querySelector('.nav button.active')?.dataset.section)==='plan');
  check(`no page errors (${tag})`,errors.length===0,errors.slice(0,2).join(' | '));
  await context.close();
}
console.log(`\n${pass} passed, ${fail} failed`);await browser.close();server.close();process.exit(fail?1:0);
