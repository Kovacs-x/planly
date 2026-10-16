// Planly 5.1 — food-search: asks Open Food Facts on behalf of the Planly app.
//
// Why: on iPhone the browser will not let Planly read Open Food Facts' answers directly ("could not connect"), although
// the same addresses open fine in Safari. Asked from here, there is no browser in the way.
//
// What it does, and nothing more:
// - Only signed-in Planly users can call it (their session is checked with Supabase Auth). It does not read or write
//   any table, and it never sees or sends anyone's food log or account details.
// - Redirects are never followed, so no request can end up anywhere but the addresses below (a redirect counts as a
//   refusal). The request body is limited to 500 bytes, counted while it is read.
// - It accepts only a few plain search words (lowercase letters, numbers, %) or a barcode number, and only ever calls
//   the fixed Open Food Facts addresses below. Nothing is saved or logged.
// - UK products come first: each search also asks for products sold in the United Kingdom.

const ORIGIN = 'https://kovacs-x.github.io'
const cors = {
  'Access-Control-Allow-Origin': ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Vary': 'Origin',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })

const SB = Deno.env.get('SUPABASE_URL')!
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!

const OFF_FAST = 'https://search.openfoodfacts.org/search'
const OFF_SEARCH = 'https://world.openfoodfacts.org/cgi/search.pl'
const OFF_PRODUCT = 'https://world.openfoodfacts.org/api/v2/product/'
const FIELDS = 'code,product_name,brands,nutriments,serving_size,serving_quantity,serving_quantity_unit,quantity,product_quantity,product_quantity_unit'
const UK = 'countries:"en:united-kingdom"'
const AGENT = 'Planly/5.1 (household planner; https://kovacs-x.github.io/planly/)'
const WORDS = /^[a-z0-9%]{1,30}( [a-z0-9%]{1,30}){0,7}$/
const CODE = /^[0-9]{8,14}$/
const NUTRIENTS = ['energy-kcal_100g', 'energy-kj_100g', 'energy_100g', 'proteins_100g', 'carbohydrates_100g', 'fat_100g']

type Product = Record<string, unknown>
type Clean = {
  code: string; product_name: string; brands: string; serving_size: string; serving_quantity: number | null
  serving_quantity_unit: string; quantity: string; product_quantity: number | null; product_quantity_unit: string
  nutriments: Record<string, number>; uk: boolean
}

// Only the fields the app uses, as plain values, so nothing unexpected is passed on.
function clean(p: Product, uk: boolean): Clean | null {
  const name = String(p?.product_name ?? '').trim().slice(0, 160)
  if (!name) return null
  const brandsRaw = Array.isArray(p.brands) ? p.brands[0] : p.brands
  const n = (p.nutriments && typeof p.nutriments === 'object') ? p.nutriments as Record<string, unknown> : {}
  const nutriments: Record<string, number> = {}
  for (const k of NUTRIENTS) {
    const v = Number(n[k])
    if (n[k] !== null && n[k] !== undefined && n[k] !== '' && Number.isFinite(v)) nutriments[k] = v
  }
  const sq = Number(p.serving_quantity), pq = Number(p.product_quantity)
  // only plain weight or volume units
  const unit = (u: unknown) => /^(g|kg|ml|cl|l)$/i.test(String(u ?? '').trim()) ? String(u).trim().toLowerCase() : ''
  return {
    code: /^[0-9]{6,14}$/.test(String(p.code ?? '')) ? String(p.code) : '',
    product_name: name,
    brands: String(brandsRaw ?? '').split(',')[0].trim().slice(0, 120),
    serving_size: String(p.serving_size ?? '').slice(0, 60),
    serving_quantity: Number.isFinite(sq) && sq > 0 && sq <= 5000 ? sq : null,
    serving_quantity_unit: unit(p.serving_quantity_unit),
    quantity: String(p.quantity ?? '').slice(0, 60),
    product_quantity: Number.isFinite(pq) && pq > 0 && pq <= 100000 ? pq : null,
    product_quantity_unit: unit(p.product_quantity_unit),
    nutriments,
    uk,
  }
}

const reason = (e: unknown) => {
  const err = e as { name?: string; status?: number }
  return err?.name === 'AbortError' || err?.name === 'TimeoutError' ? 'took too long'
    : err?.status ? 'refused, code ' + err.status : 'could not connect'
}

async function getJson(url: string, ms: number) {
  const r = await fetch(url, { headers: { 'User-Agent': AGENT, Accept: 'application/json' }, redirect: 'manual', signal: AbortSignal.timeout(ms) })
  if (!r.ok) { await r.body?.cancel(); throw Object.assign(new Error('HTTP ' + r.status), { status: r.status }) }
  return await r.json()
}

// The fast search service matches whole words only, so a half-typed last word ("apple ju") also gets a search with
// just the finished words ("apple"); the app keeps only foods matching every typed word. Each is asked twice: UK only,
// and everywhere.
async function fastSearch(q: string) {
  const words = q.split(' ')
  const texts = words.length > 1 ? [q, words.slice(0, -1).join(' ')] : [q]
  const asks = texts.flatMap((t, i) => [true, false].map((uk) => ({ uk, url: OFF_FAST + '?' + new URLSearchParams({ q: uk ? `${t} ${UK}` : t, page_size: i ? '30' : '20', fields: FIELDS, langs: 'en' }) })))
  const got = await Promise.allSettled(asks.map((a) => getJson(a.url, 6000).then((j) => {
    if (!Array.isArray(j?.hits)) throw new Error('bad answer')
    return (j.hits as Product[]).map((p) => clean(p, a.uk)).filter(Boolean) as Clean[]
  })))
  if (got.every((x) => x.status === 'rejected')) throw (got[0] as PromiseRejectedResult).reason
  // UK answers first, then the rest; one entry per product
  const seen = new Set<string>(), out: Clean[] = []
  for (const uk of [true, false]) {
    got.forEach((x, i) => {
      if (x.status !== 'fulfilled' || asks[i].uk !== uk) return
      for (const p of x.value) {
        const key = p.code || (p.product_name + '|' + p.brands).toLowerCase()
        if (seen.has(key)) continue
        seen.add(key); out.push(p)
      }
    })
  }
  return out
}

async function classicSearch(q: string) {
  const j = await getJson(OFF_SEARCH + '?' + new URLSearchParams({ search_terms: q, search_simple: '1', action: 'process', json: '1', page_size: '20', fields: FIELDS }), 15000)
  return ((j?.products ?? []) as Product[]).map((p) => clean(p, false)).filter(Boolean) as Clean[]
}

async function product(code: string) {
  const r = await fetch(OFF_PRODUCT + code + '.json?' + new URLSearchParams({ fields: FIELDS }), { headers: { 'User-Agent': AGENT, Accept: 'application/json' }, redirect: 'manual', signal: AbortSignal.timeout(10000) })
  if (r.status === 404) { await r.body?.cancel(); return json({ status: 'missing' }) }
  if (!r.ok) { await r.body?.cancel(); return json({ error: 'Open Food Facts refused, code ' + r.status, status: r.status }, 502) }
  const j = await r.json()
  if (!j?.product || j.status === 0) return json({ status: 'missing' })
  return json({ status: 'found', product: clean({ ...j.product, code }, false) })
}

// Reads the request body, counting bytes as they arrive and stopping as soon as there are too many (null). A body that
// is not valid UTF-8 gives false.
const MAX_BODY = 500
async function readLimited(req: Request, max: number): Promise<string | null | false> {
  const declared = Number(req.headers.get('content-length') ?? '')
  if (Number.isFinite(declared) && declared > max) { await req.body?.cancel().catch(() => {}); return null }
  if (!req.body) return ''
  const reader = req.body.getReader(), chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > max) { await reader.cancel().catch(() => {}); return null }
    chunks.push(value)
  }
  const bytes = new Uint8Array(total)
  let at = 0
  for (const c of chunks) { bytes.set(c, at); at += c.byteLength }
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes) } catch { return false }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  // signed-in Planly users only
  const auth = req.headers.get('authorization') || ''
  if (!auth.toLowerCase().startsWith('bearer ')) return json({ error: 'Authentication required.' }, 401)
  const userRes = await fetch(SB + '/auth/v1/user', { headers: { apikey: ANON, Authorization: auth }, redirect: 'manual' })
  if (!userRes.ok) { await userRes.body?.cancel(); return json({ error: 'Authentication required.' }, 401) }
  const user = await userRes.json().catch(() => null)
  if (!user?.id) return json({ error: 'Authentication required.' }, 401)

  const raw = await readLimited(req, MAX_BODY)
  if (raw === null) return json({ error: 'Request too large.' }, 413)
  if (raw === false) return json({ error: 'Bad request.' }, 400)
  let body: { mode?: unknown; q?: unknown; code?: unknown }
  try { body = JSON.parse(raw) } catch { return json({ error: 'Bad request.' }, 400) }

  try {
    if (body.mode === 'product') {
      const code = String(body.code ?? '')
      if (!CODE.test(code)) return json({ error: 'Bad barcode.' }, 400)
      return await product(code)
    }
    if (body.mode !== 'suggest' && body.mode !== 'search') return json({ error: 'Bad request.' }, 400)
    const q = String(body.q ?? '')
    if (!WORDS.test(q)) return json({ error: 'Bad search words.' }, 400)
    let fastWhy = 'found nothing'
    try {
      const found = await fastSearch(q)
      if (found.length || body.mode === 'suggest') return json({ products: found, source: 'fast' })
    } catch (e) {
      if (body.mode === 'suggest') return json({ error: 'Open Food Facts: ' + reason(e) }, 502)
      fastWhy = reason(e)
    }
    // pressing Search: the classic search as well, when the fast one fails or finds nothing (it is slower and busier)
    try {
      return json({ products: await classicSearch(q), source: 'classic' })
    } catch (e) {
      return json({ error: 'Fast search: ' + fastWhy + '. Main search: ' + reason(e) + '.' }, 502)
    }
  } catch (e) {
    return json({ error: 'Open Food Facts: ' + reason(e) }, 502)
  }
})
