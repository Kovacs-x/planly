const CACHE='planly-v2-calfix';
const VERSION='planly-v2-sw-calfix';
const APP_URL='./app-v3.2.0.js?v=327calfix';
const REQUIRED=['./index.html',APP_URL,'./supabase-config.js','./manifest.webmanifest'];
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
self.addEventListener('install',event=>{
  event.waitUntil((async()=>{
    const cache=await caches.open(CACHE);
    await Promise.allSettled([...REQUIRED,...OPTIONAL].map(url=>cacheOne(cache,url)));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(key=>key.startsWith('planly-v2-')&&key!==CACHE).map(key=>caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener('message',event=>{if(event.data?.type==='SKIP_WAITING')self.skipWaiting()});
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(url.origin===self.location.origin&&url.pathname.endsWith('/__planly_sw_probe__')){
    event.respondWith(new Response(VERSION,{status:200,headers:{'Content-Type':'text/plain','Cache-Control':'no-store'}}));
    return;
  }
  if(event.request.mode==='navigate'){
    event.respondWith((async()=>{
      const fresh=await networkThenCache(event.request,'./index.html');
      if(fresh.type!=='error')return fresh;
      const cache=await caches.open(CACHE);
      return (await cache.match('./index.html'))||new Response('<!doctype html><title>Planly offline</title><body>Planly offline cache is unavailable.</body>',{status:503,headers:{'Content-Type':'text/html'}});
    })());
    return;
  }
  if(url.origin===self.location.origin){
    const isApp=url.pathname.endsWith('/app-v3.2.0.js');
    if(isApp){
      event.respondWith(networkThenCache(event.request,APP_URL));
      return;
    }
    event.respondWith((async()=>{
      const cache=await caches.open(CACHE);
      const cached=await cache.match(event.request);
      if(cached)return cached;
      return networkThenCache(event.request,event.request);
    })());
    return;
  }
  event.respondWith(fetch(event.request).catch(()=>Response.error()));
});
