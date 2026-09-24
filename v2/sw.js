const CACHE='planly-v2-3-2-preview-p19';
const ASSETS=['./','./index.html','./app-v3.1.0.js','./app-v3.2.0-migration-preview.js','./supabase-config.js','./manifest.webmanifest','../icon-192.png','../icon-512.png'];

self.addEventListener('install',event=>{
  event.waitUntil(
    caches.open(CACHE)
      .then(cache=>cache.addAll(ASSETS))
      .then(()=>self.skipWaiting())
  );
});

self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(key=>key.startsWith('planly-v2-')&&key!==CACHE).map(key=>caches.delete(key))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  event.respondWith(
    fetch(event.request,{cache:'no-store'})
      .then(response=>{
        const copy=response.clone();
        caches.open(CACHE).then(cache=>cache.put(event.request,copy)).catch(()=>{});
        return response;
      })
      .catch(async()=>{
        const cached=await caches.match(event.request,{ignoreSearch:true});
        if(cached)return cached;
        if(event.request.mode==='navigate')return caches.match('./index.html');
        return Response.error();
      })
  );
});
