// Planly 5.1 — Fitness › Food: a private calorie and macro counter (tables from migration 054). Runs inside the Planly
// app closure as the Fitness tab. Every row belongs to the signed-in person only (RLS: owner_id = auth.uid()); the
// browser never chooses whose data it reads, it only sends its own rows. Works offline: changes are kept on the phone
// and sent in order when online, each guarded by cloud_version so a change made on another device is never overwritten.
// Food search uses Open Food Facts (free, no key); only the words typed into Search are sent to it.
(()=>{'use strict';
const nav=$('.nav button[data-tab="fitness"]');
if(!nav)return;
const STORE='planly-fitness-v1:',MEALS=[['breakfast','Breakfast'],['lunch','Lunch'],['dinner','Dinner'],['snack','Snacks']];
const ACTIVITY=[['sedentary','Mostly sitting',1.2],['light','Lightly active',1.375],['moderate','Active 3–5 days a week',1.55],['active','Very active',1.725],['very_active','Hard training or physical job',1.9]];
const OFF_SEARCH='https://world.openfoodfacts.org/cgi/search.pl';
let inflight='',sb=null,userId='',profile=null,entries=[],favourites=[],pending=[],failures=[],loadedFrom='',dayKey=todayKey(),syncing=false,sheet=null,fitInvalid=true;
const uuid=()=>crypto.randomUUID(),now=()=>Date.now();
function todayKey(){return localKey(new Date())}
function shiftDay(key,n){const d=new Date(key+'T12:00:00');d.setDate(d.getDate()+n);return localKey(d)}
const num=(v,d=0)=>{if(v===null||v===undefined||String(v).trim()==='')return d;const n=Number(String(v).replace(',','.'));return Number.isFinite(n)?n:d};
const r1=n=>Math.round(num(n)*10)/10,fmt=n=>Math.round(num(n)).toLocaleString('en-GB');
const clamp=(n,lo,hi)=>Math.min(hi,Math.max(lo,n));
// the database's limits for one food row (migration 054); larger values could never be saved
const withinLimits=(amount,n)=>amount>0&&amount<=10000&&n.kcal<=10000&&n.protein_g<=1000&&n.carbs_g<=1000&&n.fat_g<=1000;

// ---------- local storage (per account) ----------
function persist(){if(!userId)return;try{localStorage.setItem(STORE+userId,JSON.stringify({v:1,profile,entries,favourites,pending,failures,loadedFrom}))}catch{}}
function restore(){profile=null;entries=[];favourites=[];pending=[];failures=[];loadedFrom='';if(!userId)return;try{const x=JSON.parse(localStorage.getItem(STORE+userId)||'null');if(x?.v===1){profile=x.profile||null;entries=Array.isArray(x.entries)?x.entries:[];favourites=Array.isArray(x.favourites)?x.favourites:[];pending=Array.isArray(x.pending)?x.pending:[];failures=Array.isArray(x.failures)?x.failures:[];loadedFrom=String(x.loadedFrom||'')}}catch{}}

// ---------- sync ----------
// One queued change per row. A row not yet on the server stays an insert; later edits fold into it. A change that is
// already on its way to the server is never altered: a newer edit queues behind it and builds on the version it returns.
function queue(table,kind,row){
  const key=table==='planly_food_profile'?row.owner_id:row.id,at=pending.findIndex(op=>op.table===table&&op.key===key&&op.op!==inflight);
  const clean={...row};delete clean.cloud_version;delete clean.created_at;delete clean.updated_at;
  if(at>=0){const prev=pending[at];if(prev.kind==='insert'){if(kind==='delete'){pending.splice(at,1)}else pending[at]={...prev,row:clean}}else pending[at]={...prev,kind,row:clean};}
  else pending.push({table,kind,key,row:clean,base:Number(row.cloud_version||0),op:uuid()});
  persist();invalidate();sync();
}
const isNetwork=e=>!navigator.onLine||e?.name==='AbortError'||/failed to fetch|networkerror|network request|load failed|offline/i.test(String(e?.message||e||''));
function storeRow(table,row){if(table==='planly_food_profile'){profile=row;return}const list=table==='planly_food_entries'?entries:favourites,i=list.findIndex(x=>x.id===row.id);if(row.deleted_at){if(i>=0)list.splice(i,1)}else if(i>=0)list[i]=row;else list.push(row)}
async function sendOne(op){
  const t=sb.from(op.table);
  if(op.kind==='insert'){const res=await t.insert(op.row).select('*').single();if(res.error)throw res.error;return res.data}
  const idCol=op.table==='planly_food_profile'?'owner_id':'id';
  const res=await t.update(op.row).eq(idCol,op.key).eq('cloud_version',op.base).select('*').maybeSingle();
  if(res.error)throw res.error;
  if(!res.data){const e=Error('Changed on another device');e.code='PLANLY_CONFLICT';throw e}
  return res.data;
}
async function sync(){
  if(syncing||!sb||!userId||!navigator.onLine)return;syncing=true;let changed=false;const uid=userId;
  try{
    while(pending.length){
      const op=pending[0];inflight=op.op;
      try{const row=await sendOne(op);inflight='';if(userId!==uid)return;pending=pending.filter(p=>p.op!==op.op);
        if(!pending.some(p=>p.table===op.table&&p.key===op.key))storeRow(op.table,row);
        // later queued edits of the same row now build on the new version
        for(const p of pending)if(p.table===op.table&&p.key===op.key&&p.kind!=='insert')p.base=Number(row.cloud_version||0);
        changed=true;persist()}
      catch(e){inflight='';if(userId!==uid)return;if(isNetwork(e))break;pending=pending.filter(p=>p.op!==op.op);failures=[...failures,{op:op.op,table:op.table,name:op.row?.name||'',code:String(e?.code||''),at:now()}].slice(-10);persist();changed=true;await pull().catch(()=>{})}
    }
    if(!pending.length&&changed)await pull().catch(()=>{});
  }finally{syncing=false;inflight='';if(userId!==uid){if(userId)setTimeout(sync,0)}else if(changed){invalidate();if(state.tab==='fitness')render()}}
}
async function pull(day){
  if(!sb||!userId||!navigator.onLine||pending.length)return;
  const base=shiftDay(todayKey(),-35);let from=loadedFrom&&loadedFrom<base?loadedFrom:base;if(day&&day<from)from=day;
  const [p,e,f]=await Promise.all([
    sb.from('planly_food_profile').select('*').eq('owner_id',userId).maybeSingle(),
    sb.from('planly_food_entries').select('*').eq('owner_id',userId).is('deleted_at',null).gte('entry_date',from).order('client_created_at'),
    sb.from('planly_food_favourites').select('*').eq('owner_id',userId).is('deleted_at',null)]);
  if(p.error||e.error||f.error)throw p.error||e.error||f.error;
  if(pending.length)return; // something was changed while loading: keep the local copy until it is sent
  profile=p.data||null;entries=(e.data||[]).filter(x=>x.entry_date>=from);favourites=f.data||[];loadedFrom=from;persist();invalidate();
}
async function refresh(day){try{await sync();await pull(day)}catch(e){console.warn('Planly fitness',e)}if(state.tab==='fitness')render()}

// ---------- targets ----------
function suggestTargets(p){
  const w=num(p.weight_kg),h=num(p.height_cm),age=clamp(new Date().getFullYear()-num(p.birth_year,1990),14,100);
  if(!(w>0&&h>0&&p.sex))return null;
  const bmr=10*w+6.25*h-5*age+(p.sex==='male'?5:-161),factor=(ACTIVITY.find(a=>a[0]===p.activity)||ACTIVITY[1])[2];
  const delta=p.goal==='maintain'?0:num(p.pace_kg_week)*7700/7*(p.goal==='lose'?-1:1);
  const kcal=clamp(Math.round((bmr*factor+delta)/10)*10,p.sex==='male'?1500:1200,6000);
  const protein=clamp(Math.round(w*(p.goal==='lose'?2:1.8)),50,300),fat=clamp(Math.round(kcal*0.25/9),30,250);
  return {kcal_target:kcal,protein_g:protein,fat_g:fat,carbs_g:clamp(Math.round((kcal-protein*4-fat*9)/4),0,1000)};
}
const targets=()=>({kcal:num(profile?.kcal_target,2000),protein:num(profile?.protein_g,120),carbs:num(profile?.carbs_g,220),fat:num(profile?.fat_g,70)});

// ---------- entries ----------
const dayEntries=key=>entries.filter(x=>x.entry_date===key&&!x.deleted_at);
function totals(list){return list.reduce((t,x)=>({kcal:t.kcal+num(x.kcal),protein:t.protein+num(x.protein_g),carbs:t.carbs+num(x.carbs_g),fat:t.fat+num(x.fat_g)}),{kcal:0,protein:0,carbs:0,fat:0})}
function weekAverage(){const days=[];for(let i=1;i<=7;i++){const k=shiftDay(dayKey,-i),l=dayEntries(k);if(l.length)days.push(totals(l).kcal)}return days.length?days.reduce((a,b)=>a+b,0)/days.length:null}
function defaultMeal(){const h=new Date().getHours();return h<11?'breakfast':h<15?'lunch':h<21?'dinner':'snack'}
function nutrientsFor(food,amount,unit){
  // food.per holds kcal/protein/carbs/fat for 100 g (basis '100g') or for one serving (basis 'serving')
  const grams=unit==='serving'?(food.basis==='serving'?null:num(food.servingG)*amount):amount;
  const factor=food.basis==='serving'?(unit==='serving'?amount:amount/num(food.servingG,1)):grams/100;
  return {kcal:r1(food.per.kcal*factor),protein_g:r1(food.per.protein*factor),carbs_g:r1(food.per.carbs*factor),fat_g:r1(food.per.fat*factor)};
}
function addEntry(food,amount,unit,meal,source){
  const n=nutrientsFor(food,amount,unit),t=now();
  const row={id:uuid(),owner_id:userId,client_id:'food-'+uuid(),entry_date:dayKey,meal,name:String(food.name||'Food').trim().slice(0,160)||'Food',brand:String(food.brand||'').slice(0,120),barcode:/^[0-9]{6,14}$/.test(food.barcode||'')?food.barcode:null,source,amount:r1(amount)||1,unit,...n,client_created_at:t,client_updated_at:t,deleted_at:null};
  entries.push(row);queue('planly_food_entries','insert',row);
  const fav=favourites.find(f=>f.id===food.favouriteId);if(fav){const next={...fav,use_count:num(fav.use_count)+1,last_used_at:new Date().toISOString(),client_updated_at:t};storeRow('planly_food_favourites',next);queue('planly_food_favourites','update',next)}
  return row;
}
function updateEntry(row,patch){const next={...row,...patch,client_updated_at:now()};storeRow('planly_food_entries',next);queue('planly_food_entries','update',next)}
function deleteEntry(row){const next={...row,deleted_at:new Date().toISOString(),client_updated_at:now()};entries=entries.filter(x=>x.id!==row.id);queue('planly_food_entries',pending.some(p=>p.key===row.id&&p.kind==='insert')?'delete':'update',next)}
function saveFavourite(food){
  const per100=food.basis==='100g'?food.per:food.servingG?{kcal:food.per.kcal*100/food.servingG,protein:food.per.protein*100/food.servingG,carbs:food.per.carbs*100/food.servingG,fat:food.per.fat*100/food.servingG}:null;
  if(!per100)return false;const t=now();
  const row={id:uuid(),owner_id:userId,client_id:'fav-'+uuid(),name:String(food.name||'Food').slice(0,160),brand:String(food.brand||'').slice(0,120),barcode:/^[0-9]{6,14}$/.test(food.barcode||'')?food.barcode:null,kcal_100:r1(clamp(per100.kcal,0,2000)),protein_100:r1(clamp(per100.protein,0,100)),carbs_100:r1(clamp(per100.carbs,0,100)),fat_100:r1(clamp(per100.fat,0,100)),serving_g:food.servingG?r1(food.servingG):null,serving_label:String(food.servingLabel||'').slice(0,60),use_count:1,last_used_at:new Date().toISOString(),client_created_at:t,client_updated_at:t,deleted_at:null};
  favourites.push(row);queue('planly_food_favourites','insert',row);return row;
}
function removeFavourite(fav){const next={...fav,deleted_at:new Date().toISOString(),client_updated_at:now()};favourites=favourites.filter(x=>x.id!==fav.id);queue('planly_food_favourites',pending.some(p=>p.key===fav.id&&p.kind==='insert')?'delete':'update',next)}
function saveProfile(values){const t=now(),base=profile||{owner_id:userId,cloud_version:0};const next={...base,...values,owner_id:userId,client_updated_at:t};const kind=profile?.cloud_version||pending.some(p=>p.table==='planly_food_profile'&&p.kind==='insert')?'update':'insert';profile=next;queue('planly_food_profile',kind,next)}

// ---------- food sources ----------
const favFood=f=>({name:f.name,brand:f.brand,barcode:f.barcode,basis:'100g',per:{kcal:num(f.kcal_100),protein:num(f.protein_100),carbs:num(f.carbs_100),fat:num(f.fat_100)},servingG:num(f.serving_g)||null,servingLabel:f.serving_label||'',favouriteId:f.id,source:'favourite'});
function recentFoods(){const seen=new Set(),out=[];for(const e of [...entries].sort((a,b)=>num(b.client_created_at)-num(a.client_created_at))){const k=(e.name+'|'+e.brand).toLowerCase();if(seen.has(k)||e.source==='quick')continue;seen.add(k);const amt=num(e.amount,1)||1;out.push({name:e.name,brand:e.brand,barcode:e.barcode,basis:e.unit==='serving'?'serving':'100g',per:{kcal:num(e.kcal)/amt*(e.unit==='serving'?1:100),protein:num(e.protein_g)/amt*(e.unit==='serving'?1:100),carbs:num(e.carbs_g)/amt*(e.unit==='serving'?1:100),fat:num(e.fat_g)/amt*(e.unit==='serving'?1:100)},servingG:null,lastAmount:amt,lastUnit:e.unit,source:'search'});if(out.length>=8)break}return out}
function offProduct(p){
  const n=p?.nutriments||{},kcal=num(n['energy-kcal_100g'],NaN),kj=num(n['energy-kj_100g']??n.energy_100g,NaN),k=Number.isFinite(kcal)?kcal:Number.isFinite(kj)?kj/4.184:NaN;
  const name=String(p?.product_name||'').trim();if(!name||!Number.isFinite(k))return null;
  const sq=num(p.serving_quantity,0);
  return {name:name.slice(0,160),brand:String(p.brands||'').split(',')[0].trim().slice(0,120),barcode:/^[0-9]{6,14}$/.test(String(p.code||''))?String(p.code):null,basis:'100g',per:{kcal:clamp(k,0,2000),protein:clamp(num(n.proteins_100g),0,100),carbs:clamp(num(n.carbohydrates_100g),0,100),fat:clamp(num(n.fat_100g),0,100)},servingG:sq>0&&sq<=5000?sq:null,servingLabel:String(p.serving_size||'').slice(0,60),source:'search'};
}
async function searchOff(q){
  const url=OFF_SEARCH+'?'+new URLSearchParams({search_terms:q,search_simple:'1',action:'process',json:'1',page_size:'20',fields:'code,product_name,brands,nutriments,serving_size,serving_quantity'});
  const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),12000);
  try{const r=await fetch(url,{signal:ctl.signal});if(r.status===429)throw Error('Open Food Facts is busy. Try again in a minute.');if(!r.ok)throw Error('Open Food Facts did not answer. Try again.');const j=await r.json();return (j.products||[]).map(offProduct).filter(Boolean)}
  catch(e){if(e?.name==='AbortError'||isNetwork(e))throw Error("Couldn't reach Open Food Facts. Check your connection.");throw e}
  finally{clearTimeout(timer)}
}

// ---------- rendering ----------
function invalidate(){fitInvalid=true}
function dayLabel(key){const t=todayKey();if(key===t)return 'Today';if(key===shiftDay(t,-1))return 'Yesterday';return new Date(key+'T12:00:00').toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'})}
function ring(left,target){const R=52,C=2*Math.PI*R,used=clamp(1-left/Math.max(target,1),0,1),over=left<0;return `<svg class="fitRing" viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="${R}" class="fitRingTrack"/>${used>0?`<circle cx="60" cy="60" r="${R}" class="fitRingFill${over?' over':''}" stroke-dasharray="${(C*used).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 60 60)"/>`:''}</svg>`}
function macroRow(label,cls,val,target){return `<div class="fitMacro ${cls}"><div class="fitMacroTop"><strong>${label}</strong><span>${fmt(val)} / ${fmt(target)} g</span></div><div class="fitBar"><span style="width:${(clamp(val/Math.max(target,1),0,1)*100).toFixed(1)}%"></span></div></div>`}
function viewHtml(){
  const t=targets(),list=dayEntries(dayKey),tot=totals(list),left=t.kcal-tot.kcal,avg=weekAverage(),isToday=dayKey===todayKey();
  const setup=!profile?`<section class="fitCard fitSetup"><div><strong>Set your daily targets</strong><span>Planly works out calories and macros from your height, weight and goal.</span></div><button type="button" class="fitPrimary" data-fit="targets">Set targets</button></section>`:'';
  const fails=failures.length?`<div class="fitNotice" role="status"><span>${failures.length===1?'1 change':failures.length+' changes'} couldn't be saved and ${failures.length===1?'was':'were'} replaced by the latest saved version.</span><button type="button" data-fit="dismiss">OK</button></div>`:'';
  const meals=MEALS.map(([id,label])=>{const rows=list.filter(x=>x.meal===id);const kc=totals(rows).kcal;return `<section class="fitMeal" data-meal="${id}"><div class="fitMealHead"><h3>${label}</h3><span>${rows.length?fmt(kc)+' kcal':''}</span></div>${rows.map(x=>`<button type="button" class="fitEntry" data-entry="${esc(x.id)}"><span class="fitEntryText"><strong>${esc(x.name)}</strong><small>${esc([x.brand,amountText(x)].filter(Boolean).join(' · '))}</small></span><span class="fitEntryKcal">${fmt(x.kcal)}</span></button>`).join('')}<button type="button" class="fitQuiet" data-fit="search" data-meal="${id}">+ Add food</button></section>`}).join('');
  return `<div class="fitView">
<div class="fitSegments" role="tablist" aria-label="Fitness sections"><button type="button" class="active" role="tab" aria-selected="true">Food</button><button type="button" disabled aria-disabled="true">Gym <small>Soon</small></button><button type="button" disabled aria-disabled="true">Body <small>Soon</small></button></div>
<div class="fitDayBar"><button type="button" data-fit="prev" aria-label="Previous day">‹</button><strong>${esc(dayLabel(dayKey))}</strong><button type="button" data-fit="next" aria-label="Next day" ${isToday?'disabled':''}>›</button></div>
${fails}${setup}
<section class="fitCard fitSummary"><div class="fitSummaryTop"><div class="fitRingWrap">${ring(left,t.kcal)}<div class="fitRingText"><strong class="${left<0?'over':''}">${fmt(Math.abs(left))}</strong><span>${left<0?'kcal over':'kcal left'}</span></div></div><div class="fitMacros">${macroRow('Protein','protein',tot.protein,t.protein)}${macroRow('Carbs','carbs',tot.carbs,t.carbs)}${macroRow('Fat','fat',tot.fat,t.fat)}</div></div>
<div class="fitSummaryFoot"><span>Eaten <strong>${fmt(tot.kcal)}</strong></span><button type="button" class="fitTargetBtn" data-fit="targets">Target <strong>${fmt(t.kcal)}</strong></button><span>7-day avg <strong>${avg==null?'–':fmt(avg)}</strong></span></div></section>
<div class="fitActions"><button type="button" class="fitPrimary" data-fit="search"><svg class="pIcon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></svg>Search food</button><button type="button" class="fitSecondary" data-fit="quick">+ Quick add</button></div>
<div class="fitCard fitMeals">${meals}</div>
<p class="fitFootnote">Only you can see your food log. Targets are estimates, not medical advice.</p>
</div>`;
}
function amountText(x){const a=num(x.amount);if(x.source==='quick')return '';if(x.unit==='serving')return a===1?'1 serving':`${r1(a)} servings`;return `${r1(a)} ${x.unit}`}
function renderFitness(view){
  setHeader('Fitness',new Date(dayKey+'T12:00:00').toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'short'}));
  view.innerHTML=viewHtml();fitInvalid=false;
}
function handleClick(e){
  const b=e.target.closest('[data-fit],[data-entry]');if(!b||!e.currentTarget.contains(b)||state.tab!=='fitness')return;
  const a=b.dataset.fit;
  if(b.dataset.entry){const row=entries.find(x=>x.id===b.dataset.entry);if(row)openEdit(row);return}
  if(a==='prev'){dayKey=shiftDay(dayKey,-1);invalidate();render();if(dayKey<loadedFrom||!loadedFrom)refresh(dayKey);return}
  if(a==='next'){if(dayKey<todayKey()){dayKey=shiftDay(dayKey,1);invalidate();render()}return}
  if(a==='search')return openSearch(b.dataset.meal||defaultMeal());
  if(a==='quick')return openQuick();
  if(a==='targets')return openTargets();
  if(a==='dismiss'){failures=[];persist();invalidate();render()}
}

// ---------- sheets ----------
function ensureSheet(){
  if(sheet)return sheet;
  sheet=document.createElement('div');sheet.className='fitSheetWrap';sheet.setAttribute('aria-hidden','true');
  sheet.innerHTML='<div class="fitSheetBackdrop" data-fit-close></div><section class="fitSheet" role="dialog" aria-modal="true" aria-labelledby="fitSheetTitle"><div class="taskActionGrab"></div><div class="fitSheetHead"><button type="button" class="fitSheetBack" data-fit-back hidden aria-label="Back">‹</button><h2 id="fitSheetTitle"></h2><button type="button" class="fitSheetDone" data-fit-close>Close</button></div><div class="fitSheetBody"></div></section>';
  document.body.appendChild(sheet);
  sheet.addEventListener('click',e=>{if(e.target.closest('[data-fit-close]'))closeSheet()});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&sheet.classList.contains('open'))closeSheet()});
  return sheet;
}
function showSheet(title,html,onBack){const w=ensureSheet();w.querySelector('#fitSheetTitle').textContent=title;const back=w.querySelector('[data-fit-back]');back.hidden=!onBack;back.onclick=onBack||null;w.querySelector('.fitSheetBody').innerHTML=html;w.classList.add('open');w.setAttribute('aria-hidden','false');document.documentElement.classList.add('sheetOpen');return w.querySelector('.fitSheetBody')}
function closeSheet(){if(!sheet)return;sheet.classList.remove('open');sheet.setAttribute('aria-hidden','true');document.documentElement.classList.remove('sheetOpen');if(state.tab==='fitness'){invalidate();render()}}
const mealChips=sel=>`<div class="fitChips" role="radiogroup" aria-label="Meal">${MEALS.map(([id,l])=>`<button type="button" role="radio" aria-checked="${id===sel}" class="${id===sel?'on':''}" data-meal-pick="${id}">${l}</button>`).join('')}</div>`;
function bindMealChips(body,set){body.querySelectorAll('[data-meal-pick]').forEach(c=>c.onclick=()=>{body.querySelectorAll('[data-meal-pick]').forEach(x=>{x.classList.toggle('on',x===c);x.setAttribute('aria-checked',String(x===c))});set(c.dataset.mealPick)})}
const foodLine=f=>`${fmt(f.per.kcal)} kcal ${f.basis==='serving'?'per serving':'per 100 g'}`;

function openSearch(meal){
  let results=[],status='',query='';
  const draw=()=>{
    const q=query.trim().toLowerCase(),favs=[...favourites].filter(f=>!q||(f.name+' '+f.brand).toLowerCase().includes(q)).sort((a,b)=>num(b.use_count)-num(a.use_count)).slice(0,20);
    const recent=q?[]:recentFoods().filter(r=>!favourites.some(f=>f.name===r.name&&f.brand===r.brand));
    const item=(f,key,i)=>`<button type="button" class="fitResult" data-pick="${key}:${i}"><span><strong>${esc(f.name)}</strong><small>${esc([f.brand,foodLine(f)].filter(Boolean).join(' · '))}</small></span><span aria-hidden="true">›</span></button>`;
    const body=showSheet('Add food',`<form class="fitSearchForm" data-search-form><input name="q" type="search" enterkeyhint="search" autocomplete="off" placeholder="Search foods, e.g. greek yogurt" value="${esc(query)}" aria-label="Search foods"><button type="submit" class="fitPrimary">Search</button></form>${mealChips(meal)}
${favs.length?`<h3 class="fitGroup">Favourites</h3><div class="fitList">${favs.map((f,i)=>item(favFood(f),'fav',i)).join('')}</div>`:''}
${recent.length?`<h3 class="fitGroup">Recent</h3><div class="fitList">${recent.map((f,i)=>item(f,'recent',i)).join('')}</div>`:''}
${status?`<p class="fitStatus" role="status">${esc(status)}</p>`:''}
${results.length?`<h3 class="fitGroup">Open Food Facts</h3><div class="fitList">${results.map((f,i)=>item(f,'off',i)).join('')}</div>`:''}
${!favs.length&&!recent.length&&!results.length&&!status?'<p class="fitStatus">Search for a food, or use Quick add for just the calories.</p>':''}
<p class="fitFootnote">Search uses Open Food Facts, a free food database. Only the words you search for are sent to it.</p>`);
    const input=body.querySelector('input[name="q"]');
    input.oninput=()=>{query=input.value;const pos=input.selectionStart;if(!results.length&&!status){draw();const i2=sheet.querySelector('input[name="q"]');i2.focus();try{i2.setSelectionRange(pos,pos)}catch{}}};
    bindMealChips(body,m=>meal=m);
    body.querySelector('[data-search-form]').onsubmit=async ev=>{ev.preventDefault();query=input.value.trim();if(query.length<2){status='Type at least 2 letters.';draw();return}status='Searching…';results=[];draw();try{results=await searchOff(query);status=results.length?'':'No foods found. Try other words, or use Quick add.'}catch(err){status=err.message||'Search failed.'}draw()};
    body.querySelectorAll('[data-pick]').forEach(b=>b.onclick=()=>{const [k,i]=b.dataset.pick.split(':'),list=k==='fav'?favs.map(favFood):k==='recent'?recent:results,f=list[Number(i)];if(f)openAmount(f,meal,()=>draw())});
  };
  draw();setTimeout(()=>sheet?.querySelector('input[name="q"]')?.focus(),50);
}
function openAmount(food,meal,back){
  // grams are possible for per-100 g foods, or per-serving foods with a known serving weight; servings need one or the other
  const units=[...(food.basis==='100g'||food.servingG?['g']:[]),...(food.basis==='serving'||food.servingG?['serving']:[])];
  let unit=units.includes(food.lastUnit)?food.lastUnit:units.includes('serving')?'serving':units[0],amount=food.lastAmount||(unit==='serving'?1:100);
  const body=showSheet(food.name,`<div class="fitFoodHead"><small>${esc([food.brand,foodLine(food)].filter(Boolean).join(' · '))}</small></div>
<label class="fitField"><span>Amount</span><div class="fitAmount"><input name="amount" type="number" inputmode="decimal" min="0" step="any" value="${amount}" aria-label="Amount">${units.length>1?`<div class="fitUnit" role="group" aria-label="Unit"><button type="button" data-unit="g">grams</button><button type="button" data-unit="serving">${food.servingG?`servings of ${fmt(food.servingG)} g`:'servings'}</button></div>`:`<span class="fitUnitFixed">${unit==='g'?'grams':'servings'}</span>`}</div></label>
${mealChips(meal)}
<div class="fitPreview" data-preview></div>
${food.favouriteId?'':`<label class="fitCheck"><input type="checkbox" name="star"><span>Save to favourites</span></label>`}
<button type="button" class="fitPrimary fitWide" data-add>Add to ${esc(MEALS.find(m=>m[0]===meal)[1])}</button>
${food.favouriteId?'<button type="button" class="fitQuiet fitDanger" data-unfav>Remove from favourites</button>':''}`,back);
  const input=body.querySelector('input[name="amount"]'),addBtn=body.querySelector('[data-add]');
  const preview=()=>{amount=num(input.value);const n=nutrientsFor(food,amount||0,unit);body.querySelector('[data-preview]').innerHTML=`<strong>${fmt(n.kcal)} kcal</strong><span>Protein ${r1(n.protein_g)} g · Carbs ${r1(n.carbs_g)} g · Fat ${r1(n.fat_g)} g</span>`;body.querySelectorAll('[data-unit]').forEach(b=>{b.classList.toggle('on',b.dataset.unit===unit);b.setAttribute('aria-pressed',String(b.dataset.unit===unit))});addBtn.disabled=!withinLimits(amount,n)};
  input.oninput=preview;
  body.querySelectorAll('[data-unit]').forEach(b=>b.onclick=()=>{if(b.dataset.unit===unit)return;unit=b.dataset.unit;input.value=unit==='serving'?1:(food.servingG?Math.round(food.servingG):100);preview()});
  bindMealChips(body,m=>{meal=m;addBtn.textContent='Add to '+MEALS.find(x=>x[0]===m)[1]});
  body.querySelector('[data-unfav]')?.addEventListener('click',()=>{const f=favourites.find(x=>x.id===food.favouriteId);if(f)removeFavourite(f);back?back():closeSheet()});
  addBtn.onclick=()=>{if(!withinLimits(amount,nutrientsFor(food,amount,unit)))return;if(body.querySelector('input[name="star"]')?.checked)saveFavourite(food);addEntry(food,amount,unit,meal,food.source||'search');closeSheet();if(typeof showToast==='function')showToast(`Added ${food.name}`)};
  preview();
}
function openQuick(){
  let meal=defaultMeal();
  const body=showSheet('Quick add',`<label class="fitField"><span>Name <small>(optional)</small></span><input name="name" maxlength="160" placeholder="Quick add"></label>
<label class="fitField"><span>Calories</span><input name="kcal" type="number" inputmode="decimal" min="0" max="10000" placeholder="kcal"></label>
<div class="fitTriple"><label class="fitField"><span>Protein g</span><input name="p" type="number" inputmode="decimal" min="0"></label><label class="fitField"><span>Carbs g</span><input name="c" type="number" inputmode="decimal" min="0"></label><label class="fitField"><span>Fat g</span><input name="f" type="number" inputmode="decimal" min="0"></label></div>
${mealChips(meal)}<button type="button" class="fitPrimary fitWide" data-add disabled>Add</button>`);
  const v=n=>body.querySelector(`[name="${n}"]`),btn=body.querySelector('[data-add]');
  const ok=()=>{const k=num(v('kcal').value,NaN);btn.disabled=!(k>=0&&k<=10000&&v('kcal').value!=='')};
  body.querySelectorAll('input').forEach(i=>i.oninput=ok);bindMealChips(body,m=>meal=m);
  btn.onclick=()=>{const k=clamp(num(v('kcal').value),0,10000);addEntry({name:v('name').value.trim()||'Quick add',brand:'',basis:'serving',per:{kcal:k,protein:clamp(num(v('p').value),0,1000),carbs:clamp(num(v('c').value),0,1000),fat:clamp(num(v('f').value),0,1000)}},1,'serving',meal,'quick');closeSheet()};
  setTimeout(()=>v('kcal')?.focus(),50);
}
function openEdit(row){
  let meal=row.meal;const per=num(row.amount,1)||1;
  const body=showSheet(row.name,`<div class="fitFoodHead"><small>${esc([row.brand,dayLabel(row.entry_date)].filter(Boolean).join(' · '))}</small></div>
${row.source==='quick'?'':`<label class="fitField"><span>Amount (${esc(row.unit==='serving'?'servings':row.unit)})</span><input name="amount" type="number" inputmode="decimal" min="0" step="any" value="${r1(row.amount)}"></label>`}
${mealChips(meal)}<div class="fitPreview" data-preview></div>
<button type="button" class="fitPrimary fitWide" data-save>Save</button><button type="button" class="fitQuiet fitDanger" data-delete>Delete</button>`);
  const input=body.querySelector('input[name="amount"]');
  const scaled=()=>{const a=input?num(input.value):per,f=a/per;return {amount:r1(a),kcal:r1(row.kcal*f),protein_g:r1(row.protein_g*f),carbs_g:r1(row.carbs_g*f),fat_g:r1(row.fat_g*f)}};
  const preview=()=>{const s=scaled();body.querySelector('[data-preview]').innerHTML=`<strong>${fmt(s.kcal)} kcal</strong><span>Protein ${s.protein_g} g · Carbs ${s.carbs_g} g · Fat ${s.fat_g} g</span>`;body.querySelector('[data-save]').disabled=!withinLimits(s.amount,s)};
  if(input)input.oninput=preview;bindMealChips(body,m=>meal=m);preview();
  body.querySelector('[data-save]').onclick=()=>{const s=scaled();if(!withinLimits(s.amount,s))return;updateEntry(row,{...s,meal});closeSheet()};
  body.querySelector('[data-delete]').onclick=()=>{deleteEntry(row);closeSheet();if(typeof showToast==='function')showToast(`Deleted ${row.name}`)};
}
function openTargets(){
  const p={sex:'',birth_year:'',height_cm:'',weight_kg:'',activity:'light',goal:'maintain',pace_kg_week:0.5,targets_custom:false,...(profile||{})};
  if(!num(p.pace_kg_week))p.pace_kg_week=0.5;
  const t=targets();let custom=!!p.targets_custom;
  const seg=(name,opts,val)=>`<div class="fitSeg" role="radiogroup" data-seg="${name}">${opts.map(([v,l])=>`<button type="button" role="radio" aria-checked="${String(v)===String(val)}" class="${String(v)===String(val)?'on':''}" data-v="${v}">${l}</button>`).join('')}</div>`;
  const body=showSheet('Daily targets',`<p class="fitHint">Planly estimates your daily calories from your details (Mifflin–St Jeor), then sets protein, fat and carbs. Only you can see these.</p>
<div class="fitField"><span>Sex</span>${seg('sex',[['female','Female'],['male','Male']],p.sex)}</div>
<div class="fitTriple"><label class="fitField"><span>Birth year</span><input name="birth_year" type="number" inputmode="numeric" min="1900" max="2100" value="${esc(p.birth_year??'')}"></label><label class="fitField"><span>Height cm</span><input name="height_cm" type="number" inputmode="decimal" min="80" max="250" value="${esc(p.height_cm??'')}"></label><label class="fitField"><span>Weight kg</span><input name="weight_kg" type="number" inputmode="decimal" min="25" max="400" value="${esc(p.weight_kg??'')}"></label></div>
<label class="fitField"><span>Activity</span><select name="activity">${ACTIVITY.map(([v,l])=>`<option value="${v}" ${v===p.activity?'selected':''}>${l}</option>`).join('')}</select></label>
<div class="fitField"><span>Goal</span>${seg('goal',[['lose','Lose'],['maintain','Maintain'],['gain','Gain']],p.goal)}</div>
<div class="fitField" data-pace-wrap><span>Pace per week</span>${seg('pace_kg_week',[['0.25','0.25 kg'],['0.5','0.5 kg'],['0.75','0.75 kg']],String(p.pace_kg_week))}</div>
<div class="fitPreview" data-suggest></div>
<label class="fitCheck"><input type="checkbox" name="custom" ${custom?'checked':''}><span>Set my own numbers</span></label>
<div class="fitCustom" data-custom><div class="fitTriple fitQuad"><label class="fitField"><span>kcal</span><input name="kcal_target" type="number" inputmode="numeric" min="800" max="6000" value="${t.kcal}"></label><label class="fitField"><span>Protein g</span><input name="protein_g" type="number" inputmode="numeric" min="0" max="500" value="${t.protein}"></label><label class="fitField"><span>Carbs g</span><input name="carbs_g" type="number" inputmode="numeric" min="0" max="1000" value="${t.carbs}"></label><label class="fitField"><span>Fat g</span><input name="fat_g" type="number" inputmode="numeric" min="0" max="400" value="${t.fat}"></label></div></div>
<p class="fitStatus" data-err role="alert"></p>
<button type="button" class="fitPrimary fitWide" data-save>Save targets</button>
<p class="fitFootnote">Estimates only, not medical advice.</p>`);
  const val=n=>body.querySelector(`[name="${n}"]`)?.value;
  const read=()=>({sex:p.sex||null,birth_year:val('birth_year')?Math.round(num(val('birth_year'))):null,height_cm:val('height_cm')?r1(val('height_cm')):null,weight_kg:val('weight_kg')?r1(val('weight_kg')):null,activity:val('activity'),goal:p.goal,pace_kg_week:p.goal==='maintain'?0:num(p.pace_kg_week)});
  const update=()=>{const v=read(),s=suggestTargets(v);body.querySelector('[data-pace-wrap]').hidden=p.goal==='maintain';body.querySelector('[data-custom]').hidden=!custom;body.querySelector('[data-suggest]').innerHTML=s?`<strong>${fmt(s.kcal_target)} kcal a day</strong><span>Protein ${s.protein_g} g · Carbs ${s.carbs_g} g · Fat ${s.fat_g} g</span>`:'<span>Add your sex, height and weight to get a suggestion.</span>'};
  body.querySelectorAll('[data-seg]').forEach(g=>g.querySelectorAll('button').forEach(b=>b.onclick=()=>{p[g.dataset.seg]=b.dataset.v;g.querySelectorAll('button').forEach(x=>{x.classList.toggle('on',x===b);x.setAttribute('aria-checked',String(x===b))});update()}));
  body.querySelectorAll('input,select').forEach(i=>i.addEventListener('input',()=>{if(i.name==='custom')custom=i.checked;update()}));
  body.querySelector('[data-save]').onclick=()=>{
    const v=read(),err=body.querySelector('[data-err]');err.textContent='';
    if(v.birth_year&&(v.birth_year<1900||v.birth_year>2100)||v.height_cm&&(v.height_cm<80||v.height_cm>250)||v.weight_kg&&(v.weight_kg<25||v.weight_kg>400)){err.textContent='Check your birth year, height and weight.';return}
    let tg;if(custom){tg={kcal_target:Math.round(num(val('kcal_target'))),protein_g:Math.round(num(val('protein_g'))),carbs_g:Math.round(num(val('carbs_g'))),fat_g:Math.round(num(val('fat_g')))};if(tg.kcal_target<800||tg.kcal_target>6000||tg.protein_g>500||tg.carbs_g>1000||tg.fat_g>400||[tg.protein_g,tg.carbs_g,tg.fat_g].some(x=>x<0)){err.textContent='Calories must be 800–6,000 and macros within sensible limits.';return}}
    else{tg=suggestTargets(v);if(!tg){err.textContent='Add your sex, height and weight, or set your own numbers.';return}}
    saveProfile({...v,...tg,targets_custom:custom});closeSheet();
  };
  update();
}

// ---------- tab integration ----------
const baseRender=render;
render=function(){
  if(state.tab!=='fitness'){return baseRender.apply(this,arguments)}
  const view=$('#view');if(!view)return;
  $('#addBtn').style.display='none';
  if(fitInvalid||!view.querySelector('.fitView'))renderFitness(view);
  else setHeader('Fitness',new Date(dayKey+'T12:00:00').toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'short'}));
};
$('#view')?.addEventListener('click',handleClick);
nav.addEventListener('click',()=>{if(dayKey!==todayKey()&&state.tab!=='fitness')dayKey=todayKey();invalidate();if(userId)refresh()},true);
window.addEventListener('online',()=>{if(userId)refresh()});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&userId&&state.tab==='fitness'){if(dayKey<todayKey()&&dayKey===shiftDay(todayKey(),-1)&&!sheet?.classList.contains('open'))dayKey=todayKey();refresh()}});
async function init(){
  sb=window.PlanlySupabase?.get?.()||null;if(!sb)return;
  const {data}=await sb.auth.getSession();userId=data?.session?.user?.id||'';restore();invalidate();
  sb.auth.onAuthStateChange((_e,s)=>{const next=s?.user?.id||'';if(next===userId)return;userId=next;restore();invalidate();closeSheet();if(userId)refresh();else if(state.tab==='fitness')render()});
  if(userId&&navigator.onLine)refresh();else if(state.tab==='fitness')render();
}
window.PlanlyFitness={refresh,getState:()=>structuredClone({profile,entries,favourites,pending,failures,dayKey}),suggestTargets,nutrientsFor,offProduct};
setTimeout(()=>init().catch(e=>console.warn('Planly fitness',e)),0);
})();
