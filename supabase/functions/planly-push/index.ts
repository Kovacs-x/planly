// planly-push: called every 5 minutes by pg_cron (see migration 050). Not called by the browser.
// 1. Checks the shared cron secret (stored in Supabase Vault).
// 2. Asks the database what is due (planly_push_worklist claims each message once, so nothing is sent twice).
// 3. Sends each message with Web Push (VAPID keys from Vault) and reports the result per phone.
// It never reads calendars and never receives anything from the browser.
import { sendPush } from './webpush.js'

const SB = Deno.env.get('SUPABASE_URL')!
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const SUBJECT = 'https://kovacs-x.github.io/planly/'

function rpc(name: string, args: Record<string, unknown> = {}) {
  return fetch(`${SB}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  })
}

function sameSecret(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  const cfgRes = await rpc('planly_push_config')
  if (!cfgRes.ok) return new Response('Config unavailable', { status: 500 })
  const cfg = await cfgRes.json()
  if (!sameSecret(req.headers.get('x-planly-cron') || '', cfg?.cron_secret || '')) {
    return new Response('Forbidden', { status: 403 })
  }
  if (!cfg.vapid_public || !cfg.vapid_private) return new Response('Push keys missing', { status: 500 })
  const vapid = { publicKey: cfg.vapid_public, privateKey: cfg.vapid_private, subject: SUBJECT }

  const workRes = await rpc('planly_push_worklist')
  if (!workRes.ok) return new Response('Worklist failed', { status: 500 })
  const work = (await workRes.json()) as Array<{ id: string; endpoint: string; p256dh: string; auth: string; messages: Array<Record<string, string>> }>

  let sent = 0, failed = 0
  for (const sub of work) {
    let ok = false, gone = false
    for (const m of sub.messages) {
      const message = {
        title: m.title, body: m.body, tag: m.tag, kind: m.kind, url: './',
        ttl: m.kind === 'task' ? 900 : m.kind === 'summary' ? 7200 : 86400,
        urgency: m.kind === 'task' ? 'high' : 'normal',
      }
      try {
        const r = await sendPush(sub, message, vapid)
        if (r.ok) { ok = true; sent++ } else { failed++; if (r.gone) { gone = true; break } }
      } catch (_) {
        failed++
      }
    }
    await rpc('planly_push_report', { p_subscription_id: sub.id, p_ok: ok, p_gone: gone })
  }
  return new Response(JSON.stringify({ phones: work.length, sent, failed }), { headers: { 'Content-Type': 'application/json' } })
})
