// Fenêtre « Voir plus » d'une carte partagée : séance réalisée (performances), séance type ou programme,
// avec import dans ses propres séances.

import { h, icon } from '../core/dom.js';
import { state, saveExercise, saveTemplate } from '../core/store.js';
import { navigate } from '../core/router.js';
import { sheet, toast } from '../core/ui.js';
import { fmtDuration, fmtVolume, fmtKg, fmtRest, fmtNum } from '../core/format.js';
import { formatLong, dateKey } from '../core/date.js';
import { cleanCard, sharedToProgram } from '../core/share.js';
import { programToTemplates } from '../core/program.js';
import { haptic } from '../core/feedback.js';

const range = (g) => (g[1] === g[2] ? `${g[1]}` : `${g[1]}-${g[2]}`);
const planText = (plan) => plan.map((g) => `${g[0]}×${range(g)}${g[3] ? ` ${g[3].toLowerCase()}` : ''}`).join(' + ');
const setText = (load, [w, r]) => (load === 'pdc' ? `${r} reps` : load === 'lest' ? `${w ? `+${fmtKg(w)} kg` : 'PDC'} × ${r}` : `${fmtKg(w)} kg × ${r}`);

/** Ajoute des séances partagées à ses séances types (exercices existants réutilisés, les autres créés). */
export function importTemplates(list) {
  const taken = new Set(state.templates.map((t) => t.name.toLowerCase()));
  const prog = programToTemplates(sharedToProgram(list), state.exercises, { startOrder: state.templates.length });
  prog.newExercises.forEach((e) => saveExercise(e));
  for (const t of prog.templates) {
    if (taken.has(t.name.toLowerCase())) t.name = `${t.name} (importée)`.slice(0, 40);
    taken.add(t.name.toLowerCase());
    saveTemplate(t);
  }
  haptic();
  const n = prog.templates.length;
  toast(n === 1 ? `« ${prog.templates[0].name} » ajoutée à tes séances` : `${n} séances ajoutées à tes séances`, {
    action: 'Voir', duration: 4500, onAction: () => navigate('/train'),
  });
  return prog.templates;
}

function exerciseRows(t, { performances = false } = {}) {
  return t.blocks.map((b) => {
    const ss = b.items.length > 1;
    return h('div', { class: `sd-block ${ss ? 'superset' : ''}` },
      ss ? h('div', { class: 'sd-ss' }, icon('link', 14), 'Superset') : null,
      b.items.map((it, i) => h('div', { class: 'sd-item' },
        h('div', { class: 'sd-name' },
          ss ? h('span', { class: 'ex-letter' }, String.fromCharCode(65 + i)) : null,
          h('b', null, it.record ? '👑 ' : '', it.name),
          it.warmup ? h('span', { class: 'chip' }, 'échauff.') : null),
        h('div', { class: 'sd-plan' }, planText(it.plan), i === b.items.length - 1 ? ` · repos ${fmtRest(b.rest)}` : ' · enchaîner'),
        performances && it.done.length ? h('div', { class: 'sd-sets' }, it.done.map((x) => h('span', { class: 'sd-set tnum' }, setText(it.load, x)))) : null,
        it.note ? h('div', { class: 'sd-note' }, it.note) : null)));
  });
}

/** Ouvre le détail d'une carte (déjà reçue ou à envoyer). `from` : prénom de l'ami qui l'a partagée. */
export function openCardDetail(payload, { from = '' } = {}) {
  const c = cleanCard(payload);
  if (!c) return;
  const by = from ? h('div', { class: 'sd-by' }, `Partagé par ${from}`) : null;

  if (c.session) {
    const s = c.session;
    const meta = [s.date ? formatLong(dateKey(new Date(s.date))) : '', s.duration ? fmtDuration(s.duration) : '', s.sets ? `${s.sets} séries` : '', s.volume ? fmtVolume(s.volume) : ''].filter(Boolean).join(' · ');
    const records = s.blocks.flatMap((b) => b.items).filter((it) => it.record).length;
    sheet((close) => [
      by,
      h('div', { class: 'sd-head', style: c.color ? { '--cc': c.color } : null },
        h('span', { class: 'chat-card-emoji' }, c.emoji),
        h('div', null, h('b', { class: 'sd-title' }, s.name), h('div', { class: 'sd-meta' }, meta), records ? h('div', { class: 'sd-rec' }, `👑 ${records} record${records > 1 ? 's' : ''} battu${records > 1 ? 's' : ''}`) : null)),
      h('div', { class: 'section-title' }, 'Performances'),
      ...exerciseRows(s, { performances: true }),
      h('button', { class: 'btn primary block', onClick: () => { importTemplates([s]); close(); } }, icon('download', 18), 'Importer la séance'),
      h('p', { class: 'sd-hint' }, 'La séance rejoint tes séances types avec ses exercices, séries et temps de repos. Les charges partent de tes propres performances.'),
    ], { title: 'Séance partagée', cls: 'sd-sheet' });
    return;
  }

  if (c.template) {
    const t = c.template;
    sheet((close) => [
      by,
      h('div', { class: 'sd-head', style: t.color ? { '--cc': t.color } : null },
        h('span', { class: 'chat-card-emoji' }, '📋'),
        h('div', null, h('b', { class: 'sd-title' }, t.name), t.subtitle ? h('div', { class: 'sd-meta' }, t.subtitle) : null)),
      ...exerciseRows(t),
      h('button', { class: 'btn primary block', onClick: () => { importTemplates([t]); close(); } }, icon('download', 18), 'Importer la séance'),
    ], { title: 'Séance partagée', cls: 'sd-sheet' });
    return;
  }

  if (c.program) {
    const p = c.program;
    sheet((close) => [
      by,
      h('div', { class: 'sd-head' }, h('span', { class: 'chat-card-emoji' }, '🗂️'),
        h('div', null, h('b', { class: 'sd-title' }, p.name), h('div', { class: 'sd-meta' }, `${p.templates.length} séance${p.templates.length > 1 ? 's' : ''}`))),
      ...p.templates.map((t) => h('details', { class: 'sd-tpl', style: t.color ? { '--cc': t.color } : null },
        h('summary', null, h('span', { class: 'tpl-dot' }), h('b', null, t.name),
          h('span', { class: 'sd-meta' }, `${fmtNum(t.blocks.reduce((a, b) => a + b.items.length, 0))} exercices`), icon('down', 16, 'chat-card-caret')),
        ...exerciseRows(t),
        h('button', { class: 'btn small', onClick: () => importTemplates([t]) }, icon('download', 16), `Importer « ${t.name} » seule`))),
      h('button', { class: 'btn primary block', onClick: () => { importTemplates(p.templates); close(); } }, icon('download', 18), `Importer le programme (${p.templates.length} séances)`),
    ], { title: 'Programme partagé', cls: 'sd-sheet' });
  }
}
