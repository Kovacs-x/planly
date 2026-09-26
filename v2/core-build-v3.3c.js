/* Planly 4.0F build markers. Injected inside the primary app closure. */
verifyPlanlyOfflineCache=async function(){
  if(!('caches'in window))return {ok:false,missing:['Cache Storage unavailable']};
  try{
    const cache=await caches.open('planly-v2-400f-02'),assets=['./index.html','./app-v3.2.0.js?v=330c02','./supabase-config.js','./manifest.webmanifest','./core-projects-v3.3c.js?v=330c02','./core-build-v3.3c.js?v=400f02','./core-assignment-v3.3c.js?v=330d06','./core-project-planning-v3.3c.js?v=330c04','./core-household-calendar-v3.3c.js?v=330c05','./core-household-planning-safety-v3.3c.js?v=330c05','./core-closeout-v3.3c.js?v=330c06','./core-cloud-readiness-v3.3d.js?v=330d03','./core-release-gate-v3.3d.js?v=330d01','./core-budget-nav-v4.0b1.js?v=400b103','./core-budget-v4.0b.js?v=400c01','./core-budget-ui-v4.0b.js?v=400b401','./core-budget-scope-v4.0c.js?v=400c02','./core-budget-lifecycle-v4.0d.js?v=400e01','./core-budget-monthly-v4.0e.js?v=400e01','./core-budget-month-state-v4.0f.js?v=400f01'],missing=[];
    for(const asset of assets){if(!await cache.match(asset))missing.push(asset)}
    return {ok:missing.length===0,missing};
  }catch(err){return {ok:false,missing:[String(err?.message||err)]}}
};
probePlanlyServiceWorker=async function(){
  if(!navigator.serviceWorker?.controller)return {ok:false,reason:'no-controller'};
  try{
    const res=await planlyWithTimeout(fetch('./__planly_sw_probe__?v=400f02',{cache:'no-store'}),3000,'Service worker probe');
    const text=(await res.text()).trim();
    return {ok:res.ok&&text==='planly-v2-sw-400f-02',reason:text||('HTTP '+res.status)};
  }catch(err){return {ok:false,reason:String(err?.message||err)}}
};
