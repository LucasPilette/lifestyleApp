// Fonction Edge Supabase « push » : envoie les notifications Web Push (iPhone, Android, ordinateur).
//
// Appelée par l'app avec le jeton de l'utilisateur : POST { event, to? }
//   event = 'vapid'          -> renvoie la clé publique VAPID (pour abonner l'appareil)
//           'message' | 'friend_request' | 'friend_accept' (to = id de l'ami)
//           'mood' | 'perfect' (à tous les amis, si l'utilisateur partage son activité)
// Le serveur décide seul des destinataires et du texte (fonction SQL push_targets) : l'app ne peut
// notifier que ses amis, une seule fois par événement.
// Les clés VAPID sont créées au premier appel et gardées dans la base : aucun secret à configurer.
//
// Sans dépendance : chiffrement aes128gcm (RFC 8291) et signature VAPID (RFC 8292) en WebCrypto.
// Écrit en JavaScript (valide en TypeScript) pour pouvoir être testé sous Node.

const env = (k) => (globalThis.Deno ? Deno.env.get(k) : globalThis.process?.env?.[k]);
const SUPABASE_URL = env('SUPABASE_URL');
const SERVICE_KEY = env('SUPABASE_SERVICE_ROLE_KEY') || (() => {
  try {
    return Object.values(JSON.parse(env('SUPABASE_SECRET_KEYS') || '{}'))[0];
  } catch {
    return undefined;
  }
})();
const SUBJECT = env('VAPID_SUBJECT') || 'https://lucaspilette.github.io/lifestyleApp/';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

// --- Outils binaires -------------------------------------------------------------
const enc = new TextEncoder();
export function b64uEncode(bytes) {
  let s = '';
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function b64uDecode(str) {
  const s = atob(str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}
const concat = (...parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let i = 0;
  for (const p of parts) {
    out.set(p, i);
    i += p.length;
  }
  return out;
};

async function hkdf(salt, ikm, info, length) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8));
}

/**
 * Chiffre un message pour un abonnement (RFC 8291, aes128gcm, un seul enregistrement).
 * `asKeyPair` et `salt` ne servent qu'aux tests (valeurs fixes de la RFC).
 */
export async function encryptPayload(sub, plaintext, { asKeyPair, salt } = {}) {
  const uaPublic = b64uDecode(sub.p256dh);
  const authSecret = b64uDecode(sub.auth);
  const s = salt || crypto.getRandomValues(new Uint8Array(16));
  const kp = asKeyPair || (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']));
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, kp.privateKey, 256));
  const ikm = await hkdf(authSecret, ecdh, concat(enc.encode('WebPush: info\0'), uaPublic, asPublic), 32);
  const cek = await hkdf(s, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(s, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const data = typeof plaintext === 'string' ? enc.encode(plaintext) : plaintext;
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, concat(data, new Uint8Array([2]))));
  const header = new Uint8Array(21 + asPublic.length);
  header.set(s, 0);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = asPublic.length;
  header.set(asPublic, 21);
  return concat(header, ct);
}

/** En-tête Authorization VAPID (JWT ES256, valable 1 h) pour le service de push de l'abonnement. */
export async function vapidAuth(endpoint, vapid) {
  const head = b64uEncode(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = { aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 3600, sub: SUBJECT };
  const body = b64uEncode(enc.encode(JSON.stringify(claims)));
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, vapid.signKey, enc.encode(`${head}.${body}`));
  return `vapid t=${head}.${body}.${b64uEncode(sig)}, k=${vapid.publicKey}`;
}

export async function sendPush(sub, payload, vapid) {
  const body = await encryptPayload(sub, payload);
  return fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      Authorization: await vapidAuth(sub.endpoint, vapid),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: '86400',
      Urgency: 'high',
    },
    body,
  });
}

// --- Base de données (clé service, côté serveur uniquement) ----------------------
async function rpc(fn, args = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      ...(String(SERVICE_KEY).startsWith('eyJ') ? { Authorization: `Bearer ${SERVICE_KEY}` } : {}),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${fn} : ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

let vapidCache = null;
/** Clés VAPID : lues dans la base, créées au premier appel. */
async function vapidKeys() {
  if (vapidCache) return vapidCache;
  let cfg = await rpc('push_config');
  if (!cfg) {
    const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const pub = b64uEncode(await crypto.subtle.exportKey('raw', kp.publicKey));
    const jwk = await crypto.subtle.exportKey('jwk', kp.privateKey);
    cfg = await rpc('push_set_config', { p_public: pub, p_private: jwk }); // renvoie la config retenue (course possible)
  }
  const signKey = await crypto.subtle.importKey('jwk', cfg.private_jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  vapidCache = { publicKey: cfg.public_key, signKey };
  return vapidCache;
}

export async function handler(req) {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST attendu' }, 405);
  try {
    if (!SERVICE_KEY) return json({ error: 'Clé service indisponible' }, 500);
    // Utilisateur du jeton, vérifié par le serveur d'authentification.
    const authRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SERVICE_KEY, Authorization: req.headers.get('Authorization') || '' },
    });
    const user = authRes.ok ? await authRes.json() : null;
    if (!user?.id) return json({ error: 'Non connecté' }, 401);
    const { event, to = null } = await req.json().catch(() => ({}));
    const vapid = await vapidKeys();
    if (event === 'vapid') return json({ publicKey: vapid.publicKey });
    const t = await rpc('push_targets', { p_sender: user.id, p_kind: String(event || ''), p_other: to });
    if (!t?.subs?.length) return json({ sent: 0 });
    const payload = JSON.stringify({ title: t.title, body: t.body, url: t.url, tag: t.tag });
    const results = await Promise.all(t.subs.map(async (sub) => {
      try {
        const res = await sendPush(sub, payload, vapid);
        // Abonnement expiré ou supprimé : on l'oublie.
        if (res.status === 404 || res.status === 410) await rpc('push_drop', { p_endpoint: sub.endpoint });
        return res.status;
      } catch {
        return 0;
      }
    }));
    return json({ sent: results.filter((s) => s >= 200 && s < 300).length, results });
  } catch (e) {
    return json({ error: String(e?.message || e) }, 500);
  }
}

if (globalThis.Deno) Deno.serve(handler);
