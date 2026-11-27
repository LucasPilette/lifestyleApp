// Suivi détaillé d'un indicateur : graphiques par jours / semaines / mois et statistiques.

import { h } from '../core/dom.js';
import { state } from '../core/store.js';
import { todayKey, formatShort, relativeDay } from '../core/date.js';
import { METRICS, periodData, summary } from '../core/metrics.js';
import { mountChart } from '../components/chart.js';
import { back, navigate } from '../core/router.js';
import { pageHeader, segmented } from '../core/ui.js';
import { fmtDelta, fmtNum } from '../core/format.js';
import { QUALITY_LABELS } from './home.js';

const PAGES = {
  sommeil: { title: 'Sommeil', fields: ['sleepMin', 'sleepQ'] },
  nutrition: { title: 'Nutrition', fields: ['kcal', 'prot'] },
  pas: { title: 'Pas', fields: ['steps'] },
};

const PERIODS = [['jours', '30 jours'], ['semaines', 'Semaines'], ['mois', 'Mois']];

export default function metricView(root, pageId) {
  const def = PAGES[pageId];
  const today = todayKey();
  const goals = state.settings.goals;
  const key = `period:${pageId}`;
  let period = sessionStorage.getItem(key) || 'jours';
  const charts = [];

  const body = h('div', { class: 'page' });
  const sections = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '14px' } });

  function renderSections() {
    charts.forEach((c) => c.destroy());
    charts.length = 0;
    sections.replaceChildren();
    for (const field of def.fields) {
      const m = METRICS[field];
      const data = periodData(state.days, field, period, today);
      const goal = m.goalType ? goals[field] : null;
      const host = h('div');
      const delta = data.current != null && data.previous != null ? data.current - data.previous : null;
      const legend = h('div', { class: 'legend' },
        h('span', null, h('i', { style: { background: m.color } }), period === 'jours' ? 'Par jour' : 'Moyenne'),
        data.overlay ? h('span', null, h('i', { class: 'line' }), 'Moyenne 7 j') : null,
        goal ? h('span', null, h('i', { class: 'dash' }), `Objectif ${m.fmt(goal)}`) : null);
      sections.append(h('section', { class: 'card', style: { display: 'flex', flexDirection: 'column', gap: '14px' } },
        h('div', { class: 'hero' },
          h('div', null,
            h('div', { class: 'hero-label' }, `${m.label} · ${data.currentLabel.toLowerCase()}`),
            h('div', { class: 'hero-value' }, data.current != null ? m.fmt(data.current) : '–')),
          h('div', { class: 'hero-delta' }, delta != null ? [fmtDelta(delta, m.fmtDelta), h('br'), data.previousLabel] : '')),
        host,
        legend,
        statsGrid(field, goal)));
      charts.push(mountChart(host, {
        type: 'bar',
        points: data.points,
        overlay: data.overlay,
        color: m.color,
        goal,
        maxY: m.maxY,
        step: m.step,
        format: m.fmt,
        tick: m.tick,
        height: 190,
        ariaLabel: `${m.label}, ${PERIODS.find((p) => p[0] === period)[1]}`,
      }));
    }
  }

  function statsGrid(field, goal) {
    const m = METRICS[field];
    const sm = summary(state.days, field, goal, today);
    const stat = (label, value, sub) => h('div', { class: 'stat' }, h('div', { class: 'stat-label' }, label), h('div', { class: 'stat-value' }, value), sub ? h('div', { class: 'stat-sub' }, sub) : null);
    const items = [
      stat('Moy. 7 j', sm.avg7 != null ? m.fmt(sm.avg7) : '–', sm.delta7 != null ? fmtDelta(sm.delta7, m.fmtDelta) : `${sm.count7}/7 j`),
      stat('Moy. 30 j', sm.avg30 != null ? m.fmt(sm.avg30) : '–', `${sm.count30}/30 j saisis`),
    ];
    if (m.goalType) {
      items.push(stat('Objectif', sm.hitRate != null ? `${fmtNum(Math.round(sm.hitRate * 100))} %` : '–', sm.hits != null ? `${sm.hits} j sur 30` : ''));
      items.push(stat('Série', `${sm.streak} j`, 'objectif atteint'));
    }
    items.push(stat('Max 30 j', sm.max ? m.fmt(sm.max.value) : '–', sm.max ? formatShort(sm.max.key) : ''));
    items.push(stat('Min 30 j', sm.min ? m.fmt(sm.min.value) : '–', sm.min ? formatShort(sm.min.key) : ''));
    return h('div', { class: 'stat-grid' }, items);
  }

  // Dernières saisies (tap = ouvrir le jour sur l'accueil pour corriger)
  function entries() {
    const rows = [...state.days.values()]
      .filter((d) => def.fields.some((f) => d[f] != null))
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .slice(0, 21);
    if (!rows.length) return h('div', { class: 'empty' }, 'Aucune saisie pour le moment. Renseigne tes valeurs depuis l’accueil.');
    return h('div', { class: 'list' },
      rows.map((d) =>
        h('button', { class: 'row', onClick: () => navigate(d.date === today ? '/' : `/day/${d.date}`) },
          h('div', { class: 'row-main' },
            h('div', { class: 'row-title' }, relativeDay(d.date, today)),
            pageId === 'sommeil' && d.sleepQ ? h('div', { class: 'row-sub' }, `Qualité ${d.sleepQ}/5 · ${QUALITY_LABELS[d.sleepQ]}`) : null),
          h('div', { class: 'row-end' },
            def.fields.filter((f) => !(pageId === 'sommeil' && f === 'sleepQ')).map((f, i) =>
              h('div', { style: i ? { fontSize: '12.5px', color: 'var(--text-3)' } : { color: 'var(--text)', fontWeight: 600 } }, d[f] != null ? METRICS[f].fmt(d[f]) : '–'))))));
  }

  body.append(
    segmented(PERIODS, period, (p) => {
      period = p;
      sessionStorage.setItem(key, p);
      renderSections();
    }),
    sections,
    h('div', { class: 'section-title' }, 'Dernières saisies'),
    entries(),
  );

  root.append(h('div', { class: 'view' }, pageHeader({ title: def.title, onBack: () => back('/') }), body));
  renderSections();
  return () => charts.forEach((c) => c.destroy());
}
