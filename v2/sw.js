const CACHE='planly-v2-330c01';
const VERSION='planly-v2-sw-330c01';
const APP_URL='./app-v3.2.0.js?v=330c01';
const HARDENING_URL='./hardening-v3.3b.js?v=330c01';
const CORE_PROJECTS_URL='./core-projects-v3.3c.js?v=330c01';
const CORE_ASSIGNMENT_URL='./core-assignment-v3.3c.js?v=330c01';
const REQUIRED=['./index.html',APP_URL,HARDENING_URL,CORE_PROJECTS_URL,CORE_ASSIGNMENT_URL,'./supabase-config.js','./manifest.webmanifest'];
const OPTIONAL=['./','../icon-192.png','../icon-512.png'];

async function cacheOne(cache,url){
  try{
    const response=await fetch(url,{cache:'no-store'});
    if(response?.ok){await cache.put(url,response.clone());return true}
  }catch{}
  return false;
}
async function networkThenCache(request,cacheKey){
  const cache=await caches.open(CACHE);
  try{
    const response=await fetch(request,{cache:'no-store'});
    if(response?.ok)await cache.put(cacheKey,response.clone());
    return response;
  }catch{
    return (await cache.match(cacheKey))||Response.error();
  }
}
async function hardenedAppResponse(request){
  const cache=await caches.open(CACHE);
  let appResponse,hardeningResponse,coreProjectsResponse,coreAssignmentResponse;
  try{
    [appResponse,hardeningResponse,coreProjectsResponse,coreAssignmentResponse]=await Promise.all([fetch(request,{cache:'no-store'}),fetch(HARDENING_URL,{cache:'no-store'}),fetch(CORE_PROJECTS_URL,{cache:'no-store'}),fetch(CORE_ASSIGNMENT_URL,{cache:'no-store'})]);
    if(appResponse?.ok)await cache.put(APP_URL,appResponse.clone());
    if(hardeningResponse?.ok)await cache.put(HARDENING_URL,hardeningResponse.clone());
    if(coreProjectsResponse?.ok)await cache.put(CORE_PROJECTS_URL,coreProjectsResponse.clone());
    if(coreAssignmentResponse?.ok)await cache.put(CORE_ASSIGNMENT_URL,coreAssignmentResponse.clone());
  }catch{}
  if(!appResponse?.ok)appResponse=await cache.match(APP_URL);
  if(!hardeningResponse?.ok)hardeningResponse=await cache.match(HARDENING_URL);
  if(!coreProjectsResponse?.ok)coreProjectsResponse=await cache.match(CORE_PROJECTS_URL);
  if(!coreAssignmentResponse?.ok)coreAssignmentResponse=await cache.match(CORE_ASSIGNMENT_URL);
  if(!appResponse)return Response.error();
  let appText=await appResponse.text();
  const hardeningText=hardeningResponse?await hardeningResponse.text():'';
  const coreProjectsText=coreProjectsResponse?await coreProjectsResponse.text():'';
  const coreAssignmentText=coreAssignmentResponse?await coreAssignmentResponse.text():'';
  const coreText=[coreProjectsText,coreAssignmentText].filter(Boolean).join('\n');
  if(coreText){
    const closeIndex=appText.lastIndexOf('})();');
    if(closeIndex<0)return new Response('Planly core injection point missing',{status:500,headers:{'Content-Type':'text/plain','Cache-Control':'no-store'}});
    appText=appText.slice(0,closeIndex)+'\n'+coreText+'\n'+appText.slice(closeIndex);
  }
  return new Response(appText+'\n;'+hardeningText,{status:200,headers:{'Content-Type':'application/javascript; charset=utf-8','Cache-Control':'no-store'}});
}
self.addEventListener('install',event=>{event.waitUntil((async()=>{const cache=await caches.open(CACHE);await Promise.allSettled([...REQUIRED,...OPTIONAL].map(url=>cacheOne(cache,url)));await self.skipWaiting()})())});
self.addEventListener('activate',event=>{event.waitUntil((async()=>{const keys=await caches.keys();await Promise.all(keys.filter(key=>key.startsWith('planly-v2-')&&key!==CACHE).map(key=>caches.delete(key)));await self.clients.claim()})())});
self.addEventListener('message',event=>{if(event.data?.type==='SKIP_WAITING')self.skipWaiting()});
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(url.origin===self.location.origin&&url.pathname.endsWith('/__planly_sw_probe__')){event.respondWith(new Response(VERSION,{status:200,headers:{'Content-Type':'text/plain','Cache-Control':'no-store'}}));return}
  if(event.request.mode==='navigate'){
    event.respondWith((async()=>{const fresh=await networkThenCache(event.request,'./index.html');if(fresh.type!=='error')return fresh;const cache=await caches.open(CACHE);return (await cache.match('./index.html'))||new Response('<!doctype html><title>Planly offline</title><body>Planly offline cache is unavailable.</body>',{status:503,headers:{'Content-Type':'text/html'}})})());return;
  }
  if(url.origin===self.location.origin){
    const isApp=url.pathname.endsWith('/app-v3.2.0.js');if(isApp){event.respondWith(hardenedAppResponse(event.request));return}
    event.respondWith((async()=>{const cache=await caches.open(CACHE);const cached=await cache.match(event.request);if(cached)return cached;return networkThenCache(event.request,event.request)})());return;
  }
  event.respondWith(fetch(event.request).catch(()=>Response.error()));
});