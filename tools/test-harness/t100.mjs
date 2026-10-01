// R1 layout + a11y sweep
import { launch } from './harness.mjs';
import { ME, PARTNER, HH } from './mock.mjs';
const B='http://localhost:8802/planly/v2/'; const which=process.argv[2]||'pr'; await fetch('http://localhost:8802/__switch?to='+which);
const h=await launch({uid:ME}); const {page:p,W,MOCK,ctx}=h;
MOCK.db.planly_household_invites.push({id:'inv1',household_id:HH,invited_email:'wife@example.com',invited_by:ME,accepted_by:PARTNER,status:'accepted',accepted_at:new Date().toISOString(),token_hash:'h',created_at:new Date().toISOString(),expires_at:new Date(Date.now()+864e5).toISOString()});
await p.goto(B); await W(4000); await p.reload(); await W(9000);
const go=async(sec,seg)=>{await p.evaluate(s=>document.querySelector(`.nav button[data-section="${s}"]`)?.click(),sec);await W(700);if(seg){await p.evaluate(s=>document.querySelector(`[data-plan-segment="${s}"]`)?.click(),seg);await W(700)}await p.evaluate(()=>scrollTo(0,0));await W(200)};
const audit=()=>p.evaluate(()=>{
 const vis=e=>{const r=e.getBoundingClientRect();if(r.width<1||r.height<1)return false;const cs=getComputedStyle(e);if(cs.visibility==='hidden'||cs.display==='none'||+cs.opacity===0)return false;let x=e;while(x){if(x.hidden||getComputedStyle(x).display==='none')return false;x=x.parentElement}return true};
 const overlayClosed=e=>{const w=e.closest('#planlyListsWrap,.sheetWrap,.planlyListsWrap,[role=dialog]');return w&&!w.classList.contains('open')&&getComputedStyle(w).visibility!=='visible'};
 const name=e=>(e.getAttribute('aria-label')||e.getAttribute('title')||e.innerText||'').trim().replace(/\s+/g,' ').slice(0,40);
 const cv=document.createElement('canvas');cv.width=cv.height=1;const cx=cv.getContext('2d',{willReadFrequently:true});
 const rgba=c=>{cx.clearRect(0,0,1,1);cx.fillStyle='#000';cx.fillStyle=c;cx.fillRect(0,0,1,1);const d=cx.getImageData(0,0,1,1).data;return [d[0],d[1],d[2],d[3]/255]};
 const alphaOf=c=>{const m=c.match(/\/\s*([\d.]+)\s*\)|rgba\([^)]*,\s*([\d.]+)\)/);return m?+(m[1]??m[2]):(c==='transparent'?0:1)};
 const lum=([r,g,b])=>{const f=v=>{v/=255;return v<=.03928?v/12.92:((v+.055)/1.055)**2.4};return .2126*f(r)+.7152*f(g)+.0722*f(b)};
 const bgOf=e=>{const layers=[];let x=e,grad=false;while(x){const cs=getComputedStyle(x);if(cs.backgroundImage&&cs.backgroundImage!=='none')grad=true;const a=alphaOf(cs.backgroundColor);if(a>0){layers.push([rgba(cs.backgroundColor.replace(/\/\s*[\d.]+\s*\)/,')').replace(/rgba\(([^,]+),([^,]+),([^,]+),[^)]*\)/,'rgb($1,$2,$3)')),a]);if(a>=0.99)break}x=x.parentElement}
   let base=rgba(getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()||'#fff');for(const [c,a] of layers.reverse())base=[0,1,2].map(i=>c[i]*a+base[i]*(1-a));return {c:base,grad}};
 const out={overflow:document.documentElement.scrollWidth-innerWidth,small:[],contrast:[],unlabelled:[],noname:[],glyphs:[]};
 for(const e of document.querySelectorAll('button,a[href],input,select,textarea,[role=button],[role=tab],summary')){if(!vis(e)||overlayClosed(e))continue;if(e.closest('.nav')&&false)continue;const r=e.getBoundingClientRect();if(e.type==='hidden')continue;
  if((r.width<44||r.height<44)&&!(e.type==='checkbox'||e.type==='radio'))out.small.push(`${e.tagName.toLowerCase()}${e.id?'#'+e.id:''}.${[...e.classList].slice(0,2).join('.')} "${name(e)}" ${Math.round(r.width)}x${Math.round(r.height)}`);
  if(!name(e)&&!['INPUT','SELECT','TEXTAREA'].includes(e.tagName))out.noname.push(`${e.tagName}${e.id?'#'+e.id:''}.${e.className}`);
  if(['INPUT','SELECT','TEXTAREA'].includes(e.tagName)&&!['checkbox','radio','submit','button'].includes(e.type)){const lab=e.getAttribute('aria-label')||e.getAttribute('aria-labelledby')||(e.id&&document.querySelector(`label[for="${e.id}"]`))||e.closest('label');if(!lab)out.unlabelled.push(`${e.tagName.toLowerCase()}#${e.id||'?'} ph="${e.placeholder||''}"`)}}
 const tw=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let n;const seen=new Set();
 while(n=tw.nextNode()){const t=n.textContent.trim();if(!t)continue;const e=n.parentElement;if(!e||seen.has(e)||!vis(e)||overlayClosed(e))continue;seen.add(e);const r=e.getBoundingClientRect();if(r.bottom<0||r.top>innerHeight*3)continue;
  if(/[⌂☆★≡☑▦✓•]|\p{Extended_Pictographic}/u.test(t)&&!/^•••$/.test(t))out.glyphs.push(t.slice(0,30));
  const cs=getComputedStyle(e);const bgi=bgOf(e);if(bgi.grad)continue;const fa=alphaOf(cs.color);if(fa<0.5)continue;const fgc=rgba(cs.color.replace(/\/\s*[\d.]+\s*\)/,')'));const fg=cs.color,bg='rgb('+bgi.c.map(Math.round).join(',')+')';const L1=lum(fgc),L2=lum(bgi.c);const cr=(Math.max(L1,L2)+.05)/(Math.min(L1,L2)+.05);const fs=parseFloat(cs.fontSize),bold=+cs.fontWeight>=700;const need=(fs>=24||(bold&&fs>=18.66))?3:4.5;if(cr<need)out.contrast.push(`"${t.slice(0,24)}" ${cr.toFixed(2)} fs${fs} ${fg}/${bg}`)}
 const fab=document.getElementById('addBtn'),nav=document.querySelector('.nav');if(fab&&vis(fab)&&nav){const a=fab.getBoundingClientRect(),b=nav.getBoundingClientRect();out.fabNavGap=Math.round(b.top-a.bottom)}
 out.navH=nav?Math.round(nav.getBoundingClientRect().height):0;out.labels=[...document.querySelectorAll('.nav .navLabel')].map(x=>getComputedStyle(x).fontSize).join(',');
 out.title=document.getElementById('pageTitle')?.textContent+' / '+document.getElementById('eyebrow')?.textContent;return out});
const coverCheck=()=>p.evaluate(async()=>{scrollTo(0,document.documentElement.scrollHeight);await new Promise(r=>setTimeout(r,300));const fab=document.getElementById('addBtn'),nav=document.querySelector('.nav');const cover=(fab&&getComputedStyle(fab).display!=='none')?fab.getBoundingClientRect().top:nav.getBoundingClientRect().top;const items=[...document.querySelectorAll('#view .task, #view button, #view .homeSection, #view .empty')].filter(e=>e.getBoundingClientRect().height>0);const last=items.sort((a,b)=>b.getBoundingClientRect().bottom-a.getBoundingClientRect().bottom)[0];const lb=last?last.getBoundingClientRect().bottom:0;scrollTo(0,0);return {lastBottom:Math.round(lb),coverTop:Math.round(cover),covered:lb>cover}});
const views=[['today'],['plan','upcoming'],['plan','month'],['plan','inbox'],['plan','projects'],['home'],['budget'],['settings']];
const res={};
for(const theme of ['light','dark'])for(const w of [320,390,430]){await p.setViewportSize({width:w,height:w===320?568:(w===390?844:932)});await p.evaluate(t=>{document.documentElement.dataset.theme=t},theme);
 for(const [s,g] of views){await go(s,g);await p.evaluate(t=>{document.documentElement.dataset.theme=t},theme);await W(150);const a=await audit();a.cover=await coverCheck();res[`${theme} ${w} ${s}${g?'/'+g:''}`]=a;if(w===390||w===320)await p.screenshot({path:`shots/r1/${theme}-${w}-${s}${g?'-'+g:''}.png`})}}
for(const [k,a] of Object.entries(res)){console.log(`## ${k} | title=${a.title} overflow=${a.overflow} fabNavGap=${a.fabNavGap} navLabels=${a.labels} cover=${JSON.stringify(a.cover)}`);if(a.small.length)console.log('  small:',a.small.length,JSON.stringify([...new Set(a.small)].slice(0,14)));if(a.contrast.length)console.log('  contrast:',a.contrast.length,JSON.stringify([...new Set(a.contrast)].slice(0,10)));if(a.unlabelled.length)console.log('  unlabelled:',JSON.stringify(a.unlabelled));if(a.noname.length)console.log('  noname:',JSON.stringify(a.noname));if(a.glyphs.length)console.log('  glyphs:',JSON.stringify([...new Set(a.glyphs)].slice(0,10)))}
console.log('errors',JSON.stringify(h.errors));
await h.browser.close();
