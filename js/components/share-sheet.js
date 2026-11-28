// Feuille « Partager » de la discussion : flamme, objectifs, records, dernière séance, valeurs du jour.

import { h, icon } from '../core/dom.js';
import { toast } from '../core/ui.js';
import { avatarEl, groupAvatarEl } from './avatar.js';
import { listFriends, listGroups, sendMessage, sendGroupMessage, isConfigured } from '../core/social.js';
import { state, doneSessions, getDay, sessionColor } from '../core/store.js';
import { sheet } from '../core/ui.js';
import { todayKey, dateKey, relativeDay } from '../core/date.js';
import { perfectStreak } from '../core/metrics.js';
import { flameRules, cleanWidgets } from '../core/prefs.js';
import { flameCard, goalCard, recentRecords, recordCard, sessionCard, dayCards, cleanCard } from '../core/share.js';
import { evaluateAll } from '../views/goals.js';

/** Bulle de carte (envoyée ou reçue). */
/**
 * Bulle de carte. Le détail (performances d'une séance) est replié : il se déplie au toucher de
 * « Voir les performances », pour ne pas prendre de place dans la discussion.
 * open / onToggle : garder le détail déplié quand la discussion se redessine.
 */
export function renderCard(payload, { mini = false, open = false, onToggle } = {}) {
  const c = cleanCard(payload);
  if (!c) return null;
  let details = null;
  if (c.lines.length && !mini) {
    const n = c.lines.length;
    details = h('details', { class: 'chat-card-details', open },
      h('summary', null, h('span', null, `Voir les performances (${n})`), icon('down', 15, 'chat-card-caret')),
      h('ul', { class: 'chat-card-lines' }, c.lines.map((l) => h('li', null, l))));
    // Toucher le détail ne doit pas ouvrir les réactions de la bulle.
    details.addEventListener('click', (e) => e.stopPropagation());
    details.addEventListener('toggle', () => onToggle?.(details.open));
  }
  return h('div', { class: `chat-card ${mini ? 'mini' : ''} t-${c.type}`, style: c.color ? { '--cc': c.color } : null },
    h('span', { class: 'chat-card-emoji', 'aria-hidden': 'true' }, c.emoji),
    h('div', { class: 'chat-card-body' },
      h('span', { class: 'chat-card-title' }, c.title),
      h('b', { class: 'chat-card-value' }, c.value),
      c.sub ? h('span', { class: 'chat-card-sub' }, c.sub) : null,
      details));
}

/**
 * « Envoyer à… » : choisir un ou plusieurs amis / groupes à qui envoyer une carte (ex. séance terminée).
 * Chaque destinataire touché reçoit la carte aussitôt ; la feuille reste ouverte pour en choisir d'autres.
 */
export function openSendToSheet(item, { title = 'Partager avec…' } = {}) {
  if (!isConfigured() || !state.settings.friendCode) {
    toast('Ajoute d’abord des amis (menu ☰ → Amis)', { duration: 3500 });
    return;
  }
  sheet(() => {
    const list = h('div', { class: 'send-list' }, h('div', { class: 'empty faint' }, 'Chargement…'));
    const target = (label, avatar, sub, send) => {
      const status = h('span', { class: 'send-status' }, icon('send', 18));
      const row = h('button', { class: 'send-row' }, avatar, h('span', { class: 'send-txt' }, h('b', null, label), sub ? h('span', null, sub) : null), status);
      row.addEventListener('click', async () => {
        if (row.disabled) return;
        row.disabled = true;
        status.replaceChildren(h('span', { class: 'spinner' }));
        try {
          await send();
          status.replaceChildren(icon('check', 18));
          row.classList.add('sent');
        } catch (e) {
          row.disabled = false;
          status.replaceChildren(icon('send', 18));
          toast(e.message || 'Envoi impossible');
        }
      });
      return row;
    };
    Promise.all([listFriends(), listGroups()]).then(([friends, groups]) => {
      const rows = [
        ...groups.map((g) => target(g.name, groupAvatarEl(g.members), `${g.members?.length || 0} membres`, () => sendGroupMessage(g.id, item.body, item.payload))),
        ...friends.filter((f) => f.status === 'accepted').map((f) => target(f.name || 'Ami', avatarEl({ name: f.name, url: f.avatar_url }), '', () => sendMessage(f.id, item.body, item.payload))),
      ];
      list.replaceChildren(...(rows.length ? rows : [h('div', { class: 'empty faint' }, 'Pas encore d’amis : ajoute-les depuis l’écran Amis.')]));
    }).catch((e) => list.replaceChildren(h('div', { class: 'empty faint' }, e.message || 'Serveur injoignable.')));
    return [renderCard(item.payload), list];
  }, { title });
}

/** Série de flammes en cours, selon les critères de l'utilisateur. */
export function myStreak() {
  const rules = flameRules(state.settings);
  return perfectStreak(state.days, todayKey(), {
    sessionDates: doneSessions().map((s) => dateKey(new Date(s.startedAt))),
    minSessions: state.settings.goals.minSessions || 3,
    graceUntil: state.meta.createdAt ? dateKey(new Date(state.meta.createdAt)) : null,
    items: rules.items, weekly: rules.weekly, custom: rules.custom,
  });
}

/** Ouvre la feuille ; onPick({ payload, body }) quand l'utilisateur choisit une carte. */
export function openShareSheet(onPick) {
  sheet((close) => {
    const pick = (c) => {
      close();
      onPick(c);
    };
    const section = (title, cards) => (cards.length
      ? [h('div', { class: 'picker-group' }, title), ...cards.map((c) => h('button', { class: 'share-item', onClick: () => pick(c) }, renderCard(c.payload, { mini: true }), icon('send', 18, 'faint')))]
      : []);

    const bw = state.settings.bodyweight;
    const sessions = doneSessions();
    const goals = evaluateAll().results.filter((r) => r.status !== 'unset' && r.value != null).map(goalCard);
    const records = recentRecords(state.sessions, state.exercises, bw).slice(0, 6)
      .map((rec) => recordCard(rec, state.exercises.get(rec.exerciseId), relativeDay(dateKey(new Date(rec.date))).toLowerCase()));
    const last = sessions[0];
    const customs = state.settings.customWidgets || [];
    const today = dayCards(getDay(todayKey()) || {}, cleanWidgets(state.settings.widgets, customs), customs);

    const items = [
      ...section('Ma flamme', [flameCard(myStreak())]),
      ...section('Aujourd’hui', today),
      ...section('Mes objectifs', goals),
      ...section('Mes records', records),
      ...section('Ma dernière séance', last ? [sessionCard(last, state.exercises, bw, sessionColor(last) || '', state.sessions)] : []),
    ];
    return [h('p', { class: 'sheet-text' }, 'Choisis ce que tu veux partager : ton ami le reçoit sous forme de carte.'), ...items];
  }, { title: 'Partager' });
}
