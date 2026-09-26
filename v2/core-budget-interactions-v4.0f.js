// Planly 4.0F.1 — stable Budget interaction layer for iOS/Safari.
(()=>{'use strict';
const base=window.PlanlyBudgetUI;
let host=null,boundHost=null,busy=false;
function style(){if(document.getElementById('planlyBudgetInteractionStyle'))return;const s=document.createElement('style');s.id='planlyBudgetInteractionStyle';s.textContent=`#view[data-budget-interactions="1"] button,#view[data-budget-interactions="1"] [data-cat]{touch-action:manipulation;-webkit-tap-highlight-color:transparent}#view[data-budget-interactions="1"] .budgetBack,#view[data-budget-interactions="1"] .budgetLink{min-height:44px;min-width:44px;display:inline-flex;align-items:center;justify-content:center;position:relative;z-index:3}#view[data-budget-interactions="1"] .budgetCat{min-height:72px;position:relative;z-index:1}#view[data-budget-interactions="1"] button:disabled{pointer-events:none}`;document.head.appendChild(s)}
function mark(){if(host)host.dataset.budgetInteractions='1'}
function refresh(){queueMicrotask(()=>{mark();bind()})}
function findControl(target){return target instanceof Element?target.closest('[data-target-back],[data-target-save],[data-month-targets],[data-month-prev],[data-month-next],[data-month-carry]'):null}
async function act(el){if(!host||!host.contains(el)||busy)return;busy=true;try{
 if(el.matches('[data-target-back]')){const back=el.onclick;if(typeof back==='function')return await back.call(el,new Event('click'))}
 if(el.matches('[data-target-save]')){const save=el.onclick;if(typeof save==='function')return await save.call(el,new Event('click'))}
 if(el.matches('[data-month-targets]')){const open=el.onclick;if(typeof open==='function')return await open.call(el,new Event('click'))}
 if(el.matches('[data-month-prev],[data-month-next],[data-month-carry]')){el.click();return}
}finally{busy=false;refresh()}}
function onPointerUp(e){if(e.pointerType&&e.pointerType!=='touch'&&e.pointerType!=='pen')return;const el=findControl(e.target);if(!el)return;e.preventDefault();e.stopPropagation();act(el)}
function bind(){if(!host||boundHost===host)return;if(boundHost)boundHost.removeEventListener('pointerup',onPointerUp,true);boundHost=host;host.addEventListener('pointerup',onPointerUp,true)}
async function renderTab(target){style();host=target||host;mark();bind();const result=await base.renderTab(host);refresh();return result}
window.PlanlyBudgetUI={...base,renderTab};
})();
