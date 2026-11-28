// Feuille « Partager » de la discussion : flamme, objectifs, records, dernière séance, valeurs du jour.

import { h, icon } from '../core/dom.js';
import { state, doneSessions, getDay, sessionColor } from '../core/store.js';
import { sheet } from '../core/ui.js';
import { todayKey, dateKey, relativeDay } from '../core/date.js';
import { perfectStreak } from '../core/metrics.js';
import { flameRules, cleanWidgets } from '../core/prefs.js';
import { flameCard, goalCard, recentRecords, recordCard, sessionCard, dayCards, cleanCard } from '../core/share.js';
import { evaluateAll } from '../views/goals.js';

/** Bulle de carte (envoyée ou reçue). */
export function renderCard(payload, { mini = false } = {}) {
  const c = cleanCard(payload);
  if (!c) return null;
  return h('div', { class: `chat-card ${mini ? 'mini' : ''} t-${c.type}`, style: c.color ? { '--cc': c.color } : null },
    h('span', { class: 'chat-card-emoji', 'aria-hidden': 'true' }, c.emoji),
    h('div', { class: 'chat-card-body' },
      h('span', { class: 'chat-card-title' }, c.title),
      h('b', { class: 'chat-card-value' }, c.value),
      c.sub ? h('span', { class: 'chat-card-sub' }, c.sub) : null));
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
      ...section('Ma dernière séance', last ? [sessionCard(last, state.exercises, bw, sessionColor(last) || '')] : []),
    ];
    return [h('p', { class: 'sheet-text' }, 'Choisis ce que tu veux partager : ton ami le reçoit sous forme de carte.'), ...items];
  }, { title: 'Partager' });
}
