// The withings Edge Function against a fake Withings and a fake Planly database: the signed sign-in state (expired,
// tampered or another person's is refused); connecting saves the link, subscribes to notifications at the function's
// own address and imports weigh-ins as the person's own rows (weight + body composition mapped to columns, unknown
// readings kept in extra, impossible values dropped, a reading without weight skipped, same-moment groups merged);
// a notification pulls only that window for the linked person and ignores unknown accounts; an expired access token
// is refreshed and the rotated pair saved; app actions need a session; HEAD answers 200; disconnect revokes and forgets.
// Run: node --experimental-strip-types tests/edge/withings.test.mjs
let pass=0,fail=0;const check=(n,c,d='')=>{console.log((c?'PASS ':'FAIL ')+n+(c?'':' — '+d));c?pass++:fail++};
const ENV={SUPABASE_URL:'https://sb.test',SUPABASE_ANON_KEY:'anon',SUPABASE_SERVICE_ROLE_KEY:'service',WITHINGS_CLIENT_ID:'cid',WITHINGS_CLIENT_SECRET:'csecret'};
globalThis.Deno={env:{get:k=>ENV[k]}};
const MUSTI='7836ad26-05a7-4d91-b749-abdc32b65462',LAKI='c30c664f-d887-469d-852b-b01a572cb7a7';
const db={links:{},rows:[],calls:[]};let wcalls=[];let expireNext=false;
const now=Math.floor(Date.now()/1000);
const groups=[
 {grpid:101,date:now-3600,category:1,measures:[{type:1,value:82450,unit:-3},{type:6,value:214,unit:-1},{type:76,value:6120,unit:-2},{type:77,value:4530,unit:-2},{type:88,value:330,unit:-2},{type:8,value:1760,unit:-2},{type:5,value:6450,unit:-2},{type:170,value:9,unit:0}]},
 {grpid:102,date:now-3600,category:1,measures:[{type:11,value:64,unit:0}]},          // same moment: heart rate merges in
 {grpid:103,date:now-7200,category:1,measures:[{type:6,value:900,unit:-1}]},         // no weight: skipped
 {grpid:104,date:now-9000,category:1,measures:[{type:1,value:82100,unit:-3},{type:11,value:999,unit:0}]}, // impossible HR dropped
 {grpid:105,date:now-9500,category:2,measures:[{type:1,value:70000,unit:-3}]}];      // a goal, not a weigh-in
globalThis.fetch=async(url,opts={})=>{const u=String(url),body=opts.body;
 const res=(o,s=200)=>new Response(JSON.stringify(o),{status:s,headers:{'Content-Type':'application/json'}});
 if(u==='https://sb.test/auth/v1/user'){const a=opts.headers?.Authorization||'';return a==='Bearer musti-session'?res({id:MUSTI}):res({},401)}
 if(u.startsWith('https://sb.test/rest/v1/rpc/')){const name=u.split('/').pop(),a=JSON.parse(body);db.calls.push(name);
  if(opts.headers.Authorization!=='Bearer service')return res({},401);
  if(name==='planly_withings_link_save'){for(const k of Object.keys(db.links))if(db.links[k].withings_user===a.p_withings_user&&k!==a.p_user)delete db.links[k];db.links[a.p_user]={user_id:a.p_user,withings_user:a.p_withings_user,access_token:a.p_access,refresh_token:a.p_refresh,expires_at:a.p_expires_at,last_sync_at:db.links[a.p_user]?.last_sync_at||null};return new Response(null,{status:204})}
  if(name==='planly_withings_link_get'){const l=a.p_user?db.links[a.p_user]:Object.values(db.links).find(x=>x.withings_user===a.p_withings_user);return res(l?[l]:[])}
  if(name==='planly_withings_link_touch'){if(db.links[a.p_user])db.links[a.p_user].last_sync_at=new Date().toISOString();return new Response(null,{status:204})}
  if(name==='planly_withings_link_delete'){delete db.links[a.p_user];return new Response(null,{status:204})}}
 if(u.startsWith('https://sb.test/rest/v1/planly_body_weights')){const rows=JSON.parse(body),ins=[];for(const r of rows){if(!db.rows.some(x=>x.owner_id===r.owner_id&&x.external_id===r.external_id)){db.rows.push(r);ins.push(r)}}return res(ins,201)}
 if(u.startsWith('https://wbsapi.withings.net')){const p=new URLSearchParams(body);wcalls.push({path:u.replace('https://wbsapi.withings.net',''),p:Object.fromEntries(p),auth:opts.headers?.Authorization||''});
  if(u.endsWith('/v2/oauth2')){if(p.get('client_secret')!=='csecret')return res({status:401});
   if(p.get('grant_type')==='authorization_code')return p.get('code')==='good'&&p.get('redirect_uri')==='https://kovacs-x.github.io/planly/v2/'?res({status:0,body:{userid:555,access_token:'acc-1-xxxxxxxx',refresh_token:'ref-1-xxxxxxxx',expires_in:expireNext?1:10800,scope:'user.metrics'}}):res({status:503});
   if(p.get('grant_type')==='refresh_token')return res({status:0,body:{userid:555,access_token:'acc-2-xxxxxxxx',refresh_token:'ref-2-xxxxxxxx',expires_in:10800,scope:'user.metrics'}})}
  if(u.endsWith('/notify'))return res({status:0,body:{}});
  if(u.endsWith('/measure')){let gs=groups;if(p.get('startdate'))gs=groups.filter(g=>g.date>=Number(p.get('startdate'))&&g.date<=Number(p.get('enddate')));return res({status:0,body:{measuregrps:gs,more:0}})}}
 throw new Error('unexpected fetch '+u)};
const {handle}=await import('../../supabase/functions/withings/index.ts');
const call=(body,auth)=>handle(new Request('https://sb.test/functions/v1/withings',{method:'POST',headers:{'content-type':'application/json',...(auth?{authorization:'Bearer '+auth}:{})},body:JSON.stringify(body)}));
const j=async r=>({status:r.status,body:await r.json().catch(()=>null)});

check('HEAD answers 200 (Withings checks the address)',(await handle(new Request('https://sb.test/functions/v1/withings',{method:'HEAD'}))).status===200);
let r=await j(await call({action:'start'}));check('app actions need a Planly session',r.status===401,JSON.stringify(r));
r=await j(await call({action:'start'},'musti-session'));const url=new URL(r.body.url),state=url.searchParams.get('state');
check('start returns the Withings sign-in with our app, scope and return address',url.origin+url.pathname==='https://account.withings.com/oauth2_user/authorize2'&&url.searchParams.get('client_id')==='cid'&&url.searchParams.get('scope')==='user.metrics'&&url.searchParams.get('redirect_uri')==='https://kovacs-x.github.io/planly/v2/'&&/^pw\./.test(state),r.body.url);
check('…and never puts the secret in it',!r.body.url.includes('csecret'));
const tampered=state.replace(MUSTI,LAKI);
r=await j(await call({action:'exchange',code:'good',state:tampered}));check('a state changed to another person is refused',r.status===400&&!Object.keys(db.links).length,JSON.stringify(r));
const parts=state.split('.');parts[2]=String(Date.now()-1000);r=await j(await call({action:'exchange',code:'good',state:parts.join('.')}));
check('an expired state is refused',r.status===400&&!Object.keys(db.links).length,JSON.stringify(r));
r=await j(await call({action:'exchange',code:'bad',state}));check('a code Withings rejects is refused',r.status===400&&!Object.keys(db.links).length,JSON.stringify(r));
r=await j(await call({action:'exchange',code:'good',state}));
check('connecting saves the link for the person who started it',r.status===200&&r.body.linked&&db.links[MUSTI]?.withings_user==='555',JSON.stringify(r));
const sub=wcalls.find(c=>c.path==='/notify'&&c.p.action==='subscribe');
check('…subscribes to weigh-in notifications at the function address',sub&&sub.p.callbackurl==='https://sb.test/functions/v1/withings'&&sub.p.appli==='1'&&sub.auth==='Bearer acc-1-xxxxxxxx',JSON.stringify(sub));
const w1=db.rows.find(x=>x.external_id==='101'),w4=db.rows.find(x=>x.external_id==='104');
check('…and imports weigh-ins as my own scale readings',r.body.imported===2&&db.rows.length===2&&db.rows.every(x=>x.owner_id===MUSTI&&x.source==='withings'),JSON.stringify(db.rows.map(x=>x.external_id)));
check('body composition is mapped to columns (fat %, muscle, water, bone, fat mass, lean mass)',w1.weight_kg===82.45&&w1.fat_ratio_pct===21.4&&w1.muscle_mass_kg===61.2&&w1.hydration_kg===45.3&&w1.bone_mass_kg===3.3&&w1.fat_mass_kg===17.6&&w1.fat_free_mass_kg===64.5,JSON.stringify(w1));
check('same-moment heart rate merges in; unknown readings are kept in extra',w1.heart_rate_bpm===64&&w1.extra['170']===9,JSON.stringify(w1));
check('an impossible value is dropped, not stored; no weight or a goal is not a weigh-in',w4.weight_kg===82.1&&w4.heart_rate_bpm===undefined&&!db.rows.some(x=>['103','105'].includes(x.external_id)),JSON.stringify(w4));
// notification
wcalls=[];db.rows=db.rows.filter(x=>x.external_id!=='104');
const note=(form)=>handle(new Request('https://sb.test/functions/v1/withings',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams(form)}));
let nr=await note({userid:'999',startdate:String(now-10000),enddate:String(now),appli:'1'});
check('a notification for an unknown Withings account does nothing',nr.status===200&&!wcalls.length,JSON.stringify(wcalls));
nr=await note({userid:'555',startdate:String(now-9100),enddate:String(now-8900),appli:'1'});
const m=wcalls.find(c=>c.path==='/measure');
check('a notification pulls just that window for the linked person',nr.status===200&&m&&m.p.startdate===String(now-9101)&&db.rows.some(x=>x.external_id==='104'&&x.owner_id===MUSTI),JSON.stringify(m));
nr=await note({userid:'555',startdate:String(now-9100),enddate:String(now-8900),appli:'1'});
check('the same reading is never stored twice',db.rows.filter(x=>x.external_id==='104').length===1);
// refresh
db.links[MUSTI].expires_at=new Date(Date.now()-1000).toISOString();wcalls=[];
r=await j(await call({action:'sync'},'musti-session'));
check('an expired access token is refreshed and the rotated pair saved',r.body.linked&&wcalls[0]?.p.grant_type==='refresh_token'&&db.links[MUSTI].access_token==='acc-2-xxxxxxxx'&&db.links[MUSTI].refresh_token==='ref-2-xxxxxxxx',JSON.stringify({w:wcalls[0],l:db.links[MUSTI]}));
r=await j(await call({action:'status'},'musti-session'));check('status says linked with the last sync time',r.body.linked&&!!r.body.lastSync,JSON.stringify(r.body));
r=await j(await call({action:'status'},'nobody'));check('status for no session is refused',r.status===401);
// disconnect
wcalls=[];r=await j(await call({action:'disconnect'},'musti-session'));
check('disconnect revokes notifications at Withings and forgets the link',!r.body.linked&&!db.links[MUSTI]&&wcalls.some(c=>c.path==='/notify'&&c.p.action==='revoke'),JSON.stringify(wcalls));
console.log(`${pass} passed, ${fail} failed`);process.exit(fail?1:0);
