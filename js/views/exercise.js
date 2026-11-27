// Fiche exercice : records, courbe de progression, historique des séries.

import { h, icon, iconButton } from '../core/dom.js';
import { state, getExercise, doneSessions } from '../core/store.js';
import { exerciseHistory, exerciseRecords, setsSummary } from '../core/training.js';
import { fmtKg, fmtNum, fmtVolume } from '../core/format.js';
import { back, navigate } from '../core/router.js';
import { pageHeader, segmented } from '../core/ui.js';
import { formatShort, dateKey, dayMonth } from '../core/date.js';
import { mountChart } from '../components/chart.js';
import { editExercise } from '../components/exercise-picker.js';

export default function exerciseView(root, id) {
  const ex = getExercise(id);
  if (!ex) {
    back('/history');
    return;
  }
  const bw = state.settings.bodyweight;
  const sessions = doneSessions();
  const hist = exerciseHistory(id, sessions, ex, bw);
  const rec = exerciseRecords(id, sessions, ex, bw);
  const isPdc = ex.load === 'pdc';
  const isLest = ex.load === 'lest';
  let chart = null;

  const kg = (v) => `${fmtKg(Math.round(v * 2) / 2)} kg`;
  const stat = (label, value, sub) => h('div', { class: 'stat' }, h('div', { class: 'stat-label' }, label), h('div', { class: 'stat-value' }, value), sub ? h('div', { class: 'stat-sub' }, sub) : null);
  const recDate = (r) => (r ? formatShort(dateKey(new Date(r.date))) : '');

  const page = h('div', { class: 'page' });
  const typeLabel = ex.load === 'lest' ? 'Poids du corps + lest' : ex.load === 'pdc' ? 'Poids du corps' : 'Charge';
  page.append(h('div', { class: 'muted', style: { fontSize: '14px', margin: '0 4px' } }, `${ex.muscle} · ${typeLabel}`));

  if (!hist.length) {
    page.append(h('div', { class: 'empty' }, icon('chart'), 'Pas encore d’historique pour cet exercice.'));
  } else {
    page.append(h('div', { class: 'stat-grid' },
      isPdc
        ? stat('Record reps', `${rec.reps?.r ?? '–'}`, recDate(rec.reps))
        : stat(isLest && !bw ? 'Lest max' : 'Charge max', rec.weight ? kg(rec.weight.w) : '–', rec.weight ? `× ${rec.weight.r} · ${recDate(rec.weight)}` : ''),
      !isPdc && (!isLest || bw) ? stat('1RM estimé', rec.e1rm ? kg(rec.e1rm.value) : '–', rec.e1rm ? `${fmtKg(rec.e1rm.w)}×${rec.e1rm.r} · ${recDate(rec.e1rm)}` : '') : stat('Reps max', `${rec.reps?.r ?? '–'}`, recDate(rec.reps)),
      stat('Séances', fmtNum(hist.length), `depuis le ${formatShort(dateKey(new Date(hist[hist.length - 1].date)))}`)));

    // Métriques disponibles pour la courbe
    const metrics = [];
    if (!isPdc && (!isLest || bw)) metrics.push(['e1rm', '1RM']);
    if (!isPdc) metrics.push(['top', isLest ? 'Lest' : 'Charge']);
    metrics.push(['reps', 'Reps']);
    if (!isPdc) metrics.push(['volume', 'Volume']);
    let metric = metrics[0][0];
    const host = h('div');
    const draw = () => {
      chart?.destroy();
      const pts = [...hist].reverse().slice(-24).map((x) => {
        const v = metric === 'e1rm' ? x.e1rm : metric === 'top' ? x.topW : metric === 'reps' ? x.maxReps : x.volume;
        return { label: dayMonth(dateKey(new Date(x.date))), value: v, tip: `${formatShort(dateKey(new Date(x.date)))} · ${x.name}`, sub: setsSummary(x.sets, ex) };
      });
      const fmt = metric === 'reps' ? (v) => `${fmtNum(v)} reps` : metric === 'volume' ? fmtVolume : kg;
      chart = mountChart(host, { type: 'line', points: pts, color: 'var(--accent)', format: fmt, tick: (v) => fmtNum(v), height: 190, zeroBased: metric === 'volume', connectGaps: true, ariaLabel: `Progression ${ex.name}` });
    };
    page.append(h('section', { class: 'card', style: { display: 'flex', flexDirection: 'column', gap: '12px' } },
      metrics.length > 1 ? segmented(metrics, metric, (m) => { metric = m; draw(); }) : null,
      host));
    requestAnimationFrame(draw);

    page.append(h('div', { class: 'section-title' }, 'Historique'),
      h('div', { class: 'list' }, hist.map((x) =>
        h('button', { class: 'row', onClick: () => navigate(`/log/${x.sessionId}`) },
          h('div', { class: 'row-main' },
            h('div', { class: 'row-title' }, `${formatShort(dateKey(new Date(x.date)))} · ${x.name}`),
            h('div', { class: 'row-sub', style: { whiteSpace: 'normal' } }, setsSummary(x.sets, ex))),
          !isPdc && (!isLest || bw) ? h('div', { class: 'row-end faint', style: { fontSize: '12.5px' } }, `1RM ${kg(x.e1rm)}`) : null))));
  }

  if (isLest && !bw) {
    page.append(h('div', { class: 'banner' }, icon('info', 20), h('div', null, 'Renseigne ton poids de corps dans les réglages pour calculer le 1RM des exercices lestés.')));
  }

  root.append(h('div', { class: 'view' }, pageHeader({
    title: ex.name,
    onBack: () => back('/history'),
    actions: [iconButton('edit', 'Modifier l’exercice', async () => {
      const saved = await editExercise(ex);
      if (saved) navigate(`/exercise/${id}`, { replace: true });
    })],
  }), page));
  return () => chart?.destroy();
}
