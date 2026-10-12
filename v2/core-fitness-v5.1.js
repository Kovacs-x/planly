// Planly 5.1 — Fitness › Food: a private calorie and macro counter (tables from migration 054). Runs inside the Planly
// app closure as the Fitness tab. Every row belongs to the signed-in person only (RLS: owner_id = auth.uid()); the
// browser never chooses whose data it reads, it only sends its own rows. Works offline: changes are kept on the phone
// and sent in order when online, each guarded by cloud_version so a change made on another device is never overwritten.
// Food search uses Open Food Facts (free, no key); only the words typed into Search, or a scanned barcode number, are
// sent to it. The barcode scanner reads the camera on the phone only: no picture is saved or sent anywhere.
(()=>{'use strict';
const nav=$('.nav button[data-tab="fitness"]');
if(!nav)return;
const STORE='planly-fitness-v1:',MEALS=[['breakfast','Breakfast'],['lunch','Lunch'],['dinner','Dinner'],['snack','Snacks']];
const ACTIVITY=[['sedentary','Mostly sitting',1.2],['light','Lightly active',1.375],['moderate','Active 3–5 days a week',1.55],['active','Very active',1.725],['very_active','Hard training or physical job',1.9]];
const OFF_FAST='https://search.openfoodfacts.org/search',OFF_SEARCH='https://world.openfoodfacts.org/cgi/search.pl',OFF_PRODUCT='https://world.openfoodfacts.org/api/v2/product/';
// ZXing 0.23.0 (Apache-2.0), vendored byte for byte from npm and loaded only when the scanner opens (iPhone has no built-in reader)
const ZXING_URL='./vendor/zxing-library-0.23.0.min.js';
let camera=null,scanRun=0,zxingLoad=null,inflight='',sb=null,userId='',profile=null,entries=[],favourites=[],pending=[],failures=[],loadedFrom='',dayKey=todayKey(),syncing=false,sheet=null,fitInvalid=true;
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
  return {name:name.slice(0,160),brand:String(Array.isArray(p.brands)?p.brands[0]||'':p.brands||'').split(',')[0].trim().slice(0,120),barcode:/^[0-9]{6,14}$/.test(String(p.code||''))?String(p.code):null,basis:'100g',per:{kcal:clamp(k,0,2000),protein:clamp(num(n.proteins_100g),0,100),carbs:clamp(num(n.carbohydrates_100g),0,100),fat:clamp(num(n.fat_100g),0,100)},servingG:sq>0&&sq<=5000?sq:null,servingLabel:String(p.serving_size||'').slice(0,60),source:'search'};
}
// Open Food Facts has two name searches: the newer, faster search service, and the classic one (slower, often busy).
// Try the fast one first, then the classic one if it fails or finds nothing (with one retry if it is busy). Only the search words are sent.
const OFF_FIELDS='code,product_name,brands,nutriments,serving_size,serving_quantity';
async function getJson(url,ms,outer){const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),ms),stop=()=>ctl.abort();outer?.addEventListener('abort',stop);try{const r=await fetch(url,{signal:ctl.signal});if(!r.ok){const e=Error('HTTP '+r.status);e.status=r.status;throw e}return await r.json()}finally{clearTimeout(timer);outer?.removeEventListener('abort',stop)}}
// Matching and ranking. Every typed word must start a word of the food's name or brand ("coco p" → Kellogg's Coco Pops);
// names that start with the first typed word, then exact word matches, come first.
const words=t=>String(t||'').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9%]+/g,' ').trim().split(' ').filter(Boolean);
function matchScore(f,qw){
  if(!qw.length)return 0;const nw=words(f.name),all=[...nw,...words(f.brand)];let score=0;
  for(const q of qw){const hit=all.findIndex(w=>w.startsWith(q));if(hit<0)return null;if(all[hit]===q)score+=2;if(hit<nw.length)score+=1}
  if(nw[0]?.startsWith(qw[0]))score+=4;return score-nw.length*0.05;
}
// keepAll: Open Food Facts answers are re-ranked, not filtered (it also matches spellings like yoghurt/yogurt)
function rankFoods(list,q,boost=()=>0,keepAll=false){const qw=words(q),seen=new Set();return list.map((f,i)=>({f,i,s:matchScore(f,qw)??(keepAll?-100:null)})).filter(x=>x.s!==null).map(x=>({...x,s:x.s+boost(x.f)})).sort((a,b)=>b.s-a.s||a.i-b.i).map(x=>x.f).filter(f=>{const k=(f.name+'|'+f.brand).toLowerCase();if(seen.has(k))return false;seen.add(k);return true})}
// Answers from Open Food Facts are kept for this session, so going back or retyping is instant.
const offCache=new Map(),cacheSet=(k,v)=>{offCache.set(k,v);if(offCache.size>60)offCache.delete(offCache.keys().next().value)};
// The fast search service only matches whole words, and every word must match, so a half-typed last word
// ("apple jui", "coco p") would find nothing. Two questions go at once: all the words with the last one as a word start
// ("apple jui*"), and just the finished words ("apple", more answers), keeping those with a word starting "jui".
// If word starts are ever refused, the finished words (or a single word as typed) still give answers.
// Only plain letters and numbers are sent, so typed symbols can't be read as search commands.
async function fastSearch(q,size,ms,signal){
  const qw=words(q).slice(0,8);if(!qw.length)return [];
  const ask=(text,n)=>getJson(OFF_FAST+'?'+new URLSearchParams({q:text,page_size:String(n),fields:OFF_FIELDS}),ms,signal).then(j=>{if(!Array.isArray(j?.hits))throw Error('bad answer');return j.hits.map(offProduct).filter(Boolean)});
  const asks=[ask([...qw.slice(0,-1),qw[qw.length-1]+'*'].join(' '),size)];
  asks.push(ask((qw.length>1?qw.slice(0,-1):qw).join(' '),30).then(list=>rankFoods(list,q))); // one word: the word as typed
  const got=await Promise.allSettled(asks);if(got.every(x=>x.status==='rejected'))throw got[0].reason;
  return rankFoods(got.flatMap(x=>x.status==='fulfilled'?x.value:[]),q,undefined,true).slice(0,size);
}
// Suggestions while typing: the fast search service only, a short wait, and the previous request cancelled.
const suggestOff=(q,signal)=>fastSearch(q,12,6000,signal);
async function searchOff(q,onSlow){
  if(!navigator.onLine)throw Error("You're offline. Search needs internet; your favourites and recent foods still work.");
  const slow=setTimeout(()=>onSlow?.(),5000);
  try{
    try{const found=await fastSearch(q,20,8000);if(found.length)return found}catch{}
    const url=OFF_SEARCH+'?'+new URLSearchParams({search_terms:q,search_simple:'1',action:'process',json:'1',page_size:'20',fields:OFF_FIELDS});
    for(let attempt=0;attempt<2;attempt++){
      try{const j=await getJson(url,20000);return rankFoods((j.products||[]).map(offProduct).filter(Boolean),q,undefined,true)}
      catch(e){if(attempt===0&&navigator.onLine){await new Promise(r=>setTimeout(r,1500));continue}
        if(!navigator.onLine)throw Error("You're offline. Search needs internet; your favourites and recent foods still work.");
        throw Error('Open Food Facts is slow or busy right now. Try again in a moment, or use Quick add.')}
    }
    return [];
  }finally{clearTimeout(slow)}
}
// Barcodes carry a check digit; a code that fails it is a misread and is never looked up.
// EAN-8, UPC-A (12) and EAN-13 use the usual alternating 3/1 weights over the whole code. UPC-E (8 digits, number system
// 0 or 1) is a compressed UPC-A: it is expanded first and the check digit is verified on the 12-digit UPC-A.
function checksumOk(c){const d=[...c].map(Number),check=d.pop();const sum=d.reverse().reduce((t,x,i)=>t+x*(i%2?1:3),0);return (10-sum%10)%10===check}
function upcEtoA(c){if(!/^[01]\d{7}$/.test(c))return null;const n=c[0],d=c.slice(1,7),l=d[5],chk=c[7];
  const body=l<='2'?n+d[0]+d[1]+l+'0000'+d[2]+d[3]+d[4]:l==='3'?n+d[0]+d[1]+d[2]+'00000'+d[3]+d[4]:l==='4'?n+d[0]+d[1]+d[2]+d[3]+'00000'+d[4]:n+d.slice(0,5)+'0000'+l;
  return body+chk}
// The codes to look up for a scanned or typed barcode, or [] if it is not valid. format: 'ean_13'|'ean_8'|'upc_a'|'upc_e'
// from the scanner, '' when typed (an 8-digit typed code may be EAN-8 or UPC-E; whichever is valid is tried).
function barcodeCandidates(code,format=''){
  const c=String(code||''),out=[];
  if(/^\d{13}$/.test(c)&&(!format||format==='ean_13')&&checksumOk(c))out.push(c);
  if(/^\d{12}$/.test(c)&&(!format||format==='upc_a')&&checksumOk(c))out.push(c,'0'+c);
  if(/^\d{8}$/.test(c)){
    if((!format||format==='ean_8')&&checksumOk(c))out.push(c);
    if(!format||format==='upc_e'){const a=upcEtoA(c);if(a&&checksumOk(a))out.push(a,'0'+a,c)}}
  return [...new Set(out)];
}
const validBarcode=(code,format='')=>barcodeCandidates(code,format).length>0;
async function lookupBarcode(code,format=''){
  const cands=barcodeCandidates(code,format);if(!cands.length)return {error:"That barcode number isn't valid. Check the digits."};
  const fav=favourites.find(f=>cands.includes(f.barcode));if(fav)return {food:favFood(fav)};
  if(!navigator.onLine)return {error:"You're offline. Looking up a new barcode needs internet; use Quick add for now."};
  for(const c of cands){
    const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),12000);
    try{const r=await fetch(OFF_PRODUCT+c+'.json?'+new URLSearchParams({fields:'code,product_name,brands,nutriments,serving_size,serving_quantity'}),{signal:ctl.signal});
      if(r.status===404)continue;if(r.status===429)return {error:'Open Food Facts is busy. Try again in a minute.'};if(!r.ok)return {error:'Open Food Facts did not answer. Try again.'};
      const j=await r.json();if(!j?.product||j.status===0)continue;const food=offProduct({...j.product,code:c});
      if(!food)return {missing:String(j.product.product_name||'').trim().slice(0,160),code:c,error:'This product has no calorie information in Open Food Facts yet.'};
      return {food:{...food,barcode:c,source:'barcode'}};
    }catch(e){return {error:"Couldn't reach Open Food Facts. Check your connection."}}finally{clearTimeout(timer)}
  }
  return {code,error:'This barcode is not in Open Food Facts yet.'};
}
function loadZxing(){if(window.ZXing?.MultiFormatReader)return Promise.resolve(window.ZXing);return zxingLoad||(zxingLoad=new Promise((res,rej)=>{const sc=document.createElement('script');sc.src=ZXING_URL;sc.async=true;sc.onload=()=>window.ZXing?.MultiFormatReader?res(window.ZXing):rej(Error('Scanner failed to load'));sc.onerror=()=>{zxingLoad=null;rej(Error('Scanner failed to load'))};document.head.appendChild(sc)}))}
async function makeDetector(){
  // Android Chrome has a built-in barcode reader; everywhere else (iPhone) use ZXing on a centre crop of the frame
  try{if('BarcodeDetector' in window){const f=await window.BarcodeDetector.getSupportedFormats();if(f.includes('ean_13')){const d=new window.BarcodeDetector({formats:['ean_13','ean_8','upc_a','upc_e'].filter(x=>f.includes(x))});return async video=>{const r=await d.detect(video);return r[0]?{code:String(r[0].rawValue||''),format:String(r[0].format||'')}:null}}}}catch{}
  // No UPC-E here: ZXing 0.23.0's JavaScript UPC-E reader is broken (it expands with character codes and pads the result),
  // so it never returns a correct UPC-E. Those short codes can still be typed, and Android's built-in reader handles them.
  const Z=await loadZxing(),reader=new Z.MultiFormatReader(),hints=new Map([[Z.DecodeHintType.POSSIBLE_FORMATS,[Z.BarcodeFormat.EAN_13,Z.BarcodeFormat.EAN_8,Z.BarcodeFormat.UPC_A]],[Z.DecodeHintType.TRY_HARDER,true]]);reader.setHints(hints);
  const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d',{willReadFrequently:true});
  const formats=new Map([[Z.BarcodeFormat.EAN_13,'ean_13'],[Z.BarcodeFormat.EAN_8,'ean_8'],[Z.BarcodeFormat.UPC_A,'upc_a']]);
  return async video=>{const w=video.videoWidth,h=video.videoHeight;if(!w||!h)return null;const cw=Math.round(w*0.9),ch=Math.round(Math.min(h,w*0.5));canvas.width=Math.min(cw,1280);canvas.height=Math.round(ch*canvas.width/cw);ctx.drawImage(video,(w-cw)/2,(h-ch)/2,cw,ch,0,0,canvas.width,canvas.height);
    try{const bmp=new Z.BinaryBitmap(new Z.HybridBinarizer(new Z.HTMLCanvasElementLuminanceSource(canvas)));const res=reader.decodeWithState(bmp);return {code:res.getText(),format:formats.get(res.getBarcodeFormat())||''}}catch{return null}finally{reader.reset()}};
}
function stopCamera(){scanRun++;if(camera){for(const t of camera.getTracks())t.stop();camera=null}const v=sheet?.querySelector('video');if(v)v.srcObject=null}

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
<div class="fitActions"><button type="button" class="fitPrimary" data-fit="scan"><svg class="pIcon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16M8 8v8M11 8v8M13.5 8v8M16 8v8"/></svg>Scan</button><button type="button" class="fitSecondary" data-fit="search"><svg class="pIcon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></svg>Search</button><button type="button" class="fitSecondary" data-fit="quick">+ Quick</button></div>
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
  if(a==='scan')return openScan(defaultMeal());
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
function showSheet(title,html,onBack){stopCamera();const w=ensureSheet();w.querySelector('.fitSheet').classList.remove('tall');w.querySelector('#fitSheetTitle').textContent=title;const back=w.querySelector('[data-fit-back]');back.hidden=!onBack;back.onclick=onBack||null;w.querySelector('.fitSheetBody').innerHTML=html;w.classList.add('open');w.setAttribute('aria-hidden','false');document.documentElement.classList.add('sheetOpen');return w.querySelector('.fitSheetBody')}
function closeSheet(){stopCamera();if(!sheet)return;sheet.classList.remove('open');sheet.setAttribute('aria-hidden','true');document.documentElement.classList.remove('sheetOpen');if(state.tab==='fitness'){invalidate();render()}}
const mealChips=sel=>`<div class="fitChips" role="radiogroup" aria-label="Meal">${MEALS.map(([id,l])=>`<button type="button" role="radio" aria-checked="${id===sel}" class="${id===sel?'on':''}" data-meal-pick="${id}">${l}</button>`).join('')}</div>`;
function bindMealChips(body,set){body.querySelectorAll('[data-meal-pick]').forEach(c=>c.onclick=()=>{body.querySelectorAll('[data-meal-pick]').forEach(x=>{x.classList.toggle('on',x===c);x.setAttribute('aria-checked',String(x===c))});set(c.dataset.mealPick)})}
const foodLine=f=>`${fmt(f.per.kcal)} kcal ${f.basis==='serving'?'per serving':'per 100 g'}`;

function openSearch(meal,initial='',keep=null){
  // The search box, buttons and meal choice are drawn once; typing only redraws the list underneath (at most once a frame),
  // so the page and keyboard stay still. Your own foods show instantly; Open Food Facts suggestions follow a moment after
  // you pause typing, and pressing Search asks for the full list.
  let results=keep?.results||[],status=keep?.status||'',query=initial,busy=0,shown={mine:[],off:[]},timer=0,ctl=null,frame=0,pending='';
  const back=()=>openSearch(meal,query,{results,status});
  const body=showSheet('Add food',`<form class="fitSearchForm" data-search-form><input name="q" type="search" enterkeyhint="search" autocomplete="off" autocorrect="off" spellcheck="false" placeholder="Food name or barcode number" value="${esc(query)}" aria-label="Search foods"><button type="submit" class="fitPrimary">Search</button></form>${mealChips(meal)}
<div class="fitSearchList" data-list></div>
<p class="fitFootnote">Suggestions and search use Open Food Facts, a free food database. As you type, the words in the search box are sent to it after a short pause, from three letters, to show suggestions. Only those words, or a barcode number, are sent: never your account or food log.</p>`);
  sheet.querySelector('.fitSheet').classList.add('tall');
  const input=body.querySelector('input[name="q"]'),listEl=body.querySelector('[data-list]');
  const item=(f,key,i)=>`<button type="button" class="fitResult" data-pick="${key}:${i}"><span><strong>${esc(f.name)}</strong><small>${esc([f.brand,foodLine(f)].filter(Boolean).join(' · '))}</small></span><span aria-hidden="true">›</span></button>`;
  const mine=()=>{const favs=favourites.map(favFood),recent=recentFoods().filter(r=>!favourites.some(f=>f.name===r.name&&f.brand===r.brand)),uses=new Map(favourites.map(f=>[f.id,num(f.use_count)]));
    return rankFoods([...favs,...recent],query,f=>f.favouriteId?Math.min(3,(uses.get(f.favouriteId)||0)/3)+1:0).slice(0,query.trim()?8:20)};
  // while a new answer is on its way, narrow the best earlier answer for a shorter query to what still matches
  const provisional=()=>{const q=query.trim().toLowerCase();let best='';for(const k of offCache.keys())if(k.startsWith('s:')&&q.startsWith(k.slice(2))&&k.length>best.length)best=k;return best?rankFoods(offCache.get(best),query):[]}; // narrowing an earlier answer: keep only what still matches
  const drawList=()=>{frame=0;
    shown.mine=mine();shown.off=results.length?results:(query.trim().length>=3&&!/^\d+$/.test(query.trim())?provisional():[]);
    const q=query.trim(),pendingNow=pending&&pending===q;
    listEl.innerHTML=`${shown.mine.length?`<h3 class="fitGroup">${q?'Your foods':'Favourites and recent'}</h3><div class="fitList">${shown.mine.map((f,i)=>item(f,'mine',i)).join('')}</div>`:''}
${status?`<p class="fitStatus" role="status">${esc(status)}</p>`:''}
${shown.off.length||pendingNow?`<h3 class="fitGroup">Open Food Facts${pendingNow?' <span class="fitSpin" aria-label="Loading"></span>':''}</h3>`:''}${shown.off.length?`<div class="fitList">${shown.off.map((f,i)=>item(f,'off',i)).join('')}</div>`:''}
${!shown.mine.length&&!shown.off.length&&!status&&!pendingNow?`<p class="fitStatus">${q?'Keep typing for suggestions, or press Search.':'Search for a food, or use Quick add for just the calories.'}</p>`:''}`};
  const redraw=()=>{if(!frame)frame=requestAnimationFrame(drawList)};
  const suggest=async q=>{
    const key='s:'+q.toLowerCase();if(offCache.has(key)){if(q===query.trim()){results=offCache.get(key);redraw()}return}
    ctl?.abort();ctl=new AbortController();const mineCtl=ctl;pending=q;redraw();
    try{const found=await suggestOff(q,mineCtl.signal);cacheSet(key,found);if(q===query.trim()&&!busy){results=found;status=''}}
    catch{/* suggestions are a convenience: Search still works */}
    finally{if(pending===q)pending='';if(ctl===mineCtl)ctl=null;redraw()}};
  listEl.addEventListener('click',e=>{const b=e.target.closest('[data-pick]');if(!b)return;const [k,i]=b.dataset.pick.split(':'),f=shown[k]?.[Number(i)];if(f)openAmount(f,meal,back)});
  input.addEventListener('input',()=>{query=input.value;const q=query.trim();if(!busy){status='';results=offCache.get('s:'+q.toLowerCase())||[]}redraw();
    clearTimeout(timer);if(q.length>=3&&!/^\d+$/.test(q)&&navigator.onLine)timer=setTimeout(()=>suggest(q),300);else{ctl?.abort();pending=''}});
  bindMealChips(body,m=>meal=m);
  body.querySelector('[data-search-form]').onsubmit=async ev=>{ev.preventDefault();clearTimeout(timer);query=input.value.trim();input.blur();const run=++busy;
    if(/^\d{8,14}$/.test(query)){if(!validBarcode(query)){status="That barcode number isn't valid. Check the digits.";results=[];drawList();busy=0;return}status='Looking up barcode…';results=[];drawList();const r=await lookupBarcode(query);if(run!==busy)return;busy=0;if(r.food){openAmount(r.food,meal,back);return}status=r.error;drawList();return}
    if(query.length<2){status='Type at least 2 letters.';drawList();busy=0;return}
    const key='f:'+query.toLowerCase();if(offCache.has(key)){results=offCache.get(key);status=results.length?'':'No foods found. Try other words, or use Quick add.';busy=0;drawList();return}
    ctl?.abort();pending='';status='Searching…';results=offCache.get('s:'+query.toLowerCase())||[];drawList();
    try{const found=await searchOff(query,()=>{if(run===busy){status='Still searching… Open Food Facts can be slow.';drawList()}});if(run!==busy)return;cacheSet(key,found);results=found;status=results.length?'':'No foods found. Try other words, or use Quick add.'}
    catch(err){if(run!==busy)return;status=err.message||'Search failed.'}
    busy=0;drawList()};
  drawList();if(!initial)setTimeout(()=>input.focus(),50);
}
function openScan(meal){
  const body=showSheet('Scan barcode',`<div class="fitScanView"><video playsinline muted autoplay aria-label="Camera"></video><div class="fitScanFrame" aria-hidden="true"><span></span></div><p class="fitScanStatus" role="status">Starting camera…</p></div>
${mealChips(meal)}
<form class="fitSearchForm" data-code-form><input name="code" inputmode="numeric" pattern="[0-9]*" maxlength="14" autocomplete="off" placeholder="Or type the barcode number" aria-label="Barcode number"><button type="submit" class="fitSecondary">Look up</button></form>
<div class="fitScanMiss" data-miss hidden></div>
<p class="fitFootnote">The camera is only used on your phone; no picture is saved or sent. The barcode number is looked up in your favourites, then in Open Food Facts.</p>`);
  const run=++scanRun; // after showSheet, which stops any earlier camera
  const video=body.querySelector('video'),statusEl=body.querySelector('.fitScanStatus'),miss=body.querySelector('[data-miss]');
  const say=t=>{statusEl.textContent=t};
  bindMealChips(body,m=>meal=m);
  const found=async(code,format='')=>{stopCamera();statusEl.textContent='Found '+code;body.querySelector('.fitScanView').classList.add('found');const r=await lookupBarcode(code,format);if(!sheet?.classList.contains('open'))return;
    if(r.food){openAmount(r.food,meal,()=>openScan(meal));return}
    statusEl.textContent=r.error;miss.hidden=false;
    miss.innerHTML=`<button type="button" class="fitPrimary" data-again>Scan again</button><button type="button" class="fitSecondary" data-quick>+ Quick add</button><button type="button" class="fitSecondary" data-name>Search</button>`;
    miss.querySelector('[data-again]').onclick=()=>openScan(meal);miss.querySelector('[data-quick]').onclick=()=>openQuick(r.missing||'',meal);miss.querySelector('[data-name]').onclick=()=>openSearch(meal,r.missing||'')};
  body.querySelector('[data-code-form]').onsubmit=ev=>{ev.preventDefault();const c=String(ev.currentTarget.code.value||'').replace(/\s/g,'');if(!validBarcode(c)){statusEl.textContent="That barcode number isn't valid. Check the digits.";return}found(c)};
  (async()=>{
    if(!navigator.mediaDevices?.getUserMedia){say('This phone can’t use the camera here. Type the barcode number instead.');return}
    try{const stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}}});
      if(run!==scanRun){for(const t of stream.getTracks())t.stop();return}
      camera=stream;video.srcObject=stream;await video.play().catch(()=>{});if(run!==scanRun)return;say('Point the camera at the barcode');
      const detect=await makeDetector();if(run!==scanRun)return;let last='';
      while(run===scanRun&&camera){const hit=await detect(video).catch(()=>null);if(run!==scanRun||!camera)return;
        // read the same valid code (and type) twice in a row before trusting it
        const key=hit?hit.format+':'+hit.code:'';if(hit&&validBarcode(hit.code,hit.format)){if(key===last){found(hit.code,hit.format);return}last=key}else last='';
        await new Promise(r=>setTimeout(r,120))}
    }catch(e){if(run!==scanRun)return;stopCamera();say(e?.name==='NotAllowedError'?'Camera access is off for Planly. Allow it in Settings, or type the barcode number.':/load/.test(String(e?.message))?'The scanner could not load. Check your connection, or type the barcode number.':'The camera could not start. Type the barcode number instead.')}
  })();
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
function openQuick(prefill='',m=''){
  let meal=m||defaultMeal();
  const body=showSheet('Quick add',`<label class="fitField"><span>Name <small>(optional)</small></span><input name="name" maxlength="160" placeholder="Quick add" value="${esc(prefill)}"></label>
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
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'&&camera){stopCamera();if(sheet?.classList.contains('open')){const st=sheet.querySelector('.fitScanStatus');if(st)st.textContent='Camera paused. Close and tap Scan to start again.'}}if(document.visibilityState==='visible'&&userId&&state.tab==='fitness'){if(dayKey<todayKey()&&dayKey===shiftDay(todayKey(),-1)&&!sheet?.classList.contains('open'))dayKey=todayKey();refresh()}});
async function init(){
  sb=window.PlanlySupabase?.get?.()||null;if(!sb)return;
  const {data}=await sb.auth.getSession();userId=data?.session?.user?.id||'';restore();invalidate();
  sb.auth.onAuthStateChange((_e,s)=>{const next=s?.user?.id||'';if(next===userId)return;userId=next;restore();invalidate();closeSheet();if(userId)refresh();else if(state.tab==='fitness')render()});
  if(userId&&navigator.onLine)refresh();else if(state.tab==='fitness')render();
}
window.PlanlyFitness={rankFoods,validBarcode,barcodeCandidates,refresh,getState:()=>structuredClone({profile,entries,favourites,pending,failures,dayKey}),suggestTargets,nutrientsFor,offProduct};
setTimeout(()=>init().catch(e=>console.warn('Planly fitness',e)),0);
})();
