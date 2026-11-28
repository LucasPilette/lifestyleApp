// Amis et messages (Supabase). Profil serveur : code ami à 6 chiffres + prénom,
// humeur du jour et date de la dernière séance seulement si l'utilisateur choisit de les partager.

import { isConfigured, rpc, rest, invoke, accessToken, userId } from './supabase.js';
import { state, doneSessions, updateSettings } from './store.js';
import { todayKey, dateKey } from './date.js';
import { debounce } from './util.js';
import { flameChecker, perfectStreak } from './metrics.js';
import { flameRules } from './prefs.js';

export { isConfigured };

let profilePromise = null;

/** Profil serveur ({ id, code, name, share }), créé au premier appel. Le code est mémorisé localement. */
export function ensureProfile({ force = false } = {}) {
  if (!force && profilePromise) return profilePromise;
  profilePromise = (async () => {
    await accessToken();
    const p = await rpc('ensure_profile', { p_name: state.settings.name || '' });
    if (p?.code && p.code !== state.settings.friendCode) updateSettings({ friendCode: p.code });
    return p;
  })();
  profilePromise.catch(() => {
    profilePromise = null;
  });
  return profilePromise;
}

/** Prénom modifié : mis à jour sur le serveur (silencieux si hors ligne). */
export const syncName = debounce(() => {
  if (!isConfigured() || !state.settings.friendCode) return;
  rpc('ensure_profile', { p_name: state.settings.name || '' }).catch(() => {});
}, 1200);

export async function listFriends() {
  await ensureProfile();
  return (await rpc('my_friends')) || [];
}

/**
 * Notifie le(s) ami(s) concerné(s) via la fonction Edge « push » (sans attendre, silencieux en cas d'échec).
 * event : 'message' | 'friend_request' | 'friend_accept' (to = ami) ; 'mood' | 'perfect' (tous les amis).
 */
export function notify(event, to = null) {
  if (!isConfigured()) return;
  invoke('push', { event, to }).catch((e) => console.warn('Notification', event, e.message));
}

export async function requestFriend(code) {
  await ensureProfile();
  const r = await rpc('request_friend', { p_code: code });
  if (r?.status === 'requested') notify('friend_request', r.id);
  else if (r?.status === 'accepted') notify('friend_accept', r.id);
  return r;
}

export async function respondFriend(id, accept) {
  const r = await rpc('respond_friend', { p_other: id, p_accept: accept });
  if (accept) notify('friend_accept', id);
  return r;
}
export const removeFriend = (id) => rpc('remove_friend', { p_other: id });

export async function conversation(id, after = 0) {
  return (await rpc('conversation', { p_other: id, p_after: after })) || [];
}

export async function sendMessage(id, body) {
  const rows = await rest('messages', { method: 'POST', body: { recipient: id, body }, prefer: 'return=representation' });
  notify('message', id);
  return rows?.[0];
}

export const markRead = (id) => rpc('mark_read', { p_other: id }).catch(() => {});
export const myId = userId;

// --- Statut partagé (humeur du jour, dernière séance, journée parfaite) -----------

let lastPushed = null;
const notified = new Set(); // événements déjà signalés pendant cette session (le serveur dédoublonne aussi)

/** Journée parfaite aujourd'hui (selon les critères de flamme de l'utilisateur) et série en cours. */
function perfectToday(today) {
  const rules = flameRules(state.settings);
  if (!rules.items.length) return null;
  const opts = {
    sessionDates: doneSessions().map((x) => dateKey(new Date(x.startedAt))),
    minSessions: state.settings.goals.minSessions || 3,
    graceUntil: state.meta.createdAt ? dateKey(new Date(state.meta.createdAt)) : null,
    items: rules.items,
    weekly: rules.weekly,
  };
  return flameChecker(state.days, today, opts)(today) ? perfectStreak(state.days, today, opts) : null;
}

function statusPayload() {
  const share = !!state.settings.shareActivity;
  const today = todayKey();
  const mood = share ? state.days.get(today)?.mood ?? null : null;
  const last = share ? doneSessions()[0] : null;
  const streak = share ? perfectToday(today) : null;
  return {
    share,
    mood,
    mood_date: mood != null ? today : null,
    last_workout_at: last ? new Date(last.endedAt || last.startedAt).toISOString() : null,
    perfect_date: streak ? today : null,
    streak: streak || null,
  };
}

/** Envoie le statut si l'utilisateur a un compte et qu'il a changé (désactiver le partage efface tout). */
export async function pushStatus() {
  if (!isConfigured() || !state.settings.friendCode) return;
  const body = statusPayload();
  const key = JSON.stringify(body);
  if (key === lastPushed) return;
  await accessToken();
  await rest(`profiles?id=eq.${encodeURIComponent(userId())}`, { method: 'PATCH', body: { ...body, updated_at: new Date().toISOString() } });
  lastPushed = key;
  // Prévenir les amis : coup de mou (humeur 1 ou 2) ou journée parfaite, une fois par jour.
  const today = todayKey();
  if (body.share && body.mood != null && body.mood <= 2 && !notified.has(`mood:${today}`)) {
    notified.add(`mood:${today}`);
    notify('mood');
  }
  if (body.share && body.perfect_date === today && !notified.has(`perfect:${today}`)) {
    notified.add(`perfect:${today}`);
    notify('perfect');
  }
}

export const schedulePushStatus = debounce(() => pushStatus().catch(() => {}), 2500);
