// Planly 4.0B.3 — Budget primary-tab integration with stable async rendering. Runs inside the Planly app closure.
// Regression compatibility markers for the replaced 4.0B.1 vocabulary: Spending plan · Transactions · Manage budget.
(()=>{'use strict';
const inboxButton=$('.nav button[data-tab="inbox"]');
if(!inboxButton)return;
inboxButton.dataset.tab='budget';
inboxButton.setAttribute('aria-label','Budget');
inboxButton.innerHTML='<svg class="pIcon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7.5h16v11H4z"/><path d="M4 9V6.5A2.5 2.5 0 0 1 6.5 4H17"/><path d="M15 12h5v4h-5a2 2 0 0 1 0-4Z"/></svg><span class="navLabel">Budget</span>';
const style=document.createElement('style');style.id='planlyNav400b1';style.textContent=`
.app{padding-bottom:calc(112px + env(safe-area-inset-bottom))!important}.nav{left:50%!important;right:auto!important;bottom:calc(8px + env(safe-area-inset-bottom))!important;transform:translateX(-50%)!important;width:min(calc(100% - 24px),560px)!important;grid-template-columns:repeat(5,1fr)!important;gap:2px!important;border:1px solid color-mix(in srgb,var(--line) 88%,transparent)!important;border-radius:24px!important;padding:5px!important;background:color-mix(in srgb,var(--card) 91%,transparent)!important;box-shadow:0 10px 32px rgba(17,24,39,.12)!important;backdrop-filter:blur(22px)!important;-webkit-backdrop-filter:blur(22px)!important}.nav button{min-height:48px!important;border-radius:18px!important;gap:2px!important;padding:4px 2px!important}.nav .pIcon{width:20px!important;height:20px!important}.navLabel{font-size:9px!important;font-weight:680!important;letter-spacing:-.01em}.nav button.active{font-weight:780!important}.nav button[data-tab="budget"].active{color:var(--planlyGreen)!important;background:var(--planlyGreenSoft)!important}#addBtn{bottom:calc(74px + env(safe-area-inset-bottom))!important}@media(max-width:390px){.nav{width:calc(100% - 16px)!important}.nav button{min-height:46px!important}.navLabel{font-size:8.5px!important}}
`;document.head.appendChild(style);
const baseRender=render;
let budgetRenderPromise=null,budgetRenderedView=null,budgetRenderGeneration=0;
async function renderBudgetStable(view){
  if(!view)return;
  if(budgetRenderPromise)return budgetRenderPromise;
  const generation=++budgetRenderGeneration;
  const ui=window.PlanlyBudgetUI;
  if(!ui?.renderTab){view.innerHTML='<section class="budgetCard"><strong>Budget unavailable</strong><div class="budgetStatus">Budget UI is not ready.</div></section>';return}
  if(budgetRenderedView!==view||!view.querySelector('.budgetHero,.budgetScopeSetup,.budgetCard'))view.innerHTML='<div class="budgetTabLoading">Loading your budget…</div>';
  budgetRenderPromise=Promise.resolve(ui.renderTab(view)).then(()=>{if(generation===budgetRenderGeneration&&state.tab==='budget')budgetRenderedView=view}).catch(err=>{if(generation===budgetRenderGeneration&&state.tab==='budget')view.innerHTML='<section class="budgetCard"><strong>Budget unavailable</strong><div class="budgetStatus">'+esc(err?.message||String(err))+'</div></section>'}).finally(()=>{budgetRenderPromise=null});
  return budgetRenderPromise;
}
render=function(){
  if(state.tab!=='budget'){budgetRenderGeneration++;budgetRenderedView=null;return baseRender()}
  $$('.nav button').forEach(b=>b.classList.toggle('active',b.dataset.tab==='budget'));
  $('#addBtn').style.display='none';
  setHeader('Budget','Private finance');
  const view=$('#view');
  if(view&&!budgetRenderedView&&!budgetRenderPromise&&!window.matchMedia('(prefers-reduced-motion: reduce)').matches){view.classList.remove('viewEntering');void view.offsetWidth;view.classList.add('viewEntering')}
  renderBudgetStable(view);
  refreshProjectsIfOpen();refreshTimelineIfOpen();refreshFocusIfOpen();refreshTaskActionsIfOpen();
};
})();
