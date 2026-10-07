// The old root Planly app was retired. Planly lives at ./v2/ with its own service worker.
// This worker only removes itself and the old root caches, so phones that still have it stop using it.
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(k=>k==='planly-v10'||k.startsWith('planly-root-')).map(k=>caches.delete(k)));
    await self.registration.unregister();
  })());
});
