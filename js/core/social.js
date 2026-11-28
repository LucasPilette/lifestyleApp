// Amis et messages (Supabase). Profil serveur : code ami à 6 chiffres + prénom,
// humeur du jour et date de la dernière séance seulement si l'utilisateur choisit de les partager.

import { isConfigured, rpc, rest, invoke, accessToken, userId, uploadFile } from './supabase.js';
import { state, doneSessions, updateSettings } from './store.js';
import { todayKey, dateKey } from './date.js';
import { debounce } from './util.js';
import { dayChecklist, weekTraining } from './metrics.js';
import { growth } from './growth.js';
import { todoItems, frenchList } from './greeting.js';
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
    syncAvatar().catch((e) => console.warn('Photo de profil', e.message));
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

// Messages non lus + demandes reçues (pastille du menu et de la barre du bas), gardé 30 s.
let inboxCache = { at: 0, n: 0 };
const countInbox = (list) => list.reduce((n, f) => n + (f.unread || 0) + (f.status === 'pending' && f.direction === 'in' ? 1 : 0), 0);
export async function inboxCount() {
  if (!isConfigured() || !state.settings.friendCode) return 0;
  if (Date.now() - inboxCache.at < 30000) return inboxCache.n;
  const [friends, groups] = await Promise.all([listFriends(), listGroups()]);
  inboxCache = { at: Date.now(), n: countInbox(friends) + groups.reduce((n, g) => n + (g.unread || 0), 0) };
  return inboxCache.n;
}
export const resetInbox = () => { inboxCache = { at: 0, n: 0 }; };

// --- Groupes ---------------------------------------------------------------------

/** Mes groupes (membres, dernier message, non lus). Vide si le serveur n'a pas encore les groupes. */
export async function listGroups() {
  await ensureProfile();
  try {
    return (await rpc('my_groups')) || [];
  } catch (e) {
    if (e?.code === 'PGRST202') return [];
    throw e;
  }
}
export const createGroup = (name, memberIds) => rpc('create_group', { p_name: name, p_members: memberIds });
export const renameGroup = (id, name) => rpc('rename_group', { p_group: id, p_name: name });
export const addGroupMembers = (id, memberIds) => rpc('add_group_members', { p_group: id, p_members: memberIds });
export const leaveGroup = (id) => rpc('leave_group', { p_group: id });
export const markGroupRead = (id) => rpc('mark_group_read', { p_group: id }).catch(() => {});

export async function groupConversation(id, after = 0, since = null) {
  return (await rpc('group_conversation', { p_group: id, p_after: after, p_since: since })) || [];
}

export async function sendGroupMessage(id, body, payload = null) {
  const rows = await rest('messages', { method: 'POST', body: { group_id: id, body, ...(payload ? { payload } : {}) }, prefer: 'return=representation' });
  notify('group_message', id);
  return rows?.[0];
}

// --- Photo de profil ----------------------------------------------------------------
// La photo est gardée sur le téléphone (settings.avatar, carré 256 px) et envoyée sur le serveur
// quand il y a un compte ; avatarVersion change à chaque nouvelle photo.

/** Nouvelle photo (données JPEG) ou null pour la retirer. */
export function setAvatar(dataUrl) {
  updateSettings({ avatar: dataUrl || null, avatarVersion: Date.now() });
  syncAvatar().catch((e) => console.warn('Photo de profil', e.message));
}

let avatarSyncing = null;
export function syncAvatar() {
  if (avatarSyncing) return avatarSyncing;
  avatarSyncing = (async () => {
    const st = state.settings;
    const version = st.avatarVersion || 0;
    if (!isConfigured() || !st.friendCode || (st.avatarSyncedVersion || 0) === version) return;
    await accessToken();
    const uid = userId();
    let url = null;
    if (st.avatar) {
      const blob = await (await fetch(st.avatar)).blob();
      url = `${await uploadFile('avatars', `${uid}/avatar.jpg`, blob, 'image/jpeg')}?v=${version}`;
    }
    await rest(`profiles?id=eq.${encodeURIComponent(uid)}`, { method: 'PATCH', body: { avatar_url: url } });
    updateSettings({ avatarSyncedVersion: version, avatarUrl: url });
  })().finally(() => {
    avatarSyncing = null;
  });
  return avatarSyncing;
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

// Le serveur peut ne pas encore avoir les cartes et réactions (script SQL pas relancé) : on se rabat alors
// sur la version précédente (texte seul) au lieu de casser la discussion.
let richChat = true;
const isOldSchema = (e) => e?.code === 'PGRST202' || e?.code === 'PGRST204' || e?.code === '42703' || /payload|p_since/.test(e?.message || '');

/** Messages nouveaux (id > after) et modifiés depuis since (réactions, lu). */
export async function conversation(id, after = 0, since = null) {
  if (richChat) {
    try {
      return (await rpc('conversation', { p_other: id, p_after: after, p_since: since })) || [];
    } catch (e) {
      if (!isOldSchema(e)) throw e;
      richChat = false;
    }
  }
  return (await rpc('conversation', { p_other: id, p_after: after })) || [];
}

/** Envoie un message ; payload = carte partagée (body reste le texte de repli). */
export async function sendMessage(id, body, payload = null) {
  let rows;
  try {
    rows = await rest('messages', { method: 'POST', body: { recipient: id, body, ...(payload && richChat ? { payload } : {}) }, prefer: 'return=representation' });
  } catch (e) {
    if (!payload || !isOldSchema(e)) throw e;
    richChat = false;
    rows = await rest('messages', { method: 'POST', body: { recipient: id, body }, prefer: 'return=representation' });
  }
  notify('message', id);
  return rows?.[0];
}

/** Réagit à un message (même émoji = retirer). Renvoie les réactions à jour. */
export async function react(messageId, emoji) {
  if (!richChat) throw new Error('Les réactions arrivent avec la prochaine mise à jour du serveur.');
  return rpc('react_message', { p_id: messageId, p_emoji: emoji });
}

export const markRead = (id) => rpc('mark_read', { p_other: id }).catch(() => {});
export const myId = userId;

// --- Statut partagé (humeur du jour, dernière séance, journée parfaite) -----------

let lastPushed = null;
const notified = new Set(); // événements déjà signalés pendant cette session (le serveur dédoublonne aussi)

/**
 * Plante du jour : arrosée ou non, jours arrosés d'affilée, et ce qu'il reste à faire (pour le rappel du soir).
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
    fertilizer: state.meta.starterFertilizer || 0,
  };
  // Ce qu'il reste, en toutes lettres pour le rappel : « ta nuit et ton humeur », « 2 séances d’ici dimanche »
  const todo = todoItems(dayChecklist(state.days, today, rules.items, rules.custom));
  if (rules.weekly) {
    const wk = weekTraining(sessionDates, today, minSessions);
    if (wk.needed > 0 && wk.needed >= wk.daysLeft) todo.push(`${wk.needed} séance${wk.needed > 1 ? 's' : ''} d’ici dimanche`);
  }
  const g = growth(state.days, today, opts);
  return { perfect: g.todayDone, streak: g.streak, todo };
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
    // Rappel du soir (privé) : heure choisie, fuseau, jours arrosés d'affilée et ce qu'il reste à faire.
    tz,
    remind_hour: n.enabled && flame && n.reminderHour != null ? n.reminderHour : null,
    flame: flame ? flame.streak : null,
    flame_date: flame ? today : null,
    todo: flame ? frenchList(flame.todo).slice(0, 200) || null : null,
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
