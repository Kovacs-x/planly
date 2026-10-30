// body-import: saves weigh-ins sent from the person's own iPhone (an Apple Health Shortcut) to Fitness › Body
// (migrations 056-058). The smart scale's app (e.g. RENPHO Health) writes each weigh-in to Apple Health; the Shortcut
// sends recent readings here with the person's private import key. Readings are saved only as that person's own rows.
//
// From the app (Authorization: the person's Supabase session; the user always comes from that session):
//   create-key   makes a new import key (shown once; only its SHA-256 hash is stored) and replaces any old one
//   status       { linked, createdAt, lastUsedAt }
//   remove-key   forgets the key, so the Shortcut stops working
// From the Shortcut (header x-planly-import-key, no session): POST JSON
//   { weight: "<date>|<value>|<unit>\n…", fat: "<date>|<value>|<unit>\n…", lean: "<date>|<value>|<unit>\n…" }
//   one reading per line (newest first or any order; repeats are fine). Weight and lean mass in kg, lb or st; body fat
//   in % (or as a fraction). Readings at the same minute become one weigh-in; each weigh-in is stored once.
// Deployed with JWT verification off (a Shortcut cannot send a Supabase session); every call is checked here instead.

const cors = {
  'Access-Control-Allow-Origin': 'https://kovacs-x.github.io',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
const env = (k: string) => Deno.env.get(k) || ''
const SB = () => env('SUPABASE_URL'), ANON = () => env('SUPABASE_ANON_KEY'), SERVICE = () => env('SUPABASE_SERVICE_ROLE_KEY')

const sbHeaders = () => ({ apikey: SERVICE(), Authorization: `Bearer ${SERVICE()}`, 'Content-Type': 'application/json' })
async function rpc(name: string, args: Record<string, unknown>) {
  const r = await fetch(`${SB()}/rest/v1/rpc/${name}`, { method: 'POST', headers: sbHeaders(), body: JSON.stringify(args) })
  if (!r.ok) throw new Error('db ' + name + ' ' + r.status)
  return r.status === 204 ? null : await r.json().catch(() => null)
}
async function sha256(text: string) {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))
  return Array.from(d, b => b.toString(16).padStart(2, '0')).join('')
}
async function sessionUser(req: Request) {
  const auth = req.headers.get('authorization') || ''
  if (!auth.toLowerCase().startsWith('bearer ')) return ''
  const r = await fetch(SB() + '/auth/v1/user', { headers: { apikey: ANON(), Authorization: auth } })
  if (!r.ok) return ''
  return String((await r.json().catch(() => null))?.id || '')
}

// ---------- reading the Shortcut's lines ----------
const MASS: Record<string, number> = { kg: 1, kilogram: 1, kilograms: 1, g: 0.001, lb: 0.45359237, lbs: 0.45359237, pound: 0.45359237, pounds: 0.45359237, st: 6.35029318, stone: 6.35029318 }
type Reading = { at: number; value: number }
function parseLines(text: unknown, kind: 'mass' | 'percent', limit = 400): Reading[] {
  const out: Reading[] = []
  for (const raw of String(text ?? '').split(/\r?\n/).slice(0, limit)) {
    const [d, v, u] = raw.split('|').map(x => x.trim())
    if (!d || !v) continue
    const at = Date.parse(d)
    let value = Number(v.replace(',', '.').replace(/[^0-9.\-]/g, ''))
    if (!Number.isFinite(at) || !Number.isFinite(value)) continue
    if (at > Date.now() + 10 * 60 * 1000 || at < Date.now() - 400 * 86400 * 1000) continue
    if (kind === 'mass') { const f = MASS[(u || 'kg').toLowerCase()]; if (!f) continue; value *= f }
    else if (value > 0 && value < 1) value *= 100 // a fraction (0.242) rather than a percentage (24.2)
    out.push({ at, value })
  }
  return out
}
const minute = (ms: number) => Math.floor(ms / 60000)
export function rowsFrom(user: string, body: Record<string, unknown>) {
  const byMinute = new Map<number, Record<string, unknown>>()
  const put = (list: Reading[], col: string, lo: number, hi: number, dp: number) => {
    for (const r of list) {
      if (r.value < lo || r.value > hi) continue
      const k = minute(r.at), row = byMinute.get(k) || { at: r.at }
      if (row[col] == null) row[col] = Number(r.value.toFixed(dp))
      byMinute.set(k, row)
    }
  }
  put(parseLines(body.weight, 'mass'), 'weight_kg', 25, 400, 2)
  put(parseLines(body.fat, 'percent'), 'fat_ratio_pct', 1, 75, 1)
  put(parseLines(body.lean, 'mass'), 'fat_free_mass_kg', 0, 400, 2)
  const now = Date.now(), out: Record<string, unknown>[] = []
  for (const [k, row] of byMinute) {
    if (row.weight_kg == null) continue // a weigh-in needs a weight
    const { at, ...vals } = row
    out.push({ ...vals, id: crypto.randomUUID(), owner_id: user, client_id: 'ah-' + k, external_id: 'ah-' + k, source: 'apple_health', measured_at: new Date(at as number).toISOString(), client_created_at: now, client_updated_at: now })
  }
  return out.slice(0, 200)
}
async function saveRows(rows: Record<string, unknown>[]) {
  if (!rows.length) return 0
  const r = await fetch(`${SB()}/rest/v1/planly_body_weights?on_conflict=owner_id,external_id`, {
    method: 'POST', headers: { ...sbHeaders(), Prefer: 'resolution=ignore-duplicates,return=representation' }, body: JSON.stringify(rows),
  })
  if (!r.ok) throw new Error('save weigh-ins ' + r.status)
  const saved = await r.json().catch(() => [])
  return Array.isArray(saved) ? saved.length : 0
}

export async function handle(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  // From the Shortcut: the import key decides whose weigh-ins these are
  const key = req.headers.get('x-planly-import-key') || ''
  if (key) {
    if (!/^pk_[A-Za-z0-9_-]{40,80}$/.test(key)) return json({ error: 'Unknown import key.' }, 401)
    const raw = await req.text()
    if (raw.length > 200000) return json({ error: 'Too much at once.' }, 413)
    const body = (() => { try { return JSON.parse(raw) } catch { return null } })()
    if (!body || typeof body !== 'object') return json({ error: 'Send JSON.' }, 400)
    const user = await rpc('planly_body_import_key_use', { p_key_hash: await sha256(key) })
    if (!user) return json({ error: 'Unknown import key.' }, 401)
    const rows = rowsFrom(String(user), body as Record<string, unknown>)
    const saved = await saveRows(rows)
    return json({ ok: true, received: rows.length, saved })
  }

  const user = await sessionUser(req)
  if (!user) return json({ error: 'Authentication required.' }, 401)
  const body = await req.json().catch(() => ({})) as { action?: string }
  if (body.action === 'create-key') {
    const bytes = crypto.getRandomValues(new Uint8Array(32))
    const newKey = 'pk_' + btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    await rpc('planly_body_import_key_set', { p_user: user, p_key_hash: await sha256(newKey) })
    return json({ key: newKey, url: SB() + '/functions/v1/body-import' })
  }
  if (body.action === 'status') {
    const rows = await rpc('planly_body_import_key_status', { p_user: user })
    const k = Array.isArray(rows) ? rows[0] : null
    return json({ linked: !!k, createdAt: k?.created_at || null, lastUsedAt: k?.last_used_at || null })
  }
  if (body.action === 'remove-key') {
    await rpc('planly_body_import_key_delete', { p_user: user })
    return json({ linked: false })
  }
  return json({ error: 'Unknown action.' }, 400)
}

if (typeof Deno !== 'undefined' && (Deno as unknown as { serve?: unknown }).serve) Deno.serve(handle)
