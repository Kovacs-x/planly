// Planly 4.0B.1 — Budget primary-tab integration. Runs inside the Planly app closure.
(()=>{'use strict';
const inboxButton=$('.nav button[data-tab="inbox"]');
if(!inboxButton)return;
inboxButton.dataset.tab='budget';
inboxButton.setAttribute('aria-label','Budget');
inboxButton.innerHTML='<svg class="pIcon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7.5h16v11H4z"/><path d="M4 9V6.5A2.5 2.5 0 0 1 6.5 4H17"/><path d="M15 12h5v4h-5a2 2 0 0 1 0-4Z"/></svg><span class="navLabel">Budget</span>';
const baseRender=render;
render=function(){
  if(state.tab!=='budget')return baseRender();
  $$('.nav button').forEach(b=>b.classList.toggle('active',b.dataset.tab==='budget'));
  $('#addBtn').style.display='none';
  setHeader('Budget','Private finance');
  const view=$('#view');
  if(view){
    view.innerHTML='<div class="budgetTabLoading">Loading your budget…</div>';
    if(!window.matchMedia('(prefers-reduced-motion: reduce)').matches){view.classList.remove('viewEntering');void view.offsetWidth;view.classList.add('viewEntering')}
  }
  const ui=window.PlanlyBudgetUI;
  if(ui?.renderTab)ui.renderTab(view).catch(err=>{if(view)view.innerHTML='<section class="budgetCard"><strong>Budget unavailable</strong><div class="budgetStatus">'+esc(err?.message||String(err))+'</div></section>'});
  refreshProjectsIfOpen();refreshTimelineIfOpen();refreshFocusIfOpen();refreshTaskActionsIfOpen();
};
})();
