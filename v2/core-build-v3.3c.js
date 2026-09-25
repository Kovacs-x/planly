/* Planly 3.3C build markers. Injected inside the primary app closure. */
verifyPlanlyOfflineCache=async function(){
  if(!('caches'in window))return {ok:false,missing:['Cache Storage unavailable']};
  try{
    const cache=await caches.open('planly-v2-330c04'),assets=['./index.html','./app-v3.2.0.js?v=330c02','./supabase-config.js','./manifest.webmanifest','./core-projects-v3.3c.js?v=330c02','./core-assignment-v3.3c.js?v=330c03','./core-project-planning-v3.3c.js?v=330c04'],missing=[];
    for(const asset of assets){if(!await cache.match(asset))missing.push(asset)}
    return {ok:missing.length===0,missing};
  }catch(err){return {ok:false,missing:[String(err?.message||err)]}}
};
probePlanlyServiceWorker=async function(){
  if(!navigator.serviceWorker?.controller)return {ok:false,reason:'no-controller'};
  try{
    const res=await planlyWithTimeout(fetch('./__planly_sw_probe__?v=330c04',{cache:'no-store'}),3000,'Service worker probe');
    const text=(await res.text()).trim();
    return {ok:res.ok&&text==='planly-v2-sw-330c04',reason:text||('HTTP '+res.status)};
  }catch(err){return {ok:false,reason:String(err?.message||err)}}
};
