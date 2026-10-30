// The body-import Edge Function against a fake Planly database: app actions need a session; a new key is shown once
// and only its hash is stored; the Shortcut's readings are saved only for the key's owner (kg, lb and stone converted;
// body fat as % or fraction; weight, body fat and lean mass at the same minute merged into one weigh-in; impossible,
// future, unparseable and weightless readings dropped); the same weigh-in sent again is not stored twice; an unknown,
// malformed or removed key saves nothing.
// Run: node --experimental-strip-types tests/edge/body-import.test.mjs
let pass=0,fail=0;const check=(n,c,d='')=>{console.log((c?'PASS ':'FAIL ')+n+(c?'':' — '+d));c?pass++:fail++};
const ENV={SUPABASE_URL:'https://sb.test',SUPABASE_ANON_KEY:'anon',SUPABASE_SERVICE_ROLE_KEY:'service'};
globalThis.Deno={env:{get:k=>ENV[k]}};
const MUSTI='7836ad26-05a7-4d91-b749-abdc32b65462';
const db={keys:{},rows:[]};
globalThis.fetch=async(url,opts={})=>{const u=String(url),body=opts.body;
 const res=(o,s=200)=>new Response(JSON.stringify(o),{status:s,headers:{'Content-Type':'application/json'}});
 if(u==='https://sb.test/auth/v1/user')return opts.headers?.Authorization==='Bearer musti-session'?res({id:MUSTI}):res({},401);
 if(u.startsWith('https://sb.test/rest/v1/rpc/')){if(opts.headers.Authorization!=='Bearer service')return res({},401);const name=u.split('/').pop(),a=JSON.parse(body);
  if(name==='planly_body_import_key_set'){db.keys[a.p_user]={hash:a.p_key_hash,created_at:new Date().toISOString(),last_used_at:null};return new Response(null,{status:204})}
  if(name==='planly_body_import_key_use'){const e=Object.entries(db.keys).find(([,k])=>k.hash===a.p_key_hash);if(!e)return res(null);e[1].last_used_at=new Date().toISOString();return res(e[0])}
  if(name==='planly_body_import_key_status'){const k=db.keys[a.p_user];return res(k?[k]:[])}
  if(name==='planly_body_import_key_delete'){delete db.keys[a.p_user];return new Response(null,{status:204})}}
 if(u.startsWith('https://sb.test/rest/v1/planly_body_weights')){const rows=JSON.parse(body),ins=[];for(const r of rows)if(!db.rows.some(x=>x.owner_id===r.owner_id&&x.external_id===r.external_id)){db.rows.push(r);ins.push(r)}return res(ins,201)}
 throw new Error('unexpected fetch '+u)};
const {handle}=await import('../../supabase/functions/body-import/index.ts');
const app=(body,auth)=>handle(new Request('https://sb.test/functions/v1/body-import',{method:'POST',headers:{'content-type':'application/json',...(auth?{authorization:'Bearer '+auth}:{})},body:JSON.stringify(body)}));
const shortcut=(body,key)=>handle(new Request('https://sb.test/functions/v1/body-import',{method:'POST',headers:{'content-type':'application/json','x-planly-import-key':key},body:typeof body==='string'?body:JSON.stringify(body)}));
const j=async r=>({status:r.status,body:await r.json().catch(()=>null)});

let r=await j(await app({action:'create-key'}));check('making a key needs a Planly session',r.status===401);
r=await j(await app({action:'create-key'},'musti-session'));const key=r.body.key;
check('a new key is shown once, with the address to send to',/^pk_[A-Za-z0-9_-]{40,80}$/.test(key)&&r.body.url==='https://sb.test/functions/v1/body-import',JSON.stringify(r.body));
check('…and only its hash is stored, never the key',db.keys[MUSTI]&&/^[0-9a-f]{64}$/.test(db.keys[MUSTI].hash)&&!JSON.stringify(db).includes(key));
const t=(minsAgo)=>new Date(Date.now()-minsAgo*60000).toISOString();
const sent={
 weight:[`${t(60)}|82.45|kg`,`${t(1500)}|181.5|lb`,`${t(3000)}|13|st`,`${t(4000)}|900|kg`,`${new Date(Date.now()+86400000).toISOString()}|80|kg`,`not a date|80|kg`,`${t(5000)}|80|furlongs`].join('\n'),
 fat:[`${t(60)}|24.2|%`,`${t(1500)}|0.231|`,`${t(9000)}|22|%`].join('\n'),
 lean:[`${t(60)}|62.5|kg`].join('\n')};
r=await j(await shortcut(sent,key));
const byOwner=db.rows.filter(x=>x.owner_id===MUSTI),w1=byOwner.find(x=>x.weight_kg===82.45),w2=byOwner.find(x=>Math.abs(x.weight_kg-82.33)<0.02),w3=byOwner.find(x=>Math.abs(x.weight_kg-82.55)<0.02);
check('the Shortcut\'s weigh-ins are saved as my own Apple Health readings',r.status===200&&r.body.saved===3&&byOwner.length===3&&db.rows.every(x=>x.owner_id===MUSTI&&x.source==='apple_health'),JSON.stringify(db.rows.map(x=>x.weight_kg)));
check('kg, lb and stone are converted to kg',!!w1&&!!w2&&!!w3,JSON.stringify(byOwner.map(x=>x.weight_kg)));
check('body fat and lean mass at the same minute join that weigh-in; a fraction becomes a %',w1.fat_ratio_pct===24.2&&w1.fat_free_mass_kg===62.5&&w2.fat_ratio_pct===23.1&&w3.fat_ratio_pct===undefined,JSON.stringify({w1,w2,w3}));
check('impossible, future, unparseable and unknown-unit readings, and body fat without a weight, are dropped',db.rows.length===3&&!db.rows.some(x=>x.weight_kg===900||x.weight_kg===80));
r=await j(await shortcut(sent,key));check('sending the same readings again stores nothing twice',r.body.saved===0&&db.rows.length===3,JSON.stringify(r.body));
r=await j(await app({action:'status'},'musti-session'));check('status shows the key and when it was last used',r.body.linked&&!!r.body.lastUsedAt,JSON.stringify(r.body));
r=await j(await shortcut(sent,'pk_'+'x'.repeat(43)));check('an unknown key saves nothing',r.status===401&&db.rows.length===3);
r=await j(await shortcut(sent,'nonsense'));check('a malformed key is refused before anything is looked up',r.status===401);
r=await j(await shortcut('not json',key));check('a body that is not JSON is refused',r.status===400);
r=await j(await app({action:'create-key'},'musti-session'));const key2=r.body.key;
r=await j(await shortcut(sent,key));check('making a new key stops the old one',r.status===401&&key2!==key);
await app({action:'remove-key'},'musti-session');r=await j(await shortcut(sent,key2));
check('removing the key stops the Shortcut',r.status===401&&!db.keys[MUSTI]);
console.log(`${pass} passed, ${fail} failed`);process.exit(fail?1:0);
