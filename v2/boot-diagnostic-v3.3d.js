(()=>{
  'use strict';
  const KEY='planly:boot-diagnostic:v1';
  const started=performance.now();
  let previous=null;
  try{previous=JSON.parse(sessionStorage.getItem(KEY)||'null')}catch{}
  const events=[];
  const clean=v=>{try{return typeof v==='string'?v:JSON.stringify(v)}catch{return String(v)}};
  const sw=()=>({supported:'serviceWorker'in navigator,controller:navigator.serviceWorker?.controller?.scriptURL||null,swBoot:window.__planlySwBoot||null});
  const state=()=>({t:Math.round(performance.now()-started),readyState:document.readyState,visibility:document.visibilityState,online:navigator.onLine,href:location.href,htmlClass:document.documentElement.className,bodyClass:document.body?.className||null,bodyPosition:document.body?getComputedStyle(document.body).position:null,bodyOverflow:document.body?getComputedStyle(document.body).overflow:null,scrollY:window.scrollY,...sw()});
  const payload=()=>({version:'330d-bootdiag-02',previous,current:{startedAt:new Date().toISOString(),events}});
  const persist=()=>{try{sessionStorage.setItem(KEY,JSON.stringify({version:'330d-bootdiag-02',startedAt:new Date().toISOString(),events}))}catch{}};
  const mark=(name,detail)=>{events.push({name,detail:detail==null?null:clean(detail),...state()});if(events.length>120)events.shift();persist()};
  const exportTrace=()=>JSON.stringify(payload(),null,2);
  window.__planlyBootDiagnostic={version:'330d-bootdiag-02',events,mark,snapshot:state,export:exportTrace,previous:()=>previous};
  const panel=()=>{
    if(document.getElementById('planlyBootDiagPanel'))return;
    const box=document.createElement('details');box.id='planlyBootDiagPanel';box.style.cssText='position:fixed;z-index:2147483647;left:8px;right:8px;bottom:calc(82px + env(safe-area-inset-bottom));max-height:52vh;overflow:auto;background:#fff;color:#111;border:2px solid #111;border-radius:12px;padding:10px;font:12px/1.35 -apple-system,BlinkMacSystemFont,sans-serif;box-shadow:0 8px 30px #0004';
    const sum=document.createElement('summary');sum.textContent='Planly startup diagnostic';sum.style.cssText='font-weight:700;font-size:14px;cursor:pointer';box.appendChild(sum);
    const info=document.createElement('div');info.style.cssText='margin:8px 0';info.textContent=previous?'Previous first-load trace preserved.':'No previous trace yet. Reproduce freeze, then refresh once.';box.appendChild(info);
    const btn=document.createElement('button');btn.type='button';btn.textContent='Show trace';btn.style.cssText='padding:8px 12px;margin:0 8px 8px 0';box.appendChild(btn);
    const copy=document.createElement('button');copy.type='button';copy.textContent='Copy trace';copy.style.cssText='padding:8px 12px;margin-bottom:8px';box.appendChild(copy);
    const pre=document.createElement('pre');pre.style.cssText='display:none;white-space:pre-wrap;word-break:break-word;user-select:text;border-top:1px solid #ccc;padding-top:8px;margin:0;max-height:32vh;overflow:auto';box.appendChild(pre);
    btn.onclick=()=>{pre.textContent=exportTrace();pre.style.display='block';box.open=true;mark('diagnostic-trace-shown')};
    copy.onclick=async()=>{const text=exportTrace();try{await navigator.clipboard.writeText(text);copy.textContent='Copied';setTimeout(()=>copy.textContent='Copy trace',1500)}catch{pre.textContent=text;pre.style.display='block';box.open=true;copy.textContent='Select trace below'}mark('diagnostic-trace-copy')};
    document.body.appendChild(box);
  };
  mark('diagnostic-loaded');
  addEventListener('error',e=>mark('window-error',{message:e.message,source:e.filename,line:e.lineno,column:e.colno,error:e.error?.stack||e.error?.message||''}));
  addEventListener('unhandledrejection',e=>mark('unhandled-rejection',e.reason?.stack||e.reason?.message||e.reason));
  document.addEventListener('readystatechange',()=>mark('readystatechange'));
  document.addEventListener('DOMContentLoaded',()=>{mark('dom-content-loaded');panel()},{once:true});
  addEventListener('load',()=>{mark('window-load');panel();setTimeout(()=>mark('post-load-250ms'),250);setTimeout(()=>mark('post-load-1500ms'),1500)},{once:true});
  addEventListener('pageshow',e=>mark('pageshow',{persisted:e.persisted}));
  addEventListener('pagehide',e=>mark('pagehide',{persisted:e.persisted}));
  document.addEventListener('visibilitychange',()=>mark('visibilitychange'));
  if('serviceWorker'in navigator){navigator.serviceWorker.addEventListener('controllerchange',()=>mark('sw-controllerchange'));navigator.serviceWorker.ready.then(reg=>mark('sw-ready',{scope:reg.scope,active:reg.active?.scriptURL||null,state:reg.active?.state||null})).catch(err=>mark('sw-ready-error',err))}
  const sample=()=>mark('interaction-sample',{active:document.activeElement?.id||document.activeElement?.tagName||null});
  document.addEventListener('pointerdown',sample,{capture:true,passive:true});
  document.addEventListener('click',e=>mark('click-capture',{tag:e.target?.tagName,id:e.target?.id||null,class:e.target?.className||null}),true);
})();
