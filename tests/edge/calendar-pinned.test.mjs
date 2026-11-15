// calendar-source-create: DNS-rebinding safe fetching. The feed's host is resolved once per hop; every address is checked
// against the private-range blocklist; the request then goes to one of those exact addresses (TCP to the IP, TLS for the
// original host name, Host header kept), so a second lookup that would return 127.0.0.1 is never made. Redirects are
// checked again hop by hop. Private IPv6 written in hex (::ffff:7f00:1, NAT64, 6to4) is refused too. The HTTP reply is
// read with a size cap (Content-Length and chunked).
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
const {fetchCalendarFeed,publicAddresses}=await import('../../supabase/functions/calendar-source-create/index.ts');
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

console.log(`${pass} passed, ${fail} failed`);process.exit(fail?1:0);
