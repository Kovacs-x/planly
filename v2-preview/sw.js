const CACHE='planly-preview-v3-2-p28';
const VERSION='planly-preview-sw-p28';
const ASSETS=['./','./index.html','./app-v3.2.0-migration-preview.js','./supabase-config.js','./manifest.webmanifest','../icon-192.png','../icon-512.png'];

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting()));
});

self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(key=>key.startsWith('planly-preview-v3-2-')&&key!==CACHE).map(key=>caches.delete(key))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener('message',event=>{
  if(event.data?.type==='SKIP_WAITING')self.skipWaiting();
});

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(url.origin===self.location.origin&&url.pathname.endsWith('/__planly_sw_probe__')){
    event.respondWith(new Response(VERSION,{status:200,headers:{'Content-Type':'text/plain','Cache-Control':'no-store'}}));
    return;
  }
  if(event.request.mode==='navigate'){
    event.respondWith(
      caches.open(CACHE).then(async cache=>{
        const cached=await cache.match('./index.html',{ignoreSearch:true})||await cache.match('./',{ignoreSearch:true});
        if(cached)return cached;
        try{
          const response=await fetch(event.request,{cache:'no-store'});
          if(response?.ok)cache.put('./index.html',response.clone()).catch(()=>{});
          return response;
        }catch{
          return new Response('<!doctype html><title>Planly offline</title><body>Planly offline cache is unavailable.</body>',{status:503,headers:{'Content-Type':'text/html'}});
        }
      })
    );
    return;
  }
  if(url.origin===self.location.origin){
    event.respondWith(
      caches.match(event.request,{ignoreSearch:true}).then(async cached=>{
        if(cached)return cached;
        try{
          const response=await fetch(event.request,{cache:'no-store'});
          if(response?.ok)caches.open(CACHE).then(cache=>cache.put(event.request,response.clone())).catch(()=>{});
          return response;
        }catch{return Response.error()}
      })
    );
    return;
  }
  event.respondWith(fetch(event.request).catch(()=>Response.error()));
});
