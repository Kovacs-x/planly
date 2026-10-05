// Minimal Web Push sender (RFC 8291 aes128gcm payload encryption + RFC 8292 VAPID), using only WebCrypto.
// Shared by the planly-push Edge Function (Deno) and its Node test.

const enc = new TextEncoder()

export function b64urlToBytes(s) {
  const pad = '='.repeat((4 - (s.length % 4)) % 4)
  const bin = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

export function bytesToB64url(bytes) {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function concat(...parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let i = 0
  for (const p of parts) { out.set(p, i); i += p.length }
  return out
}

async function hkdf(salt, ikm, info, bits) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits'])
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, bits))
}

// Encrypts `payload` (string) for one subscription. Returns the request body bytes.
export async function encryptPayload(payload, p256dhB64, authB64) {
  const uaPublic = b64urlToBytes(p256dhB64)
  const authSecret = b64urlToBytes(authB64)
  if (uaPublic.length !== 65 || authSecret.length !== 16) throw new Error('Bad subscription keys')
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const as = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', as.publicKey))
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, as.privateKey, 256))
  const ikm = await hkdf(authSecret, ecdh, concat(enc.encode('WebPush: info\0'), uaPublic, asPublic), 256)
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 128)
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 96)
  const plain = concat(enc.encode(payload), new Uint8Array([2]))
  const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt'])
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aes, plain))
  const rs = new Uint8Array([0, 0, 16, 0]) // 4096
  return concat(salt, rs, new Uint8Array([65]), asPublic, cipher)
}

// VAPID: vapidPrivate is a P-256 JWK JSON string {kty,crv,x,y,d}; vapidPublic is the raw key, base64url.
export async function vapidAuthorization(endpoint, vapidPublic, vapidPrivate, subject) {
  const jwk = typeof vapidPrivate === 'string' ? JSON.parse(vapidPrivate) : vapidPrivate
  const key = await crypto.subtle.importKey('jwk', { ...jwk, ext: true }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
  const header = bytesToB64url(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const claims = bytesToB64url(enc.encode(JSON.stringify({
    aud: new URL(endpoint).origin,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: subject,
  })))
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(header + '.' + claims)))
  return `vapid t=${header}.${claims}.${bytesToB64url(sig)}, k=${vapidPublic}`
}

// Sends one message. Returns { ok, gone, status }.
export async function sendPush(sub, message, vapid, fetchImpl = fetch) {
  const body = await encryptPayload(JSON.stringify(message), sub.p256dh, sub.auth)
  const res = await fetchImpl(sub.endpoint, {
    method: 'POST',
    headers: {
      Authorization: await vapidAuthorization(sub.endpoint, vapid.publicKey, vapid.privateKey, vapid.subject),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(message.ttl || 3600),
      Urgency: message.urgency || 'normal',
    },
    body,
  })
  return { ok: res.status >= 200 && res.status < 300, gone: res.status === 404 || res.status === 410, status: res.status }
}
