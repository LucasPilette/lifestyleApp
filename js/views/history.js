// Historique : séances passées et progression par exercice.

import { h, icon } from '../core/dom.js';
import { state, doneSessions, sessionColor } from '../core/store.js';
import { sessionStats, exerciseHistory } from '../core/training.js';
import { fmtDuration, fmtVolume, fmtKg } from '../core/format.js';
import { back, navigate } from '../core/router.js';
import { pageHeader, segmented } from '../core/ui.js';
import { dateKey, formatMonthLong, relativeDay, formatTime, agoLabel } from '../core/date.js';

export default function historyView(root) {
  let tab = sessionStorage.getItem('historyTab') || 'sessions';
  const content = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '14px' } });

  function renderSessions() {
    const sessions = doneSessions();
    if (!sessions.length) {
      content.replaceChildren(h('div', { class: 'empty' }, icon('history'), 'Aucune séance pour l’instant. Lance ta première depuis l’accueil !'));
      return;
    }
    const byMonth = new Map();
    for (const s of sessions) {
      const k = dateKey(new Date(s.startedAt)).slice(0, 7) + '-01';
      byMonth.set(k, [...(byMonth.get(k) || []), s]);
    }
    const bw = state.settings.bodyweight;
    content.replaceChildren(...[...byMonth.entries()].flatMap(([month, list]) => [
      h('div', { class: 'section-title' }, `${formatMonthLong(month)} · ${list.length} séance${list.length > 1 ? 's' : ''}`),
      h('div', { class: 'list' }, list.map((s) => {
        const st = sessionStats(s, state.exercises, bw);
        return h('button', { class: 'row', onClick: () => navigate(`/log/${s.id}`) },
          h('span', { class: 'tc-dot', style: { '--tc': sessionColor(s) || 'var(--text-3)' } }),
          h('div', { class: 'row-main' },
            h('div', { class: 'row-title' }, s.name),
            h('div', { class: 'row-sub' }, `${relativeDay(dateKey(new Date(s.startedAt)))} · ${formatTime(s.startedAt)} · ${fmtDuration(st.duration)}`)),
          h('div', { class: 'row-end' }, h('div', null, `${st.sets} séries`), h('div', { class: 'faint', style: { fontSize: '12.5px' } }, fmtVolume(st.volume))),
          icon('chevron', 18, 'chev'));
      })),
    ]));
  }

  function renderExercises() {
    const sessions = doneSessions();
    const bw = state.settings.bodyweight;
    const rows = [];
    for (const ex of state.exercises.values()) {
      const hist = exerciseHistory(ex.id, sessions, ex, bw);
      if (!hist.length) continue;
      const best = hist.reduce((a, b) => (b.e1rm > a.e1rm ? b : a));
      rows.push({ ex, last: hist[0], count: hist.length, best });
    }
    rows.sort((a, b) => b.last.date - a.last.date);
    content.replaceChildren(
      rows.length
        ? h('div', { class: 'list' }, rows.map(({ ex, last, count, best }) =>
            h('button', { class: 'row', onClick: () => navigate(`/exercise/${ex.id}`) },
              h('div', { class: 'row-main' },
                h('div', { class: 'row-title' }, ex.name),
                h('div', { class: 'row-sub' }, `${count} séance${count > 1 ? 's' : ''} · ${agoLabel(dateKey(new Date(last.date)))}`)),
              h('div', { class: 'row-end' },
                ex.load === 'pdc' ? `${best.maxReps} reps` : h('div', null, `${fmtKg(Math.round(best.e1rm * 2) / 2)} kg`, h('div', { class: 'faint', style: { fontSize: '11.5px' } }, '1RM estimé'))),
              icon('chevron', 18, 'chev'))))
        : h('div', { class: 'empty' }, icon('chart'), 'Les exercices apparaîtront ici après ta première séance.'),
    );
  }

  const render = () => (tab === 'sessions' ? renderSessions() : renderExercises());
  const page = h('div', { class: 'page' },
    segmented([['sessions', 'Séances'], ['exercises', 'Exercices']], tab, (t) => {
      tab = t;
      sessionStorage.setItem('historyTab', t);
      render();
    }),
    content);
  render();
  root.append(h('div', { class: 'view' }, pageHeader({ title: 'Historique', onBack: () => back('/') }), page));
}
