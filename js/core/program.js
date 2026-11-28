// Programmes : conversion d'un programme créé par le coach IA en séances types de l'app,
// et programme exemple. Pur (aucun DOM) : testable sous Node.

import { uid, slugify, normalize } from './util.js';
import { MUSCLES, TEMPLATE_COLORS, seedTemplates } from '../data/seed.js';

const int = (v, lo, hi, d) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
};
const text = (s, max) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/**
 * Convertit la réponse du coach (voir supabase/functions/coach) en séances types, en la validant :
 * exercices inconnus ignorés, valeurs bornées, nouveaux exercices créés (ou rapprochés d'un existant par le nom),
 * une seule série d'échauffement par séance.
 * @param {object} raw réponse { name, summary, new_exercises, sessions }
 * @param {Map<string, object>} exercises bibliothèque actuelle
 * @param {{ startOrder?: number, now?: number }} opts
 * @returns {{ name: string, summary: string, templates: object[], newExercises: object[], skipped: string[] }}
 */
export function programToTemplates(raw, exercises, { startOrder = 0, now = Date.now() } = {}) {
  const skipped = [];
  const byName = new Map([...exercises.values()].map((e) => [normalize(e.name), e.id]));
  const taken = new Set(exercises.keys());
  const newExercises = [];
  const alias = new Map(); // id temporaire -> id réel

  for (const e of Array.isArray(raw?.new_exercises) ? raw.new_exercises : []) {
    const name = text(e?.name, 60);
    if (!name || !e?.id) continue;
    const existing = byName.get(normalize(name));
    if (existing) {
      alias.set(e.id, existing);
      continue;
    }
    let id = slugify(name) || 'exercice';
    while (taken.has(id)) id += '_';
    taken.add(id);
    const load = ['kg', 'lest', 'pdc'].includes(e.load) ? e.load : 'kg';
    newExercises.push({ id, name, muscle: MUSCLES.includes(e.muscle) ? e.muscle : 'Autre', load, inc: load === 'pdc' ? 0 : 2.5, bar: false, custom: true });
    byName.set(normalize(name), id);
    alias.set(e.id, id);
  }
  const resolve = (ref) => (exercises.has(ref) ? ref : alias.get(ref) || null);

  const templates = [];
  for (const [si, s] of (Array.isArray(raw?.sessions) ? raw.sessions : []).slice(0, 7).entries()) {
    const blocks = [];
    let warmupUsed = false;
    for (const b of Array.isArray(s?.blocks) ? s.blocks : []) {
      const items = [];
      for (const it of (Array.isArray(b?.items) ? b.items : []).slice(0, 3)) {
        const exerciseId = resolve(it?.exercise_id);
        if (!exerciseId) {
          skipped.push(String(it?.exercise_id ?? '?'));
          continue;
        }
        const sets = (Array.isArray(it.sets) ? it.sets : []).slice(0, 3).map((g) => {
          const min = int(g?.reps_min, 1, 50, 8);
          return { n: int(g?.count, 1, 8, 3), min, max: Math.max(min, int(g?.reps_max, 1, 60, min)), tag: text(g?.label, 14) };
        });
        const warmup = !!it.warmup && !warmupUsed;
        if (warmup) warmupUsed = true;
        items.push({
          id: uid(), exerciseId, alternatives: [], warmup, note: text(it.note, 120),
          sets: sets.length ? sets : [{ n: 3, min: 8, max: 12, tag: '' }],
        });
      }
      if (items.length) blocks.push({ id: uid(), rest: int(b.rest_seconds, 0, 600, 120), items });
    }
    if (!blocks.length) continue;
    const order = startOrder + templates.length;
    templates.push({
      id: uid(), name: text(s.name, 40) || `Séance ${si + 1}`, subtitle: text(s.subtitle, 80),
      color: TEMPLATE_COLORS[order % TEMPLATE_COLORS.length], order, blocks, createdAt: now,
    });
  }
  // Les exercices créés mais jamais utilisés ne sont pas ajoutés à la bibliothèque.
  const used = new Set(templates.flatMap((t) => t.blocks.flatMap((b) => b.items.map((it) => it.exerciseId))));
  return {
    name: text(raw?.name, 60) || 'Mon programme',
    summary: text(raw?.summary, 400),
    templates,
    newExercises: newExercises.filter((e) => used.has(e.id)),
    skipped,
  };
}

/** Programme exemple (haut / bas du corps, 4 séances), avec des noms génériques et de nouveaux identifiants. */
export function exampleProgram({ startOrder = 0, now = Date.now() } = {}) {
  const NAMES = { 'upper-a': 'Haut du corps A', 'lower-a': 'Bas du corps A', 'upper-b': 'Haut du corps B', 'lower-b': 'Bas du corps B' };
  return seedTemplates().map((t, i) => ({ ...t, id: uid(), name: NAMES[t.id] || t.name, order: startOrder + i, createdAt: now }));
}
