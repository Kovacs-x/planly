// Static server for the harness. Serves the tree in ./tree (copy of the repo's v2/ + scripts/) at /planly/.
// Usage: node serve.mjs   (port 8802; GET /__switch?to=pr|main switches between ./tree and ./main-tree)
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const here = path.dirname(new URL(import.meta.url).pathname);
const dirs = { pr: path.join(here, 'tree'), main: path.join(here, 'main-tree') };
let cur = process.env.START || 'pr'; let swMode = 'ok';
const types = { '.js': 'application/javascript', '.html': 'text/html', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.txt': 'text/plain' };
http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/__switch') { const to = u.searchParams.get('to'); if (dirs[to]) cur = to; res.end(cur); return }
  if (u.pathname === '/__sw') { swMode = u.searchParams.get('mode'); res.end(swMode); return }
  if (u.pathname.endsWith('/sw.js') && swMode === '404') { res.statusCode = 404; res.end('nf'); return }
  if (u.pathname.endsWith('/sw.js') && swMode === 'hang') { res.setHeader('content-type','application/javascript'); res.end("self.addEventListener('install',e=>e.waitUntil(new Promise(()=>{})));"); return }
  let p = u.pathname.replace(/^\/planly\//, '/'); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(dirs[cur], p);
  fs.readFile(f, (e, b) => { if (e) { res.statusCode = 404; res.end('nf'); return } res.setHeader('content-type', types[path.extname(f)] || 'application/octet-stream'); res.setHeader('cache-control', 'no-cache'); res.end(b) });
}).listen(Number(process.env.PORT || 8802));
