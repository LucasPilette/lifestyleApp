// Calendrier du mois (ouvert en touchant la date de l'accueil) : goutte des jours arrosés, engrais des jours rattrapés,
// pastilles des données saisies aux couleurs des rubriques, toucher un jour pour l'ouvrir.

import { h, icon } from '../core/dom.js';
import { state } from '../core/store.js';
import { addDays, addMonths, formatMonthLong, monthEnd, monthStart, parseKey } from '../core/date.js';
import { dayEntries } from '../core/metrics.js';
import { sheet } from '../core/ui.js';

// Même ordre et mêmes couleurs que les rubriques de l'accueil
const DOTS = [
  { id: 'sleep', label: 'Sommeil', c: 'var(--c-sleep)' },
  { id: 'mood', label: 'Humeur', c: 'var(--c-mood)' },
  { id: 'weight', label: 'Poids', c: 'var(--c-weight)' },
  { id: 'nutrition', label: 'Nutrition', c: 'var(--c-kcal)' },
  { id: 'steps', label: 'Pas', c: 'var(--c-steps)' },
  { id: 'training', label: 'Séance', c: 'var(--accent)' },
  { id: 'routines', label: 'Routines', c: 'var(--c-routine)' },
];
const WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

/**
 * @param {object} o
 * @param {string} o.selected jour affiché
 * @param {string} o.today
 * @param {string[]} [o.widgets] widgets affichés à l'accueil (pastilles et légende limitées à ceux-ci)
 * @param {object[]} [o.customs] widgets personnalisés (une pastille chacun, à leur couleur)
 * @param {(key: string) => boolean} o.isWatered jour arrosé (réussi)
 * @param {(key: string) => boolean} [o.isSaved] jour oublié rattrapé par un engrais
 * @param {Map<string, {count: number, color: string|null}>} o.sessionDays séances terminées par jour
 * @param {(key: string) => void} o.onPick
 */
export function openCalendar({ selected, today, widgets, customs = [], isWatered, isSaved = () => false, sessionDays, onPick }) {
  const dotsShown = [
    ...DOTS.filter((d) => !widgets || widgets.includes(d.id)),
    ...customs.filter((c) => !widgets || widgets.includes(c.id)).map((c) => ({ id: c.id, label: c.name, c: c.color, custom: true })),
  ];
  let month = monthStart(selected);
  const currentMonth = monthStart(today);
  const title = h('div', { class: 'cal-title' });
  const stats = h('div', { class: 'cal-stats' });
  const grid = h('div', { class: 'cal-grid', role: 'grid' });
  const prevBtn = h('button', { class: 'icon-btn small', 'aria-label': 'Mois précédent', onClick: () => go(-1) }, icon('back', 18));
  const nextBtn = h('button', { class: 'icon-btn small', 'aria-label': 'Mois suivant', onClick: () => go(1) }, icon('chevron', 18));
  let close;

  function go(n) {
    const m = addMonths(month, n);
    if (m > currentMonth) return;
    month = m;
    render();
  }

  function render() {
    title.textContent = formatMonthLong(month);
    nextBtn.disabled = month >= currentMonth;
    const end = monthEnd(month);
    const lead = (parseKey(month).getDay() + 6) % 7; // lundi = 0
    const cells = Array.from({ length: lead }, () => h('span', { class: 'cal-day blank', 'aria-hidden': 'true' }));
    let flames = 0;
    let sessions = 0;
    for (let k = month; k <= end; k = addDays(k, 1)) {
      const entries = dayEntries(state.days.get(k));
      const trained = sessionDays.get(k);
      const lit = isWatered(k);
      const saved = !lit && isSaved(k);
      const future = k > today;
      if (lit) flames++;
      if (trained && dotsShown.some((d) => d.id === 'training')) sessions += trained.count;
      const day = state.days.get(k);
      const dots = dotsShown.filter((d) => (d.id === 'training' ? trained : d.custom ? day?.custom?.[d.id] != null : entries[d.id]));
      const n = parseKey(k).getDate();
      cells.push(h('button', {
        class: `cal-day ${lit ? 'lit' : ''} ${saved ? 'saved' : ''} ${k === today ? 'today' : ''} ${k === selected ? 'sel' : ''} ${future ? 'future' : ''}`,
        disabled: future,
        'aria-label': `${n}${lit ? ', arrosé' : saved ? ', rattrapé par un engrais' : ''}${dots.length ? `, ${dots.map((d) => d.label).join(', ')}` : ''}`,
        onClick: () => {
          close();
          if (k !== selected) onPick(k);
        },
      },
        lit || saved ? h('span', { class: 'cal-flame', 'aria-hidden': 'true' }, icon(lit ? 'drop' : 'fertilizer', 11)) : null,
        h('span', { class: 'cal-num' }, n),
        h('span', { class: 'cal-dots', 'aria-hidden': 'true' },
          dots.map((d) => h('i', { style: { '--c': d.id === 'training' ? trained.color || d.c : d.c } })))));
    }
    grid.replaceChildren(...cells);
    stats.replaceChildren(
      h('span', { class: 'cal-stat flame' }, icon('drop', 14), `${flames} jour${flames > 1 ? 's' : ''} arrosé${flames > 1 ? 's' : ''}`),
      dotsShown.some((d) => d.id === 'training') ? h('span', { class: 'cal-stat' }, icon('dumbbell', 14), `${sessions} séance${sessions > 1 ? 's' : ''}`) : '');
  }

  close = sheet((c) => {
    render();
    return [
      h('div', { class: 'cal-nav' }, prevBtn, title, nextBtn),
      stats,
      h('div', { class: 'cal-week', 'aria-hidden': 'true' }, WEEKDAYS.map((d) => h('span', null, d))),
      grid,
      // Séance : pastille multicolore, chaque jour prend la couleur de sa séance
      h('div', { class: 'cal-legend' }, dotsShown.map((d) => h('span', { class: d.id === 'training' ? 'multi' : '', style: { '--c': d.c } }, h('i'), d.label))),
      selected !== today
        ? h('button', { class: 'btn primary block', onClick: () => { c(); onPick(today); } }, 'Revenir à aujourd’hui')
        : null,
    ];
  }, { title: 'Calendrier', cls: 'cal-sheet' });
}
