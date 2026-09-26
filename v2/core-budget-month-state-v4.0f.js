// Planly 4.0F — authoritative active-month state for every Budget flow.
(()=>{'use strict';
const base=window.PlanlyBudgetUI;
let host=null;
const valid=m=>/^\d{4}-(0[1-9]|1[0-2])$/.test(String(m||''));
const current=()=>new Date().toISOString().slice(0,7);
const get=()=>valid(window.PlanlyBudgetActiveMonth)?window.PlanlyBudgetActiveMonth:current();
function set(month){window.PlanlyBudgetActiveMonth=valid(month)?month:current();window.dispatchEvent(new CustomEvent('planly:budget-month',{detail:{month:window.PlanlyBudgetActiveMonth}}));return window.PlanlyBudgetActiveMonth}
function date(day=1){const m=get(),[y,mo]=m.split('-').map(Number),last=new Date(y,mo,0).getDate(),d=Math.min(Math.max(Number(day)||1,1),last);return `${m}-${String(d).padStart(2,'0')}`}
window.PlanlyBudgetMonth={get,set,date};
set(get());
async function renderTab(target){host=target||host;set(get());return base.renderTab(host)}
window.PlanlyBudgetUI={...base,renderTab};
})();
