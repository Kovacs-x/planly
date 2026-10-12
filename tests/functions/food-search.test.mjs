// Unit test of the food-search Edge Function with fake Supabase Auth and Open Food Facts.
// Run: node tests/functions/food-search.test.mjs (Node 22.18+ runs the TypeScript file directly).
let pass=0,fail=0;const check=(n,c,d='')=>{console.log((c?'PASS ':'FAIL ')+n+(c?'':' — '+d));c?pass++:fail++};
const env={SUPABASE_URL:'https://sb.test',SUPABASE_ANON_KEY:'anon'};
let handler;globalThis.Deno={env:{get:k=>env[k]},serve:h=>{handler=h}};
const calls=[];let off={fast:'ok',classic:'ok',product:'ok',ukRefused:false};
const j=(s,o)=>new Response(JSON.stringify(o),{status:s,headers:{'content-type':'application/json'}});
const hit=(code,name,extra={})=>({code:code.length<8?code+'00000':code,product_name:name,brands:['Brand '+code,'Other'],nutriments:{'energy-kcal_100g':50,proteins_100g:1,carbohydrates_100g:10,fat_100g:0.1,salt_100g:9,'secret-field':1},serving_quantity:200,serving_size:'1 glass',ingredients_text:'not wanted',...extra});
const redirectTo=new Map(),evil=[];
// Like real fetch: a redirect is followed unless redirect is 'manual' (the 3xx is returned) or 'error' (it fails).
globalThis.fetch=async(url,init={})=>{const res=await answer(String(url),init);const to=res.headers.get('location');
  if(res.status>=300&&res.status<400&&to){if(init.redirect==='manual')return res;if(init.redirect==='error')throw new TypeError('redirect');return globalThis.fetch(to,init)}return res};
const answer=async(url,init={})=>{const h=init.headers||{};calls.push({url,h,redirect:init.redirect});
  if(url.startsWith('https://evil.test/')){evil.push(url);return new Response(JSON.stringify({hits:[],products:[],id:'EVIL',status:1,product:{product_name:'Evil',nutriments:{'energy-kcal_100g':1}}}),{status:200,headers:{'content-type':'application/json'}})}
  for(const [k,v] of redirectTo)if(url.includes(k))return new Response('',{status:302,headers:{location:v}});
  if(url==='https://sb.test/auth/v1/user')return h.Authorization==='Bearer good'&&h.apikey==='anon'?j(200,{id:'U1'}):j(401,{});
  const u=new URL(url);
  if(u.host==='search.openfoodfacts.org'&&u.pathname==='/search'){if(off.fast==='down')throw new TypeError('fetch failed');if(off.fast==='busy')return j(503,{});
    const q=u.searchParams.get('q'),uk=q.includes('countries:"en:united-kingdom"');if(uk&&off.ukRefused)return j(400,{detail:'bad'});
    if(off.fast==='empty')return j(200,{hits:[]});
    const words=q.replace(' countries:"en:united-kingdom"','');
    if(words==='apple ju')return j(200,{hits:[]});
    if(words==='apple')return j(200,{hits:uk?[hit('111','Apple Juice'),hit('222','Apple Pie')]:[hit('333','Chausson aux pommes'),hit('111','Apple Juice')]});
    return j(200,{hits:[hit('444','Thing')]})}
  if(u.host==='world.openfoodfacts.org'&&u.pathname==='/cgi/search.pl'){if(off.classic==='down')return j(503,{});return j(200,{products:[{code:'555',product_name:'Classic Apple',brands:'Tesco,Other',nutriments:{'energy-kcal_100g':40}}]})}
  if(u.host==='world.openfoodfacts.org'&&u.pathname.startsWith('/api/v2/product/')){if(off.product==='busy')return j(429,{});
    const code=u.pathname.split('/').pop().replace('.json','');if(code==='5000436589457')return j(200,{status:1,product:hit(code,'Greek Style Yogurt')});
    if(code==='4006381333931')return j(200,{status:1,product:{product_name:'',nutriments:{}}});return j(404,{status:0})}
  return j(404,{})};
await import('../../supabase/functions/food-search/index.ts');
const call=async(body,auth='Bearer good',method='POST',raw=null)=>{calls.length=0;const res=await handler(new Request('https://fn.test',{method,headers:auth?{authorization:auth,'content-type':'application/json'}:{'content-type':'application/json'},body:method==='POST'?(raw??JSON.stringify(body)):undefined}));
  return {status:res.status,body:await res.json().catch(()=>null),cors:res.headers.get('access-control-allow-origin'),upstream:calls.filter(c=>!c.url.startsWith('https://sb.test'))}};

// who may call it
let r=await call({mode:'search',q:'apple'},'');check('no session → 401, nothing asked of Open Food Facts',r.status===401&&r.upstream.length===0);
r=await call({mode:'search',q:'apple'},'Bearer forged');check('invalid session → 401, nothing asked',r.status===401&&r.upstream.length===0);
r=await call({mode:'search',q:'apple'},'Bearer good','GET');check('only POST',r.status===405);
r=await handler(new Request('https://fn.test',{method:'OPTIONS'}));check('CORS preflight is answered for the Planly site only',r.headers.get('access-control-allow-origin')==='https://kovacs-x.github.io');

// what it accepts
for(const [label,body] of [['symbols / search syntax',{mode:'search',q:'apple OR brands:x'}],['capitals',{mode:'search',q:'Apple'}],['empty words',{mode:'search',q:''}],['too many words',{mode:'search',q:'a b c d e f g h i'}],['a long word',{mode:'search',q:'a'.repeat(31)}],['a web address',{mode:'search',q:'http://evil'}],['unknown mode',{mode:'fetch',q:'apple'}],['bad barcode',{mode:'product',code:'12ab'}],['barcode path trick',{mode:'product',code:'../../x'}]]){
  r=await call(body);check('refuses '+label+' without asking Open Food Facts',r.status===400&&r.upstream.length===0,JSON.stringify(r.body))}
r=await call(null,'Bearer good','POST','{"mode":"search","q":"'+'a '.repeat(300)+'"}');check('refuses an oversized request',r.status===413&&r.upstream.length===0);
r=await call(null,'Bearer good','POST','not json');check('refuses a body that is not JSON',r.status===400&&r.upstream.length===0);
// the size limit counts bytes while reading, not characters after reading
r=await call(null,'Bearer good','POST','{"mode":"search","q":"'+'é'.repeat(260)+'"}');check('refuses a multibyte body over 500 bytes (under 500 characters)',r.status===413&&r.upstream.length===0,String(r.status));
{let pulled=0;const big=new ReadableStream({pull(c){pulled++;if(pulled>1000)return c.close();c.enqueue(new Uint8Array(64*1024).fill(97))}});
 const res=await handler(new Request('https://fn.test',{method:'POST',headers:{authorization:'Bearer good','content-type':'application/json'},body:big,duplex:'half'}));
 check('stops reading a huge body as soon as it passes the limit (no Content-Length)',res.status===413&&pulled<=3,'pulled '+pulled+' chunks, status '+res.status)}
{let pulled=0;const big=new ReadableStream({pull(c){pulled++;c.enqueue(new Uint8Array(64*1024))}});
 const res=await handler(new Request('https://fn.test',{method:'POST',headers:{authorization:'Bearer good','content-type':'application/json','content-length':String(10*1024*1024)},body:big,duplex:'half'}));
 check('refuses a body whose declared size is too large without reading it',res.status===413&&pulled<=1,'pulled '+pulled)}
r=await call(null,'Bearer good','POST',new Uint8Array([123,34,109,111,100,101,34,58,34,255,34,125]));check('refuses a body that is not valid UTF-8',r.status===400&&r.upstream.length===0);

// search
r=await call({mode:'suggest',q:'apple ju'});
const qs=r.upstream.map(c=>new URL(c.url).searchParams.get('q')).sort();
check('a half-typed last word also asks with the finished words, each UK-only and everywhere',JSON.stringify(qs)===JSON.stringify(['apple','apple countries:"en:united-kingdom"','apple ju','apple ju countries:"en:united-kingdom"']),JSON.stringify(qs));
check('only Open Food Facts search is called, with a Planly user agent and no account details',r.upstream.every(c=>c.url.startsWith('https://search.openfoodfacts.org/search?')&&/^Planly\//.test(c.h['User-Agent'])&&!JSON.stringify(c).includes('good')&&!JSON.stringify(c).includes('U1')),JSON.stringify(r.upstream.map(c=>c.url)));
check('UK products come first, each product once',JSON.stringify(r.body.products.map(p=>[p.code.slice(0,3),p.uk]))==='[["111",true],["222",true],["333",false]]',JSON.stringify(r.body.products));
const p=r.body.products[0];
check('only the fields the app uses are passed on',JSON.stringify(Object.keys(p).sort())==='["brands","code","nutriments","product_name","serving_quantity","serving_size","uk"]'&&JSON.stringify(Object.keys(p.nutriments).sort())==='["carbohydrates_100g","energy-kcal_100g","fat_100g","proteins_100g"]'&&p.brands==='Brand 111',JSON.stringify(p));
check('the answer goes to the Planly site only',r.cors==='https://kovacs-x.github.io');
off.ukRefused=true;r=await call({mode:'suggest',q:'apple'});check('if the UK filter is refused, everywhere answers still come back',r.status===200&&r.body.products.map(p=>p.code.slice(0,3)).join()==='333,111',JSON.stringify(r.body));off.ukRefused=false;
off.fast='empty';r=await call({mode:'suggest',q:'apple'});check('suggestions never use the slower classic search',r.status===200&&r.body.products.length===0&&r.upstream.every(c=>c.url.includes('search.openfoodfacts.org')));
r=await call({mode:'search',q:'apple'});check('Search uses the classic search when the fast one finds nothing',r.status===200&&r.body.source==='classic'&&r.body.products[0].product_name==='Classic Apple'&&r.body.products[0].brands==='Tesco');
off.fast='down';off.classic='down';r=await call({mode:'search',q:'apple'});check('when both fail, it says why for each',r.status===502&&r.body.error==='Fast search: could not connect. Main search: refused, code 503.',JSON.stringify(r.body));
r=await call({mode:'suggest',q:'apple'});check('a failed suggestion says why',r.status===502&&/could not connect/.test(r.body.error));
off.fast='ok';off.classic='ok';

// redirects are never followed: a redirect counts as a refusal and nothing is asked of its destination
redirectTo.set('search.openfoodfacts.org','https://evil.test/a');redirectTo.set('cgi/search.pl','https://evil.test/b');
r=await call({mode:'search',q:'apple'});check('a redirect from the fast or classic search is not followed',r.status===502&&evil.length===0&&/refused, code 302/.test(r.body.error),JSON.stringify(r.body)+' evil:'+evil.join());
redirectTo.clear();redirectTo.set('/api/v2/product/','https://evil.test/c');
r=await call({mode:'product',code:'5000436589457'});check('a redirect from the product lookup is not followed',r.status===502&&r.body.status===302&&evil.length===0,JSON.stringify(r.body));
redirectTo.clear();redirectTo.set('sb.test/auth/v1/user','https://evil.test/d');
r=await call({mode:'search',q:'apple'});check('a redirect from the sign-in check is not followed (and means not signed in)',r.status===401&&evil.length===0&&r.upstream.length===0);
redirectTo.clear();
check('every outgoing request refuses redirects',calls.length>0&&calls.every(c=>c.redirect==='manual'));
r=await call({mode:'suggest',q:'apple'});check('every request of a normal search refuses redirects too',r.status===200&&calls.every(c=>c.redirect==='manual'),JSON.stringify(calls.map(c=>c.redirect)));

// barcodes
r=await call({mode:'product',code:'5000436589457'});check('a barcode is looked up at the product address only',r.status===200&&r.body.status==='found'&&r.body.product.product_name==='Greek Style Yogurt'&&r.upstream.length===1&&new URL(r.upstream[0].url).pathname==='/api/v2/product/5000436589457.json');
r=await call({mode:'product',code:'4006381333932'});check('an unknown barcode → missing',r.status===200&&r.body.status==='missing');
r=await call({mode:'product',code:'4006381333931'});check('a product with no name → found, no product',r.status===200&&r.body.status==='found'&&r.body.product===null);
off.product='busy';r=await call({mode:'product',code:'5000436589457'});check('Open Food Facts busy → 502 with the code',r.status===502&&r.body.status===429);off.product='ok';

console.log(`${pass} passed, ${fail} failed`);process.exit(fail?1:0);
