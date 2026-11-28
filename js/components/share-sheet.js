// Feuille « Partager » de la discussion : plante, objectifs, records, séances, graphiques, valeurs du jour.

import { h, icon } from '../core/dom.js';
import { toast } from '../core/ui.js';
import { avatarEl, groupAvatarEl } from './avatar.js';
import { listFriends, listGroups, sendMessage, sendGroupMessage, isConfigured } from '../core/social.js';
import { state, doneSessions, getDay, sessionColor } from '../core/store.js';
import { sheet } from '../core/ui.js';
import { todayKey, dateKey, relativeDay } from '../core/date.js';
import { myGrowth } from '../core/plant-state.js';
import { flameRules, cleanWidgets } from '../core/prefs.js';
import { plantCard, goalCard, recentRecords, recordCard, sessionCard, dayCards, cleanCard, chartCard, templateCard, programCard } from '../core/share.js';
import { openCardDetail } from './share-detail.js';
import { mountChart } from './chart.js';
import { METRICS } from '../core/metrics.js';
import { fmtNum } from '../core/format.js';
import { evaluateAll } from '../views/goals.js';

/** Graphique d'une carte (une seule série : le titre de la carte la nomme, pas de légende). */
function cardChart(c) {
  const ch = c.chart;
  const m = METRICS[ch.field];
  const fmt = m ? m.fmt : (v) => `${fmtNum(v, ch.decimals ? 1 : 0)}${ch.unit ? ` ${ch.unit}` : ''}`;
  const host = h('div', { class: 'chat-card-chart' });
  mountChart(host, {
    type: ch.kind,
    points: ch.values.map((v, i) => ({ label: ch.labels[i] || '', value: v, tip: ch.labels[i] || '' })),
    color: c.color || m?.color || 'var(--accent)',
    goal: ch.goal,
    maxY: ch.maxY ?? m?.maxY,
    step: m?.step,
    format: fmt,
    tick: m ? m.tick : (v) => fmtNum(v, ch.decimals ? 1 : 0),
    height: 130,
    ariaLabel: `${c.title}, ${c.sub}`,
  });
  // Toucher le graphique (valeur du jour) ne doit pas ouvrir les réactions de la bulle.
  host.addEventListener('click', (e) => e.stopPropagation());
  return host;
}

/**
 * Bulle de carte. Séance, séance type ou programme : « Voir plus » ouvre le détail complet (avec import).
 * Anciennes cartes de séance (texte seul) : détail repliable « Voir les performances ».
 * open / onToggle : garder ce détail déplié quand la discussion se redessine ; from : prénom de l'expéditeur.
 */
export function renderCard(payload, { mini = false, open = false, onToggle, from = '' } = {}) {
  const c = cleanCard(payload);
  if (!c) return null;
  let details = null;
  let chart = null; // graphique : sur sa propre ligne, toute la largeur de la carte
  if (!mini && (c.session || c.template || c.program)) {
    details = h('button', { class: 'chat-card-more', onClick: (e) => { e.stopPropagation(); openCardDetail(c, { from }); } },
      c.session ? 'Voir plus' : c.program ? 'Voir le programme' : 'Voir la séance', icon('chevron', 15));
  } else if (!mini && c.chart) {
    chart = cardChart(c);
  } else if (c.lines.length && !mini) {
    const n = c.lines.length;
    details = h('details', { class: 'chat-card-details', open },
      h('summary', null, h('span', null, `Voir les performances (${n})`), icon('down', 15, 'chat-card-caret')),
      h('ul', { class: 'chat-card-lines' }, c.lines.map((l) => h('li', null, l))));
    // Toucher le détail ne doit pas ouvrir les réactions de la bulle.
    details.addEventListener('click', (e) => e.stopPropagation());
    details.addEventListener('toggle', () => onToggle?.(details.open));
  }
  return h('div', { class: `chat-card ${mini ? 'mini' : ''} t-${c.type} ${c.chart && !mini ? 'has-chart' : ''}`, style: c.color ? { '--cc': c.color } : null },
    h('span', { class: 'chat-card-emoji', 'aria-hidden': 'true' }, c.emoji),
    h('div', { class: 'chat-card-body' },
      h('span', { class: 'chat-card-title' }, c.title),
      h('b', { class: 'chat-card-value' }, c.value),
      c.sub ? h('span', { class: 'chat-card-sub' }, c.sub) : null,
      details),
    chart);
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

    // Graphiques des 7 derniers jours (30 pour le poids) sur les widgets affichés
    const widgets = cleanWidgets(state.settings.widgets, customs);
    const dailyGoals = state.settings.goals;
    const charts = [];
    const add = (c) => c && charts.push(c);
    if (widgets.includes('sleep')) add(chartCard(state.days, 'sleepMin', todayKey(), { goal: dailyGoals.sleepMin }));
    if (widgets.includes('mood')) add(chartCard(state.days, 'mood', todayKey()));
    if (widgets.includes('steps')) add(chartCard(state.days, 'steps', todayKey(), { goal: dailyGoals.steps }));
    if (widgets.includes('nutrition')) add(chartCard(state.days, 'kcal', todayKey(), { goal: dailyGoals.kcal }));
    if (widgets.includes('weight')) add(chartCard(state.days, 'weight', todayKey(), { range: 30 }));
    for (const cw of customs) if (widgets.includes(cw.id) && (cw.kind === 'number' || cw.kind === 'emoji')) add(chartCard(state.days, 'custom', todayKey(), { custom: cw }));
    const tpls = state.templates.map((t) => templateCard(t, state.exercises));
    if (state.templates.length > 1) tpls.unshift(programCard(state.templates, state.exercises, state.settings.name));

    const items = [
      ...section('Ma plante', [plantCard(myGrowth())]),
      ...section('Aujourd’hui', today),
      ...section('Mes objectifs', goals),
      ...section('Mes records', records),
      ...section('Ma dernière séance', last ? [sessionCard(last, state.exercises, bw, sessionColor(last) || '', state.sessions)] : []),
      ...section('Mes graphiques', charts),
      ...section('Mes séances et mon programme', tpls),
    ];
    return [h('p', { class: 'sheet-text' }, 'Choisis ce que tu veux partager : ton ami le reçoit sous forme de carte.'), ...items];
  }, { title: 'Partager' });
}
