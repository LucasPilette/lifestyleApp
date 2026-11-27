// Logique d'entraînement pure (sans DOM ni stockage) : testable sous Node.
//
// Modèles :
//  Template  { id, name, subtitle, order, blocks: [Block] }
//  Block     { id, rest (s), items: [TItem] }            // >1 item = superset
//  TItem     { id, exerciseId, alternatives: [id], sets: [{ n, min, max, tag }], warmup, note }
//  Session   { id, templateId, name, startedAt, endedAt, status: 'active'|'done', note,
//              blocks: [{ id, rest, items: [SItem] }], rest: { start, end } | null }
//  SItem     { id, exerciseId, alternatives, note, plan: { sets, warmup }, prev, hints: [string], sets: [SSet] }
//  SSet      { id, kind: 'warmup'|'work', tag, min, max, w, r, pw, pr, done, doneAt }
//            w/r = valeurs saisies ; pw/pr = valeurs proposées (placeholders)

import { fmtKg } from './format.js';
import { uid } from './util.js';

export const DEFAULT_PLAN = { sets: [{ n: 3, min: 8, max: 12, tag: '' }], warmup: false };
export const DEFAULT_REST = 120;

// --- Calculs de base -----------------------------------------------------

/** 1RM estimé (Epley). */
export function e1rm(load, reps) {
  if (!load || !reps) return 0;
  return reps === 1 ? load : load * (1 + reps / 30);
}

/** Charge réellement déplacée selon le type d'exercice. */
export function loadOf(exercise, w, bodyweight) {
  const type = exercise?.load || 'kg';
  if (type === 'lest') return (bodyweight || 0) + (w || 0);
  if (type === 'pdc') return bodyweight || 0;
  return w || 0;
}

export function roundTo(w, step = 2.5) {
  if (!step) return w;
  return Math.round(w / step) * step;
}

const isWorkDone = (s) => s.done && s.kind === 'work';

// --- Historique ----------------------------------------------------------

/**
 * Dernière réalisation d'un exercice. Priorité aux séances du même modèle
 * (ex. tractions lourdes en Upper A vs légères en Upper B).
 */
export function lastPerformance(exerciseId, templateId, sessions, excludeId = null) {
  let fallback = null;
  for (const s of sessions) {
    if (s.status !== 'done' || s.id === excludeId) continue;
    for (const b of s.blocks) {
      for (const it of b.items) {
        if (it.exerciseId !== exerciseId) continue;
        const sets = it.sets.filter(isWorkDone);
        if (!sets.length) continue;
        const perf = { sessionId: s.id, date: s.startedAt, templateId: s.templateId, sets };
        if (!templateId || s.templateId === templateId) return perf;
        if (!fallback) fallback = perf;
      }
    }
  }
  return fallback;
}

/** Toutes les réalisations d'un exercice, de la plus récente à la plus ancienne. */
export function exerciseHistory(exerciseId, sessions, exercise, bodyweight) {
  const out = [];
  for (const s of sessions) {
    if (s.status !== 'done') continue;
    const sets = [];
    for (const b of s.blocks) for (const it of b.items) {
      if (it.exerciseId === exerciseId) sets.push(...it.sets.filter(isWorkDone));
    }
    if (!sets.length) continue;
    let best = 0;
    let topW = -Infinity;
    let maxReps = 0;
    let volume = 0;
    for (const st of sets) {
      const load = loadOf(exercise, st.w, bodyweight);
      best = Math.max(best, e1rm(load, st.r));
      topW = Math.max(topW, st.w || 0);
      maxReps = Math.max(maxReps, st.r || 0);
      volume += load * (st.r || 0);
    }
    out.push({ sessionId: s.id, date: s.startedAt, name: s.name, templateId: s.templateId, sets, e1rm: best, topW, maxReps, volume });
  }
  return out;
}

/** Records d'un exercice (optionnellement avant une date). */
export function exerciseRecords(exerciseId, sessions, exercise, bodyweight, beforeTs = Infinity, excludeId = null) {
  const rec = { e1rm: null, weight: null, reps: null };
  for (const h of exerciseHistory(exerciseId, sessions, exercise, bodyweight)) {
    if (h.date >= beforeTs || h.sessionId === excludeId) continue;
    for (const st of h.sets) {
      const load = loadOf(exercise, st.w, bodyweight);
      const est = e1rm(load, st.r);
      if (est > 0 && (!rec.e1rm || est > rec.e1rm.value)) rec.e1rm = { value: est, w: st.w, r: st.r, date: h.date };
      const w = st.w || 0;
      if (!rec.weight || w > rec.weight.w || (w === rec.weight.w && st.r > rec.weight.r)) rec.weight = { w, r: st.r, date: h.date };
      if (!rec.reps || st.r > rec.reps.r) rec.reps = { w, r: st.r, date: h.date };
    }
  }
  return rec;
}

// --- Planification -------------------------------------------------------

/**
 * Propose charges et reps pour un groupe de séries à partir de la dernière fois.
 * Double progression : si toutes les séries ont atteint le haut de la fourchette
 * à la charge de travail, on augmente la charge ; sinon on vise +1 rep.
 */
export function planGroup(group, lastSets, exercise) {
  const inc = exercise?.inc ?? 2.5;
  const isPdc = exercise?.load === 'pdc';
  const plan = [];
  if (!lastSets.length) {
    for (let i = 0; i < group.n; i++) plan.push({ pw: isPdc ? 0 : null, pr: group.min, prev: null });
    return { plan, hint: null, progressed: false };
  }
  const topW = Math.max(...lastSets.map((s) => s.w || 0));
  const atTop = lastSets.filter((s) => (s.w || 0) === topW);
  const allHitMax = !isPdc && lastSets.length >= group.n && atTop.length >= group.n && atTop.every((s) => s.r >= group.max);
  const allRepsMax = isPdc && lastSets.length >= group.n && lastSets.every((s) => s.r >= group.max);

  for (let i = 0; i < group.n; i++) {
    const prev = lastSets[i] || null;
    // Charge de travail du groupe pour toutes les séries (cohérent avec le conseil affiché)
    let pw = topW;
    let pr;
    if (allHitMax) {
      pw = roundTo(topW + inc, inc < 1.25 ? 0.5 : 1.25);
      pr = group.min;
    } else {
      const lastR = prev?.r ?? group.min;
      pr = Math.min(group.max, Math.max(group.min, lastR + 1));
    }
    plan.push({ pw: isPdc ? 0 : pw, pr, prev });
  }

  let hint;
  const label = group.tag ? `${group.tag} : ` : '';
  if (allHitMax) hint = `${label}↑ passe à ${fmtKg(plan[0].pw)} kg`;
  else if (allRepsMax) hint = `${label}haut de fourchette atteint : ajoute du lest ou ralentis le tempo`;
  else if (isPdc) hint = `${label}vise +1 rep par série`;
  else hint = `${label}${fmtKg(topW)} kg, vise +1 rep`;
  return { plan, hint, progressed: allHitMax };
}

export const WARMUP_PCT = 0.6;
export const WARMUP_REPS = 6;

/**
 * Une seule série d'échauffement : ~60 % de la charge de travail × 6
 * (au moins la barre vide ; au poids du corps pour les exercices lestés).
 */
export function warmupPlan(topW, exercise) {
  const type = exercise?.load || 'kg';
  if (type === 'lest' || type === 'pdc') return [{ pw: 0, pr: 8 }];
  if (topW == null) return [{ pw: null, pr: 8 }];
  const bar = exercise?.bar ? 20 : 0;
  return [{ pw: Math.max(bar, roundTo(topW * WARMUP_PCT, 2.5)), pr: WARMUP_REPS }];
}

/** Construit l'élément de séance d'un exercice à partir de son plan et de l'historique. */
export function buildItem({ exerciseId, alternatives = [], note = '', plan = DEFAULT_PLAN, templateId, sessions, exercises }) {
  const exercise = exercises.get(exerciseId);
  const last = lastPerformance(exerciseId, templateId, sessions);
  const sets = [];
  const hints = [];
  const groups = plan.sets.map((g) => {
    const lastSets = last ? last.sets.filter((s) => (s.tag || '') === (g.tag || '')) : [];
    // Si les étiquettes ne correspondent pas (plan modifié), on se rabat sur toutes les séries.
    const source = lastSets.length || !last ? lastSets : last.sets;
    return { g, ...planGroup(g, source, exercise) };
  });

  if (plan.warmup) {
    const firstW = groups[0]?.plan[0]?.pw ?? null;
    warmupPlan(firstW, exercise).forEach((w) =>
      sets.push(makeSet({ kind: 'warmup', tag: '', min: w.pr, max: w.pr, pw: w.pw, pr: w.pr })),
    );
  }
  for (const { g, plan: p, hint } of groups) {
    if (hint) hints.push(hint);
    p.forEach((x) => sets.push(makeSet({ kind: 'work', tag: g.tag || '', min: g.min, max: g.max, pw: x.pw, pr: x.pr, prev: x.prev })));
  }
  if (!last) hints.push('Première fois : trouve ta charge de travail');
  return {
    id: uid(),
    exerciseId,
    alternatives,
    note,
    plan: { sets: plan.sets.map((g) => ({ ...g })), warmup: !!plan.warmup },
    prev: last ? { date: last.date, sets: last.sets.map((s) => ({ w: s.w, r: s.r, tag: s.tag || '' })) } : null,
    hints,
    sets,
  };
}

export function makeSet({ kind = 'work', tag = '', min = 8, max = 12, pw = null, pr = null, prev = null } = {}) {
  return {
    id: uid(),
    kind,
    tag,
    min,
    max,
    w: null,
    r: null,
    pw,
    pr,
    prev: prev ? { w: prev.w, r: prev.r } : null,
    done: false,
    doneAt: null,
  };
}

/** Démarre une séance à partir d'un modèle (ou une séance libre si template = null). */
export function createSession(template, { sessions, exercises, now = Date.now() }) {
  const blocks = (template?.blocks || []).map((b) => ({
    id: uid(),
    rest: b.rest ?? DEFAULT_REST,
    items: b.items.map((it) =>
      buildItem({
        exerciseId: it.exerciseId,
        alternatives: it.alternatives || [],
        note: it.note || '',
        plan: { sets: it.sets, warmup: it.warmup },
        templateId: template.id,
        sessions,
        exercises,
      }),
    ),
  }));
  return {
    id: uid(),
    templateId: template?.id || null,
    name: template?.name || 'Séance libre',
    startedAt: now,
    endedAt: null,
    status: 'active',
    note: '',
    blocks,
    rest: null,
  };
}

// --- Déroulé de séance ---------------------------------------------------

/**
 * Prochaine série à faire. Dans un superset, on alterne les exercices (A1, B1, A2, B2…).
 */
export function nextPending(session) {
  for (let bi = 0; bi < session.blocks.length; bi++) {
    const block = session.blocks[bi];
    let best = null;
    block.items.forEach((it, ii) => {
      const si = it.sets.findIndex((s) => !s.done);
      if (si < 0) return;
      // rang = position parmi les séries de travail (l'échauffement passe avant)
      const rank = it.sets[si].kind === 'warmup' ? -1 : it.sets.slice(0, si + 1).filter((s) => s.kind === 'work').length;
      if (!best || rank < best.rank) best = { bi, ii, si, rank };
    });
    if (best) return { bi: best.bi, ii: best.ii, si: best.si };
  }
  return null;
}

/** Temps de repos (s) après avoir validé la série (bi, ii, si). 0 = enchaîner. */
export function restAfter(session, bi, ii, si, settings = {}) {
  const block = session.blocks[bi];
  const set = block.items[ii].sets[si];
  if (!nextPending(session)) return 0; // séance terminée
  if (set.kind === 'warmup') return settings.warmupRest ?? 60;
  // Superset : s'il reste une série chez un exercice suivant du bloc au même tour, on enchaîne.
  const rank = block.items[ii].sets.slice(0, si + 1).filter((s) => s.kind === 'work').length;
  for (let j = ii + 1; j < block.items.length; j++) {
    const work = block.items[j].sets.filter((s) => s.kind === 'work');
    const sameRound = work[rank - 1];
    if (sameRound && !sameRound.done) return 0;
  }
  return block.rest ?? DEFAULT_REST;
}

/**
 * Après validation d'une série : les séries suivantes du même groupe (non validées,
 * non saisies) proposent la charge et les reps qui viennent d'être faites.
 */
export function propagateWeight(item, si) {
  const ref = item.sets[si];
  if (ref.kind === 'warmup') {
    // Première fois sur l'exercice (aucune charge proposée) : l'échauffement vaut ~60 %,
    // on en déduit une charge de travail pour le premier groupe de séries.
    if (!ref.w) return;
    const first = item.sets.find((s) => s.kind === 'work');
    if (!first) return;
    const guess = roundTo(ref.w / WARMUP_PCT, 2.5);
    for (const s of item.sets) {
      if (s.kind !== 'work' || s.tag !== first.tag) continue;
      if (!s.done && s.w == null && s.pw == null) s.pw = guess;
    }
    return;
  }
  for (let j = si + 1; j < item.sets.length; j++) {
    const s = item.sets[j];
    if (s.kind !== ref.kind || s.tag !== ref.tag) break;
    if (s.done) continue;
    if (s.w == null) s.pw = ref.w;
    if (s.r == null && ref.r) s.pr = ref.r;
  }
}

/** Échauffement uniquement sur le premier exercice de la séance. */
export function normalizeWarmups(template) {
  let first = true;
  for (const b of template.blocks) for (const it of b.items) {
    it.warmup = first;
    first = false;
  }
  return template;
}

export function sessionProgress(session) {
  let done = 0;
  let total = 0;
  for (const b of session.blocks) for (const it of b.items) for (const s of it.sets) {
    total++;
    if (s.done) done++;
  }
  return { done, total };
}

/** Statistiques d'une séance terminée (séries de travail validées uniquement). */
export function sessionStats(session, exercises, bodyweight) {
  let sets = 0;
  let reps = 0;
  let volume = 0;
  const exIds = new Set();
  for (const b of session.blocks) for (const it of b.items) {
    const ex = exercises.get(it.exerciseId);
    for (const s of it.sets) {
      if (!isWorkDone(s)) continue;
      sets++;
      reps += s.r || 0;
      volume += loadOf(ex, s.w, bodyweight) * (s.r || 0);
      exIds.add(it.exerciseId);
    }
  }
  const end = session.endedAt || Date.now();
  return { sets, reps, volume, exercises: exIds.size, duration: end - session.startedAt };
}

/** Records battus pendant une séance. */
export function sessionRecords(session, sessions, exercises, bodyweight) {
  const out = [];
  const seen = new Set();
  for (const b of session.blocks) for (const it of b.items) {
    if (seen.has(it.exerciseId)) continue;
    seen.add(it.exerciseId);
    const ex = exercises.get(it.exerciseId);
    const before = exerciseRecords(it.exerciseId, sessions, ex, bodyweight, session.startedAt, session.id);
    if (!before.weight) continue; // première fois : pas de record à célébrer
    let bestW = null;
    let bestE = null;
    for (const s of it.sets.filter(isWorkDone)) {
      const w = s.w || 0;
      if (w > before.weight.w && (!bestW || w > bestW.w)) bestW = { w, r: s.r };
      const est = e1rm(loadOf(ex, s.w, bodyweight), s.r);
      if (before.e1rm && est > before.e1rm.value + 0.01 && (!bestE || est > bestE.value)) bestE = { value: est, w, r: s.r };
    }
    if (bestW) out.push({ exerciseId: it.exerciseId, type: 'weight', w: bestW.w, r: bestW.r });
    else if (bestE) out.push({ exerciseId: it.exerciseId, type: 'e1rm', w: bestE.w, r: bestE.r, value: bestE.value });
  }
  return out;
}

/** Séance suggérée : celle qui suit la dernière réalisée dans l'ordre du programme. */
export function suggestTemplate(templates, sessions) {
  if (!templates.length) return null;
  const last = sessions.find((s) => s.status === 'done' && templates.some((t) => t.id === s.templateId));
  if (!last) return templates[0];
  const i = templates.findIndex((t) => t.id === last.templateId);
  return templates[(i + 1) % templates.length];
}

/** Retire les séries non validées et les exercices vides (fin de séance). */
export function pruneSession(session) {
  for (const b of session.blocks) {
    for (const it of b.items) it.sets = it.sets.filter((s) => s.done);
    b.items = b.items.filter((it) => it.sets.length);
  }
  session.blocks = session.blocks.filter((b) => b.items.length);
}

/** Résumé texte des séries : "100×5 · 100×5 · 100×4". */
export function setsSummary(sets, exercise) {
  return sets
    .map((s) => (exercise?.load === 'pdc' ? `${s.r}` : exercise?.load === 'lest' && !s.w ? `PDC×${s.r}` : `${fmtKg(s.w)}×${s.r}`))
    .join(' · ');
}
