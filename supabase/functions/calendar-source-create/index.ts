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
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

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
      apikey: SERVICE,
      Authorization: `Bearer ${SERVICE}`,
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

async function assertPublicHttpsUrl(url: URL) {
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Unsafe calendar URL')
  if (url.port && url.port !== '443') throw new Error('Unsafe calendar port')
  const host = url.hostname.toLowerCase().replace(/\.$/, '')
  if (!host || host === 'localhost' || host.endsWith('.localhost') ||
      host.endsWith('.local') || host.endsWith('.internal') ||
      host.endsWith('.lan') || blockedIp(host)) {
    throw new Error('Private calendar destination')
  }
  if (/^[\d.]+$/.test(host) || host.includes(':')) return
  const results = await Promise.allSettled([
    Deno.resolveDns(host, 'A'),
    Deno.resolveDns(host, 'AAAA'),
  ])
  const addresses = results.flatMap((r) => r.status === 'fulfilled' ? r.value : [])
  if (!addresses.length || addresses.some((ip) => blockedIp(ip))) {
    throw new Error('Calendar destination is not public')
  }
}

async function readLimitedText(response: Response) {
  const declared = Number(response.headers.get('content-length') || 0)
  if (declared > MAX_FEED_BYTES) throw new Error('Calendar feed is too large')
  if (!response.body) return ''
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (!value) continue
    total += value.byteLength
    if (total > MAX_FEED_BYTES) {
      await reader.cancel()
      throw new Error('Calendar feed is too large')
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(bytes)
}

async function fetchCalendarFeed(input: string | URL) {
  let url = input instanceof URL ? new URL(input.toString()) : new URL(String(input))
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    await assertPublicHttpsUrl(url)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), FEED_TIMEOUT_MS)
    let response: Response
    try {
      response = await fetch(url, {
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          Accept: 'text/calendar,text/plain;q=0.9,*/*;q=0.1',
          'User-Agent': 'Planly-Calendar/1.1',
        },
      })
    } finally {
      clearTimeout(timer)
    }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location')
      if (!location || redirect === MAX_REDIRECTS) throw new Error('Unsafe calendar redirect')
      url = new URL(location, url)
      continue
    }
    return { response, text: await readLimitedText(response), finalUrl: url }
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
