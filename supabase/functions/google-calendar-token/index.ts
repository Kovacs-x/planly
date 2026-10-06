// google-calendar-token: keeps Google Calendar connected without reconnecting every hour.
// Called by the browser with the person's Supabase session. The user id always comes from that verified
// session, never from the request body. The Google refresh token never leaves the server: the browser only
// ever receives short-lived (one-hour) access tokens.
//   exchange   { code }  one-time code from Google's sign-in popup -> stores the refresh token, returns an access token
//   token                 returns a fresh access token, or { linked: false } when this person has not connected
//   disconnect            revokes the refresh token at Google and deletes it
// GOOGLE_CLIENT_SECRET is an Edge Function secret (Supabase dashboard), never in the repo or browser code.

const cors = {
  'Access-Control-Allow-Origin': 'https://kovacs-x.github.io',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}

const SB = Deno.env.get('SUPABASE_URL')!
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const CLIENT_ID = '171071129565-49nuqh2l2i83ftg8gnu8evsfq3qh48r8.apps.googleusercontent.com'
const SCOPE = 'https://www.googleapis.com/auth/calendar.events.owned'
const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token'

function rpc(name: string, args: Record<string, unknown>) {
  return fetch(`${SB}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  })
}

async function google(params: Record<string, string>) {
  const secret = Deno.env.get('GOOGLE_CLIENT_SECRET') || ''
  if (!secret) return { ok: false, status: 500, data: { error: 'not_configured' } }
  const res = await fetch(GOOGLE_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ ...params, client_id: CLIENT_ID, client_secret: secret }),
  })
  const data = await res.json().catch(() => ({}))
  return { ok: res.ok, status: res.status, data }
}

const grantsCalendar = (scope: unknown) => String(scope || '').split(/\s+/).includes(SCOPE)
const access = (d: Record<string, unknown>) =>
  ({ linked: true, accessToken: String(d.access_token || ''), expiresIn: Math.max(60, Number(d.expires_in) || 3600) })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const auth = req.headers.get('authorization') || ''
  if (!auth.toLowerCase().startsWith('bearer ')) return json({ error: 'Authentication required.' }, 401)
  const userRes = await fetch(SB + '/auth/v1/user', { headers: { apikey: ANON, Authorization: auth } })
  if (!userRes.ok) return json({ error: 'Authentication required.' }, 401)
  const userId = String((await userRes.json().catch(() => null))?.id || '')
  if (!userId) return json({ error: 'Authentication required.' }, 401)

  const body = await req.json().catch(() => ({})) as { action?: string; code?: string }

  if (body.action === 'exchange') {
    const code = String(body.code || '')
    if (!code || code.length > 2048) return json({ error: 'Missing sign-in code.' }, 400)
    const r = await google({ code, grant_type: 'authorization_code', redirect_uri: 'postmessage' })
    if (r.data?.error === 'not_configured') return json({ error: 'Google Calendar is not set up on the server yet.' }, 503)
    if (!r.ok || !r.data?.access_token) return json({ error: 'Google did not accept the sign-in. Try connecting again.' }, 400)
    if (!grantsCalendar(r.data.scope)) return json({ error: 'Calendar access was not allowed. Tick the calendar box when connecting.' }, 400)
    let stays = false
    if (r.data.refresh_token) {
      const saved = await rpc('planly_google_token_save', { p_user: userId, p_refresh_token: String(r.data.refresh_token), p_scope: String(r.data.scope || '') })
      if (!saved.ok) return json({ error: 'Could not save the connection.' }, 500)
      stays = true
    } else {
      // Google only sends a refresh token on a fresh approval; an earlier one may already be stored.
      const got = await rpc('planly_google_token_get', { p_user: userId })
      stays = got.ok && !!(await got.json().catch(() => null))
    }
    return json({ ...access(r.data), stays })
  }

  if (body.action === 'token') {
    const got = await rpc('planly_google_token_get', { p_user: userId })
    if (!got.ok) return json({ error: 'Could not read the connection.' }, 500)
    const refresh = await got.json().catch(() => null)
    if (!refresh) return json({ linked: false })
    const r = await google({ refresh_token: String(refresh), grant_type: 'refresh_token' })
    if (r.data?.error === 'not_configured') return json({ error: 'Google Calendar is not set up on the server yet.' }, 503)
    if (r.data?.error === 'invalid_grant') {
      // Revoked at Google, password change, or expired: forget it so the app asks to reconnect.
      await rpc('planly_google_token_delete', { p_user: userId })
      return json({ linked: false, reconnect: true })
    }
    if (!r.ok || !r.data?.access_token) return json({ error: 'Google is not responding. Try again shortly.' }, 502)
    return json(access(r.data))
  }

  if (body.action === 'disconnect') {
    const got = await rpc('planly_google_token_get', { p_user: userId })
    const refresh = got.ok ? await got.json().catch(() => null) : null
    if (refresh) {
      await fetch('https://oauth2.googleapis.com/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token: String(refresh) }),
      }).catch(() => null)
    }
    const del = await rpc('planly_google_token_delete', { p_user: userId })
    if (!del.ok) return json({ error: 'Could not remove the connection.' }, 500)
    return json({ linked: false })
  }

  return json({ error: 'Unknown action.' }, 400)
})
