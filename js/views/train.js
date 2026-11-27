// Choix de la séance à lancer.

import { h, icon } from '../core/dom.js';
import { state, activeSession, doneSessions, exerciseName, saveSession, deleteSession, templateColor } from '../core/store.js';
import { createSession, suggestTemplate } from '../core/training.js';
import { agoLabel, dateKey } from '../core/date.js';
import { fmtRange, fmtRest } from '../core/format.js';
import { back, navigate } from '../core/router.js';
import { pageHeader, sheet, confirmSheet } from '../core/ui.js';
import { unlockAudio, haptic } from '../core/feedback.js';

/** Durée estimée d'une séance type (séries × ~45 s d'effort + repos). */
export function estimateMinutes(t) {
  let sec = 0;
  for (const b of t.blocks) {
    const rounds = Math.max(...b.items.map((it) => it.sets.reduce((a, g) => a + g.n, 0)));
    const work = b.items.reduce((a, it) => a + it.sets.reduce((x, g) => x + g.n, 0) * 45 + (it.warmup ? 90 : 0), 0);
    sec += work + rounds * (b.rest || 0);
  }
  return Math.round(sec / 300) * 5;
}

export default function trainView(root) {
  const page = h('div', { class: 'page' });
  const active = activeSession();
  const templates = state.templates;
  const sessions = doneSessions();
  const suggested = suggestTemplate(templates, sessions);

  if (active) {
    page.append(h('div', { class: 'banner' }, icon('timer', 20),
      h('div', null, h('b', null, `${active.name} en cours. `), 'Reprends-la ou abandonne-la avant d’en démarrer une autre.',
        h('div', { style: { display: 'flex', gap: '8px', marginTop: '10px' } },
          h('button', { class: 'btn small primary', onClick: () => navigate('/workout', { replace: true }) }, 'Reprendre'),
          h('button', { class: 'btn small danger', onClick: async () => {
            if (await confirmSheet({ title: 'Abandonner la séance ?', message: 'Les séries saisies seront perdues.', confirmLabel: 'Abandonner', danger: true })) {
              deleteSession(active.id);
              navigate('/train', { replace: true });
            }
          } }, 'Abandonner')))));
  }

  if (!templates.length) {
    page.append(h('div', { class: 'empty' }, icon('list'), 'Aucune séance enregistrée.',
      h('div', { style: { marginTop: '14px' } }, h('button', { class: 'btn primary', onClick: () => navigate('/programs') }, 'Créer une séance'))));
  }

  for (const t of templates) {
    const last = sessions.find((s) => s.templateId === t.id);
    const exNames = t.blocks.flatMap((b) => b.items.map((it) => exerciseName(it.exerciseId)));
    const isSug = suggested?.id === t.id;
    page.append(h('button', { class: `card tpl-card ${isSug ? 'suggested' : ''}`, style: { '--tc': templateColor(t) }, onClick: () => preview(t) },
      h('span', { class: 'tpl-mark', 'aria-hidden': 'true' }, (t.name || '?').charAt(0).toUpperCase()),
      h('div', { class: 'tpl-top' },
        h('div', { style: { flex: 1, minWidth: 0 } },
          h('div', { class: 'tpl-name' }, h('span', { class: 'tpl-dot' }), t.name),
          t.subtitle ? h('div', { class: 'tpl-sub' }, t.subtitle) : null),
        isSug ? h('span', { class: 'chip accent' }, 'Suggérée') : null,
        icon('chevron', 20, 'faint')),
      h('div', { class: 'tpl-ex' }, exNames.join(' · ')),
      h('div', { class: 'tpl-meta' },
        h('span', null, `${exNames.length} exercices`),
        h('span', null, `≈ ${estimateMinutes(t)} min`),
        h('span', null, last ? `Dernière : ${agoLabel(dateKey(new Date(last.startedAt)))}` : 'Jamais faite'))));
  }

  page.append(
    h('button', { class: 'btn dashed block', onClick: () => start(null) }, icon('plus', 18), 'Séance libre'),
    h('button', { class: 'btn ghost block', onClick: () => navigate('/programs') }, icon('edit', 18), 'Gérer mes séances'),
  );

  function preview(t) {
    const tc = templateColor(t);
    sheet((close) => [
      t.subtitle ? h('p', { class: 'sheet-text' }, t.subtitle) : null,
      h('div', { class: 'list' },
        t.blocks.map((b) => {
          const ss = b.items.length > 1;
          return b.items.map((it, i) =>
            h('div', { class: 'row' },
              ss ? h('span', { class: 'ex-letter' }, String.fromCharCode(65 + i)) : null,
              h('div', { class: 'row-main' },
                h('div', { class: 'row-title' }, exerciseName(it.exerciseId)),
                h('div', { class: 'row-sub' },
                  [it.warmup ? 'Échauffement + ' : '', it.sets.map((g) => `${g.n}×${fmtRange(g.min, g.max)}${g.tag ? ` ${g.tag.toLowerCase()}` : ''}`).join(' + '),
                    !ss || i === b.items.length - 1 ? ` · repos ${fmtRest(b.rest)}` : ' · enchaîner'].join(''))),
            ));
        })),
      h('button', { class: 'btn block tc-btn', style: { height: '56px', fontSize: '17px', '--tc': tc }, onClick: () => { close(); start(t); } }, icon('play', 20), 'Commencer la séance'),
    ], { title: t.name, cls: 'tc-sheet', style: { '--tc': tc } });
  }

  function start(t) {
    if (activeSession()) {
      navigate('/workout');
      return;
    }
    unlockAudio();
    haptic();
    const s = createSession(t, { sessions: doneSessions(), exercises: state.exercises });
    s.color = templateColor(t);
    saveSession(s);
    navigate('/workout', { replace: true });
  }

  // Fond : halos aux couleurs des séances
  const glow = templates.slice(0, 4).map((t, i) => `radial-gradient(60% 26% at ${i % 2 ? 100 : 0}% ${12 + i * 24}%, color-mix(in srgb, ${templateColor(t)} 26%, transparent), transparent 70%)`);
  root.append(
    h('div', { class: 'page-bg', 'aria-hidden': 'true', style: { background: [...glow, 'var(--bg)'].join(', ') } }),
    h('div', { class: 'view' }, pageHeader({ title: 'S’entraîner', onBack: () => back('/') }), page));
}
