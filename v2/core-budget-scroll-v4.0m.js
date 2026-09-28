// Planly 4.0M.1 — preserve async same-surface scroll, reset explicit Budget page transitions to the top.
(()=>{'use strict';
const base=window.PlanlyBudgetUI;if(!base?.renderTab)return;
let host=null;
function surface(el){if(!el)return'';const category=el.querySelector('[data-act="allocation"][data-category]')?.dataset.category;if(category)return'category:'+category;if(el.querySelector('#budgetCategoryForm'))return'manage';if(el.querySelector('#budgetAllocationForm'))return'allocation';if(el.querySelector('#budgetIncomeForm'))return'income';if(el.querySelector('#budgetLifecycleForm'))return'edit';if(el.querySelector('.budgetScopeSetup'))return'scope-setup';if(el.querySelector('.budgetHero'))return'dashboard';return''}
function clamp(y){const max=Math.max(0,(document.scrollingElement?.scrollHeight||document.documentElement.scrollHeight||0)-window.innerHeight);return Math.max(0,Math.min(Number(y)||0,max))}
function scrollTopNow(){window.scrollTo({top:0,left:0,behavior:'auto'});requestAnimationFrame(()=>{if(Math.abs(window.scrollY||0)>1)window.scrollTo({top:0,left:0,behavior:'auto'})})}
const baseRender=base.renderTab.bind(base);
async function renderTab(target){host=target||host;const beforeSurface=surface(host),beforeY=window.scrollY||document.scrollingElement?.scrollTop||0,connected=!!host?.isConnected;const result=await baseRender(host);const afterSurface=surface(host);if(connected&&beforeSurface&&beforeSurface===afterSurface&&Math.abs((window.scrollY||0)-beforeY)>1){const restore=()=>window.scrollTo({top:clamp(beforeY),left:0,behavior:'auto'});restore();requestAnimationFrame(()=>{if(surface(host)===beforeSurface&&Math.abs((window.scrollY||0)-beforeY)>1)restore()})}return result}
window.addEventListener('planly:budget-view-changed',e=>{const from=String(e.detail?.from||''),to=String(e.detail?.to||'');if(from&&to&&from!==to)scrollTopNow()});
window.PlanlyBudgetUI={...base,renderTab};
})();
