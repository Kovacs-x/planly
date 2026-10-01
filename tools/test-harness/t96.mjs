import { launch } from './harness.mjs';
import { ME, PARTNER, HH, session } from './mock.mjs';
const B = 'http://localhost:8802/planly/v2/';
const which = process.argv[2]; await fetch('http://localhost:8802/__switch?to=' + which);
const h = await launch({ uid: ME }); const { page: p, W, MOCK, ctx } = h;
MOCK.db.planly_household_invites.push({ id: 'inv1', household_id: HH, invited_email: 'wife@example.com', invited_by: ME, accepted_by: PARTNER, status: 'accepted', accepted_at: new Date().toISOString(), token_hash: 'h', created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 864e5).toISOString() });
await ctx.routeWebSocket(/supabase\.co\/realtime/, ws => { ws.onMessage(m => { try { const j = JSON.parse(m); if (Array.isArray(j)) { const [jr, r, topic, ev] = j; if (['phx_join', 'heartbeat', 'access_token'].includes(ev)) ws.send(JSON.stringify([jr, r, topic, 'phx_reply', { status: 'ok', response: { postgres_changes: [] } }])) } } catch { } }) });
const by = () => { const o = {}; for (const l of MOCK.log) { const k = l.split('?')[0].replace('/rest/v1/', '').replace('GET ', ''); o[k] = (o[k] || 0) + 1 } return o };
await p.goto(B); await W(4000);
await p.evaluate(s => localStorage.setItem('sb-dtniwcwjucepsjzoojuc-auth-token', JSON.stringify(s)), session(ME, 'alex@example.test', 25));
MOCK.log = []; await p.reload(); await W(12000);
const launchR = { total: MOCK.log.length, by: by() };
const resume = async () => { await p.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('blur')) }); await W(500); await p.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('focus')); window.dispatchEvent(new Event('pageshow')) }); await W(7000) };
// partner completes bathroom server-side before the first resume
const b = MOCK.db.planly_tasks.find(x => x.client_id === 'task-bathroom'); b.completed = true; b.completed_by = PARTNER; b.completed_at = new Date().toISOString(); b.cloud_version++; b.data = { ...b.data, completed: true };
MOCK.log = []; await resume(); const r1 = { total: MOCK.log.length, by: by() };
const seen = await p.evaluate(() => { const e = [...document.querySelectorAll('.task')].find(e => e.textContent.includes('Clean bathroom')); return e ? (e.closest('.completedSection') ? 'completed' : 'open') : 'hidden(completed section collapsed)' });
await W(62000);
MOCK.log = []; await resume(); const r2 = { total: MOCK.log.length, by: by() };
MOCK.log = []; await W(20000); const idle = MOCK.log.length;
// hide only (no preceding reconcile within window): does the hidden flush write?
MOCK.log = []; await p.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true }); document.dispatchEvent(new Event('visibilitychange')) }); await W(3000); const hideOnly = MOCK.log.slice();
// visible again, then hide within 5s of reconcile: flush should send the pending touch immediately
MOCK.log = []; await p.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true }); document.dispatchEvent(new Event('visibilitychange')) }); await W(1500); const before = MOCK.log.filter(l=>l.includes('sync_state')&&!l.startsWith('GET')).length; await p.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true }); document.dispatchEvent(new Event('visibilitychange')) }); await W(800); const afterHide = MOCK.log.filter(l=>l.includes('sync_state')&&!l.startsWith('GET')).length; await W(6000); const afterWait = MOCK.log.filter(l=>l.includes('sync_state')&&!l.startsWith('GET')).length;
console.log(which,'HIDE-ONLY', JSON.stringify(hideOnly));
console.log(which,'RESUME then quick hide: syncPATCH before hide',before,'0.8s after hide',afterHide,'6s later',afterWait);
console.log(which, 'LAUNCH', JSON.stringify(launchR));
console.log(which, 'RESUME <60s', JSON.stringify(r1), '| partner completion after resume:', seen);
console.log(which, 'RESUME >60s', JSON.stringify(r2));
console.log(which, 'idle20s', idle, 'errors', JSON.stringify(h.errors));
await h.browser.close();
