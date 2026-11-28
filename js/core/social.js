// Amis et messages (Supabase). Profil serveur : code ami à 6 chiffres + prénom,
// humeur du jour et date de la dernière séance seulement si l'utilisateur choisit de les partager.

import { isConfigured, rpc, rest, invoke, accessToken, userId } from './supabase.js';
import { state, doneSessions, updateSettings } from './store.js';
import { todayKey, dateKey } from './date.js';
import { debounce } from './util.js';
import { flameChecker, perfectStreak, dayChecklist, weekTraining } from './metrics.js';
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
  const list = (await rpc('my_friends')) || [];
  inboxCache = { at: Date.now(), n: countInbox(list) };
  return list;
}

// Messages non lus + demandes reçues (pastille du menu et de la barre du bas), gardé 30 s.
let inboxCache = { at: 0, n: 0 };
const countInbox = (list) => list.reduce((n, f) => n + (f.unread || 0) + (f.status === 'pending' && f.direction === 'in' ? 1 : 0), 0);
export async function inboxCount() {
  if (!isConfigured() || !state.settings.friendCode) return 0;
  if (Date.now() - inboxCache.at < 30000) return inboxCache.n;
  await listFriends();
  return inboxCache.n;
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

/**
 * Flamme du jour : journée parfaite ou non, série en cours, et ce qu'il reste à faire (pour le rappel du soir).
 * null si l'utilisateur n'a aucun critère quotidien.
 */
function flameToday(today) {
  const rules = flameRules(state.settings);
  if (!rules.items.length) return null;
  const sessionDates = doneSessions().map((x) => dateKey(new Date(x.startedAt)));
  const minSessions = state.settings.goals.minSessions || 3;
  const opts = {
    sessionDates, minSessions,
    graceUntil: state.meta.createdAt ? dateKey(new Date(state.meta.createdAt)) : null,
    items: rules.items, weekly: rules.weekly, custom: rules.custom,
  };
  const todo = dayChecklist(state.days, today, rules.items, rules.custom).missing;
  if (rules.weekly) {
    const wk = weekTraining(sessionDates, today, minSessions);
    if (wk.needed > 0 && wk.needed >= wk.daysLeft) todo.push(`${wk.needed} séance${wk.needed > 1 ? 's' : ''} d’ici dimanche`);
  }
  return { perfect: flameChecker(state.days, today, opts)(today), streak: perfectStreak(state.days, today, opts), todo };
}

function statusPayload() {
  const share = !!state.settings.shareActivity;
  const today = todayKey();
  const mood = share ? state.days.get(today)?.mood ?? null : null;
  const last = share ? doneSessions()[0] : null;
  const flame = flameToday(today);
  const n = state.settings.notifications || {};
  let tz = null;
  try {
    tz = Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    tz = null;
  }
  return {
    share,
    mood,
    mood_date: mood != null ? today : null,
    last_workout_at: last ? new Date(last.endedAt || last.startedAt).toISOString() : null,
    // Journée parfaite et série : visibles par les amis seulement si share (voir my_friends).
    perfect_date: flame?.perfect ? today : null,
    streak: flame?.perfect ? flame.streak : null,
    // Rappel du soir (privé) : heure choisie, fuseau, flamme en jeu et ce qu'il reste à faire.
    tz,
    remind_hour: n.enabled && flame && n.reminderHour != null ? n.reminderHour : null,
    flame: flame ? flame.streak : null,
    flame_date: flame ? today : null,
    todo: flame ? flame.todo.join(', ').slice(0, 200) || null : null,
    todo_date: flame ? today : null,
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
