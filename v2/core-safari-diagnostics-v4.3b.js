// Planly 4.3B — low-overhead Safari tap/freeze diagnostics.
(()=>{'use strict';
const KEY='planly-safari-diagnostics-v2',MAX=30,MAX_BYTES=64000;let events=[];
const trim=s=>String(s??'').replace(/\s+/g,' ').trim().slice(0,40);
function load(){try{const v=JSON.parse(localStorage.getItem(KEY)||'[]');events=Array.isArray(v)?v:[]}catch{events=[]}}load();
const elInfo=el=>{if(!(el instanceof Element))return null;const r=el.getBoundingClientRect(),cs=getComputedStyle(el),own=Array.from(el.childNodes).filter(n=>n.nodeType===3).map(n=>n.textContent).join(' ');return {tag:el.tagName,id:el.id||'',cls:trim(el.className),text:trim(own),z:cs.zIndex,pointer:cs.pointerEvents,position:cs.position,rect:[Math.round(r.left),Math.round(r.top),Math.round(r.width),Math.round(r.height)]}};
function persist(){while(events.length>MAX)events.shift();try{let s=JSON.stringify(events);while(s.length>MAX_BYTES&&events.length>1){events.shift();s=JSON.stringify(events)}localStorage.setItem(KEY,s)}catch{}}
function push(e){events.push(e);persist();return e}
function base(reason){const b=document.body,html=document.documentElement,bs=b?getComputedStyle(b):null;return {at:new Date().toISOString(),reason,htmlClass:html.className,bodyClass:b?.className||'',bodyOverflow:bs?.overflow||'',bodyPosition:bs?.position||'',scrollY:Math.round(scrollY)}}
function blockers(){const out=[];for(const el of document.querySelectorAll('body *')){const cs=getComputedStyle(el);if(cs.display==='none'||cs.visibility==='hidden'||cs.pointerEvents==='none')continue;const r=el.getBoundingClientRect(),z=Number.parseInt(cs.zIndex,10);if((cs.position==='fixed'||cs.position==='absolute')&&Number.isFinite(z)&&z>=20&&r.width>=innerWidth*.8&&r.height>=innerHeight*.55)out.push(elInfo(el))}return out.slice(-8)}
async function swInfo(){try{const reg=await navigator.serviceWorker?.getRegistration('./');return {controller:navigator.serviceWorker?.controller?.scriptURL||'',active:reg?.active?.state||'',waiting:reg?.waiting?.state||'',installing:reg?.installing?.state||''}}catch(err){return {error:trim(err?.message||err)}}}
async function full(reason,extra={}){const active=document.activeElement,s={...base(reason),href:location.href,visibility:document.visibilityState,online:navigator.onLine,active:elInfo(active),blockers:blockers(),sw:await swInfo(),boot:window.__planlySwBoot||null,...extra};return push(s)}
function light(reason,extra={}){return push({...base(reason),...extra})}
function recordError(kind,value){light(kind,{error:{message:trim(value?.message||value?.reason?.message||value?.reason||value)}})}
addEventListener('error',e=>recordError('error',e));addEventListener('unhandledrejection',e=>recordError('unhandledrejection',e));
addEventListener('pageshow',e=>light('pageshow',{persisted:!!e.persisted}),{once:true});
let down=null,seq=0,pending=new Map();
document.addEventListener('pointerdown',e=>{down={t:performance.now(),x:e.clientX,y:e.clientY,target:elInfo(e.target)}},{capture:true,passive:true});
document.addEventListener('click',e=>{let best=null;for(const [id,p] of pending)if(!best||p.at>best.p.at)best={id,p};if(best){best.p.clicked=true;best.p.click=elInfo(e.target)}},{capture:true,passive:true});
document.addEventListener('pointerup',e=>{if(!down)return;const d=down;down=null;const dt=Math.round(performance.now()-d.t),move=Math.round(Math.hypot(e.clientX-d.x,e.clientY-d.y));if(dt>=900||move>=18)return;const id=++seq,up=elInfo(e.target),hit=elInfo(document.elementFromPoint(e.clientX,e.clientY)),p={at:performance.now(),clicked:false};pending.set(id,p);setTimeout(()=>{pending.delete(id);const entry=light('tap',{tap:{dt,move,down:d.target,up,hit,clicked:p.clicked,click:p.click||null}});if(!p.clicked)setTimeout(()=>full('tap-no-click',{tap:entry.tap}),0)},320)},{capture:true,passive:true});
async function report(){const now=await full('manual-report');return JSON.stringify({generatedAt:new Date().toISOString(),note:'May contain short excerpts of on-screen text (max 40 characters per captured element).',userAgent:navigator.userAgent,screen:{w:screen.width,h:screen.height,dpr:devicePixelRatio},current:now,events},null,2)}
async function copy(){const text=await report();try{await navigator.clipboard.writeText(text);return true}catch{return false}}
function expose(){window.PlanlySafariDiagnostics={snapshot:full,report,copy,clear(){events=[];try{localStorage.removeItem(KEY)}catch{}},getEvents(){return events.slice()}}}
expose();
})();