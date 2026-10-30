// withings: links a person's Withings scale to Fitness › Body and saves their own weigh-ins (migrations 056-058).
// Tokens never leave the server. Weigh-ins are saved only as the linked person's own rows (owner_id = that user).
//
// From the app (Authorization: the person's Supabase session; the user id always comes from that session):
//   start        returns the Withings sign-in address, with a signed, 10-minute state tied to this person
//   status       { linked, lastSync }
//   sync         pulls new weigh-ins now (the app also asks on opening Body, in case a notification was missed)
//   disconnect   stops notifications at Withings and forgets the link
// From the Withings sign-in page coming back to Planly (no session needed; the signed state names the person):
//   exchange     { code, state } -> saves the link, subscribes to weigh-in notifications, imports the last 90 days
// From Withings (notifications, unauthenticated by design): HEAD -> 200; POST form { userid, startdate, enddate, appli }
//   -> looks the Withings user up in our own links and pulls that window. A forged call can only make us re-read real
//   data from Withings for an already-linked person; it cannot write anything else.
// WITHINGS_CLIENT_ID / WITHINGS_CLIENT_SECRET are Edge Function secrets (Supabase dashboard), never in browser code.
// Deployed with JWT verification off (Withings cannot send a Supabase token); app calls are checked here instead.

const APP = 'https://kovacs-x.github.io'
const REDIRECT = 'https://kovacs-x.github.io/planly/v2/'
const AUTHORIZE = 'https://account.withings.com/oauth2_user/authorize2'
const API = 'https://wbsapi.withings.net'
const SCOPE = 'user.metrics'
const cors = {
  'Access-Control-Allow-Origin': APP,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const env = (k: string) => Deno.env.get(k) || ''
const SB = () => env('SUPABASE_URL'), ANON = () => env('SUPABASE_ANON_KEY'), SERVICE = () => env('SUPABASE_SERVICE_ROLE_KEY')
const CLIENT_ID = () => env('WITHINGS_CLIENT_ID'), SECRET = () => env('WITHINGS_CLIENT_SECRET')
const FUNCTION_URL = () => SB() + '/functions/v1/withings'

// ---------- Planly database (service role, RPCs from migration 058) ----------
const sbHeaders = () => ({ apikey: SERVICE(), Authorization: `Bearer ${SERVICE()}`, 'Content-Type': 'application/json' })
async function rpc(name: string, args: Record<string, unknown>) {
  const r = await fetch(`${SB()}/rest/v1/rpc/${name}`, { method: 'POST', headers: sbHeaders(), body: JSON.stringify(args) })
  if (!r.ok) throw new Error('db ' + name + ' ' + r.status)
  return r.status === 204 ? null : await r.json().catch(() => null)
}
type Link = { user_id: string; withings_user: string; access_token: string; refresh_token: string; expires_at: string; last_sync_at: string | null }
async function getLink(user: string | null, wuser: string | null): Promise<Link | null> {
  const rows = await rpc('planly_withings_link_get', { p_user: user, p_withings_user: wuser })
  return Array.isArray(rows) && rows[0] ? rows[0] as Link : null
}

// ---------- signed sign-in state (ties the Withings sign-in to the Planly person who started it) ----------
const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
async function hmac(text: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('planly-withings-state:' + SECRET()), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return b64(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(text))))
}
async function makeState(user: string) {
  const exp = Date.now() + 10 * 60 * 1000, nonce = b64(crypto.getRandomValues(new Uint8Array(12))), body = `pw.${user}.${exp}.${nonce}`
  return body + '.' + await hmac(body)
}
async function readState(state: string) {
  const parts = String(state || '').split('.')
  if (parts.length !== 5 || parts[0] !== 'pw') return null
  const [, user, exp, nonce, sig] = parts
  if (!/^[0-9a-f-]{36}$/.test(user) || !(Number(exp) > Date.now())) return null
  const want = await hmac(`pw.${user}.${exp}.${nonce}`)
  if (want.length !== sig.length) return null
  let diff = 0
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ sig.charCodeAt(i)
  return diff === 0 ? user : null
}

// ---------- Withings ----------
async function withings(path: string, params: Record<string, string>, token?: string) {
  const r = await fetch(API + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: new URLSearchParams(params),
  })
  const d = await r.json().catch(() => ({}))
  return { ok: r.ok && d?.status === 0, status: Number(d?.status ?? -1), body: d?.body || {} }
}
async function saveTokens(user: string, b: Record<string, unknown>) {
  await rpc('planly_withings_link_save', {
    p_user: user, p_withings_user: String(b.userid), p_access: String(b.access_token), p_refresh: String(b.refresh_token),
    p_expires_at: new Date(Date.now() + Math.max(60, Number(b.expires_in) || 10800) * 1000).toISOString(), p_scope: String(b.scope || ''),
  })
}
// A usable access token for this link, refreshing it (and saving the new pair, which Withings rotates) when near expiry.
async function accessFor(link: Link): Promise<string | null> {
  if (new Date(link.expires_at).getTime() - Date.now() > 120000) return link.access_token
  const r = await withings('/v2/oauth2', { action: 'requesttoken', grant_type: 'refresh_token', client_id: CLIENT_ID(), client_secret: SECRET(), refresh_token: link.refresh_token })
  if (!r.ok || !r.body.access_token) return null
  await saveTokens(link.user_id, { ...r.body, userid: link.withings_user })
  return String(r.body.access_token)
}

// Withings measure types -> planly_body_weights columns (056/057). Anything else is kept in `extra`.
const COLUMNS: Record<number, [string, number, number, number]> = { // type: [column, min, max, decimals]
  1: ['weight_kg', 25, 400, 2], 6: ['fat_ratio_pct', 1, 75, 1], 8: ['fat_mass_kg', 0, 300, 2], 5: ['fat_free_mass_kg', 0, 400, 2],
  76: ['muscle_mass_kg', 0, 300, 2], 77: ['hydration_kg', 0, 300, 2], 88: ['bone_mass_kg', 0, 30, 2], 11: ['heart_rate_bpm', 25, 250, 0],
}
type Group = { grpid: number; date: number; category: number; measures: { type: number; value: number; unit: number }[] }
// One row per weigh-in moment: groups at the same second merge (a scale can send weight and heart rate separately).
export function rowsFrom(user: string, groups: Group[]) {
  const byDate = new Map<number, Group[]>()
  for (const g of groups) if (g && g.category === 1 && Array.isArray(g.measures)) byDate.set(g.date, [...(byDate.get(g.date) || []), g])
  const out: Record<string, unknown>[] = []
  for (const [date, gs] of byDate) {
    const row: Record<string, unknown> = { extra: {} }
    let weightGroup: Group | null = null
    for (const g of gs) for (const m of g.measures) {
      const v = Number(m.value) * Math.pow(10, Number(m.unit)), col = COLUMNS[m.type]
      if (!Number.isFinite(v)) continue
      if (col) { const [name, lo, hi, dp] = col; if (v >= lo && v <= hi) { row[name] = Number(v.toFixed(dp)); if (m.type === 1) weightGroup = g } }
      else if (Object.keys(row.extra as object).length < 30) (row.extra as Record<string, number>)[String(m.type)] = Number(v.toFixed(3))
    }
    if (!weightGroup || row.weight_kg == null) continue // a weigh-in needs a weight
    const now = Date.now(), id = 'withings-' + weightGroup.grpid
    out.push({ ...row, id: crypto.randomUUID(), owner_id: user, client_id: id, external_id: String(weightGroup.grpid), source: 'withings', measured_at: new Date(date * 1000).toISOString(), client_created_at: now, client_updated_at: now })
  }
  return out
}
async function saveRows(rows: Record<string, unknown>[]) {
  if (!rows.length) return 0
  const r = await fetch(`${SB()}/rest/v1/planly_body_weights?on_conflict=owner_id,external_id`, {
    method: 'POST', headers: { ...sbHeaders(), Prefer: 'resolution=ignore-duplicates,return=representation' }, body: JSON.stringify(rows),
  })
  if (!r.ok) throw new Error('save weigh-ins ' + r.status + ' ' + (await r.text()).slice(0, 200))
  const saved = await r.json().catch(() => [])
  return Array.isArray(saved) ? saved.length : 0
}
// Pull weigh-ins for one link: a time window (notifications) or everything changed since the last sync.
async function pull(link: Link, window?: { start: number; end: number }) {
  const token = await accessFor(link)
  if (!token) return { ok: false, saved: 0, reconnect: true }
  let offset = 0, saved = 0
  for (let page = 0; page < 20; page++) {
    const params: Record<string, string> = { action: 'getmeas', category: '1' }
    if (window) { params.startdate = String(window.start - 1); params.enddate = String(window.end + 1) }
    else params.lastupdate = String(link.last_sync_at ? Math.floor(new Date(link.last_sync_at).getTime() / 1000) - 3600 : Math.floor(Date.now() / 1000) - 90 * 86400)
    if (offset) params.offset = String(offset)
    const r = await withings('/measure', params, token)
    if (!r.ok) return { ok: false, saved, reconnect: r.status === 401 }
    saved += await saveRows(rowsFrom(link.user_id, (r.body.measuregrps || []) as Group[]))
    if (!r.body.more) break
    offset = Number(r.body.offset) || 0
    if (!offset) break
  }
  await rpc('planly_withings_link_touch', { p_user: link.user_id })
  return { ok: true, saved }
}

async function sessionUser(req: Request) {
  const auth = req.headers.get('authorization') || ''
  if (!auth.toLowerCase().startsWith('bearer ')) return ''
  const r = await fetch(SB() + '/auth/v1/user', { headers: { apikey: ANON(), Authorization: auth } })
  if (!r.ok) return ''
  return String((await r.json().catch(() => null))?.id || '')
}

export async function handle(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method === 'HEAD' || req.method === 'GET') return new Response(null, { status: 200 }) // Withings checks the address
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  if (!CLIENT_ID() || !SECRET()) return json({ error: 'The scale link is not set up on the server yet.' }, 503)

  // Withings notification (form-encoded, no session)
  if ((req.headers.get('content-type') || '').includes('application/x-www-form-urlencoded')) {
    const f = new URLSearchParams(await req.text())
    const wuser = f.get('userid') || '', start = Number(f.get('startdate')), end = Number(f.get('enddate'))
    if (!/^\d{1,40}$/.test(wuser) || f.get('appli') !== '1') return new Response('ok')
    const link = await getLink(null, wuser).catch(() => null)
    if (link) await pull(link, Number.isFinite(start) && Number.isFinite(end) && end >= start && end - start < 86400 * 31 ? { start, end } : undefined).catch(() => null)
    return new Response('ok') // always 200, so Withings does not retry forever
  }

  const body = await req.json().catch(() => ({})) as { action?: string; code?: string; state?: string }

  if (body.action === 'exchange') {
    const user = await readState(String(body.state || ''))
    const code = String(body.code || '')
    if (!user) return json({ error: 'This sign-in has expired. Tap Connect again.' }, 400)
    if (!code || code.length > 512) return json({ error: 'Missing sign-in code.' }, 400)
    const r = await withings('/v2/oauth2', { action: 'requesttoken', grant_type: 'authorization_code', client_id: CLIENT_ID(), client_secret: SECRET(), code, redirect_uri: REDIRECT })
    if (!r.ok || !r.body.access_token || !r.body.userid) return json({ error: 'Withings did not accept the sign-in. Tap Connect again.' }, 400)
    await saveTokens(user, r.body)
    await withings('/notify', { action: 'subscribe', callbackurl: FUNCTION_URL(), appli: '1' }, String(r.body.access_token)).catch(() => null)
    const link = await getLink(user, null)
    const res = link ? await pull(link) : { ok: false, saved: 0 }
    return json({ linked: true, imported: res.saved })
  }

  const user = await sessionUser(req)
  if (!user) return json({ error: 'Authentication required.' }, 401)

  if (body.action === 'start') {
    const q = new URLSearchParams({ response_type: 'code', client_id: CLIENT_ID(), scope: SCOPE, redirect_uri: REDIRECT, state: await makeState(user) })
    return json({ url: AUTHORIZE + '?' + q.toString() })
  }
  if (body.action === 'status') {
    const link = await getLink(user, null)
    return json({ linked: !!link, lastSync: link?.last_sync_at || null })
  }
  if (body.action === 'sync') {
    const link = await getLink(user, null)
    if (!link) return json({ linked: false })
    const r = await pull(link)
    if (r.reconnect) return json({ linked: true, reconnect: true, saved: r.saved })
    return json({ linked: true, saved: r.saved })
  }
  if (body.action === 'disconnect') {
    const link = await getLink(user, null)
    if (link) {
      const token = await accessFor(link).catch(() => null)
      if (token) await withings('/notify', { action: 'revoke', callbackurl: FUNCTION_URL(), appli: '1' }, token).catch(() => null)
      await rpc('planly_withings_link_delete', { p_user: user })
    }
    return json({ linked: false })
  }
  return json({ error: 'Unknown action.' }, 400)
}

if (typeof Deno !== 'undefined' && (Deno as unknown as { serve?: unknown }).serve) Deno.serve(handle)
