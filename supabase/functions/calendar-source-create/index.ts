import { withSupabase } from 'npm:@supabase/server'

type SourceInput = {
  name?: string
  feedUrl?: string
  colour?: string
  showToday?: boolean
  showMonth?: boolean
  showTimeline?: boolean
}

const cors = {
  'Access-Control-Allow-Origin': 'https://kovacs-x.github.io',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}

export default {
  fetch: withSupabase({ auth: 'user' }, async (req, ctx) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

    const body = await req.json().catch(() => ({})) as SourceInput
    const name = String(body.name || '').trim()
    const raw = String(body.feedUrl || '').trim()
    if (!name || !raw) return json({ error: 'Calendar name and iCalendar link are required.' }, 400)

    let url: URL
    try {
      const normalized = raw.replace(/^webcal:/i, 'https:')
      url = new URL(normalized)
      if (url.protocol !== 'https:') throw new Error('HTTPS only')
    } catch {
      return json({ error: 'Enter a valid HTTPS or webcal iCalendar subscription link.' }, 400)
    }

    // Validate before storing. Do not return the private URL or response body.
    let feed: Response
    try {
      feed = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': 'Planly-Calendar/1.0', 'Accept': 'text/calendar,text/plain;q=0.9,*/*;q=0.1' } })
    } catch {
      return json({ error: 'Planly could not reach this calendar feed.' }, 400)
    }
    if (!feed.ok) return json({ error: 'The calendar feed could not be opened.' }, 400)
    const text = await feed.text()
    if (!/BEGIN:VCALENDAR/i.test(text) || !/END:VCALENDAR/i.test(text)) return json({ error: 'This link did not return an iCalendar feed.' }, 400)

    const userId = ctx.userClaims?.sub
    if (!userId) return json({ error: 'Authentication required.' }, 401)

    const { data: source, error: sourceError } = await ctx.supabase
      .from('calendar_sources')
      .insert({
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
      })
      .select('id,name,source_type,colour,is_read_only,show_today,show_month,show_timeline,enabled,status,last_synced_at')
      .single()

    if (sourceError || !source) return json({ error: sourceError?.message || 'Could not create calendar source.' }, 400)

    const { error: credentialError } = await ctx.supabase.rpc('set_calendar_source_credential', {
      p_source_id: source.id,
      p_feed_url: url.toString(),
    })

    if (credentialError) {
      await ctx.supabase.from('calendar_sources').delete().eq('id', source.id)
      return json({ error: 'Calendar credential could not be stored securely.' }, 500)
    }

    return json({ source })
  }),
}
