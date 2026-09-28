// Planly 4.0Q.4 — retire unsafe legacy mutators and derive offline verification from the deployed runtime.
(()=>{'use strict';
const api=window.PlanlyBudget;if(!api)return;
function actions(){const a=window.PlanlyBudgetActions;if(!a)throw Error('Budget persistence layer is unavailable.');return a}
api.updateEntry=(id,patch)=>actions().persistedEntryUpdate(id,patch);
api.deleteEntry=id=>actions().persistedDelete(id);
api.updateCategory=(id,patch)=>actions().persistedCategoryUpdate(id,patch);
api.__legacyMutationGuard='authoritative-v1';
async function manifestAssets(){const res=await fetch('./runtime-modules.json',{cache:'no-store'});if(!res.ok)throw Error('Runtime manifest unavailable');const manifest=await res.json();if(!Array.isArray(manifest?.modules))throw Error('Runtime manifest is invalid');return manifest.modules.filter(x=>typeof x==='string'&&x.startsWith('./')&&x.includes('.js')&&!x.includes('..')&&!x.includes('://'))}
async function serviceWorkerVersion(){if(!navigator.serviceWorker?.controller)return'';const res=await fetch('./__planly_sw_probe__?verify='+Date.now(),{cache:'no-store'});if(!res.ok)return'';return (await res.text()).trim()}
window.verifyPlanlyOfflineCache=async function(){if(!('caches'in window))return {ok:false,missing:['Cache Storage unavailable']};try{const version=await serviceWorkerVersion();if(!version)return {ok:false,missing:['Service worker is not controlling this tab']};const keys=await caches.keys(),candidates=keys.filter(k=>k.startsWith('planly-v2-')).sort(),cacheName=candidates.at(-1);if(!cacheName)return {ok:false,missing:['Planly runtime cache unavailable']};const cache=await caches.open(cacheName),assets=await manifestAssets(),missing=[];for(const asset of assets)if(!await cache.match(asset))missing.push(asset);return {ok:missing.length===0,missing,cache:cacheName,serviceWorker:version}}catch(err){return {ok:false,missing:[String(err?.message||err)]}}};
window.probePlanlyServiceWorker=async function(){if(!navigator.serviceWorker?.controller)return {ok:false,reason:'no-controller'};try{const version=await serviceWorkerVersion();return {ok:!!version,reason:version||'probe-failed'}}catch(err){return {ok:false,reason:String(err?.message||err)}}};
})();
