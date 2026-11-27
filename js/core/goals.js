// Objectifs à long terme (poids, sommeil moyen, 1RM bench, calories moyennes).
// Pur : calcule la valeur actuelle depuis les données de l'app, testable sous Node.

import { addDays } from './date.js';
import { avgBetween } from './metrics.js';
import { exerciseHistory, e1rm } from './training.js';
import { fmtNum, fmtSleep, fmtKg } from './format.js';

export const BENCH_ID = 'bench';

export const GOAL_DEFS = {
  weight: {
    label: 'Poids', icon: 'scale', color: 'var(--c-weight)', unit: 'kg', decimal: true, dirs: ['min', 'max'],
    fmt: (v) => `${fmtNum(v, 1)} kg`, step: 1,
  },
  sleep: {
    label: 'Sommeil moyen', icon: 'moon', color: 'var(--c-sleep)', unit: '', dirs: ['min'],
    fmt: (v) => fmtSleep(v), step: 15,
  },
  bench: {
    label: 'Développé couché', icon: 'dumbbell', color: 'var(--accent)', unit: 'kg', decimal: true, dirs: ['min'],
    fmt: (v) => `${fmtKg(Math.round(v * 2) / 2)} kg`, step: 2.5,
  },
  kcal: {
    label: 'Calories moyennes', icon: 'flame', color: 'var(--c-kcal)', unit: 'kcal', dirs: ['min', 'max'],
    fmt: (v) => `${fmtNum(Math.round(v))} kcal`, step: 100,
  },
};
export const GOAL_ORDER = ['weight', 'sleep', 'bench', 'kcal'];

export const DEFAULT_OBJECTIVES = {
  weight: { target: null, dir: null, start: null, achievedAt: null },
  sleep: { target: 450, dir: 'min', start: null, achievedAt: null },
  bench: { target: 150, dir: 'min', start: 147, current: 147, achievedAt: null },
  kcal: { target: 2600, dir: 'min', start: null, achievedAt: null },
};

/** Meilleur 1RM estimé au développé couché dans l'historique (kg). */
export function bestBenchE1rm(sessions, exercises) {
  const ex = exercises.get(BENCH_ID);
  const hist = exerciseHistory(BENCH_ID, sessions, ex, 0);
  return hist.reduce((m, x) => Math.max(m, x.e1rm), 0);
}

/** Meilleur 1RM estimé au bench sur une séance donnée. */
export function sessionBenchE1rm(session) {
  let best = 0;
  for (const b of session.blocks) for (const it of b.items) {
    if (it.exerciseId !== BENCH_ID) continue;
    for (const s of it.sets) if (s.done && s.kind === 'work') best = Math.max(best, e1rm(s.w || 0, s.r || 0));
  }
  return best;
}

/** Dernière valeur renseignée d'un champ (la plus récente). */
function latest(days, field) {
  let best = null;
  for (const [key, d] of days) if (d[field] != null && (!best || key > best.key)) best = { key, value: d[field] };
  return best;
}

/** Valeur actuelle d'un objectif + précision (période, nombre de jours…). */
export function currentValue(id, cfg, { days, sessions, exercises, today }) {
  if (id === 'weight') {
    const l = latest(days, 'weight');
    return l ? { value: l.value, sub: 'dernière pesée', since: l.key } : { value: null, sub: 'aucune pesée' };
  }
  if (id === 'sleep' || id === 'kcal') {
    const field = id === 'sleep' ? 'sleepMin' : 'kcal';
    const a = avgBetween(days, field, addDays(today, -29), today);
    return { value: a.avg, sub: a.count ? `moyenne 30 j · ${a.count} j saisis` : 'pas encore de données' };
  }
  if (id === 'bench') {
    const fromHistory = bestBenchE1rm(sessions, exercises);
    const value = Math.max(cfg?.current || 0, fromHistory) || null;
    return { value, sub: '1RM estimé' };
  }
  return { value: null, sub: '' };
}

export function isMet(value, target, dir) {
  if (value == null || target == null) return false;
  return dir === 'max' ? value <= target : value >= target;
}

/** Progression 0..1 depuis la valeur de départ vers la cible. */
export function progressOf(value, target, start, dir) {
  if (value == null || target == null) return 0;
  if (isMet(value, target, dir)) return 1;
  if (start != null && start !== target) {
    const p = (value - start) / (target - start);
    return Math.max(0, Math.min(1, p));
  }
  if (dir === 'max') return Math.max(0, Math.min(1, target / value));
  return Math.max(0, Math.min(1, value / target));
}

/**
 * État complet d'un objectif.
 * status : 'unset' | 'progress' | 'met' (atteint, à maintenir) | 'lost' (atteint puis perdu)
 */
export function evaluateGoal(id, cfg, ctx) {
  const def = GOAL_DEFS[id];
  const cur = currentValue(id, cfg, ctx);
  if (!cfg || cfg.target == null) return { id, def, cfg, ...cur, status: 'unset', progress: 0 };
  const dir = cfg.dir || 'min';
  const met = isMet(cur.value, cfg.target, dir);
  const status = met ? 'met' : cfg.achievedAt ? 'lost' : 'progress';
  return { id, def, cfg, ...cur, dir, met, status, progress: progressOf(cur.value, cfg.target, cfg.start, dir) };
}

/** Direction suggérée quand on fixe une cible (poids : prise ou perte selon la valeur actuelle). */
export function suggestDir(id, target, current) {
  const def = GOAL_DEFS[id];
  if (def.dirs.length === 1) return def.dirs[0];
  if (current == null || target == null) return 'min';
  return target >= current ? 'min' : 'max';
}
