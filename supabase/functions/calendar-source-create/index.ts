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

// IPv6 written as its eight 16-bit groups, so mapped/compatible IPv4 in hex form (::ffff:7f00:1) is caught too.
function ipv6Groups(h: string): number[] | null {
  let x = h
  const v4 = x.match(/(\d+\.\d+\.\d+\.\d+)$/)
  if (v4) {
    const p = v4[1].split('.').map(Number)
    if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null
    x = x.slice(0, -v4[1].length) + ((p[0] << 8) | p[1]).toString(16) + ':' + ((p[2] << 8) | p[3]).toString(16)
  }
  const halves = x.split('::')
  if (halves.length > 2) return null
  const head = halves[0] ? halves[0].split(':') : [], tail = halves.length === 2 && halves[1] ? halves[1].split(':') : []
  const fill = halves.length === 2 ? 8 - head.length - tail.length : 0
  if (fill < 0 || (halves.length === 1 && head.length !== 8)) return null
  const groups = [...head, ...Array(fill).fill('0'), ...tail].map((g) => /^[0-9a-f]{1,4}$/.test(g) ? parseInt(g, 16) : NaN)
  return groups.length === 8 && groups.every((g) => !Number.isNaN(g)) ? groups : null
}

function blockedIp(host: string) {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '')
  if (blockedIpv4(h)) return true
  if (!h.includes(':')) return false
  const g = ipv6Groups(h)
  if (!g) return true // not a valid address: refuse rather than guess
  if (g.every((x) => x === 0) || (g.slice(0, 7).every((x) => x === 0) && g[7] === 1)) return true // :: and ::1
  if ((g[0] & 0xfe00) === 0xfc00) return true // fc00::/7 unique local
  if ((g[0] & 0xffc0) === 0xfe80) return true // fe80::/10 link local
  if ((g[0] & 0xff00) === 0xff00) return true // ff00::/8 multicast
  const v4 = (hi: number, lo: number) => `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`
  if (g.slice(0, 5).every((x) => x === 0) && (g[5] === 0xffff || g[5] === 0)) return blockedIpv4(v4(g[6], g[7])) // ::ffff:a.b.c.d and ::a.b.c.d
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)) return blockedIpv4(v4(g[6], g[7])) // NAT64 64:ff9b::/96
  if (g[0] === 0x2002) return blockedIpv4(v4(g[1], g[2])) // 6to4 2002::/16
  return false
}

// DNS-rebinding safe: the host is resolved ONCE here, every address is checked, and the request is then made to one of
// these exact addresses (pinnedGet), so a second lookup can never swap in a private address.
export async function publicAddresses(url: URL): Promise<string[]> {
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Unsafe calendar URL')
  if (url.port && url.port !== '443') throw new Error('Unsafe calendar port')
  const host = url.hostname.toLowerCase().replace(/\.$/, '').replace(/^\[|\]$/g, '')
  if (!host || host === 'localhost' || host.endsWith('.localhost') ||
      host.endsWith('.local') || host.endsWith('.internal') ||
      host.endsWith('.lan') || blockedIp(host)) {
    throw new Error('Private calendar destination')
  }
  if (/^[\d.]+$/.test(host) || host.includes(':')) return [host]
  const results = await Promise.allSettled([
    Deno.resolveDns(host, 'A'),
    Deno.resolveDns(host, 'AAAA'),
  ])
  const addresses = results.flatMap((r) => r.status === 'fulfilled' ? r.value : [])
  if (!addresses.length || addresses.some((ip) => blockedIp(ip))) {
    throw new Error('Calendar destination is not public')
  }
  return addresses
}

const HEADER_MAX = 32_768
const encoder = new TextEncoder()

function indexOfCrlfCrlf(b: Uint8Array) {
  for (let i = 0; i + 3 < b.length; i += 1) if (b[i] === 13 && b[i + 1] === 10 && b[i + 2] === 13 && b[i + 3] === 10) return i
  return -1
}

function dechunk(b: Uint8Array, maxBytes: number) {
  const out: Uint8Array[] = []
  let i = 0, total = 0
  while (true) {
    let j = i
    while (j + 1 < b.length && !(b[j] === 13 && b[j + 1] === 10)) j += 1
    if (j + 1 >= b.length) throw new Error('Calendar feed was cut short')
    const size = parseInt(new TextDecoder().decode(b.subarray(i, j)).split(';')[0].trim(), 16)
    if (!Number.isFinite(size) || size < 0) throw new Error('Calendar feed is malformed')
    i = j + 2
    if (size === 0) break
    if (i + size > b.length) throw new Error('Calendar feed was cut short')
    total += size
    if (total > maxBytes) throw new Error('Calendar feed is too large')
    out.push(b.subarray(i, i + size))
    i += size + 2
  }
  const all = new Uint8Array(total)
  let o = 0
  for (const c of out) { all.set(c, o); o += c.byteLength }
  return all
}

// One GET over a TCP connection to the validated address, with TLS for the original host name (so the certificate is
// still checked against it) and the original Host header. HTTP/1.1, Connection: close, identity encoding, bounded size.
export async function pinnedGet(
  url: URL,
  ip: string,
  opts: { port?: number; caCerts?: string[]; timeoutMs?: number; maxBytes?: number } = {},
): Promise<{ status: number; headers: Headers; body: Uint8Array }> {
  const maxBytes = opts.maxBytes ?? MAX_FEED_BYTES
  const tcp = await Deno.connect({ hostname: ip, port: opts.port ?? 443 })
  let conn: Deno.Conn = tcp
  let timedOut = false
  const timer = setTimeout(() => { timedOut = true; try { conn.close() } catch { /* closed */ } }, opts.timeoutMs ?? FEED_TIMEOUT_MS)
  try {
    conn = await Deno.startTls(tcp, { hostname: url.hostname.replace(/^\[|\]$/g, ''), caCerts: opts.caCerts })
    const request = encoder.encode(
      `GET ${url.pathname || '/'}${url.search} HTTP/1.1\r\nHost: ${url.host}\r\n` +
      'Accept: text/calendar,text/plain;q=0.9,*/*;q=0.1\r\nAccept-Encoding: identity\r\n' +
      'User-Agent: Planly-Calendar/1.2\r\nConnection: close\r\n\r\n',
    )
    for (let sent = 0; sent < request.length;) sent += await conn.write(request.subarray(sent))
    const cap = HEADER_MAX + maxBytes + 65_536
    const chunks: Uint8Array[] = []
    let total = 0
    const buf = new Uint8Array(32_768)
    while (true) {
      const n = await conn.read(buf)
      if (n === null) break
      total += n
      if (total > cap) throw new Error('Calendar feed is too large')
      chunks.push(buf.slice(0, n))
    }
    const raw = new Uint8Array(total)
    let o = 0
    for (const c of chunks) { raw.set(c, o); o += c.byteLength }
    const end = indexOfCrlfCrlf(raw)
    if (end < 0 || end > HEADER_MAX) throw new Error('Calendar server sent no valid response')
    const lines = new TextDecoder().decode(raw.subarray(0, end)).split('\r\n')
    const statusMatch = lines[0].match(/^HTTP\/1\.[01] (\d{3})/)
    if (!statusMatch) throw new Error('Calendar server sent no valid response')
    const headers = new Headers()
    for (const line of lines.slice(1)) {
      const k = line.indexOf(':')
      if (k > 0) headers.append(line.slice(0, k).trim(), line.slice(k + 1).trim())
    }
    let body = raw.subarray(end + 4)
    if (/\bchunked\b/i.test(headers.get('transfer-encoding') || '')) body = dechunk(body, maxBytes)
    else if (headers.has('content-length')) {
      const len = Number(headers.get('content-length'))
      if (!Number.isFinite(len) || len < 0 || len > maxBytes) throw new Error('Calendar feed is too large')
      if (body.length < len) throw new Error('Calendar feed was cut short')
      body = body.subarray(0, len)
    }
    if (body.length > maxBytes) throw new Error('Calendar feed is too large')
    return { status: Number(statusMatch[1]), headers, body }
  } catch (err) {
    if (timedOut) throw new Error('Calendar feed timed out')
    throw err
  } finally {
    clearTimeout(timer)
    try { conn.close() } catch { /* closed */ }
  }
}

export async function fetchCalendarFeed(input: string | URL) {
  let url = input instanceof URL ? new URL(input.toString()) : new URL(String(input))
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    const addresses = await publicAddresses(url)
    let result: { status: number; headers: Headers; body: Uint8Array } | null = null
    let lastError: unknown = null
    for (const ip of addresses) {
      try { result = await pinnedGet(url, ip); break } catch (err) { lastError = err }
    }
    if (!result) throw lastError instanceof Error ? lastError : new Error('Calendar feed could not be reached')
    if ([301, 302, 303, 307, 308].includes(result.status)) {
      const location = result.headers.get('location')
      if (!location || redirect === MAX_REDIRECTS) throw new Error('Unsafe calendar redirect')
      url = new URL(location, url)
      continue
    }
    const response = new Response(null, { status: result.status, headers: result.headers })
    return { response, text: new TextDecoder().decode(result.body), finalUrl: url }
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
