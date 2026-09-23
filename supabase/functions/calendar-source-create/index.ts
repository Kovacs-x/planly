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

function parseIcsDate(value: string) {
  if (isDateOnly(value)) {
    return {
      iso: value.slice(0, 4) + '-' + value.slice(4, 6) + '-' + value.slice(6, 8),
      allDay: true,
    }
  }

  const m = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/)
  if (!m) return null

  return {
    iso: `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6] || '00'}${m[7] ? 'Z' : ''}`,
    allDay: false,
  }
}

function parseEvents(text: string) {
  const clean = unfold(text)
  const out: Record<string, unknown>[] = []

  for (const block of clean.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/gi) || []) {
    if (/^STATUS:CANCELLED$/mi.test(block)) continue

    const uid = property(block, 'UID')
    const sr = rawProperty(block, 'DTSTART')
    if (!uid || !sr) continue

    const er = rawProperty(block, 'DTEND')
    const s = parseIcsDate(sr.value)
    const e = er ? parseIcsDate(er.value) : null
    if (!s) continue

    const allDay = s.allDay
    let startsAt: string | null = null
    let endsAt: string | null = null
    let startDate: string | null = null
    let endDate: string | null = null

    if (allDay) {
      startDate = s.iso
      endDate = e?.iso || s.iso
    } else {
      startsAt = s.iso
      endsAt = e?.iso || s.iso
      startDate = s.iso.slice(0, 10)
      endDate = (e?.iso || s.iso).slice(0, 10)
    }

    out.push({
      external_uid: uid,
      title: property(block, 'SUMMARY') || 'Busy',
      description: property(block, 'DESCRIPTION') || null,
      location: property(block, 'LOCATION') || null,
      starts_at: startsAt,
      ends_at: endsAt,
      is_all_day: allDay,
      start_date: startDate,
      end_date: endDate,
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
  try {
    feed = await fetch(String(feedUrl), {
      redirect: 'follow',
      headers: {
        Accept: 'text/calendar,text/plain;q=0.9,*/*;q=0.1',
        'User-Agent': 'Planly-Calendar/1.0',
      },
    })
  } catch {
    return json({ error: 'Calendar feed could not be reached.' }, 502)
  }

  if (!feed.ok) return json({ error: 'Calendar feed could not be opened.' }, 502)

  const ics = await feed.text()
  if (!/BEGIN:VCALENDAR/i.test(ics) || !/END:VCALENDAR/i.test(ics)) {
    return json({ error: 'Calendar feed is invalid.' }, 502)
  }

  const events = parseEvents(ics).map((event) => ({
    ...event,
    source_id: sourceId,
    owner_id: userId,
  }))

  // First-pass 3.1 importer. Atomic replacement/TZID/RRULE hardening remains a pre-production gate.
  const deleteRes = await serviceFetch(
    '/rest/v1/external_calendar_events?source_id=eq.' + encodeURIComponent(sourceId),
    { method: 'DELETE', headers: { Prefer: 'return=minimal' } },
  )
  if (!deleteRes.ok) {
    return json({ error: 'Could not replace previous calendar events.' }, 500)
  }

  if (events.length) {
    const insertRes = await serviceFetch(
      '/rest/v1/external_calendar_events?on_conflict=source_id,external_uid',
      {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(events),
      },
    )
    if (!insertRes.ok) return json({ error: 'Calendar events could not be saved.' }, 500)
  }

  const updateRes = await serviceFetch(
    '/rest/v1/calendar_sources?id=eq.' + encodeURIComponent(sourceId),
    {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        status: 'connected',
        error: null,
        last_synced_at: new Date().toISOString(),
      }),
    },
  )
  if (!updateRes.ok) return json({ error: 'Calendar source status could not be updated.' }, 500)

  return json({ ok: true, sourceId, eventCount: events.length })
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
  try {
    feed = await fetch(url, {
      redirect: 'follow',
      headers: {
        'User-Agent': 'Planly-Calendar/1.0',
        Accept: 'text/calendar,text/plain;q=0.9,*/*;q=0.1',
      },
    })
  } catch {
    return json({ error: 'Planly could not reach this calendar feed.' }, 400)
  }

  if (!feed.ok) return json({ error: 'The calendar feed could not be opened.' }, 400)

  const text = await feed.text()
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
