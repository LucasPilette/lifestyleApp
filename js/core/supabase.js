// Client Supabase minimal (sans dépendance) : compte anonyme, REST et fonctions SQL (RPC).
// La session (jetons) est gardée dans IndexedDB, à côté des données de l'app.

import { SUPABASE_URL, SUPABASE_KEY } from '../config.js';
import * as db from './db.js';

export const isConfigured = () => !!(SUPABASE_URL && SUPABASE_KEY);

let session = null; // { access_token, refresh_token, expires_at, user: { id } }
let pending = null;

export class ServerError extends Error {
  constructor(message, { status = 0, code = '' } = {}) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function call(path, { method = 'GET', body, token, headers = {} } = {}) {
  let res;
  try {
    res = await fetch(`${SUPABASE_URL}${path}`, {
      method,
      headers: {
        apikey: SUPABASE_KEY,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ServerError('Pas de connexion internet.', { code: 'offline' });
  }
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const msg = data?.message || data?.msg || data?.error_description || data?.error || `Erreur serveur (${res.status})`;
    throw new ServerError(msg, { status: res.status, code: data?.code || data?.error_code || '' });
  }
  return data;
}

async function saveSession(s) {
  session = s ? { access_token: s.access_token, refresh_token: s.refresh_token, expires_at: s.expires_at || Math.floor(Date.now() / 1000) + (s.expires_in || 3600), user: { id: s.user?.id } } : null;
  await db.kvSet('auth', session);
}

/** Jeton d'accès valide : crée un compte anonyme au premier appel, le rafraîchit au besoin. */
export function accessToken() {
  if (!isConfigured()) return Promise.reject(new ServerError('Serveur non configuré.', { code: 'not_configured' }));
  if (pending) return pending;
  pending = (async () => {
    if (!session) session = (await db.kvGet('auth')) || null;
    const now = Math.floor(Date.now() / 1000);
    if (session && session.expires_at - 60 > now) return session.access_token;
    if (session?.refresh_token) {
      try {
        await saveSession(await call('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: session.refresh_token } }));
        return session.access_token;
      } catch (e) {
        if (e.code === 'offline') throw e;
        // Jeton refusé : impossible de retrouver ce compte, on en ouvre un nouveau.
        console.warn('Session perdue', e);
      }
    }
    try {
      await saveSession(await call('/auth/v1/signup', { method: 'POST', body: {} }));
    } catch (e) {
      if (/anonymous/i.test(e.message)) throw new ServerError('Connexion anonyme désactivée sur le serveur.', { code: 'anonymous_disabled' });
      throw e;
    }
    return session.access_token;
  })().finally(() => {
    pending = null;
  });
  return pending;
}

/** Identifiant du compte (après accessToken()). */
export const userId = () => session?.user?.id || null;

export async function rpc(fn, args = {}) {
  return call(`/rest/v1/rpc/${fn}`, { method: 'POST', body: args, token: await accessToken() });
}

export async function rest(path, { method = 'GET', body, prefer } = {}) {
  return call(`/rest/v1/${path}`, { method, body, token: await accessToken(), headers: prefer ? { Prefer: prefer } : {} });
}

/** Appel d'une fonction Edge (ex. « push »). */
export async function invoke(fn, body = {}) {
  return call(`/functions/v1/${fn}`, { method: 'POST', body, token: await accessToken() });
}
