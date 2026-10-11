// Planly browser test harness: a static server for the app, an in-memory mock of Supabase (REST, RPC, auth) and a
// phone-sized Chromium. Nothing here talks to the real Planly database: every *.supabase.co request is answered locally.
//   PLANLY_ROOT          app checkout to serve (default: this repository). Point it at another checkout to test a base.
//   PLANLY_CHROMIUM      optional Chromium executable (default: Playwright's own).
//   PLANLY_SUPABASE_UMD  optional local copy of the pinned supabase-js UMD bundle (default: fetched from the CDN).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
let playwright;
try { playwright = await import('playwright'); } catch { playwright = createRequire('/opt/node-tools/node_modules/')('playwright'); }
export const chromium = playwright.chromium || playwright.default?.chromium;
export const launchBrowser = () => chromium.launch(process.env.PLANLY_CHROMIUM ? { executablePath: process.env.PLANLY_CHROMIUM } : {});

const ROOT = process.env.PLANLY_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SB = 'https://dtniwcwjucepsjzoojuc.supabase.co';
export const OWNER = '7836ad26-0000-4000-8000-00000000000a';
export const PARTNER = 'c30c664f-0000-4000-8000-00000000000b';
export const HOUSEHOLD = '5f0d9622-0000-4000-8000-0000000000aa';

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.woff2': 'font/woff2', '.css': 'text/css' };
export function startServer(port = 8765) {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const f = path.join(ROOT, p);
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' });
    fs.createReadStream(f).pipe(res);
  });
  return new Promise(r => server.listen(port, () => r(server)));
}

// ---------- mock database ----------
export function makeDb() {
  const now = new Date().toISOString();
  return {
    tables: {
      planly_tasks: [], planly_projects: [],
      planly_preferences: [OWNER, PARTNER].map(id => ({ owner_id: id, default_category: 'Personal', default_duration: 30, auto_complete_parent_subtasks: true, planning_start: '08:00', planning_end: '23:00', cloud_version: 1 })),
      planly_sync_state: [OWNER, PARTNER].map(id => ({ owner_id: id, initial_migration_completed_at: now, migration_project_count: 0, migration_task_count: 0, migration_digest: 'x', last_successful_sync_at: now })),
      planly_households: [{ id: HOUSEHOLD, name: 'Home', created_by: OWNER, created_at: now }],
      planly_household_members: [
        { household_id: HOUSEHOLD, user_id: OWNER, role: 'owner', joined_at: '2026-01-01T00:00:00Z', display_name: 'Musti' },
        { household_id: HOUSEHOLD, user_id: PARTNER, role: 'member', joined_at: '2026-01-02T00:00:00Z', display_name: 'Laki' }],
    },
    log: [],
    delays: {},      // table or rpc name -> ms
    offline: false,
  };
}
function applyFilters(rows, params) {
  let out = rows;
  for (const [k, v] of params) {
    if (['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'].includes(k)) continue;
    const m = /^(eq|neq|is|in)\.(.*)$/.exec(v); if (!m) continue;
    const [, op, val] = m;
    out = out.filter(r => {
      const cell = r[k];
      if (op === 'eq') return String(cell) === val;
      if (op === 'neq') return String(cell) !== val;
      if (op === 'is') return val === 'null' ? cell == null : String(cell) === val;
      if (op === 'in') return val.replace(/[()]/g, '').split(',').includes(String(cell));
      return true;
    });
  }
  const limit = params.get('limit'); if (limit) out = out.slice(0, Number(limit));
  return out;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
export async function installMock(context, db, userId) {
  if (process.env.PLANLY_SUPABASE_UMD) await context.route('https://cdn.jsdelivr.net/**', r => r.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(process.env.PLANLY_SUPABASE_UMD) }));
  await context.route('https://accounts.google.com/**', r => r.fulfill({ contentType: 'text/javascript', body: '' }));
  await context.route(SB + '/**', async route => {
    const req = route.request(), url = new URL(req.url()), method = req.method();
    if (db.offline) return route.abort('internetdisconnected');
    const json = (status, body, headers = {}) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', ...headers }, body: JSON.stringify(body) });
    if (method === 'OPTIONS') return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (url.pathname.startsWith('/auth/v1/user')) return json(200, { id: userId, email: userId + '@test', aud: 'authenticated', role: 'authenticated' });
    if (url.pathname.startsWith('/auth/v1/')) return json(200, {});
    if (url.pathname.startsWith('/functions/') || url.pathname.startsWith('/realtime/')) return json(404, {});
    const rpc = /^\/rest\/v1\/rpc\/(.+)$/.exec(url.pathname);
    if (rpc) {
      const name = rpc[1], body = JSON.parse(req.postData() || '{}');
      db.log.push({ rpc: name, body, userId });
      if (db.delays[name]) await sleep(db.delays[name]);
      if (db.rpcHandlers && db.rpcHandlers[name]) { const [st, b] = db.rpcHandlers[name](body, userId); return json(st, b); }
      if (name === 'planly_set_household_subtask_done') {
        const t = db.tables.planly_tasks.find(x => x.owner_id === body.p_owner_id && x.client_id === body.p_client_id);
        if (!t) return json(400, { code: 'P0002', message: 'not found' });
        t.data.subtasks = t.data.subtasks.map(s => String(s.id) === String(body.p_subtask_id) ? { ...s, done: !!body.p_done } : s);
        t.cloud_version++;
        return json(200, [{ subtasks: t.data.subtasks, completed: !!t.data.completed, cloud_version: t.cloud_version }]);
      }
      if (name === 'planly_set_household_task_completed') {
        const t = db.tables.planly_tasks.find(x => x.owner_id === body.p_owner_id && x.client_id === body.p_client_id);
        if (!t) return json(400, { code: 'P0002', message: 'not found' });
        t.data.completed = !!body.p_completed; t.completed_by = body.p_completed ? userId : null; t.completed_at = body.p_completed ? new Date().toISOString() : null; t.cloud_version++;
        return json(200, [{ completed: t.data.completed, completed_by: t.completed_by, completed_at: t.completed_at, cloud_version: t.cloud_version, task_date: t.data.date, next_date: null }]);
      }
      return json(200, null);
    }
    const tm = /^\/rest\/v1\/([a-z_]+)$/.exec(url.pathname);
    if (!tm) return json(404, {});
    const table = tm[1], rows = db.tables[table] || (db.tables[table] = []);
    const wantsObject = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
    const reply = list => wantsObject ? (list.length === 1 ? json(200, list[0]) : json(406, { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' })) : json(200, list);
    db.log.push({ table, method, query: url.search, userId });
    if (db.delays[table] && method !== 'GET') await sleep(db.delays[table]);
    if (method === 'GET' || method === 'HEAD') return reply(applyFilters(rows, url.searchParams));
    const body = JSON.parse(req.postData() || 'null');
    if (method === 'POST') {
      const items = (Array.isArray(body) ? body : [body]).map(x => ({ cloud_version: 1, deleted_at: null, ...x }));
      for (const it of items) {
        if (table === 'planly_tasks' || table === 'planly_projects') {
          if (rows.some(r => r.owner_id === it.owner_id && r.client_id === it.client_id)) return json(409, { code: '23505', message: 'duplicate key' });
        }
        rows.push(it);
      }
      return reply(items);
    }
    if (method === 'PATCH') {
      const hit = applyFilters(rows, url.searchParams);
      for (const r of hit) { Object.assign(r, body); if ('cloud_version' in r) r.cloud_version = Number(r.cloud_version) + 1; }
      return reply(hit);
    }
    return json(200, []);
  });
}

function fakeJwt(sub) {
  const b = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  return b({ alg: 'HS256', typ: 'JWT' }) + '.' + b({ sub, role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 86400 }) + '.sig';
}
export async function newPhone(browser, db, userId) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'allow' });
  await installMock(context, db, userId);
  const session = { access_token: fakeJwt(userId), refresh_token: 'r', token_type: 'bearer', expires_in: 86400, expires_at: Math.floor(Date.now() / 1000) + 86400, user: { id: userId, email: userId + '@test', aud: 'authenticated', role: 'authenticated', app_metadata: { provider: 'email' }, user_metadata: {} } };
  await context.addInitScript(([session, userId]) => {
    try {
      localStorage.setItem('sb-dtniwcwjucepsjzoojuc-auth-token', JSON.stringify(session));
      localStorage.setItem('planly-cloud-last-account-v1', userId);
      const k = 'planly-cloud-migration-status-v1:' + userId;
      if (!localStorage.getItem(k)) localStorage.setItem(k, JSON.stringify({ state: 'cloud-write-test' }));
      localStorage.setItem('planly-device-settings-v1', localStorage.getItem('planly-device-settings-v1') || '{}');
    } catch {}
  }, [session, userId]);
  const errors = [];
  context.on('page', p => p.on('pageerror', e => errors.push(String(e))));
  return { context, errors };
}
export async function openApp(context, errors) {
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto('http://localhost:8765/v2/', { waitUntil: 'load' });
  // first visit installs the SW and reloads into the composed runtime
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(1500);
  if (!(await page.evaluate(() => !!navigator.serviceWorker.controller))) { await page.reload({ waitUntil: 'load' }); }
  await page.waitForTimeout(2500);
  return page;
}
export { sleep };
