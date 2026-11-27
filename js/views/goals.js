// Objectifs : widgets (anneau de progression + valeur), 2 par ligne, détail au toucher,
// et un widget « + » pour créer un objectif parmi ceux que l'app sait mesurer.
// Un objectif atteint reste affiché (doré, « à maintenir ») ; s'il est perdu : « à reconquérir ».

import { h, icon } from '../core/dom.js';
import { state, doneSessions, updateSettings } from '../core/store.js';
import { evaluateGoal, goalDef, ADDABLE_GOALS } from '../core/goals.js';
import { todayKey, formatShort, agoLabel } from '../core/date.js';
import { back, navigate } from '../core/router.js';
import { pageHeader, toast, sheet } from '../core/ui.js';
import { editGoal, goalList } from '../components/goal-editor.js';
import { pickExercise } from '../components/exercise-picker.js';
import { goalRing } from '../components/ring.js';
import { successSound } from '../core/feedback.js';

/** Évalue les objectifs de la liste et mémorise la date de première réussite. */
export function evaluateAll() {
  const today = todayKey();
  const ctx = { days: state.days, sessions: doneSessions(), exercises: state.exercises, today };
  const objectives = state.settings.objectives || {};
  const results = goalList().map((key) => evaluateGoal(key, objectives[key], ctx));
  const newly = results.filter((r) => r.status === 'met' && !r.cfg?.achievedAt);
  if (newly.length) {
    updateSettings({ objectives: Object.fromEntries(newly.map((r) => [r.key, { achievedAt: today }])) });
    newly.forEach((r) => { r.cfg = { ...r.cfg, achievedAt: today }; });
  }
  return { results, newly };
}

export default function goalsView(root) {
  const grid = h('div', { class: 'goal-grid' });

  function render() {
    const { results, newly } = evaluateAll();
    if (newly.length) {
      successSound();
      toast(`🏆 Objectif atteint : ${newly.map((r) => r.def.label).join(', ')} !`, { duration: 4500 });
    }
    grid.replaceChildren(...results.map(widget), addWidget());
  }

  function widget(r) {
    const unset = r.status === 'unset';
    const met = r.status === 'met';
    const statusTxt = unset ? 'À définir'
      : met ? 'Atteint'
      : r.status === 'lost' ? 'À reconquérir'
      : `Objectif ${r.dir === 'max' ? '≤ ' : ''}${r.def.fmt(r.cfg.target)}`;
    return h('button', {
      class: `gw2 glass ${met ? 'met' : ''} ${r.status === 'lost' ? 'lost' : ''} ${unset ? 'unset' : ''}`,
      style: { '--c': r.def.color },
      'aria-label': `${r.def.label} : ${r.value != null ? r.def.fmt(r.value) : 'pas de donnée'}, ${statusTxt}`,
      onClick: () => detail(r),
    },
      met ? h('span', { class: 'gw-trophy' }, icon('trophy', 12)) : null,
      h('div', { class: 'gw-ring' },
        goalRing(unset ? 0 : r.progress, { met }),
        h('span', { class: 'gw-value' }, r.value != null ? r.def.compact(r.value) : unset ? icon('plus', 22) : '–'),
        !unset ? h('span', { class: 'gw-pct' }, `${Math.round(r.progress * 100)} %`) : null),
      h('span', { class: 'gw-label' }, r.def.label),
      h('span', { class: 'gw-status' }, statusTxt));
  }

  function addWidget() {
    return h('button', { class: 'gw2 add', 'aria-label': 'Créer un objectif', onClick: addGoal },
      h('div', { class: 'gw-ring' }, h('span', { class: 'gw-plus' }, icon('plus', 30))),
      h('span', { class: 'gw-label' }, 'Nouvel objectif'),
      h('span', { class: 'gw-status' }, 'Choisir parmi les suivis'));
  }

  /** Choix d'un nouvel objectif parmi ce que l'app mesure. */
  function addGoal() {
    const list = goalList();
    const options = ADDABLE_GOALS.filter((g) => !list.includes(g.key) || state.settings.objectives?.[g.key]?.target == null);
    sheet((close) => {
      const items = [];
      let lastGroup = null;
      for (const g of options) {
        const def = goalDef(g.key, state.exercises);
        if (g.group !== lastGroup) {
          items.push(h('div', { class: 'picker-group' }, g.group));
          lastGroup = g.group;
        }
        items.push(h('button', { class: 'picker-item', style: { '--c': def.color }, onClick: async () => {
          close();
          await create(g.key);
        } }, h('span', { class: 'goal-dot' }), h('span', null, def.label), h('span', { class: 'muted' }, def.kind === 'avg' ? 'moy. 30 j' : '')));
      }
      items.push(h('div', { class: 'picker-group' }, 'Force'));
      items.push(h('button', { class: 'picker-item', style: { '--c': 'var(--accent)' }, onClick: async () => {
        close();
        const exId = await pickExercise({ title: '1RM réel sur…' });
        if (exId) await create(exId === 'bench' ? 'bench' : `lift:${exId}`);
      } }, h('span', { class: 'goal-dot' }), h('span', null, '1RM réel sur un exercice…'), icon('chevron', 16, 'faint')));
      return items;
    }, { title: 'Nouvel objectif' });
  }

  async function create(key) {
    const ctx = { days: state.days, sessions: doneSessions(), exercises: state.exercises, today: todayKey() };
    const r = evaluateGoal(key, state.settings.objectives?.[key], ctx);
    if (await editGoal(key, { current: r.value, isNew: true })) render();
  }

  /** Détail d'un objectif. */
  function detail(r) {
    sheet((close) => {
      const unset = r.status === 'unset';
      const statusTxt = unset ? 'Aucune cible définie pour l’instant.'
        : r.status === 'met' ? `Atteint${r.cfg.achievedAt ? ` le ${formatShort(r.cfg.achievedAt)}` : ''} : à maintenir ou dépasser.`
        : r.status === 'lost' ? `Atteint le ${formatShort(r.cfg.achievedAt)}, à reconquérir.`
        : `${Math.round(r.progress * 100)} % de l’objectif.`;
      const edit = async (raise) => {
        close();
        if (await editGoal(r.key, { current: r.value, raise })) render();
      };
      return [
        h('div', { class: `gw-detail ${r.status === 'met' ? 'met' : ''}`, style: { '--c': r.def.color } },
          h('div', { class: 'gw-ring big' }, goalRing(unset ? 0 : r.progress, { met: r.status === 'met' }),
            h('span', { class: 'gw-value' }, `${Math.round((unset ? 0 : r.progress) * 100)} %`)),
          h('div', null,
            h('div', { class: 'gw-d-current' }, r.value != null ? r.def.fmt(r.value) : '–'),
            h('div', { class: 'gw-d-sub' }, r.sub, r.since ? ` · ${agoLabel(r.since)}` : ''),
            !unset ? h('div', { class: 'gw-d-target' }, `Objectif : ${r.dir === 'max' ? 'au plus ' : r.def.dirs.length > 1 ? 'au moins ' : ''}${r.def.fmt(r.cfg.target)}`) : null)),
        r.def.kind === 'lift' && r.est ? h('p', { class: 'sheet-text' }, `1RM estimé d’après tes meilleures séries : ${r.def.fmt(r.est)}.`) : null,
        h('p', { class: 'sheet-text' }, statusTxt),
        r.def.kind === 'lift' ? h('button', { class: 'link-btn', style: { alignSelf: 'flex-start' }, onClick: () => { close(); navigate(`/exercise/${r.def.exerciseId}`); } }, 'Voir la progression de l’exercice →') : null,
        h('div', { class: 'sheet-actions' },
          r.status === 'met' ? h('button', { class: 'btn', onClick: () => edit(true) }, icon('up', 16), 'Viser plus haut') : null,
          h('button', { class: 'btn primary', onClick: () => edit(false) }, unset ? 'Définir' : 'Ajuster')),
      ];
    }, { title: r.def.label });
  }

  render();
  root.append(
    h('div', { class: 'page-bg goals-bg', 'aria-hidden': 'true' }),
    h('div', { class: 'view' },
      pageHeader({ title: 'Objectifs', onBack: () => back('/') }),
      h('div', { class: 'page' },
        h('p', { class: 'muted', style: { fontSize: '13.5px', margin: '0 4px' } }, 'Calculés à partir de tes données. Touche un objectif pour le détail.'),
        grid)));
}
