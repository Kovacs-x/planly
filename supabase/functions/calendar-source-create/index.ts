type SourceInput = {
  action?: 'create' | 'refresh'
  sourceId?: string
  name?: string
  feedUrl?: string
  colour?: string
  showToday?: boolean
  showMonth?: boolean
  showTimeline?: boolean
}

const cors = {
  'Access-Control-Allow-Origin': 'https://kovacs-x.github.io',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

const SB = Deno.env.get('SUPABASE_URL')!
// API keys: the new publishable/secret keys (SUPABASE_PUBLISHABLE_KEYS / SUPABASE_SECRET_KEYS, the key named "default"),
// falling back to the legacy anon/service_role keys while both exist. New keys go on the apikey header only.
function namedKey(list: string, legacy: string) {
  try {
    const all = JSON.parse(Deno.env.get(list) || '{}')
    if (typeof all?.default === 'string' && all.default) return all.default as string
  } catch { /* not set */ }
  return Deno.env.get(legacy) || ''
}
const ANON = namedKey('SUPABASE_PUBLISHABLE_KEYS', 'SUPABASE_ANON_KEY')
const SERVICE = namedKey('SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY')
const serviceAuth = (): Record<string, string> =>
  SERVICE.startsWith('eyJ') ? { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` } : { apikey: SERVICE }

function callerFetch(path: string, auth: string, init: RequestInit = {}) {
  return fetch(SB + path, {
    ...init,
    headers: {
      apikey: ANON,
      Authorization: auth,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  })
}

function serviceFetch(path: string, init: RequestInit = {}) {
  return fetch(SB + path, {
    ...init,
    headers: {
      ...serviceAuth(),
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  })
}


const MAX_FEED_BYTES = 2_000_000
const MAX_REDIRECTS = 3
const FEED_TIMEOUT_MS = 12_000

function blockedIpv4(host: string) {
  const p = host.split('.').map(Number)
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false
  const [a, b, d] = p
  return a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0 && d === 2) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && d === 100) ||
    (a === 203 && b === 0 && d === 113)
}

function blockedIp(host: string) {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '')
  if (blockedIpv4(h)) return true
  if (!h.includes(':')) return false
  if (h === '::' || h === '::1') return true
  if (h.startsWith('fc') || h.startsWith('fd')) return true
  if (/^fe[89ab]/.test(h)) return true
  const mapped = h.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/)
  return mapped ? blockedIpv4(mapped[1]) : false
}

// Resolve the host once, validate every address it returns, and hand back a single validated public IP to pin the
// request to. fetch() would resolve the hostname again, independently, when it opened the connection: an attacker who
// controls the host's DNS could answer the validation lookup with a public IP and the connection lookup with a private
// one (DNS rebinding / TOCTOU). Pinning the TCP connection to an address we validated here closes that window.
async function resolvePinnedIp(url: URL): Promise<{ host: string; ip: string }> {
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Unsafe calendar URL')
  if (url.port && url.port !== '443') throw new Error('Unsafe calendar port')
  const host = url.hostname.toLowerCase().replace(/\.$/, '')
  if (!host || host === 'localhost' || host.endsWith('.localhost') ||
      host.endsWith('.local') || host.endsWith('.internal') ||
      host.endsWith('.lan') || blockedIp(host)) {
    throw new Error('Private calendar destination')
  }
  // A literal-IP host is already the connection target; validate it and pin to it.
  const literal = host.replace(/^\[|\]$/g, '')
  if (/^[\d.]+$/.test(host) || host.includes(':')) {
    if (blockedIp(literal)) throw new Error('Private calendar destination')
    return { host, ip: literal }
  }
  const results = await Promise.allSettled([
    Deno.resolveDns(host, 'A'),
    Deno.resolveDns(host, 'AAAA'),
  ])
  const v4 = results[0].status === 'fulfilled' ? results[0].value : []
  const v6 = results[1].status === 'fulfilled' ? results[1].value : []
  const addresses = [...v4, ...v6]
  // Reject if ANY resolved address is private, so a mixed public/private answer can never be exploited by picking the
  // private one. Then pin the connection to a specific validated address (IPv4 preferred, both families are public).
  if (!addresses.length || addresses.some((ip) => blockedIp(ip))) {
    throw new Error('Calendar destination is not public')
  }
  return { host, ip: v4[0] ?? v6[0] }
}

function indexOfHeaderEnd(bytes: Uint8Array) {
  for (let i = 0; i + 3 < bytes.length; i += 1) {
    if (bytes[i] === 13 && bytes[i + 1] === 10 && bytes[i + 2] === 13 && bytes[i + 3] === 10) return i
  }
  return -1
}

function containsSequence(haystack: Uint8Array, needle: number[]) {
  outer: for (let i = 0; i + needle.length <= haystack.length; i += 1) {
    for (let j = 0; j < needle.length; j += 1) if (haystack[i + j] !== needle[j]) continue outer
    return true
  }
  return false
}

function parseResponseHead(raw: Uint8Array) {
  const sep = indexOfHeaderEnd(raw)
  if (sep < 0) return null
  const head = new TextDecoder('latin1').decode(raw.subarray(0, sep)).split('\r\n')
  const status = Number((head[0].match(/^HTTP\/\d(?:\.\d)?\s+(\d{3})/) || [])[1] || 0)
  if (!status) throw new Error('Malformed calendar response')
  const headers = new Headers()
  for (const line of head.slice(1)) {
    const i = line.indexOf(':')
    if (i > 0) { try { headers.append(line.slice(0, i).trim(), line.slice(i + 1).trim()) } catch { /* ignore */ } }
  }
  return { status, headers, body: raw.subarray(sep + 4) }
}

// A response is complete once we can see its whole body: a chunked stream whose zero-size terminator has arrived, or a
// Content-Length that the body has reached. Checking this lets us stop reading promptly instead of waiting for the
// connection to close (and the request timeout to fire) on a server that ignores "Connection: close".
function responseComplete(raw: Uint8Array) {
  const parsed = parseResponseHead(raw)
  if (!parsed) return false
  if (/^chunked$/i.test(parsed.headers.get('transfer-encoding') || '')) {
    // "\r\n0\r\n\r\n" (or a leading "0\r\n\r\n" for an empty body) marks the end of the chunks.
    return containsSequence(parsed.body, [13, 10, 48, 13, 10, 13, 10]) ||
      (parsed.body.length >= 5 && parsed.body[0] === 48 && parsed.body[1] === 13 && parsed.body[2] === 10 &&
        parsed.body[3] === 13 && parsed.body[4] === 10)
  }
  const declared = Number(parsed.headers.get('content-length') ?? '')
  if (Number.isFinite(declared)) return parsed.body.length >= declared
  return false
}

function decodeChunked(bytes: Uint8Array) {
  const out: Uint8Array[] = []
  let i = 0
  let total = 0
  while (i < bytes.length) {
    let j = i
    while (j + 1 < bytes.length && !(bytes[j] === 13 && bytes[j + 1] === 10)) j += 1
    const size = parseInt(new TextDecoder('latin1').decode(bytes.subarray(i, j)).split(';')[0].trim(), 16)
    if (!Number.isFinite(size) || size < 0) throw new Error('Malformed calendar response')
    if (size === 0) break
    const start = j + 2
    const end = start + size
    if (end > bytes.length) throw new Error('Malformed calendar response')
    out.push(bytes.subarray(start, end))
    total += size
    if (total > MAX_FEED_BYTES) throw new Error('Calendar feed is too large')
    i = end + 2
  }
  const joined = new Uint8Array(total)
  let offset = 0
  for (const part of out) { joined.set(part, offset); offset += part.byteLength }
  return joined
}

function decodeResponseBody(parsed: { status: number; headers: Headers; body: Uint8Array }) {
  let body: Uint8Array
  if (/^chunked$/i.test(parsed.headers.get('transfer-encoding') || '')) {
    body = decodeChunked(parsed.body)
  } else {
    const declared = Number(parsed.headers.get('content-length') ?? '')
    if (Number.isFinite(declared) && declared > MAX_FEED_BYTES) throw new Error('Calendar feed is too large')
    body = Number.isFinite(declared) && declared >= 0 ? parsed.body.subarray(0, declared) : parsed.body
  }
  if (body.byteLength > MAX_FEED_BYTES) throw new Error('Calendar feed is too large')
  return new TextDecoder().decode(body)
}

// HTTPS GET pinned to a validated IP. The TCP connection targets that IP directly (no second name resolution), while
// TLS SNI and certificate verification use the original hostname via Deno.startTls({ hostname }), so a valid
// certificate is still required and the host can never be rebound to a private address between check and connect.
async function pinnedHttpsGet(url: URL, pin: { host: string; ip: string }, timeoutMs: number) {
  const tcp = await Deno.connect({ hostname: pin.ip, port: Number(url.port || '443') })
  let conn: Deno.TlsConn
  try {
    conn = await Deno.startTls(tcp, { hostname: pin.host, alpnProtocols: ['http/1.1'] })
  } catch (err) {
    try { tcp.close() } catch { /* already closed */ }
    throw err
  }
  let timedOut = false
  const timer = setTimeout(() => { timedOut = true; try { conn.close() } catch { /* already closed */ } }, timeoutMs)
  try {
    const path = (url.pathname || '/') + (url.search || '')
    const request =
      `GET ${path} HTTP/1.1\r\n` +
      `Host: ${url.host}\r\n` +
      `User-Agent: Planly-Calendar/1.1\r\n` +
      `Accept: text/calendar,text/plain;q=0.9,*/*;q=0.1\r\n` +
      `Accept-Encoding: identity\r\n` +
      `Connection: close\r\n\r\n`
    const toSend = new TextEncoder().encode(request)
    for (let sent = 0; sent < toSend.length;) sent += await conn.write(toSend.subarray(sent))
    const RAW_CAP = MAX_FEED_BYTES + 65_536
    let raw = new Uint8Array(0)
    const buf = new Uint8Array(16_384)
    while (true) {
      const n = await conn.read(buf)
      if (n === null) break
      if (n > 0) {
        const next = new Uint8Array(raw.length + n)
        next.set(raw)
        next.set(buf.subarray(0, n), raw.length)
        raw = next
        if (raw.length > RAW_CAP) throw new Error('Calendar feed is too large')
        if (responseComplete(raw)) break
      }
    }
    const parsed = parseResponseHead(raw)
    if (!parsed) throw new Error('Malformed calendar response')
    return { status: parsed.status, ok: parsed.status >= 200 && parsed.status < 300, headers: parsed.headers, parsed }
  } catch (err) {
    if (timedOut) throw new Error('Calendar feed timed out')
    throw err
  } finally {
    clearTimeout(timer)
    try { conn.close() } catch { /* already closed */ }
  }
}

async function fetchCalendarFeed(input: string | URL) {
  let url = input instanceof URL ? new URL(input.toString()) : new URL(String(input))
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    // Re-validate and re-pin on every hop, so a redirect cannot aim the next request at a private address.
    const pin = await resolvePinnedIp(url)
    const res = await pinnedHttpsGet(url, pin, FEED_TIMEOUT_MS)
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const location = res.headers.get('location')
      if (!location || redirect === MAX_REDIRECTS) throw new Error('Unsafe calendar redirect')
      url = new URL(location, url)
      continue
    }
    return { response: { ok: res.ok, status: res.status }, text: decodeResponseBody(res.parsed), finalUrl: url }
  }
  throw new Error('Too many calendar redirects')
}

function unfold(value: string) {
  return value.replace(/\r?\n[ \t]/g, '')
}

function unescapeIcs(value: string) {
  return value
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
}

function property(block: string, name: string) {
  const match = block.match(new RegExp('^' + name + '(?:;[^:]*)?:(.*)$', 'mi'))
  return match ? unescapeIcs(match[1].trim()) : ''
}

function rawProperty(block: string, name: string) {
  const match = block.match(new RegExp('^' + name + '([^:]*)?:(.*)$', 'mi'))
  return match ? { params: match[1] || '', value: match[2].trim() } : null
}

function isDateOnly(value: string) {
  return /^\d{8}$/.test(value)
}

type IcsDateParts = {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

function parseIcsParts(value: string): IcsDateParts | null {
  const m = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?)?(Z)?$/)
  if (!m) return null

  return {
    year: Number(m[1]),
    month: Number(m[2]),
    day: Number(m[3]),
    hour: Number(m[4] || 0),
    minute: Number(m[5] || 0),
    second: Number(m[6] || 0),
  }
}

function dateKey(parts: IcsDateParts) {
  return [
    String(parts.year).padStart(4, '0'),
    String(parts.month).padStart(2, '0'),
    String(parts.day).padStart(2, '0'),
  ].join('-')
}

function parameterValue(params: string, name: string) {
  const match = params.match(new RegExp('(?:^|;)' + name + '=([^;:]*)', 'i'))
  return match ? match[1].replace(/^"|"$/g, '').trim() : ''
}

function validTimeZone(value: string) {
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: value }).format(new Date())
    return true
  } catch {
    return false
  }
}

function partsInTimeZone(date: Date, timeZone: string): IcsDateParts {
  const values: Record<string, string> = {}

  new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date).forEach((part) => {
    if (part.type !== 'literal') values[part.type] = part.value
  })

  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
  }
}

function zonedLocalToUtc(parts: IcsDateParts, timeZone: string) {
  const wanted = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  )

  let guess = wanted

  for (let i = 0; i < 4; i += 1) {
    const seen = partsInTimeZone(new Date(guess), timeZone)
    const seenAsUtc = Date.UTC(
      seen.year,
      seen.month - 1,
      seen.day,
      seen.hour,
      seen.minute,
      seen.second,
    )
    const delta = wanted - seenAsUtc
    guess += delta
    if (delta === 0) break
  }

  return new Date(guess).toISOString()
}

function dateKeyInTimeZone(iso: string, timeZone: string) {
  return dateKey(partsInTimeZone(new Date(iso), timeZone))
}

function calendarTimeZone(text: string) {
  const raw = property(text, 'X-WR-TIMEZONE').trim()
  return raw && validTimeZone(raw) ? raw : 'Europe/London'
}

function parseIcsDate(value: string, params = '', defaultTimeZone = 'Europe/London') {
  const parts = parseIcsParts(value)
  if (!parts) return null

  if (isDateOnly(value)) {
    return {
      iso: dateKey(parts),
      localDate: dateKey(parts),
      allDay: true,
    }
  }

  const explicitTz = parameterValue(params, 'TZID')
  const timeZone = explicitTz && validTimeZone(explicitTz)
    ? explicitTz
    : defaultTimeZone

  if (value.endsWith('Z')) {
    const iso = new Date(Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    )).toISOString()

    return {
      iso,
      localDate: dateKeyInTimeZone(iso, timeZone),
      allDay: false,
    }
  }

  const iso = zonedLocalToUtc(parts, timeZone)

  return {
    iso,
    localDate: dateKey(parts),
    allDay: false,
  }
}

function recurrenceDiagnostics(text: string) {
  const clean = unfold(text)
  const tzids = new Set<string>()

  for (const match of clean.matchAll(/;TZID=([^:;\r\n]+)/gi)) {
    const value = String(match[1] || '').replace(/^"|"$/g, '').trim()
    if (value) tzids.add(value)
  }

  return {
    rruleCount: (clean.match(/^RRULE:/gmi) || []).length,
    exdateCount: (clean.match(/^EXDATE(?:;[^:]*)?:/gmi) || []).length,
    recurrenceIdCount: (clean.match(/^RECURRENCE-ID(?:;[^:]*)?:/gmi) || []).length,
    cancelledCount: (clean.match(/^STATUS:CANCELLED$/gmi) || []).length,
    timeZones: [...tzids],
  }
}

function parseEvents(text: string) {
  const clean = unfold(text)
  const out: Record<string, unknown>[] = []
  const defaultTimeZone = calendarTimeZone(clean)

  for (const block of clean.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/gi) || []) {
    if (/^STATUS:CANCELLED$/mi.test(block)) continue

    const uid = property(block, 'UID')
    const recurrenceId = rawProperty(block, 'RECURRENCE-ID')
    const externalUid = recurrenceId?.value
      ? uid + '::' + recurrenceId.value
      : uid

    const sr = rawProperty(block, 'DTSTART')
    if (!uid || !sr) continue

    const er = rawProperty(block, 'DTEND')
    const s = parseIcsDate(sr.value, sr.params, defaultTimeZone)
    const e = er ? parseIcsDate(er.value, er.params, defaultTimeZone) : null
    if (!s) continue

    const allDay = s.allDay

    out.push({
      external_uid: externalUid,
      title: property(block, 'SUMMARY') || 'Busy',
      description: property(block, 'DESCRIPTION') || null,
      location: property(block, 'LOCATION') || null,
      starts_at: allDay ? null : s.iso,
      ends_at: allDay ? null : (e?.iso || s.iso),
      is_all_day: allDay,
      start_date: s.localDate,
      end_date: e?.localDate || s.localDate,
      source_updated_at: new Date().toISOString(),
    })
  }

  return out
}

async function refreshSource(sourceId: string, userId: string, auth: string) {
  const srcRes = await callerFetch(
    '/rest/v1/calendar_sources?id=eq.' + encodeURIComponent(sourceId) +
      '&owner_id=eq.' + encodeURIComponent(userId) +
      '&select=id,name,enabled',
    auth,
  )
  const sources = await srcRes.json().catch(() => [])
  if (!srcRes.ok || !sources[0]) return json({ error: 'Calendar source not found.' }, 404)
  if (!sources[0].enabled) return json({ error: 'Calendar source is disabled.' }, 400)

  const credRes = await serviceFetch('/rest/v1/rpc/get_calendar_source_feed_url', {
    method: 'POST',
    body: JSON.stringify({ p_source_id: sourceId, p_owner_id: userId }),
  })
  const feedUrl = await credRes.json().catch(() => null)
  if (!credRes.ok || !feedUrl) return json({ error: 'Calendar credential unavailable.' }, 500)

  let feed: Response
  let ics: string
  try {
    const result = await fetchCalendarFeed(String(feedUrl))
    feed = result.response
    ics = result.text
  } catch {
    return json({ error: 'Calendar feed could not be reached safely.' }, 502)
  }

  if (!feed.ok) return json({ error: 'Calendar feed could not be opened.' }, 502)
  if (!/BEGIN:VCALENDAR/i.test(ics) || !/END:VCALENDAR/i.test(ics)) {
    return json({ error: 'Calendar feed is invalid.' }, 502)
  }

  const rawEventCount = (unfold(ics).match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/gi) || []).length
  const recurrence = recurrenceDiagnostics(ics)

  // Do not silently import an incomplete recurring calendar. The existing
  // cached rota remains intact because replacement is atomic and happens later.
  if (recurrence.rruleCount > 0) {
    return json({
      error: 'Recurring calendar rules were detected and need explicit expansion before this refresh can safely replace the cached rota.',
      code: 'ICAL_RRULE_REQUIRES_EXPANSION',
      diagnostics: recurrence,
    }, 422)
  }

  const events = parseEvents(ics)

  if (rawEventCount > 0 && events.length === 0) {
    return json({ error: 'Calendar events were found but could not be parsed safely.' }, 502)
  }

  const replaceRes = await serviceFetch(
    '/rest/v1/rpc/replace_external_calendar_events',
    {
      method: 'POST',
      body: JSON.stringify({
        p_source_id: sourceId,
        p_owner_id: userId,
        p_events: events,
      }),
    },
  )

  const replacedCount = await replaceRes.json().catch(() => null)
  if (!replaceRes.ok) {
    return json({ error: 'Calendar refresh could not be committed safely.' }, 500)
  }

  return json({
    ok: true,
    sourceId,
    eventCount: Number(replacedCount ?? events.length),
    diagnostics: recurrence,
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const auth = req.headers.get('authorization') || ''
  if (!auth.toLowerCase().startsWith('bearer ')) {
    return json({ error: 'Authentication required.' }, 401)
  }

  const userRes = await fetch(SB + '/auth/v1/user', {
    headers: { apikey: ANON, Authorization: auth },
  })
  if (!userRes.ok) return json({ error: 'Authentication required.' }, 401)

  const user = await userRes.json().catch(() => null)
  const userId = String(user?.id || '')
  if (!userId) return json({ error: 'Authentication required.' }, 401)

  const body = await req.json().catch(() => ({})) as SourceInput

  if (body.action === 'refresh') {
    const sourceId = String(body.sourceId || '').trim()
    if (!sourceId) return json({ error: 'sourceId is required.' }, 400)
    return refreshSource(sourceId, userId, auth)
  }

  const name = String(body.name || '').trim()
  const raw = String(body.feedUrl || '').trim()
  if (!name || !raw) {
    return json({ error: 'Calendar name and iCalendar link are required.' }, 400)
  }

  let url: URL
  try {
    const normalized = raw.replace(/^webcal:/i, 'https:')
    url = new URL(normalized)
    if (url.protocol !== 'https:') throw new Error('HTTPS only')
  } catch {
    return json({ error: 'Enter a valid HTTPS or webcal iCalendar subscription link.' }, 400)
  }

  let feed: Response
  let text: string
  try {
    const result = await fetchCalendarFeed(url)
    feed = result.response
    text = result.text
  } catch {
    return json({ error: 'Planly could not safely reach this calendar feed.' }, 400)
  }

  if (!feed.ok) return json({ error: 'The calendar feed could not be opened.' }, 400)
  if (!/BEGIN:VCALENDAR/i.test(text) || !/END:VCALENDAR/i.test(text)) {
    return json({ error: 'This link did not return an iCalendar feed.' }, 400)
  }

  const createRes = await callerFetch(
    '/rest/v1/calendar_sources?select=id,name,source_type,colour,is_read_only,show_today,show_month,show_timeline,enabled,status,last_synced_at',
    auth,
    {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        owner_id: userId,
        name,
        source_type: 'ical',
        colour: body.colour || '#E78AA7',
        is_read_only: true,
        show_today: body.showToday !== false,
        show_month: body.showMonth !== false,
        show_timeline: body.showTimeline !== false,
        enabled: true,
        status: 'connected',
      }),
    },
  )

  const created = await createRes.json().catch(() => [])
  const source = Array.isArray(created) ? created[0] : null
  if (!createRes.ok || !source) {
    return json({ error: created?.message || 'Could not create calendar source.' }, 400)
  }

  const credentialRes = await callerFetch(
    '/rest/v1/rpc/set_calendar_source_credential',
    auth,
    {
      method: 'POST',
      body: JSON.stringify({
        p_source_id: source.id,
        p_feed_url: url.toString(),
      }),
    },
  )

  if (!credentialRes.ok) {
    await callerFetch(
      '/rest/v1/calendar_sources?id=eq.' + encodeURIComponent(source.id),
      auth,
      { method: 'DELETE', headers: { Prefer: 'return=minimal' } },
    )
    return json({ error: 'Calendar credential could not be stored securely.' }, 500)
  }

  return json({ source })
})
