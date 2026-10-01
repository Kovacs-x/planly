const CACHE='planly-v2-630a-53';
const VERSION='planly-v2-sw-630a-53';
const APP_URL='./app-v3.2.0.js?v=630a01';
const HARDENING_URL='./hardening-v3.3b.js?v=600h15';
const RUNTIME_MANIFEST_URL='./runtime-modules.json';
const CORE_PROJECTS_URL='./core-projects-v3.3c.js?v=610p01';
const CORE_BUILD_URL='./core-build-v3.3c.js?v=430a01';
const CORE_ASSIGNMENT_URL='./core-assignment-v3.3c.js?v=610s01';
const CORE_PROJECT_PLANNING_URL='./core-project-planning-v3.3c.js?v=330c04';
const CORE_HOUSEHOLD_CALENDAR_URL='./core-household-calendar-v3.3c.js?v=600c08';
const CORE_HOUSEHOLD_PLANNING_SAFETY_URL='./core-household-planning-safety-v3.3c.js?v=330c05';
const CORE_CLOSEOUT_URL='./core-closeout-v3.3c.js?v=330c06';
const CORE_CLOUD_READINESS_URL='./core-cloud-readiness-v3.3d.js?v=330d04';
const CORE_RELEASE_GATE_URL='./core-release-gate-v3.3d.js?v=330d01';
const CORE_BUDGET_NAV_URL='./core-budget-nav-v4.0b1.js?v=400b107';
const CORE_REDESIGN_R1_URL='./core-redesign-r1.js?v=630r114';
const BUDGET_RUNTIME_URL='./core-budget-v4.0b.js?v=400k11';
const BUDGET_UI_URL='./core-budget-ui-v4.0b.js?v=400b412';
const BUDGET_SCOPE_URL='./core-budget-scope-v4.0c.js?v=400c07';
const BUDGET_LIFECYCLE_URL='./core-budget-lifecycle-v4.0d.js?v=400n06';
const BUDGET_MONTHLY_URL='./core-budget-monthly-v4.0e.js?v=400e09';
const BUDGET_MONTH_STATE_URL='./core-budget-month-state-v4.0f.js?v=400f01';
const BUDGET_INSIGHTS_URL='./core-budget-insights-v4.0g.js?v=400g04';
const BUDGET_ACTIONS_URL='./core-budget-actions-v4.0l.js?v=400n08';
const BUDGET_SCROLL_URL='./core-budget-scroll-v4.0m.js?v=400m02';
const BUDGET_REVIEW_URL='./core-budget-review-hardening-v4.0p.js?v=400p05';
const BUDGET_CORE_GUARD_URL='./core-budget-core-guard-v4.0q.js?v=400q04';
const LISTS_RUNTIME_URL='./core-lists-v4.1.js?v=610l01';
const HOUSEHOLD_DASHBOARD_URL='./core-household-dashboard-v4.2.js?v=420a03';
const INTELLIGENCE_RUNTIME_URL='./core-intelligence-v5.js?v=560i504';
const UPDATE_RUNTIME_URL='./core-update-v4.3.js?v=430a01';
const SAFARI_DIAGNOSTICS_URL='./core-safari-diagnostics-v4.3b.js?v=430b01';
const CORE_URLS=[CORE_PROJECTS_URL,CORE_BUILD_URL,CORE_ASSIGNMENT_URL,CORE_PROJECT_PLANNING_URL,CORE_HOUSEHOLD_CALENDAR_URL,CORE_HOUSEHOLD_PLANNING_SAFETY_URL,CORE_CLOSEOUT_URL,CORE_CLOUD_READINESS_URL,CORE_RELEASE_GATE_URL,CORE_BUDGET_NAV_URL,CORE_REDESIGN_R1_URL];
const APPEND_URLS=[BUDGET_RUNTIME_URL,BUDGET_UI_URL,BUDGET_SCOPE_URL,BUDGET_LIFECYCLE_URL,BUDGET_MONTHLY_URL,BUDGET_MONTH_STATE_URL,BUDGET_INSIGHTS_URL,BUDGET_ACTIONS_URL,BUDGET_SCROLL_URL,BUDGET_REVIEW_URL,BUDGET_CORE_GUARD_URL,LISTS_RUNTIME_URL,HOUSEHOLD_DASHBOARD_URL,UPDATE_RUNTIME_URL,SAFARI_DIAGNOSTICS_URL,INTELLIGENCE_RUNTIME_URL];
const REQUIRED=['./index.html',APP_URL,HARDENING_URL,RUNTIME_MANIFEST_URL,...CORE_URLS,...APPEND_URLS,'./supabase-config.js','./manifest.webmanifest'];
const OPTIONAL=['./','../icon-192.png','../icon-512.png','./fonts/outfit-400.woff2','./fonts/outfit-500.woff2','./fonts/outfit-600.woff2','./fonts/outfit-700.woff2'];
const FETCH_TIMEOUT=8000;
function timedFetch(input,init={}){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),FETCH_TIMEOUT);return fetch(input,{...init,signal:controller.signal}).finally(()=>clearTimeout(timer))}
async function cacheOne(cache,url){try{const response=await timedFetch(url,{cache:'no-store'});if(response?.ok){await cache.put(url,response.clone());return true}}catch{}return false}
async function networkThenCache(request,cacheKey){const cache=await caches.open(CACHE);try{const response=await timedFetch(request,{cache:'no-store'});if(response?.ok)await cache.put(cacheKey,response.clone());return response}catch{return (await cache.match(cacheKey))||Response.error()}}
async function freshOrCached(cache,url,request=null){try{const response=await timedFetch(request||url,{cache:'no-store'});if(response?.ok){await cache.put(url,response.clone());return response}}catch{}return cache.match(url)}
function validRuntimeModule(url){return typeof url==='string'&&url.startsWith('./')&&url.includes('.js')&&!url.includes('..')&&!url.includes('://')}
async function runtimeModuleUrls(cache){try{const response=await freshOrCached(cache,RUNTIME_MANIFEST_URL);if(response){const manifest=await response.clone().json(),urls=manifest?.modules;if(Array.isArray(urls)&&urls.length&&urls.every(validRuntimeModule))return [...new Set(urls)]}}catch{}return APPEND_URLS}
async function hardenedAppResponse(request){const cache=await caches.open(CACHE),appendUrls=await runtimeModuleUrls(cache);const [appResponse,hardeningResponse,...moduleResponses]=await Promise.all([freshOrCached(cache,APP_URL,request),freshOrCached(cache,HARDENING_URL),...CORE_URLS.map(url=>freshOrCached(cache,url)),...appendUrls.map(url=>freshOrCached(cache,url))]);if(!appResponse)return Response.error();let appText=await appResponse.text();const coreResponses=moduleResponses.slice(0,CORE_URLS.length),appendResponses=moduleResponses.slice(CORE_URLS.length),coreTexts=[];for(const response of coreResponses)if(response)coreTexts.push(await response.text());if(coreTexts.length!==CORE_URLS.length)return new Response('Planly core module missing',{status:500,headers:{'Content-Type':'text/plain','Cache-Control':'no-store'}});const closeIndex=appText.lastIndexOf('})();');if(closeIndex<0)return new Response('Planly core injection point missing',{status:500,headers:{'Content-Type':'text/plain','Cache-Control':'no-store'}});appText=appText.slice(0,closeIndex)+'\n'+coreTexts.join('\n')+'\n'+appText.slice(closeIndex);const appendTexts=[];for(const response of appendResponses)if(response)appendTexts.push(await response.text());if(appendTexts.length!==appendUrls.length)return new Response('Planly runtime manifest module missing',{status:500,headers:{'Content-Type':'text/plain','Cache-Control':'no-store'}});const hardeningText=hardeningResponse?await hardeningResponse.text():'';return new Response(appText+'\n;'+hardeningText+'\n;'+appendTexts.join('\n;'),{status:200,headers:{'Content-Type':'application/javascript; charset=utf-8','Cache-Control':'no-store'}})}
self.addEventListener('install',event=>{event.waitUntil((async()=>{const cache=await caches.open(CACHE);const results=await Promise.all(REQUIRED.map(url=>cacheOne(cache,url)));if(results.some(ok=>!ok)){await caches.delete(CACHE);throw new Error('Planly required offline assets failed to install')}await Promise.allSettled(OPTIONAL.map(url=>cacheOne(cache,url)))})())});
self.addEventListener('activate',event=>{event.waitUntil((async()=>{const keys=await caches.keys();await Promise.all(keys.filter(key=>key.startsWith('planly-v2-')&&key!==CACHE).map(key=>caches.delete(key)));await self.clients.claim()})())});
self.addEventListener('message',event=>{if(event.data?.type==='SKIP_WAITING')self.skipWaiting()});
self.addEventListener('fetch',event=>{if(event.request.method!=='GET')return;const url=new URL(event.request.url);if(url.origin===self.location.origin&&url.pathname.endsWith('/__planly_sw_probe__')){event.respondWith(new Response(VERSION,{status:200,headers:{'Content-Type':'text/plain','Cache-Control':'no-store'}}));return}if(event.request.mode==='navigate'){event.respondWith((async()=>{const fresh=await networkThenCache(event.request,'./index.html');if(fresh.type!=='error')return fresh;const cache=await caches.open(CACHE);return (await cache.match('./index.html'))||new Response('<!doctype html><title>Planly offline</title><body>Planly offline cache is unavailable.</body>',{status:503,headers:{'Content-Type':'text/html'}})})());return}if(url.origin===self.location.origin){if(url.pathname.endsWith('/app-v3.2.0.js')){event.respondWith(hardenedAppResponse(event.request));return}event.respondWith((async()=>{const cache=await caches.open(CACHE),cached=await cache.match(event.request);if(cached)return cached;return networkThenCache(event.request,event.request)})());return}return});