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

function budgetState(){try{return window.PlanlyBudget?.getState?.()||null}catch{return null}}
function ensureFeedbackStyle(){if(document.getElementById('planlyBudgetCreateFeedbackStyle'))return;const s=document.createElement('style');s.id='planlyBudgetCreateFeedbackStyle';s.textContent='.budgetCreateToast{position:fixed;left:50%;bottom:calc(92px + env(safe-area-inset-bottom));transform:translateX(-50%);z-index:10020;background:var(--text);color:var(--card);border-radius:999px;padding:10px 16px;font-size:12px;font-weight:800;box-shadow:0 10px 28px rgba(0,0,0,.18);pointer-events:none;animation:budgetToastIn .18s ease-out}.budgetCreatedFlash{animation:budgetCreatedFlash 1.35s ease-out}@keyframes budgetToastIn{from{opacity:0;transform:translate(-50%,8px)}to{opacity:1;transform:translate(-50%,0)}}@keyframes budgetCreatedFlash{0%,35%{box-shadow:0 0 0 4px color-mix(in srgb,var(--planlyBlue,#3b82f6) 25%,transparent);border-radius:16px}100%{box-shadow:none}}';document.head.appendChild(s)}
function toast(message){ensureFeedbackStyle();document.querySelector('.budgetCreateToast')?.remove();const el=document.createElement('div');el.className='budgetCreateToast';el.setAttribute('role','status');el.textContent=message;document.body.appendChild(el);setTimeout(()=>el.remove(),1800)}
function returnToBudget(){const budgetButton=document.querySelector('[data-tab="budget"]');if(budgetButton instanceof HTMLElement)budgetButton.click();else if(host)renderTab(host)}

// Observe the existing synchronous local-create handlers at the UI boundary.
// We only change navigation/feedback after state proves that creation succeeded;
// persistence, cloud sync, ownership and household authorization stay untouched.
document.addEventListener('submit',event=>{
  const form=event.target;
  if(!(form instanceof HTMLFormElement))return;
  const before=budgetState();
  if(!before)return;
  if(form.id==='budgetAllocationForm'){
    const ids=new Set((before.entries||[]).map(x=>x.id));
    queueMicrotask(()=>{
      const after=budgetState(),created=(after?.entries||[]).find(x=>!ids.has(x.id)&&x.kind==='expense');
      if(!created)return;
      returnToBudget();
      toast('Payment added');
    });
    return;
  }
  const createButton=form.querySelector('button[type="submit"]');
  if(!createButton||!/create category/i.test(createButton.textContent||''))return;
  const ids=new Set((before.categories||[]).map(x=>x.id));
  queueMicrotask(()=>{
    const after=budgetState(),created=(after?.categories||[]).find(x=>!ids.has(x.id));
    if(!created)return;
    toast(`${created.name||'Category'} added`);
    requestAnimationFrame(()=>{
      const rows=[...document.querySelectorAll('.budgetCat')];
      const row=rows.find(el=>(el.querySelector('strong')?.textContent||'').trim()===String(created.name||'').trim());
      if(!row)return;
      row.scrollIntoView({behavior:'smooth',block:'center'});
      row.classList.add('budgetCreatedFlash');
      setTimeout(()=>row.classList.remove('budgetCreatedFlash'),1500);
    });
  });
},true);
})();
