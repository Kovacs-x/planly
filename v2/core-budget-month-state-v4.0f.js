// Planly 4.0F.3 — authoritative active-month state with native iOS scrolling/taps.
(()=>{'use strict';
const base=window.PlanlyBudgetUI;
let host=null;
const valid=m=>/^\d{4}-(0[1-9]|1[0-2])$/.test(String(m||''));
const current=()=>new Date().toISOString().slice(0,7);
const get=()=>valid(window.PlanlyBudgetActiveMonth)?window.PlanlyBudgetActiveMonth:current();
function set(month){window.PlanlyBudgetActiveMonth=valid(month)?month:current();window.dispatchEvent(new CustomEvent('planly:budget-month',{detail:{month:window.PlanlyBudgetActiveMonth}}));return window.PlanlyBudgetActiveMonth}
function date(day=1){const m=get(),[y,mo]=m.split('-').map(Number),last=new Date(y,mo,0).getDate(),d=Math.min(Math.max(Number(day)||1,1),last);return `${m}-${String(d).padStart(2,'0')}`}
function installTouchStyle(){if(document.getElementById('planlyBudgetTouchStyle'))return;const s=document.createElement('style');s.id='planlyBudgetTouchStyle';s.textContent=`#view[data-budget-touch="1"] button,#view[data-budget-touch="1"] [data-cat]{touch-action:auto;-webkit-tap-highlight-color:transparent}#view[data-budget-touch="1"] .budgetBack,#view[data-budget-touch="1"] .budgetLink{min-height:44px;min-width:44px;display:inline-flex;align-items:center;justify-content:center;position:relative;z-index:3}#view[data-budget-touch="1"] .budgetCat{min-height:72px;position:relative;z-index:1}`;document.head.appendChild(s)}
function bindTouch(){if(!host)return;installTouchStyle();host.dataset.budgetTouch='1'}
window.PlanlyBudgetMonth={get,set,date};
set(get());
async function renderTab(target){host=target||host;bindTouch();set(get());const result=await base.renderTab(host);bindTouch();return result}
window.PlanlyBudgetUI={...base,renderTab};
})();
