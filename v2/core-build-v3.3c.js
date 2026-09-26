/* Planly 4.0F build markers. Injected inside the primary app closure. */
verifyPlanlyOfflineCache=async function(){
  if(!('caches'in window))return {ok:false,missing:['Cache Storage unavailable']};
  try{
    const cache=await caches.open('planly-v2-400f-05'),assets=['./index.html','./app-v3.2.0.js?v=330c02','./supabase-config.js','./manifest.webmanifest','./core-projects-v3.3c.js?v=330c02','./core-build-v3.3c.js?v=400f05','./core-assignment-v3.3c.js?v=330d06','./core-project-planning-v3.3c.js?v=330c04','./core-household-calendar-v3.3c.js?v=330c05','./core-household-planning-safety-v3.3c.js?v=330c05','./core-closeout-v3.3c.js?v=330c06','./core-cloud-readiness-v3.3d.js?v=330d03','./core-release-gate-v3.3d.js?v=330d01','./core-budget-nav-v4.0b1.js?v=400b103','./core-budget-v4.0b.js?v=400c01','./core-budget-ui-v4.0b.js?v=400b401','./core-budget-scope-v4.0c.js?v=400c02','./core-budget-lifecycle-v4.0d.js?v=400e01','./core-budget-monthly-v4.0e.js?v=400e03','./core-budget-month-state-v4.0f.js?v=400f01'],missing=[];
    for(const asset of assets){if(!await cache.match(asset))missing.push(asset)}
    return {ok:missing.length===0,missing};
  }catch(err){return {ok:false,missing:[String(err?.message||err)]}}
};
probePlanlyServiceWorker=async function(){
  if(!navigator.serviceWorker?.controller)return {ok:false,reason:'no-controller'};
  try{
    const res=await planlyWithTimeout(fetch('./__planly_sw_probe__?v=400f05',{cache:'no-store'}),3000,'Service worker probe');
    const text=(await res.text()).trim();
    return {ok:res.ok&&text==='planly-v2-sw-400f-05',reason:text||('HTTP '+res.status)};
  }catch(err){return {ok:false,reason:String(err?.message||err)}}
};

/* Opt-in diagnostics only: ?planlydiag=1. No behaviour changes when disabled. */
if(new URLSearchParams(location.search).get('planlydiag')==='1'){
  const diag={startedAt:new Date().toISOString(),events:[],max:700};
  const describe=el=>{if(!(el instanceof Element))return null;const r=el.getBoundingClientRect(),cs=getComputedStyle(el);return {tag:el.tagName,id:el.id||'',cls:String(el.className||'').slice(0,100),text:String(el.textContent||'').trim().replace(/\s+/g,' ').slice(0,80),top:Math.round(r.top),bottom:Math.round(r.bottom),h:Math.round(r.height),overflowAnchor:cs.overflowAnchor||'',position:cs.position||''}};
  const anchor=()=>{const x=Math.max(1,Math.min(innerWidth-1,Math.round(innerWidth/2))),ys=[1,80,160,Math.round((visualViewport?.height||innerHeight)/2)];return ys.map(y=>describe(document.elementFromPoint(x,Math.min((visualViewport?.height||innerHeight)-1,y)))).filter(Boolean)};
  const snap=()=>({tab:state?.tab||'',scrollY:Math.round(window.scrollY||0),scrollTop:Math.round(document.scrollingElement?.scrollTop||0),docH:document.documentElement?.scrollHeight||0,vvH:Math.round(window.visualViewport?.height||0),vvTop:Math.round(window.visualViewport?.offsetTop||0),focus:document.activeElement?.id||document.activeElement?.tagName||'',bodyOverflow:getComputedStyle(document.body).overflow,htmlOverflow:getComputedStyle(document.documentElement).overflow,anchors:state?.tab==='budget'?anchor():undefined});
  const log=(type,data={})=>{diag.events.push({t:Math.round(performance.now()),type,...snap(),...data});if(diag.events.length>diag.max)diag.events.shift();updatePanel()};
  const originalRender=render;
  render=function(){const before=snap(),stack=(new Error()).stack?.split('\n').slice(1,7).join(' | ')||'';log('render:start',{before,stack});const result=originalRender.apply(this,arguments);requestAnimationFrame(()=>log('render:raf',{before,after:snap()}));return result};
  for(const name of ['scrollTo','scrollBy']){const original=window[name];if(typeof original==='function')window[name]=function(){log('programmatic:'+name,{args:[...arguments],stack:(new Error()).stack?.split('\n').slice(1,6).join(' | ')||''});return original.apply(this,arguments)}}
  const originalFocus=HTMLElement.prototype.focus;HTMLElement.prototype.focus=function(){log('programmatic:focus',{target:describe(this),stack:(new Error()).stack?.split('\n').slice(1,6).join(' | ')||''});return originalFocus.apply(this,arguments)};
  const originalSIV=Element.prototype.scrollIntoView;if(originalSIV)Element.prototype.scrollIntoView=function(){log('programmatic:scrollIntoView',{target:describe(this),args:[...arguments],stack:(new Error()).stack?.split('\n').slice(1,6).join(' | ')||''});return originalSIV.apply(this,arguments)};
  let lastScrollY=Math.round(window.scrollY||0),scrollTimer=0,touching=false,touchY=0;
  addEventListener('touchstart',e=>{touching=true;touchY=Math.round(e.touches?.[0]?.clientY||0);if(state?.tab==='budget')log('touch:start',{touchY,target:describe(e.target)})},{capture:true,passive:true});
  addEventListener('touchend',e=>{if(state?.tab==='budget')log('touch:end',{touchY,target:describe(e.target)});touching=false},{capture:true,passive:true});
  addEventListener('touchcancel',()=>{touching=false},{capture:true,passive:true});
  addEventListener('scroll',()=>{const y=Math.round(window.scrollY||0),delta=y-lastScrollY;lastScrollY=y;clearTimeout(scrollTimer);scrollTimer=setTimeout(()=>log('scroll:settle',{delta,touching,anchors:state?.tab==='budget'?anchor():undefined}),120)},{passive:true});
  addEventListener('focusin',e=>log('focusin',{target:e.target?.id||e.target?.tagName||''}),true);
  addEventListener('resize',()=>log('window:resize'));
  visualViewport?.addEventListener('resize',()=>log('viewport:resize'));
  visualViewport?.addEventListener('scroll',()=>log('viewport:scroll'));
  const panel=document.createElement('div');panel.id='planlyDiagPanel';panel.style.cssText='position:fixed;left:8px;right:8px;bottom:calc(86px + env(safe-area-inset-bottom));z-index:99999;background:rgba(10,12,16,.94);color:#fff;border-radius:14px;padding:8px;font:11px/1.3 -apple-system,sans-serif;max-height:30vh;overflow:auto;box-shadow:0 8px 30px rgba(0,0,0,.35)';
  panel.innerHTML='<div style="display:flex;gap:6px;align-items:center"><strong style="flex:1">Planly diagnostics</strong><button id="planlyDiagMark" type="button">MARK JUMP</button><button id="planlyDiagCopy" type="button">COPY</button></div><pre id="planlyDiagText" style="white-space:pre-wrap;margin:6px 0 0"></pre>';
  document.addEventListener('DOMContentLoaded',()=>{document.body.appendChild(panel);panel.querySelector('#planlyDiagMark').onclick=()=>log('USER:JUMP',{anchors:state?.tab==='budget'?anchor():undefined});panel.querySelector('#planlyDiagCopy').onclick=async()=>{const text=JSON.stringify(diag,null,2);try{await navigator.clipboard.writeText(text);showToast('Diagnostics copied')}catch{prompt('Copy Planly diagnostics:',text)}};log('diag:ready')},{once:true});
  function updatePanel(){const out=panel.querySelector?.('#planlyDiagText');if(!out)return;out.textContent=diag.events.slice(-8).map(e=>`${e.t} ${e.type} tab=${e.tab} y=${e.scrollY} h=${e.docH}`).join('\n')}
  window.PlanlyDiagnostics=diag;
}
