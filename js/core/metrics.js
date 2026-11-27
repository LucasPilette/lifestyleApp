// Définition des indicateurs quotidiens et calculs statistiques (moyennes, tendances, séries).
// Pur : prend une Map date -> entrée, testable sous Node.

import { addDays, addMonths, formatMonth, formatShort, keysBetween, monthEnd, monthStart, weekStart, dayMonth, formatMonthLong } from './date.js';
import { fmtNum, fmtSleep } from './format.js';

export const METRICS = {
  sleepMin: {
    label: 'Sommeil', short: 'Durée', unit: '', color: 'var(--c-sleep)', goalType: 'min', step: 120,
    fmt: fmtSleep, fmtDelta: (v) => fmtSleep(v), tick: (v) => `${Math.round(v / 60)} h`,
  },
  sleepQ: {
    label: 'Qualité du sommeil', short: 'Qualité', unit: '/5', color: 'var(--c-sleep)', goalType: null, maxY: 5, step: 1,
    fmt: (v) => `${fmtNum(v, 1)}/5`, fmtDelta: (v) => fmtNum(v, 1), tick: (v) => fmtNum(v, 0),
  },
  kcal: {
    label: 'Calories', short: 'Calories', unit: 'kcal', color: 'var(--c-kcal)', goalType: 'target',
    fmt: (v) => `${fmtNum(Math.round(v))} kcal`, fmtDelta: (v) => `${fmtNum(Math.round(v))} kcal`, tick: (v) => fmtNum(v),
  },
  prot: {
    label: 'Protéines', short: 'Protéines', unit: 'g', color: 'var(--c-prot)', goalType: 'min',
    fmt: (v) => `${fmtNum(Math.round(v))} g`, fmtDelta: (v) => `${fmtNum(Math.round(v))} g`, tick: (v) => fmtNum(v),
  },
  steps: {
    label: 'Pas', short: 'Pas', unit: 'pas', color: 'var(--c-steps)', goalType: 'min',
    fmt: (v) => `${fmtNum(Math.round(v))} pas`, fmtDelta: (v) => fmtNum(Math.round(v)), tick: (v) => (v >= 1000 ? `${fmtNum(v / 1000, 1)}k` : fmtNum(v)),
  },
};

/** Objectif atteint ? 'min' = au moins l'objectif ; 'target' = à ±10 %. */
export function meetsGoal(value, goal, type) {
  if (value == null || !goal || !type) return false;
  if (type === 'min') return value >= goal;
  if (type === 'target') return Math.abs(value - goal) <= goal * 0.1;
  return false;
}

export function mean(values) {
  const v = values.filter((x) => x != null && !Number.isNaN(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

export function valuesIn(days, field, start, end) {
  return keysBetween(start, end).map((key) => ({ key, value: days.get(key)?.[field] ?? null }));
}

export function avgBetween(days, field, start, end) {
  const vals = valuesIn(days, field, start, end).map((p) => p.value);
  return { avg: mean(vals), count: vals.filter((v) => v != null).length, days: vals.length };
}

/** Moyenne glissante sur `win` jours, alignée sur `keys`. */
export function rollingAvg(days, field, keys, win = 7) {
  return keys.map((k) => avgBetween(days, field, addDays(k, -(win - 1)), k).avg);
}

/** Série de jours consécutifs (jusqu'à aujourd'hui, ou hier si aujourd'hui pas encore saisi). */
export function streak(days, field, goal, type, today) {
  if (!type || !goal) return 0;
  let k = today;
  if (days.get(k)?.[field] == null) k = addDays(k, -1);
  let n = 0;
  while (meetsGoal(days.get(k)?.[field], goal, type)) {
    n++;
    k = addDays(k, -1);
  }
  return n;
}

/**
 * Données de la vue détaillée selon la période :
 *  'jours'    : 30 derniers jours (barres) + moyenne glissante 7 j
 *  'semaines' : moyennes hebdomadaires sur 12 semaines
 *  'mois'     : moyennes mensuelles sur 12 mois
 */
export function periodData(days, field, period, today) {
  const def = METRICS[field];
  if (period === 'semaines') {
    const cur = weekStart(today);
    const points = [];
    for (let i = 11; i >= 0; i--) {
      const ws = addDays(cur, -7 * i);
      const we = i === 0 ? today : addDays(ws, 6);
      const { avg, count } = avgBetween(days, field, ws, we);
      points.push({ key: ws, label: dayMonth(ws), value: avg, tip: `Semaine du ${formatShort(ws)}`, sub: count ? `moyenne sur ${count} j` : 'aucune saisie' });
    }
    const curAvg = points[11].value;
    const prevAvg = points[10].value;
    return { points, current: curAvg, previous: prevAvg, currentLabel: 'Cette semaine', previousLabel: 'vs semaine dernière' };
  }
  if (period === 'mois') {
    const cur = monthStart(today);
    const points = [];
    for (let i = 11; i >= 0; i--) {
      const ms = addMonths(cur, -i);
      const me = i === 0 ? today : monthEnd(ms);
      const { avg, count } = avgBetween(days, field, ms, me);
      points.push({ key: ms, label: formatMonth(ms), value: avg, tip: formatMonthLong(ms), sub: count ? `moyenne sur ${count} j` : 'aucune saisie' });
    }
    return { points, current: points[11].value, previous: points[10].value, currentLabel: 'Ce mois-ci', previousLabel: 'vs mois dernier' };
  }
  // jours
  const start = addDays(today, -29);
  const keys = keysBetween(start, today);
  const rolling = rollingAvg(days, field, keys, 7);
  const points = keys.map((key, i) => ({
    key,
    label: dayMonth(key),
    value: days.get(key)?.[field] ?? null,
    tip: formatShort(key),
    sub: rolling[i] != null ? `moy. 7 j : ${def.fmt(rolling[i])}` : '',
  }));
  const current = avgBetween(days, field, start, today).avg;
  const previous = avgBetween(days, field, addDays(start, -30), addDays(start, -1)).avg;
  return { points, overlay: rolling, current, previous, currentLabel: 'Moyenne 30 jours', previousLabel: 'vs 30 jours précédents' };
}

/** Synthèse affichée sous le graphique. */
export function summary(days, field, goal, today) {
  const def = METRICS[field];
  const a7 = avgBetween(days, field, addDays(today, -6), today);
  const p7 = avgBetween(days, field, addDays(today, -13), addDays(today, -7));
  const a30 = avgBetween(days, field, addDays(today, -29), today);
  const last30 = valuesIn(days, field, addDays(today, -29), today).filter((p) => p.value != null);
  const hits = def.goalType ? last30.filter((p) => meetsGoal(p.value, goal, def.goalType)).length : null;
  const max = last30.length ? last30.reduce((a, b) => (b.value > a.value ? b : a)) : null;
  const min = last30.length ? last30.reduce((a, b) => (b.value < a.value ? b : a)) : null;
  return {
    avg7: a7.avg,
    count7: a7.count,
    delta7: a7.avg != null && p7.avg != null ? a7.avg - p7.avg : null,
    avg30: a30.avg,
    count30: a30.count,
    hitRate: hits != null && last30.length ? hits / last30.length : null,
    hits,
    streak: streak(days, field, goal, def.goalType, today),
    max,
    min,
  };
}

/** Valeurs des N derniers jours (pour les mini-graphiques de l'accueil). */
export function lastDays(days, field, today, n = 14) {
  return valuesIn(days, field, addDays(today, -(n - 1)), today).map((p) => p.value);
}
