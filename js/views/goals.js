// Objectifs : poids, sommeil moyen, 1RM bench, calories moyennes.
// Un objectif atteint reste affiché (« à maintenir ») ; s'il est perdu : « à reconquérir ».

import { h, icon } from '../core/dom.js';
import { state, doneSessions, updateSettings } from '../core/store.js';
import { GOAL_ORDER, evaluateGoal } from '../core/goals.js';
import { todayKey, formatShort, agoLabel } from '../core/date.js';
import { fmtSleep } from '../core/format.js';
import { back } from '../core/router.js';
import { pageHeader, toast } from '../core/ui.js';
import { editGoal } from '../components/goal-editor.js';
import { successSound } from '../core/feedback.js';

/** Évalue tous les objectifs et mémorise la date de première réussite. */
export function evaluateAll() {
  const today = todayKey();
  const ctx = { days: state.days, sessions: doneSessions(), exercises: state.exercises, today };
  const objectives = state.settings.objectives || {};
  const results = GOAL_ORDER.map((id) => evaluateGoal(id, objectives[id], ctx));
  const newly = results.filter((r) => r.status === 'met' && !r.cfg?.achievedAt);
  if (newly.length) {
    updateSettings({ objectives: Object.fromEntries(newly.map((r) => [r.id, { achievedAt: today }])) });
    newly.forEach((r) => { r.cfg = { ...r.cfg, achievedAt: today }; });
  }
  return { results, newly };
}

export default function goalsView(root) {
  const list = h('div', { class: 'goals' });

  function render() {
    const { results, newly } = evaluateAll();
    if (newly.length) {
      successSound();
      toast(`🏆 Objectif atteint : ${newly.map((r) => r.def.label).join(', ')} !`, { duration: 4500 });
    }
    list.replaceChildren(...results.map(card));
  }

  function card(r) {
    const { def } = r;
    const fmt = r.id === 'sleep' ? fmtSleep : def.fmt;
    const open = async (raise = false) => {
      if (await editGoal(r.id, { current: r.value, raise })) render();
    };
    if (r.status === 'unset') {
      return h('button', { class: 'card goal is-unset', style: { '--c': def.color }, onClick: () => open() },
        h('div', { class: 'goal-top' }, h('div', { class: 'card-icon' }, icon(def.icon)), h('h2', null, def.label)),
        h('div', { class: 'goal-unset' }, r.value != null ? `Actuellement ${fmt(r.value)}. ` : '', h('b', null, 'Définir un objectif'), icon('chevron', 16)));
    }
    const dirTxt = r.dir === 'max' ? 'au plus' : r.id === 'weight' || r.id === 'kcal' ? 'au moins' : '';
    const statusEl = r.status === 'met'
      ? h('div', { class: 'goal-status met' }, icon('trophy', 15), `Atteint ${r.cfg.achievedAt ? `le ${formatShort(r.cfg.achievedAt)}` : ''} · à maintenir ou dépasser`)
      : r.status === 'lost'
        ? h('div', { class: 'goal-status lost' }, icon('flag', 15), `Atteint le ${formatShort(r.cfg.achievedAt)} · à reconquérir`)
        : h('div', { class: 'goal-status' }, `${Math.round(r.progress * 100)} % du chemin`);
    return h('section', { class: `card goal is-${r.status}`, style: { '--c': def.color } },
      h('button', { class: 'goal-main', onClick: () => open() },
        h('div', { class: 'goal-top' },
          h('div', { class: 'card-icon' }, icon(def.icon)),
          h('h2', null, def.label),
          r.status === 'met' ? h('span', { class: 'goal-badge' }, icon('trophy', 13), 'Atteint') : null),
        h('div', { class: 'goal-values' },
          h('span', { class: 'goal-current' }, r.value != null ? fmt(r.value) : '–'),
          h('span', { class: 'goal-target' }, `/ ${dirTxt ? `${dirTxt} ` : ''}${fmt(r.cfg.target)}`)),
        h('div', { class: 'goal-sub' }, r.sub, r.since ? ` · ${agoLabel(r.since)}` : ''),
        h('div', { class: 'goal-bar' }, h('i', { style: { width: `${Math.round(r.progress * 100)}%` } })),
        statusEl),
      r.status === 'met'
        ? h('button', { class: 'goal-raise', onClick: () => open(true) }, icon('up', 16), 'Viser plus haut')
        : null);
  }

  render();
  root.append(
    h('div', { class: 'page-bg goals-bg', 'aria-hidden': 'true' }),
    h('div', { class: 'view' },
      pageHeader({ title: 'Objectifs', onBack: () => back('/') }),
      h('div', { class: 'page' },
        h('p', { class: 'muted', style: { fontSize: '13.5px', margin: '0 4px' } }, 'Calculés à partir de tes données. Touche un objectif pour l’ajuster.'),
        list)));
}
