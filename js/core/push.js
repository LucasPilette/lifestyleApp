// Notifications push : abonnement de cet appareil (Web Push, iOS 16.4+ une fois l'app installée).
// Les envois sont faits par la fonction Edge « push » (supabase/functions/push).

import { isConfigured, invoke, rpc } from './supabase.js';
import { ensureProfile } from './social.js';

export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

const keyBytes = (b64u) => {
  const s = atob(b64u.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((b64u.length + 3) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};

/** Enregistrement du service worker (absent en développement local) : on n'attend pas indéfiniment. */
async function registration() {
  const reg = await Promise.race([navigator.serviceWorker.ready, new Promise((r) => setTimeout(() => r(null), 4000))]);
  if (!reg) throw new Error('Service worker indisponible.');
  return reg;
}

/**
 * Abonne cet appareil (la permission doit déjà être accordée) et l'enregistre sur le serveur.
 * Sans effet si les notifications ne sont pas disponibles.
 */
export async function subscribePush() {
  if (!pushSupported() || !isConfigured() || Notification.permission !== 'granted') return false;
  await ensureProfile();
  const reg = await registration();
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    const { publicKey } = await invoke('push', { event: 'vapid' });
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
  }
  const j = sub.toJSON();
  await rpc('save_push_subscription', { p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth });
  return true;
}

/** Désabonne cet appareil (local + serveur). */
export async function unsubscribePush() {
  if (!pushSupported()) return;
  try {
    const reg = await registration();
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return;
    const endpoint = sub.endpoint;
    await sub.unsubscribe();
    if (isConfigured()) await rpc('delete_push_subscription', { p_endpoint: endpoint });
  } catch (e) {
    console.warn('Désabonnement push', e);
  }
}
