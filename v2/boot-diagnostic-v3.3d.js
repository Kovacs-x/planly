(()=>{
  'use strict';
  const KEY='planly:boot-diagnostic:v1';
  const started=performance.now();
  const events=[];
  const clean=v=>{try{return typeof v==='string'?v:JSON.stringify(v)}catch{return String(v)}};
  const sw=()=>({supported:'serviceWorker'in navigator,controller:navigator.serviceWorker?.controller?.scriptURL||null,swBoot:window.__planlySwBoot||null});
  const state=()=>({
    t:Math.round(performance.now()-started),
    readyState:document.readyState,
    visibility:document.visibilityState,
    online:navigator.onLine,
    href:location.href,
    htmlClass:document.documentElement.className,
    bodyClass:document.body?.className||null,
    bodyPosition:document.body?getComputedStyle(document.body).position:null,
    bodyOverflow:document.body?getComputedStyle(document.body).overflow:null,
    scrollY:window.scrollY,
    ...sw()
  });
  const persist=()=>{try{sessionStorage.setItem(KEY,JSON.stringify({version:'330d-bootdiag-01',startedAt:new Date().toISOString(),events}))}catch{}};
  const mark=(name,detail)=>{events.push({name,detail:detail==null?null:clean(detail),...state()});if(events.length>120)events.shift();persist()};
  window.__planlyBootDiagnostic={version:'330d-bootdiag-01',events,mark,snapshot:state,export:()=>JSON.stringify({version:'330d-bootdiag-01',events},null,2),previous:()=>{try{return JSON.parse(sessionStorage.getItem(KEY)||'null')}catch{return null}}};
  mark('diagnostic-loaded');
  addEventListener('error',e=>mark('window-error',{message:e.message,source:e.filename,line:e.lineno,column:e.colno,error:e.error?.stack||e.error?.message||''}));
  addEventListener('unhandledrejection',e=>mark('unhandled-rejection',e.reason?.stack||e.reason?.message||e.reason));
  document.addEventListener('readystatechange',()=>mark('readystatechange'));
  document.addEventListener('DOMContentLoaded',()=>mark('dom-content-loaded'),{once:true});
  addEventListener('load',()=>{mark('window-load');setTimeout(()=>mark('post-load-250ms'),250);setTimeout(()=>mark('post-load-1500ms'),1500)},{once:true});
  addEventListener('pageshow',e=>mark('pageshow',{persisted:e.persisted}));
  addEventListener('pagehide',e=>mark('pagehide',{persisted:e.persisted}));
  document.addEventListener('visibilitychange',()=>mark('visibilitychange'));
  if('serviceWorker'in navigator){
    navigator.serviceWorker.addEventListener('controllerchange',()=>mark('sw-controllerchange'));
    navigator.serviceWorker.ready.then(reg=>mark('sw-ready',{scope:reg.scope,active:reg.active?.scriptURL||null,state:reg.active?.state||null})).catch(err=>mark('sw-ready-error',err));
  }
  const sample=()=>mark('interaction-sample',{active:document.activeElement?.id||document.activeElement?.tagName||null});
  document.addEventListener('pointerdown',sample,{capture:true,passive:true});
  document.addEventListener('click',e=>mark('click-capture',{tag:e.target?.tagName,id:e.target?.id||null,class:e.target?.className||null}),true);
})();
