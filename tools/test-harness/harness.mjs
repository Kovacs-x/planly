import { chromium, devices } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import { MOCK, handle, session, reset, ME } from './mock.mjs';
export const BASE = 'http://localhost:8800/planly/v2/';
const SUPA = 'https://dtniwcwjucepsjzoojuc.supabase.co';
const UMD = fs.readFileSync(new URL('./supabase.umd.js', import.meta.url));
export async function launch({ device = 'iPhone 13', uid = ME, online = true } = {}) {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await browser.newContext({ ...devices[device], ...(process.env.TZID?{timezoneId:process.env.TZID}:{}) });
  await ctx.route(url => url.href.startsWith(SUPA), async (route, req) => {
    const r = handle(req.method(), req.url(), req.headers(), req.postData());
    await route.fulfill({ status: r.status, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': 'content-range', ...r.headers }, body: r.body });
  });
  await ctx.route('https://cdn.jsdelivr.net/**', r => r.fulfill({ status: 200, headers: { 'content-type': 'application/javascript', 'access-control-allow-origin': '*' }, body: UMD }));
  await ctx.route('https://accounts.google.com/**', r => r.fulfill({ status: 200, headers: { 'content-type': 'application/javascript' }, body: '' }));
  await ctx.addInitScript(s => { try { if (!localStorage.getItem('sb-dtniwcwjucepsjzoojuc-auth-token')) localStorage.setItem('sb-dtniwcwjucepsjzoojuc-auth-token', JSON.stringify(s)) } catch { } }, session(uid));
  const page = await ctx.newPage();
  const errors = [], consoleMsgs = [], failed = [];
  page.on('pageerror', e => errors.push(e.message.slice(0, 200)));
  page.on('console', m => { if (['error', 'warning'].includes(m.type())) consoleMsgs.push(`${m.type()}: ${m.text().slice(0, 180)}`) });
  page.on('requestfailed', r => failed.push(`${r.url().slice(0, 120)} ${r.failure()?.errorText}`));
  const W = ms => page.waitForTimeout(ms);
  async function boot() { await page.goto(BASE); await W(4500); await page.reload(); await W(5500); }
  async function tab(name) { await page.evaluate(n => document.querySelector(`[data-tab="${n}"]`)?.click(), name); await W(1200); }
  async function shot(name) { await page.screenshot({ path: new URL(`./shots/${name}.png`, import.meta.url).pathname, fullPage: false }); }
  return { browser, ctx, page, errors, consoleMsgs, failed, W, boot, tab, shot, MOCK, reset };
}
