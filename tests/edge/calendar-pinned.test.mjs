// calendar-source-create: DNS-rebinding safe fetching. The feed's host is resolved once per hop; every address is checked
// against the private-range blocklist; the request then goes to one of those exact addresses (TCP to the IP, TLS for the
// original host name, Host header kept), so a second lookup that would return 127.0.0.1 is never made. Redirects are
// checked again hop by hop. Private IPv6 written in hex (::ffff:7f00:1, NAT64, 6to4) is refused too. The HTTP reply is
// read with a size cap (Content-Length and chunked).
// Review of #316: IPv6 is allowed only inside global unicast 2000::/3, minus special-purpose ranges (documentation,
// Teredo and other IETF assignments, 6to4); a '::' must stand for at least one group; the timeout covers the TCP connect
// and TLS too; chunked replies with bad framing are refused instead of half-read.
// Run: node --experimental-strip-types tests/edge/calendar-pinned.test.mjs
let pass=0,fail=0;const check=(n,c,d='')=>{console.log((c?'PASS ':'FAIL ')+n+(c?'':' — '+d));c?pass++:fail++};
const ENV={SUPABASE_URL:'https://sb.test',SUPABASE_PUBLISHABLE_KEYS:JSON.stringify({default:'sb_publishable_test'}),SUPABASE_SECRET_KEYS:JSON.stringify({default:'sb_secret_test'})};
const dnsCalls=[],connects=[],tls=[],requests=[];let dns={},servers={};
const enc=new TextEncoder(),dec=new TextDecoder();
function fakeConn(ip){let out=null,closed=false;const conn={
  async write(b){const text=dec.decode(b);requests.push({ip,text});const reply=servers[ip]?.(text);out=typeof reply==='string'?enc.encode(reply):reply;return b.length},
  async read(buf){if(closed||!out||!out.length)return null;const n=Math.min(buf.length,out.length);buf.set(out.subarray(0,n));out=out.subarray(n);return n},
  close(){closed=true}};return conn}
globalThis.Deno={env:{get:k=>ENV[k]},serve:()=>{},
  resolveDns:async(host,type)=>{dnsCalls.push(host+' '+type);const next=(dns[host]?.[type]||[]);return Array.isArray(next[0])?next.shift():next},
  connect:async({hostname,port})=>{connects.push(hostname+':'+port);if(!servers[hostname])throw new Error('connection refused');return fakeConn(hostname)},
  startTls:async(conn,{hostname})=>{tls.push(hostname);return conn}};
const {fetchCalendarFeed,publicAddresses,pinnedGet}=await import('../../supabase/functions/calendar-source-create/index.ts');
const ics='BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:1\r\nDTSTART;VALUE=DATE:20261120\r\nSUMMARY:Night\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n';
const ok=(body,extra='')=>`HTTP/1.1 200 OK\r\nContent-Type: text/calendar\r\nContent-Length: ${enc.encode(body).length}\r\n${extra}\r\n${body}`;
const reset=()=>{dnsCalls.length=0;connects.length=0;tls.length=0;requests.length=0};

// the rebinding attack: the first lookup answers a public address, any later lookup would answer 127.0.0.1
dns={'rota.example.org':{A:[['93.184.216.34'],['127.0.0.1'],['127.0.0.1']],AAAA:[[],[],[]]}};servers={'93.184.216.34':()=>ok(ics),'127.0.0.1':()=>ok('SECRET')};reset();
let r=await fetchCalendarFeed('https://rota.example.org/feed.ics?k=1');
check('the feed is fetched from the address that was checked',r.response.status===200&&r.text===ics,JSON.stringify({s:r.response.status,t:r.text.slice(0,20)}));
check('…the host is looked up once (A and AAAA), never again before connecting',dnsCalls.length===2,dnsCalls.join(', '));
check('…the connection goes to that exact IP on 443, never to 127.0.0.1',JSON.stringify(connects)==='["93.184.216.34:443"]',connects.join(', '));
check('…TLS is for the original host name, so its certificate is still checked',JSON.stringify(tls)==='["rota.example.org"]',tls.join(', '));
check('…and the request keeps the original Host header and path',/^GET \/feed\.ics\?k=1 HTTP\/1\.1\r\nHost: rota\.example\.org\r\n/.test(requests[0]?.text||'')&&/Connection: close/.test(requests[0].text),JSON.stringify(requests[0]?.text.slice(0,80)));

// a host that resolves to any private address is refused before connecting
for(const [name,addrs] of [['127.0.0.1',['127.0.0.1']],['10.x',['10.1.2.3']],['IPv4-mapped hex ::ffff:7f00:1',['::ffff:7f00:1']],['IPv4-mapped dotted',['::ffff:192.168.1.1']],['NAT64 to 10.0.0.1',['64:ff9b::a00:1']],['6to4 to 192.168.0.1',['2002:c0a8:1::1']],['unique local fd00::1',['fd00::1']],['link local fe80::1',['fe80::1']],['loopback ::1',['::1']],['one public, one private',['93.184.216.34','169.254.169.254']]]){
 dns={'evil.example.org':{A:addrs.filter(a=>!a.includes(':')),AAAA:addrs.filter(a=>a.includes(':'))}};reset();
 let err='';try{await fetchCalendarFeed('https://evil.example.org/x.ics')}catch(e){err=e.message}
 check(`refused: ${name}`,/not public/.test(err)&&connects.length===0,JSON.stringify({err,connects}))}
for(const u of ['http://rota.example.org/x.ics','https://rota.example.org:8443/x.ics','https://user:pw@rota.example.org/x.ics','https://localhost/x.ics','https://[::1]/x.ics','https://[::ffff:7f00:1]/x.ics','https://10.0.0.5/x.ics']){
 let err='';try{await publicAddresses(new URL(u))}catch(e){err=e.message}check(`refused before any lookup: ${u}`,!!err,err)}
check('a public IPv6 address is allowed',(await publicAddresses(new URL('https://[2606:4700::1111]/x.ics')))[0]==='2606:4700::1111');

// redirects: every hop is resolved and checked again; a redirect to a private host is refused
dns={'a.example.org':{A:['93.184.216.34'],AAAA:[]},'b.example.org':{A:['10.0.0.9'],AAAA:[]},'c.example.org':{A:['151.101.1.1'],AAAA:[]}};
servers={'93.184.216.34':t=>/Host: a\.example\.org/.test(t)?'HTTP/1.1 302 Found\r\nLocation: https://b.example.org/x.ics\r\nContent-Length: 0\r\n\r\n':ok(ics)};reset();
let err='';try{await fetchCalendarFeed('https://a.example.org/x.ics')}catch(e){err=e.message}
check('a redirect to a host that resolves privately is refused',/not public/.test(err)&&connects.length===1,JSON.stringify({err,connects}));
servers['93.184.216.34']=()=> 'HTTP/1.1 301 Moved\r\nLocation: https://c.example.org/y.ics\r\nContent-Length: 0\r\n\r\n';servers['151.101.1.1']=()=>ok(ics);reset();
r=await fetchCalendarFeed('https://a.example.org/x.ics');
check('a redirect to a public host is followed, pinned to its own checked address',r.text===ics&&JSON.stringify(connects)==='["93.184.216.34:443","151.101.1.1:443"]'&&JSON.stringify(tls)==='["a.example.org","c.example.org"]',JSON.stringify({connects,tls}));

// reading the reply
dns={'rota.example.org':{A:['93.184.216.34'],AAAA:[]}};
const half=ics.slice(0,40),rest=ics.slice(40);
servers={'93.184.216.34':()=>`HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n${enc.encode(half).length.toString(16)}\r\n${half}\r\n${enc.encode(rest).length.toString(16)};ext=1\r\n${rest}\r\n0\r\n\r\n`};
r=await fetchCalendarFeed('https://rota.example.org/feed.ics');
check('a chunked reply is put back together',r.text===ics,JSON.stringify(r.text.slice(0,30)));
servers={'93.184.216.34':()=>`HTTP/1.1 200 OK\r\nContent-Length: 3000000\r\n\r\nx`};err='';try{await fetchCalendarFeed('https://rota.example.org/feed.ics')}catch(e){err=e.message}
check('a reply that says it is over 2 MB is refused',/too large/.test(err),err);
servers={'93.184.216.34':()=>'HTTP/1.1 200 OK\r\n\r\n'+'x'.repeat(2_200_000)};err='';try{await fetchCalendarFeed('https://rota.example.org/feed.ics')}catch(e){err=e.message}
check('a reply that streams more than 2 MB is refused',/too large/.test(err),err);
servers={'93.184.216.34':()=>'not http at all'};err='';try{await fetchCalendarFeed('https://rota.example.org/feed.ics')}catch(e){err=e.message}
check('a reply that is not HTTP is refused',/no valid response/.test(err),err);
servers={'93.184.216.34':()=>'HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n\r\n'};r=await fetchCalendarFeed('https://rota.example.org/feed.ics');
check('a 404 comes back as a not-ok response (the caller reports it)',r.response.status===404&&!r.response.ok);
dns={'two.example.org':{A:['185.199.108.153','151.101.1.1'],AAAA:[]}};servers={'151.101.1.1':()=>ok(ics)};reset();
r=await fetchCalendarFeed('https://two.example.org/feed.ics');
check('if the first checked address does not answer, the next checked address is tried',r.text===ics&&JSON.stringify(connects)==='["185.199.108.153:443","151.101.1.1:443"]',JSON.stringify(connects));

// review of #316: IPv6 is allowed only inside global unicast (2000::/3), minus special-purpose and transition ranges
for(const [name,a] of [['documentation 2001:db8::1','2001:db8::1'],['documentation 3fff::1','3fff::1'],['local-use NAT64 64:ff9b:1::a00:1','64:ff9b:1::a00:1'],['Teredo 2001:0:4136:e378:8000:63bf:3fff:fdd2','2001:0:4136:e378:8000:63bf:3fff:fdd2'],['benchmarking 2001:2::1','2001:2::1'],['ORCHIDv2 2001:20::1','2001:20::1'],['discard-only 100::1','100::1'],['SRv6 SIDs 5f00::1','5f00::1'],['6to4, even wrapping a public IPv4 (2002:5db8:d822::1)','2002:5db8:d822::1'],['IPv4-mapped, even of a public IPv4 (::ffff:93.184.216.34)','::ffff:93.184.216.34'],['unassigned 4000::1','4000::1'],['malformed: :: standing for zero groups (1:2:3:4::5:6:7:8)','1:2:3:4::5:6:7:8'],['malformed: 8 groups then :: (1:2:3:4:5:6:7:8::)','1:2:3:4:5:6:7:8::'],['malformed: zone id fe80::1%en0','fe80::1%en0'],['malformed: 9 groups','1:2:3:4:5:6:7:8:9']]){
 dns={'v6.example.org':{A:[],AAAA:[a]}};reset();
 let err='';try{await fetchCalendarFeed('https://v6.example.org/x.ics')}catch(e){err=e.message}
 check(`IPv6 refused: ${name}`,/not public/.test(err)&&connects.length===0,JSON.stringify({err,connects}))}
for(const a of ['2606:4700::1111','2a00:1450:4009:81f::200e','2001:4860:4860::8888']){
 dns={'v6.example.org':{A:[],AAAA:[a]}};let got=null;try{got=await publicAddresses(new URL('https://v6.example.org/x.ics'))}catch(e){got=e.message}
 check(`IPv6 global unicast still allowed: ${a}`,Array.isArray(got)&&got[0]===a,JSON.stringify(got))}
dns={'v4.example.org':{A:['192.88.99.1'],AAAA:[]}};err='';try{await fetchCalendarFeed('https://v4.example.org/x.ics')}catch(e){err=e.message}
check('IPv4 6to4 relay anycast 192.88.99.0/24 refused',/not public/.test(err),err);

// review of #316: chunked framing must be exact, or the reply is refused (never half-read)
dns={'rota.example.org':{A:['93.184.216.34'],AAAA:[]}};
const chunkReply=b=>()=>'HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n'+b;
const L=enc.encode(ics).length.toString(16);
for(const [name,body] of [
 ['a size with junk after the hex digits ("'+L+'zz")',`${L}zz\r\n${ics}\r\n0\r\n\r\n`],
 ['a size written as 0x…',`0x${L}\r\n${ics}\r\n0\r\n\r\n`],
 ['a signed size (+…)',`+${L}\r\n${ics}\r\n0\r\n\r\n`],
 ['an empty size line',`\r\n${ics}\r\n0\r\n\r\n`],
 ['a chunk not followed by CRLF',`${L}\r\n${ics}XX0\r\n\r\n`],
 ['a chunk that is longer than its size',`${(parseInt(L,16)-2).toString(16)}\r\n${ics}\r\n0\r\n\r\n`],
 ['no final CRLF after the last chunk',`${L}\r\n${ics}\r\n0\r\n`],
 ['bytes after the end of the chunked body',`${L}\r\n${ics}\r\n0\r\n\r\nHTTP/1.1 200 OK\r\n`],
 ['a trailer line without a colon',`${L}\r\n${ics}\r\n0\r\nnot a header\r\n\r\n`]]){
 servers={'93.184.216.34':chunkReply(body)};let err='';try{await fetchCalendarFeed('https://rota.example.org/feed.ics')}catch(e){err=e.message}
 check(`chunked refused: ${name}`,/malformed|cut short/.test(err),err||'accepted')}
servers={'93.184.216.34':chunkReply(`${L}\r\n${ics}\r\n0\r\nX-Checksum: 1\r\n\r\n`)};r=await fetchCalendarFeed('https://rota.example.org/feed.ics');
check('chunked with a valid trailer is still read',r.text===ics);
servers={'93.184.216.34':()=>'HTTP/1.1 200 OK\r\nTransfer-Encoding: gzip, chunked\r\n\r\n0\r\n\r\n'};err='';try{await fetchCalendarFeed('https://rota.example.org/feed.ics')}catch(e){err=e.message}
check('a transfer encoding other than plain chunked is refused',/malformed/.test(err),err||'accepted');
for(const cl of ['12abc','-5','5, 6','']){servers={'93.184.216.34':()=>`HTTP/1.1 200 OK\r\nContent-Length: ${cl}\r\n\r\nhello world!`};err='';try{await fetchCalendarFeed('https://rota.example.org/feed.ics')}catch(e){err=e.message}
 check(`a bad Content-Length (${JSON.stringify(cl)}) is refused`,/malformed/.test(err),err||'accepted')}

// review of #316: the timeout covers the TCP connect and the TLS handshake as well as reading
const within=(p,ms)=>Promise.race([p.then(()=>'resolved',e=>e.message),new Promise(r=>setTimeout(()=>r('still waiting'),ms))]);
const realConnect=Deno.connect,realTls=Deno.startTls;let closed=[];
const slowConn=(tag,ms)=>new Promise(res=>setTimeout(()=>res({close(){closed.push(tag)},read:async()=>null,write:async b=>b.length}),ms));
const u=new URL('https://slow.example.org/x.ics');
Deno.connect=()=>new Promise(()=>{});let t0=Date.now();
let out=await within(pinnedGet(u,'93.184.216.34',{timeoutMs:150}),1500);
check('a TCP connect that never answers is cut off by the timeout',/timed out/.test(out)&&Date.now()-t0<600,out+' after '+(Date.now()-t0)+'ms');
Deno.connect=()=>slowConn('late-tcp',400);t0=Date.now();
out=await within(pinnedGet(u,'93.184.216.34',{timeoutMs:150}),1500);
check('a slow TCP connect is cut off at the timeout',/timed out/.test(out)&&Date.now()-t0<380,out+' after '+(Date.now()-t0)+'ms');
await new Promise(r=>setTimeout(r,400));
check('…and a connection that opens after the timeout is closed straight away',closed.includes('late-tcp'),JSON.stringify(closed));
Deno.connect=async()=>({close(){closed.push('tcp')},read:async()=>null,write:async b=>b.length});Deno.startTls=()=>new Promise(()=>{});closed=[];t0=Date.now();
out=await within(pinnedGet(u,'93.184.216.34',{timeoutMs:150}),1500);
check('a TLS handshake that never finishes is cut off by the timeout, and the socket is closed',/timed out/.test(out)&&Date.now()-t0<600&&closed.includes('tcp'),out+' '+JSON.stringify(closed));
let release;Deno.startTls=async c=>c;Deno.connect=async()=>({close(){closed.push('stall');release?.()},read:()=>new Promise(r=>{release=()=>r(null)}),write:async b=>b.length});closed=[];t0=Date.now();
out=await within(pinnedGet(u,'93.184.216.34',{timeoutMs:150}),1500);
check('a server that never sends anything is cut off by the timeout',/timed out/.test(out)&&Date.now()-t0<600&&closed.includes('stall'),out+' '+JSON.stringify(closed));
Deno.connect=realConnect;Deno.startTls=realTls;

console.log(`${pass} passed, ${fail} failed`);process.exit(fail?1:0);
