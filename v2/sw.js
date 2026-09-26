const CACHE='planly-v2-400b04';
const VERSION='planly-v2-sw-400b04';
const APP_URL='./app-v3.2.0.js?v=330c02';
const HARDENING_URL='./hardening-v3.3b.js?v=330c02';
const CORE_PROJECTS_URL='./core-projects-v3.3c.js?v=330c02';
const CORE_BUILD_URL='./core-build-v3.3c.js?v=400b04';
const CORE_ASSIGNMENT_URL='./core-assignment-v3.3c.js?v=330d06';
const CORE_PROJECT_PLANNING_URL='./core-project-planning-v3.3c.js?v=330c04';
const CORE_HOUSEHOLD_CALENDAR_URL='./core-household-calendar-v3.3c.js?v=330c05';
const CORE_HOUSEHOLD_PLANNING_SAFETY_URL='./core-household-planning-safety-v3.3c.js?v=330c05';
const CORE_CLOSEOUT_URL='./core-closeout-v3.3c.js?v=330c06';
const CORE_CLOUD_READINESS_URL='./core-cloud-readiness-v3.3d.js?v=330d03';
const CORE_RELEASE_GATE_URL='./core-release-gate-v3.3d.js?v=330d01';
const BUDGET_RUNTIME_URL='./core-budget-v4.0b.js?v=400b03';
const BUDGET_UI_URL='./core-budget-ui-v4.0b.js?v=400b01';
const CORE_URLS=[CORE_PROJECTS_URL,CORE_BUILD_URL,CORE_ASSIGNMENT_URL,CORE_PROJECT_PLANNING_URL,CORE_HOUSEHOLD_CALENDAR_URL,CORE_HOUSEHOLD_PLANNING_SAFETY_URL,CORE_CLOSEOUT_URL,CORE_CLOUD_READINESS_URL,CORE_RELEASE_GATE_URL];
const APPEND_URLS=[BUDGET_RUNTIME_URL,BUDGET_UI_URL];
const REQUIRED=['./index.html',APP_URL,HARDENING_URL,...CORE_URLS,...APPEND_URLS,'./supabase-config.js','./manifest.webmanifest'];
const OPTIONAL=['./','../icon-192.png','../icon-512.png'];
async function cacheOne(cache,url){try{const response=await fetch(url,{cache:'no-store'});if(response?.ok){await cache.put(url,response.clone());return true}}catch{}return false}
async function networkThenCache(request,cacheKey){const cache=await caches.open(CACHE);try{const response=await fetch(request,{cache:'no-store'});if(response?.ok)await cache.put(cacheKey,response.clone());return response}catch{return (await cache.match(cacheKey))||Response.error()}}
async function freshOrCached(cache,url,request=null){try{const response=await fetch(request||url,{cache:'no-store'});if(response?.ok){await cache.put(url,response.clone());return response}}catch{}return cache.match(url)}
async function hardenedAppResponse(request){const cache=await caches.open(CACHE);const [appResponse,hardeningResponse,...moduleResponses]=await Promise.all([freshOrCached(cache,APP_URL,request),freshOrCached(cache,HARDENING_URL),...CORE_URLS.map(url=>freshOrCached(cache,url)),...APPEND_URLS.map(url=>freshOrCached(cache,url))]);if(!appResponse)return Response.error();let appText=await appResponse.text();const coreResponses=moduleResponses.slice(0,CORE_URLS.length),appendResponses=moduleResponses.slice(CORE_URLS.length),coreTexts=[];for(const response of coreResponses)if(response)coreTexts.push(await response.text());if(coreTexts.length){const closeIndex=appText.lastIndexOf('})();');if(closeIndex<0)return new Response('Planly core injection point missing',{status:500,headers:{'Content-Type':'text/plain','Cache-Control':'no-store'}});appText=appText.slice(0,closeIndex)+'\n'+coreTexts.join('\n')+'\n'+appText.slice(closeIndex)}const appendTexts=[];for(const response of appendResponses)if(response)appendTexts.push(await response.text());if(appendTexts.length!==APPEND_URLS.length)return new Response('Planly appended module missing',{status:500,headers:{'Content-Type':'text/plain','Cache-Control':'no-store'}});const hardeningText=hardeningResponse?await hardeningResponse.text():'';return new Response(appText+'\n;'+hardeningText+'\n;'+appendTexts.join('\n;'),{status:200,headers:{'Content-Type':'application/javascript; charset=utf-8','Cache-Control':'no-store'}})}
self.addEventListener('install',event=>{event.waitUntil((async()=>{const cache=await caches.open(CACHE);await Promise.allSettled([...REQUIRED,...OPTIONAL].map(url=>cacheOne(cache,url)));await self.skipWaiting()})())});
self.addEventListener('activate',event=>{event.waitUntil((async()=>{const keys=await caches.keys();await Promise.all(keys.filter(key=>key.startsWith('planly-v2-')&&key!==CACHE).map(key=>caches.delete(key)));await self.clients.claim()})())});
self.addEventListener('message',event=>{if(event.data?.type==='SKIP_WAITING')self.skipWaiting()});
self.addEventListener('fetch',event=>{if(event.request.method!=='GET')return;const url=new URL(event.request.url);if(url.origin===self.location.origin&&url.pathname.endsWith('/__planly_sw_probe__')){event.respondWith(new Response(VERSION,{status:200,headers:{'Content-Type':'text/plain','Cache-Control':'no-store'}}));return}if(event.request.mode==='navigate'){event.respondWith((async()=>{const fresh=await networkThenCache(event.request,'./index.html');if(fresh.type!=='error')return fresh;const cache=await caches.open(CACHE);return (await cache.match('./index.html'))||new Response('<!doctype html><title>Planly offline</title><body>Planly offline cache is unavailable.</body>',{status:503,headers:{'Content-Type':'text/html'}})})());return}if(url.origin===self.location.origin){if(url.pathname.endsWith('/app-v3.2.0.js')){event.respondWith(hardenedAppResponse(event.request));return}event.respondWith((async()=>{const cache=await caches.open(CACHE),cached=await cache.match(event.request);if(cached)return cached;return networkThenCache(event.request,event.request)})());return}event.respondWith(fetch(event.request).catch(()=>Response.error()))});
