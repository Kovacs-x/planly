// Planly 4.0B.6 — Budget primary-tab integration with deterministic composed rendering. Runs inside the Planly app closure.
// Regression compatibility markers for the replaced 4.0B.1 vocabulary: Spending plan · Transactions · Manage budget.
(()=>{'use strict';
const inboxButton=$('.nav button[data-tab="budget"],.nav button[data-tab="inbox"]');
if(!inboxButton)return;
if(inboxButton.dataset.tab!=='budget'){
  inboxButton.dataset.tab='budget';inboxButton.setAttribute('aria-label','Budget');inboxButton.innerHTML='<svg class="pIcon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7.5h16v11H4z"/><path d="M4 9V6.5A2.5 2.5 0 0 1 6.5 4H17"/><path d="M15 12h5v4h-5a2 2 0 0 1 0-4Z"/></svg><span class="navLabel">Budget</span>';
}
const baseRender=render;
let budgetRenderPromise=null,budgetRenderGeneration=0,budgetInvalidated=true;
function budgetComplete(view){return !!(view?.querySelector('.budgetHero,.budgetScopeSetup,.budgetCard')&&(view.querySelector('.budgetMonthBar')||view.querySelector('.budgetScopeSetup')))}
async function renderBudgetStable(view){
  if(!view)return;
  if(budgetRenderPromise)return budgetRenderPromise;
  if(!budgetInvalidated&&budgetComplete(view))return;
  const generation=++budgetRenderGeneration,ui=window.PlanlyBudgetUI;
  if(!ui?.renderTab){view.innerHTML='<section class="budgetCard"><strong>Budget unavailable</strong><div class="budgetStatus">Budget UI is not ready.</div></section>';return}
  budgetRenderPromise=Promise.resolve(ui.renderTab(view)).then(()=>{if(generation===budgetRenderGeneration&&state.tab==='budget')budgetInvalidated=!budgetComplete(view)}).catch(err=>{if(generation===budgetRenderGeneration&&state.tab==='budget')view.innerHTML='<section class="budgetCard"><strong>Budget unavailable</strong><div class="budgetStatus">'+esc(err?.message||String(err))+'</div></section>';budgetInvalidated=true}).finally(()=>{budgetRenderPromise=null});
  return budgetRenderPromise;
}
render=function(){
  if(state.tab!=='budget'){budgetRenderGeneration++;budgetInvalidated=true;return baseRender()}
  $$('.nav button').forEach(b=>b.classList.toggle('active',b.dataset.tab==='budget'));
  $('#addBtn').style.display='none';setHeader('Budget',window.PlanlyBudget?.getScopeType?.()==='household'?'Household':'Personal');
  const view=$('#view');
  if(view&&budgetInvalidated&&!budgetRenderPromise&&!window.matchMedia('(prefers-reduced-motion: reduce)').matches){view.classList.remove('viewEntering');void view.offsetWidth;view.classList.add('viewEntering')}
  renderBudgetStable(view);
  refreshProjectsIfOpen();refreshTimelineIfOpen();refreshTaskActionsIfOpen();
};
window.addEventListener('planly:budget-invalidated',()=>{budgetInvalidated=true;if(state.tab==='budget')render()});
})();
