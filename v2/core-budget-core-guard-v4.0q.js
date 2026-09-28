// Planly 4.0Q.1 — retire unsafe legacy mutators and align offline verification with this runtime.
(()=>{'use strict';
const api=window.PlanlyBudget;if(!api)return;
function actions(){const a=window.PlanlyBudgetActions;if(!a)throw Error('Budget persistence layer is unavailable.');return a}
api.updateEntry=(id,patch)=>actions().persistedEntryUpdate(id,patch);
api.deleteEntry=id=>actions().persistedDelete(id);
api.updateCategory=(id,patch)=>actions().persistedCategoryUpdate(id,patch);
api.__legacyMutationGuard='authoritative-v1';
const CACHE='planly-v2-420a-08',SW='planly-v2-sw-420a-08';
const REVIEW_ASSETS=['./core-budget-lifecycle-v4.0d.js?v=400n02','./core-budget-actions-v4.0l.js?v=400n02','./core-budget-review-hardening-v4.0p.js?v=400p02','./core-budget-core-guard-v4.0q.js?v=400q01'];
window.verifyPlanlyOfflineCache=async function(){if(!('caches'in window))return {ok:false,missing:['Cache Storage unavailable']};try{const cache=await caches.open(CACHE),missing=[];for(const asset of REVIEW_ASSETS)if(!await cache.match(asset))missing.push(asset);return {ok:missing.length===0,missing}}catch(err){return {ok:false,missing:[String(err?.message||err)]}}};
window.probePlanlyServiceWorker=async function(){if(!navigator.serviceWorker?.controller)return {ok:false,reason:'no-controller'};try{const res=await fetch('./__planly_sw_probe__?v=420a08',{cache:'no-store'}),text=(await res.text()).trim();return {ok:res.ok&&text===SW,reason:text||('HTTP '+res.status)}}catch(err){return {ok:false,reason:String(err?.message||err)}}};
})();
