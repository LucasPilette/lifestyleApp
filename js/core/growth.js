// Grow : la graine qui pousse. Chaque journée réussie (les critères choisis par l'utilisateur) l'arrose ;
// les jours arrosés d'affilée la font grandir, de la graine à l'arbre-monde. Pur : testable sous Node.

import { addDays, weekStart } from './date.js';
import { dayChecklist, weekSessionCounts, DEFAULT_DAILY } from './metrics.js';

/** Stades de la plante : `min` = jours arrosés d'affilée pour l'atteindre. */
export const STAGES = [
  { id: 'seed', name: 'Graine', min: 0, emoji: '🌰', ta: 'ta graine', sa: 'sa graine', une: 'une graine' },
  { id: 'sprout', name: 'Pousse', min: 7, emoji: '🌱', ta: 'ta pousse', sa: 'sa pousse', une: 'une pousse' },
  { id: 'shrub', name: 'Arbuste', min: 30, emoji: '🌿', ta: 'ton arbuste', sa: 'son arbuste', une: 'un arbuste' },
  { id: 'tree', name: 'Arbre', min: 90, emoji: '🌲', ta: 'ton arbre', sa: 'son arbre', une: 'un arbre' },
  { id: 'oak', name: 'Chêne', min: 180, emoji: '🌳', ta: 'ton chêne', sa: 'son chêne', une: 'un chêne' },
  { id: 'world', name: 'Arbre-monde', min: 365, emoji: '🌍', ta: 'ton arbre-monde', sa: 'son arbre-monde', une: 'un arbre-monde' },
];

/** Un engrais tous les 7 jours arrosés d'une même série, 3 en réserve au plus. */
export const FERTILIZER_EVERY = 7;
export const FERTILIZER_MAX = 3;

/** Indice du stade atteint avec `streak` jours arrosés d'affilée. */
export function stageIndex(streak = 0) {
  let i = 0;
  while (i + 1 < STAGES.length && streak >= STAGES[i + 1].min) i++;
  return i;
}
export const stageOf = (streak) => STAGES[stageIndex(streak)];

/** « 12 jours », « 1 jour ». */
export const daysLabel = (n) => `${n} jour${n > 1 ? 's' : ''}`;

/**
 * Croissance de la plante, rejouée jour après jour depuis le premier jour renseigné (3 ans au plus).
 * - Jour arrosé (parfait selon les critères) : +1 jour. Tous les 7 jours arrosés de la série : +1 engrais (3 au plus).
 * - Jour oublié : un engrais le rattrape automatiquement (la série continue, sans compter ce jour) ;
 *   sans engrais, la plante fane et une nouvelle graine repart de zéro.
 * - Semaine terminée sous le minimum de séances (si les séances comptent) : pareil, un engrais la rattrape.
 * - Aujourd'hui (pas encore fini), la semaine en cours et la semaine de démarrage (graceUntil) ne sont jamais pénalisés.
 * - Sans critère quotidien, chaque jour depuis le démarrage est arrosé : seule la règle des séances compte.
 */
export function growth(days, today, { sessionDates = [], minSessions = 3, graceUntil = null, items = DEFAULT_DAILY, weekly = true, custom = {} } = {}) {
  const counts = weekSessionCounts(sessionDates);
  const graceWeek = graceUntil ? weekStart(graceUntil) : null;
  const curWeek = weekStart(today);
  const isWatered = (k) => (items.length ? dayChecklist(days, k, items, custom).perfect : weekly && !!graceUntil && k >= graceUntil);
  const weekFailed = (ws) => weekly && ws < curWeek && !(graceWeek && ws <= graceWeek) && (counts.get(ws) || 0) < minSessions;

  // Premier jour à rejouer : premier jour renseigné, première séance ou démarrage de l'app.
  let start = today;
  for (const k of days.keys()) if (k < start) start = k;
  for (const k of sessionDates) if (k < start) start = k;
  if (graceUntil && graceUntil < start) start = graceUntil;
  const limit = addDays(today, -1100);
  if (start < limit) start = limit;

  let streak = 0;
  let run = 0; // jours arrosés de la série en cours (les jours rattrapés ne comptent pas)
  let fertilizer = 0;
  let best = 0;
  let wilted = null; // dernier jour où la plante a fané
  let earnedAt = null; // dernier engrais gagné
  const watered = new Set();
  const saved = new Set(); // jours rattrapés par un engrais
  const savedWeeks = new Set(); // semaines (lundi) rattrapées par un engrais

  const water = (k) => {
    watered.add(k);
    streak++;
    run++;
    if (run % FERTILIZER_EVERY === 0 && fertilizer < FERTILIZER_MAX) {
      fertilizer++;
      earnedAt = k;
    }
    if (streak > best) best = streak;
  };
  const miss = (k, week = false) => {
    if (streak === 0) return; // rien à protéger
    if (fertilizer > 0) {
      fertilizer--;
      (week ? savedWeeks : saved).add(k);
    } else {
      streak = 0;
      run = 0;
      wilted = k;
    }
  };
  // Le lundi, bilan de la semaine qui vient de se terminer.
  const weekCheck = (k) => {
    if (k === start || k !== weekStart(k)) return;
    const ws = weekStart(addDays(k, -1));
    if (weekFailed(ws)) miss(ws, true);
  };

  for (let k = start; k < today; k = addDays(k, 1)) {
    weekCheck(k);
    if (isWatered(k)) water(k);
    else miss(k);
  }
  weekCheck(today);
  const todayDone = isWatered(today);
  if (todayDone) water(today);

  const index = stageIndex(streak);
  const stage = STAGES[index];
  const next = STAGES[index + 1] || null;
  return {
    streak, stage, index, next,
    toNext: next ? next.min - streak : 0,
    progress: next ? (streak - stage.min) / (next.min - stage.min) : 1,
    fertilizer, best, bestStage: stageOf(best),
    watered, saved, savedWeeks, wilted, earnedAt, todayDone,
    // Prochain engrais : dans combien de jours arrosés (null si la réserve est pleine)
    nextFertilizer: fertilizer >= FERTILIZER_MAX ? null : FERTILIZER_EVERY - (run % FERTILIZER_EVERY),
  };
}
