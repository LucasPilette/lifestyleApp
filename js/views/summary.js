// Bilan affiché à la fin d'une séance.

import { h, icon } from '../core/dom.js';
import { state, getSession, getExercise, exerciseName, saveSession, doneSessions, sessionColor } from '../core/store.js';
import { sessionStats, sessionRecords, setsSummary } from '../core/training.js';
import { fmtDuration, fmtVolume, fmtKg, fmtNum } from '../core/format.js';
import { navigate } from '../core/router.js';
import { formatLong, dateKey } from '../core/date.js';

export default function summaryView(root, id) {
  const s = getSession(id);
  if (!s) {
    navigate('/', { replace: true });
    return;
  }
  const bw = state.settings.bodyweight;
  const stats = sessionStats(s, state.exercises, bw);
  const records = sessionRecords(s, state.sessions, state.exercises, bw);
  const prev = doneSessions().find((x) => x.id !== s.id && x.templateId && x.templateId === s.templateId && x.startedAt < s.startedAt);
  const prevStats = prev ? sessionStats(prev, state.exercises, bw) : null;
  const volDelta = prevStats && prevStats.volume ? (stats.volume - prevStats.volume) / prevStats.volume : null;

  const tile = (label, value, sub) => h('div', { class: 'tile' }, h('div', { class: 'tile-label' }, label), h('div', { class: 'tile-value' }, value), sub ? h('div', { class: 'tile-sub' }, sub) : null);

  const note = h('textarea', { class: 'text-input', rows: 3, placeholder: 'Comment s’est passée la séance ?' }, s.note || '');
  note.addEventListener('change', () => {
    s.note = note.value;
    saveSession(s);
  });

  const page = h('div', { class: 'page' },
    h('div', { class: 'summary-hero' },
      h('div', { class: 'summary-badge', style: sessionColor(s) ? { background: sessionColor(s) } : null }, icon(records.length ? 'trophy' : 'check')),
      h('h1', null, records.length ? 'Nouveaux records !' : 'Séance terminée'),
      h('p', null, `${s.name} · ${formatLong(dateKey(new Date(s.startedAt)))}`)),
    h('div', { class: 'tiles' },
      tile('Durée', fmtDuration(stats.duration)),
      tile('Volume', fmtVolume(stats.volume), volDelta != null ? `${volDelta >= 0 ? '▲' : '▼'} ${fmtNum(Math.abs(volDelta * 100))} % vs dernière ${s.name}` : null),
      tile('Séries', fmtNum(stats.sets), `${fmtNum(stats.reps)} répétitions`),
      tile('Exercices', fmtNum(stats.exercises))),
    records.length
      ? [h('div', { class: 'section-title' }, 'Records battus'),
        h('div', { class: 'list' }, records.map((r) => {
          const ex = getExercise(r.exerciseId);
          return h('div', { class: 'row record-row' }, icon('trophy', 20),
            h('div', { class: 'row-main' },
              h('div', { class: 'row-title' }, exerciseName(r.exerciseId)),
              h('div', { class: 'row-sub' }, r.type === 'weight' ? 'Charge la plus lourde' : '1RM estimé : ' + fmtKg(Math.round(r.value * 2) / 2) + ' kg')),
            h('div', { class: 'row-end' }, ex?.load === 'pdc' ? `${r.r} reps` : `${fmtKg(r.w)} kg × ${r.r}`));
        }))]
      : null,
    h('div', { class: 'section-title' }, 'Détail'),
    h('div', { class: 'list' },
      s.blocks.flatMap((b) => b.items).map((it) => {
        const ex = getExercise(it.exerciseId);
        const work = it.sets.filter((x) => x.kind === 'work');
        return h('button', { class: 'row', onClick: () => navigate(`/exercise/${it.exerciseId}`) },
          h('div', { class: 'row-main' },
            h('div', { class: 'row-title' }, exerciseName(it.exerciseId)),
            h('div', { class: 'row-sub' }, work.length ? setsSummary(work, ex) : 'Échauffement uniquement')),
          icon('chevron', 18, 'chev'));
      })),
    h('div', { class: 'section-title' }, 'Note'),
    note,
    h('button', { class: 'btn primary block', style: { height: '56px', marginTop: '6px' }, onClick: () => navigate('/', { replace: true }) }, 'Retour à l’accueil'));

  root.append(h('div', { class: 'view' }, h('div', { style: { height: 'var(--safe-t)' } }), page));
}
