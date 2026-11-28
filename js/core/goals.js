// Objectifs à long terme, calculés depuis les données de l'app. Pur : testable sous Node.
//
// Clés d'objectif :
//   'weight'            dernière pesée
//   'sleep', 'kcal'     moyennes 30 j (clés historiques, = 'avg:sleepMin' / 'avg:kcal')
//   'avg:<champ>'       moyenne 30 j d'un champ du journal (sleepQ, prot, steps, mood)
//   'bench'             1RM réel au développé couché (barre passée), avec valeur de départ enregistrée
//   'lift:<exercice>'   1RM réel (barre la plus lourde passée) sur un autre exercice
//   'sessions'          séances par semaine (moyenne sur 4 semaines)
//   'cavg:<widget>'     moyenne 30 j d'un widget personnalisé (chiffre ou émoji)
//   'clast:<widget>'    dernière valeur d'un widget personnalisé (chiffre)
//   'rate:<widget>'     régularité : jours « faits » sur les 30 derniers (widget intégré ou personnalisé)

import { addDays, dateKey } from './date.js';
import { avgBetween, dayChecklist } from './metrics.js';
import { WIDGETS, customDone, cleanWidgets } from './prefs.js';
import { exerciseHistory, e1rm } from './training.js';
import { fmtNum, fmtSleep, fmtKg } from './format.js';

export const BENCH_ID = 'bench';
// Nouveau compte : aucun objectif imposé, ils viennent des objectifs de ses widgets (voir goalsFromWidgets).
export const DEFAULT_GOAL_LIST = [];
export const DEFAULT_OBJECTIVES = {};
// Objectifs de l'installation d'origine (avant l'onboarding), conservés pour elle seule.
export const LEGACY_GOAL_LIST = ['weight', 'sleep', 'bench', 'kcal'];
export const LEGACY_OBJECTIVES = {
  weight: { target: null, dir: null, start: null, achievedAt: null },
  sleep: { target: 450, dir: 'min', start: null, achievedAt: null },
  bench: { target: 150, dir: 'min', start: 147, current: 147, achievedAt: null },
  kcal: { target: 2600, dir: 'min', start: null, achievedAt: null },
};

// --- Objectifs tirés des widgets -------------------------------------------------------
// Chaque widget qui a un objectif (sommeil 8 h, 10 000 pas, 3 séances / semaine, 8 verres d'eau…) donne un
// objectif à long terme : la moyenne sur 30 jours (4 semaines pour les séances) doit l'atteindre.

/** Objectifs des widgets affichés : clé d'objectif -> { target, dir }, dans l'ordre de l'accueil. */
export function widgetTargets(settings = {}) {
  const custom = settings.customWidgets || [];
  const widgets = cleanWidgets(settings.widgets, custom);
  const g = settings.goals || {};
  const out = new Map();
  const add = (key, target, dir) => { if (typeof target === 'number' && target > 0) out.set(key, { target, dir }); };
  for (const w of widgets) {
    if (w === 'weight') {
      const o = settings.objectives?.weight;
      if (o?.target != null) out.set('weight', { target: o.target, dir: o.dir || 'min' });
    } else if (w === 'sleep') add('sleep', g.sleepMin, 'min');
    else if (w === 'nutrition') {
      // Calories : « au plus » quand le poids visé est en dessous du poids actuel (perte de poids), sinon « au moins ».
      add('kcal', g.kcal, settings.objectives?.weight?.dir === 'max' ? 'max' : 'min');
      add('avg:prot', g.prot, 'min');
    } else if (w === 'steps') add('avg:steps', g.steps, 'min');
    else if (w === 'training') add('sessions', g.minSessions, 'min');
    else {
      const c = custom.find((x) => x.id === w);
      if (c?.kind === 'number') add(`cavg:${c.id}`, c.target, c.dir === 'max' ? 'max' : 'min');
    }
  }
  return out;
}

/** Liste d'objectifs d'un nouveau compte : ceux de ses widgets. */
export function goalsFromWidgets(settings = {}) {
  const targets = widgetTargets(settings);
  const objectives = {};
  for (const [key, t] of targets) {
    objectives[key] = key === 'weight' ? { ...settings.objectives.weight } : { target: t.target, dir: t.dir, start: null, achievedAt: null };
  }
  return { goalList: [...targets.keys()], objectives };
}

/**
 * Après un changement de réglages : les objectifs suivent ceux des widgets.
 * - objectif d'un widget modifié, resté sur l'ancienne valeur du widget : il prend la nouvelle ;
 * - widget qui reçoit un objectif (ou widget ajouté avec un objectif) : l'objectif apparaît ;
 * un objectif réglé à la main dans Objectifs (valeur différente) n'est jamais touché.
 * @returns {object|null} morceau de réglages à fusionner
 */
export function followWidgetTargets(prev = {}, next = {}) {
  const before = widgetTargets(prev);
  const after = widgetTargets(next);
  const list = next.goalList || [];
  const added = [];
  const objectives = {};
  for (const [key, t] of after) {
    if (key === 'weight') continue; // réglé dans l'onboarding ou dans Objectifs, directement
    const old = before.get(key);
    if (old && old.target === t.target && old.dir === t.dir) continue;
    const cfg = next.objectives?.[key];
    if (list.includes(key)) {
      if (cfg?.target == null || (old && cfg.target === old.target)) objectives[key] = { target: t.target, dir: t.dir, achievedAt: null };
    } else if (!old) {
      added.push(key);
      objectives[key] = { target: t.target, dir: t.dir, start: null, achievedAt: null };
    }
  }
  if (!added.length && !Object.keys(objectives).length) return null;
  return { ...(added.length ? { goalList: [...list, ...added] } : {}), objectives };
}

const kg = (v) => `${fmtKg(Math.round(v * 2) / 2)} kg`;
const kilo = (v) => (v >= 1000 ? `${fmtNum(v / 1000, 1)}k` : fmtNum(Math.round(v)));

/** Moyennes 30 j proposées. */
const AVG_FIELDS = {
  sleepMin: {
    label: 'Sommeil moyen', short: 'Sommeil', icon: 'moon', color: 'var(--c-sleep)', unit: '', input: 'duration', dirs: ['min'], step: 15,
    fmt: fmtSleep, compact: (v) => `${Math.floor(v / 60)}h${String(Math.round(v % 60)).padStart(2, '0')}`,
  },
  sleepQ: {
    label: 'Qualité du sommeil', short: 'Qualité', icon: 'moon', color: 'var(--c-sleep)', unit: '/5', decimal: true, dirs: ['min'], step: 0.5,
    fmt: (v) => `${fmtNum(v, 1)}/5`, compact: (v) => fmtNum(v, 1),
  },
  kcal: {
    label: 'Calories moyennes', short: 'Calories', icon: 'flame', color: 'var(--c-kcal)', unit: 'kcal', dirs: ['min', 'max'], step: 100,
    fmt: (v) => `${fmtNum(Math.round(v))} kcal`, compact: kilo,
  },
  prot: {
    label: 'Protéines moyennes', short: 'Protéines', icon: 'zap', color: 'var(--c-prot)', unit: 'g', dirs: ['min'], step: 10,
    fmt: (v) => `${fmtNum(Math.round(v))} g`, compact: (v) => fmtNum(Math.round(v)),
  },
  steps: {
    label: 'Pas moyens', short: 'Pas', icon: 'steps', color: 'var(--c-steps)', unit: 'pas', dirs: ['min'], step: 1000,
    fmt: (v) => `${fmtNum(Math.round(v))} pas`, compact: kilo,
  },
  mood: {
    label: 'Humeur moyenne', short: 'Humeur', icon: 'smile', color: 'var(--c-mood)', unit: '/5', decimal: true, dirs: ['min'], step: 0.5,
    fmt: (v) => `${fmtNum(v, 1)}/5`, compact: (v) => fmtNum(v, 1),
  },
};

/** Champ du journal suivi par une clé de moyenne (ou null). */
function avgField(key) {
  if (key === 'sleep') return 'sleepMin';
  if (key === 'kcal') return 'kcal';
  if (key.startsWith('avg:')) return key.slice(4);
  return null;
}

/** Exercice suivi par une clé de 1RM (ou null). */
export function liftExercise(key) {
  if (key === 'bench') return BENCH_ID;
  if (key.startsWith('lift:')) return key.slice(5);
  return null;
}

/** Définition d'affichage d'un objectif. `exercises` nomme les objectifs de force, `custom` (widgets personnalisés) les autres. */
export function goalDef(key, exercises = new Map(), custom = []) {
  const [prefix, ref] = key.includes(':') ? [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)] : [key, null];
  if (prefix === 'cavg' || prefix === 'clast') {
    const w = custom.find((c) => c.id === ref);
    if (!w) return unknownDef(key);
    const emoji = w.kind === 'emoji';
    const unit = emoji ? '/5' : w.unit || '';
    const num = (v) => fmtNum(v, emoji || w.decimals || prefix === 'cavg' ? 1 : 0);
    return {
      kind: prefix, widget: w, label: prefix === 'cavg' ? `${w.name} (moyenne)` : w.name, short: w.name, icon: 'chart', color: w.color || 'var(--c-routine)',
      unit, decimal: true, dirs: emoji ? ['min'] : ['min', 'max'], step: 1,
      fmt: (v) => (emoji ? `${w.emojis?.[Math.min(4, Math.max(0, Math.round(v) - 1))] || ''} ${num(v)}/5` : `${num(v)}${unit ? ` ${unit}` : ''}`),
      compact: (v) => num(v),
    };
  }
  if (prefix === 'rate') {
    const w = WIDGETS[ref] ? { name: WIDGETS[ref].label, color: WIDGETS[ref].color } : custom.find((c) => c.id === ref);
    if (!w || ref === 'training') return unknownDef(key);
    return {
      kind: 'rate', widgetId: ref, label: `Régularité · ${w.name}`, short: w.name, icon: 'calendar', color: w.color || 'var(--c-routine)',
      unit: 'j / 30', decimal: false, dirs: ['min'], step: 1,
      fmt: (v) => `${Math.round(v)} j / 30`, compact: (v) => `${Math.round(v)} j`,
    };
  }
  if (key === 'weight') {
    return {
      kind: 'weight', label: 'Poids', short: 'Poids', icon: 'scale', color: 'var(--c-weight)', unit: 'kg', decimal: true,
      dirs: ['min', 'max'], step: 1, fmt: (v) => `${fmtNum(v, 1)} kg`, compact: (v) => fmtNum(v, 1),
    };
  }
  if (key === 'sessions') {
    return {
      kind: 'sessions', label: 'Séances par semaine', short: 'Séances', icon: 'calendar', color: '#ff7a45', unit: '/ sem.', decimal: true,
      dirs: ['min'], step: 1, fmt: (v) => `${fmtNum(v, 1)} / sem.`, compact: (v) => fmtNum(v, 1),
    };
  }
  const field = avgField(key);
  if (field && AVG_FIELDS[field]) return { kind: 'avg', field, ...AVG_FIELDS[field] };
  const exId = liftExercise(key);
  if (exId) {
    const ex = exercises.get(exId);
    const name = ex?.name || (exId === BENCH_ID ? 'Développé couché' : 'Exercice');
    const lest = ex?.load === 'lest';
    return {
      kind: 'lift', exerciseId: exId, label: name, short: exId === BENCH_ID ? 'Bench' : name, icon: 'dumbbell', color: 'var(--accent)',
      unit: 'kg', decimal: true, dirs: ['min'], step: 2.5, lest,
      fmt: (v) => (lest ? `+${kg(v)}` : kg(v)), compact: (v) => fmtNum(Math.round(v * 2) / 2, 1),
    };
  }
  return unknownDef(key);
}

const unknownDef = (key) => ({ kind: 'unknown', label: key, short: key, icon: 'flag', color: 'var(--text-3)', unit: '', dirs: ['min'], step: 1, fmt: (v) => fmtNum(v, 1), compact: (v) => fmtNum(v, 1) });

/**
 * Objectifs proposés à l'ajout, d'après les widgets affichés (la force se choisit via la liste d'exercices).
 * @returns {{ key: string, group: string }[]}
 */
export function addableGoals(widgets = [], customWidgets = []) {
  const has = (w) => widgets.includes(w);
  const out = [];
  if (has('weight')) out.push({ key: 'weight', group: 'Corps' });
  if (has('sleep')) out.push({ key: 'sleep', group: 'Sommeil' }, { key: 'avg:sleepQ', group: 'Sommeil' });
  if (has('nutrition')) out.push({ key: 'kcal', group: 'Nutrition' }, { key: 'avg:prot', group: 'Nutrition' });
  if (has('steps')) out.push({ key: 'avg:steps', group: 'Activité' });
  if (has('training')) out.push({ key: 'sessions', group: 'Entraînement' });
  if (has('mood')) out.push({ key: 'avg:mood', group: 'Bien-être' });
  for (const w of ['sleep', 'mood', 'nutrition', 'steps', 'routines']) if (has(w)) out.push({ key: `rate:${w}`, group: 'Régularité' });
  for (const c of customWidgets) {
    if (!has(c.id)) continue;
    if (c.kind === 'number') out.push({ key: `cavg:${c.id}`, group: c.name }, { key: `clast:${c.id}`, group: c.name });
    if (c.kind === 'emoji') out.push({ key: `cavg:${c.id}`, group: c.name });
    out.push({ key: `rate:${c.id}`, group: c.name });
  }
  return out;
}

/** Objectifs proposés à l'ajout (hors force, choisie via la liste d'exercices). */
export const ADDABLE_GOALS = [
  { key: 'weight', group: 'Corps' },
  { key: 'sleep', group: 'Sommeil' },
  { key: 'avg:sleepQ', group: 'Sommeil' },
  { key: 'kcal', group: 'Nutrition' },
  { key: 'avg:prot', group: 'Nutrition' },
  { key: 'avg:steps', group: 'Activité' },
  { key: 'sessions', group: 'Activité' },
  { key: 'avg:mood', group: 'Bien-être' },
];

// --- Force : 1RM réel -----------------------------------------------------

/** Barre la plus lourde passée sur un exercice pendant une séance (série de travail validée, ≥ 1 rep). */
export function sessionLift(session, exerciseId) {
  let best = 0;
  for (const b of session.blocks) for (const it of b.items) {
    if (it.exerciseId !== exerciseId) continue;
    for (const s of it.sets) if (s.done && s.kind === 'work' && (s.r || 0) >= 1) best = Math.max(best, s.w || 0);
  }
  return best;
}

export function bestLift(exerciseId, sessions) {
  let best = 0;
  for (const s of sessions) if (s.status === 'done') best = Math.max(best, sessionLift(s, exerciseId));
  return best;
}

export const sessionBenchLift = (session) => sessionLift(session, BENCH_ID);
export const bestBenchLift = (sessions) => bestLift(BENCH_ID, sessions);

/** Meilleur 1RM estimé au bench sur une séance donnée. */
export function sessionBenchE1rm(session) {
  let best = 0;
  for (const b of session.blocks) for (const it of b.items) {
    if (it.exerciseId !== BENCH_ID) continue;
    for (const s of it.sets) if (s.done && s.kind === 'work') best = Math.max(best, e1rm(s.w || 0, s.r || 0));
  }
  return best;
}

/** Meilleur 1RM estimé (charge seule) dans l'historique ; non calculé pour un lest seul. */
export function bestE1rm(exerciseId, sessions, exercises) {
  const ex = exercises.get(exerciseId);
  if (ex?.load === 'lest') return 0;
  return exerciseHistory(exerciseId, sessions, ex, 0).reduce((m, x) => Math.max(m, x.e1rm), 0);
}
export const bestBenchE1rm = (sessions, exercises) => bestE1rm(BENCH_ID, sessions, exercises);

// --- Valeur actuelle et statut --------------------------------------------

function latest(days, field) {
  let best = null;
  for (const [key, d] of days) if (d[field] != null && (!best || key > best.key)) best = { key, value: d[field] };
  return best;
}

/** Valeur actuelle d'un objectif + précision (période, nombre de jours…). */
export function currentValue(key, cfg, { days, sessions, exercises = new Map(), today, custom = [] }) {
  const def = goalDef(key, exercises, custom);
  if (def.kind === 'cavg' || def.kind === 'clast') {
    const id = def.widget.id;
    if (def.kind === 'clast') {
      let best = null;
      for (const [k, d] of days) if (typeof d.custom?.[id] === 'number' && (!best || k > best.key)) best = { key: k, value: d.custom[id] };
      return best ? { value: best.value, sub: 'dernière valeur', since: best.key } : { value: null, sub: 'pas encore de valeur' };
    }
    const from = addDays(today, -29);
    const vals = [];
    for (const [k, d] of days) if (k >= from && k <= today && typeof d.custom?.[id] === 'number') vals.push(d.custom[id]);
    return vals.length
      ? { value: vals.reduce((a, b) => a + b, 0) / vals.length, sub: `moyenne 30 j · ${vals.length} j saisis` }
      : { value: null, sub: 'pas encore de données' };
  }
  if (def.kind === 'rate') {
    const w = custom.find((c) => c.id === def.widgetId);
    let n = 0;
    for (let i = 0; i < 30; i++) {
      const k = addDays(today, -i);
      const ok = w ? customDone(w, days.get(k)?.custom?.[w.id]) : dayChecklist(days, k, [def.widgetId]).perfect;
      if (ok) n++;
    }
    return { value: n, sub: 'sur les 30 derniers jours' };
  }
  if (def.kind === 'weight') {
    const l = latest(days, 'weight');
    return l ? { value: l.value, sub: 'dernière pesée', since: l.key } : { value: null, sub: 'aucune pesée' };
  }
  if (def.kind === 'avg') {
    const a = avgBetween(days, def.field, addDays(today, -29), today);
    return { value: a.avg, sub: a.count ? `moyenne 30 j · ${a.count} j saisis` : 'pas encore de données' };
  }
  if (def.kind === 'lift') {
    const value = Math.max(cfg?.current || 0, bestLift(def.exerciseId, sessions)) || null;
    const est = bestE1rm(def.exerciseId, sessions, exercises) || null;
    return { value, est, sub: def.lest ? 'lest max passé en séance' : '1RM réel (barre passée en séance)' };
  }
  if (def.kind === 'sessions') {
    const from = addDays(today, -27);
    const n = sessions.filter((s) => {
      if (s.status !== 'done') return false;
      const k = dateKey(new Date(s.startedAt));
      return k >= from && k <= today;
    }).length;
    return { value: n / 4, sub: `moyenne sur 4 semaines · ${n} séances` };
  }
  return { value: null, sub: '' };
}

export function isMet(value, target, dir) {
  if (value == null || target == null) return false;
  return dir === 'max' ? value <= target : value >= target;
}

/** Progression 0..1 : depuis la valeur de départ si fournie, sinon rapport à la cible. */
export function progressOf(value, target, start, dir) {
  if (value == null || target == null) return 0;
  if (isMet(value, target, dir)) return 1;
  if (start != null && start !== target) return Math.max(0, Math.min(1, (value - start) / (target - start)));
  if (dir === 'max') return Math.max(0, Math.min(1, target / value));
  return Math.max(0, Math.min(1, value / target));
}

/**
 * État complet d'un objectif.
 * status : 'unset' | 'progress' | 'met' (atteint, à maintenir) | 'lost' (atteint puis perdu)
 */
export function evaluateGoal(key, cfg, ctx) {
  const def = goalDef(key, ctx.exercises, ctx.custom);
  const cur = currentValue(key, cfg, ctx);
  const base = { id: key, key, def, cfg: cfg || {}, ...cur };
  if (!cfg || cfg.target == null) return { ...base, status: 'unset', progress: 0 };
  const dir = cfg.dir || 'min';
  const met = isMet(cur.value, cfg.target, dir);
  const status = met ? 'met' : cfg.achievedAt ? 'lost' : 'progress';
  // Poids : progression depuis la valeur de départ ; autres : valeur rapportée à la cible (ex. 147/150 = 98 %).
  const progress = progressOf(cur.value, cfg.target, def.kind === 'weight' ? cfg.start : null, dir);
  return { ...base, dir, met, status, progress };
}

/** Direction suggérée quand on fixe une cible (poids : prise ou perte selon la valeur actuelle). */
export function suggestDir(key, target, current, custom = []) {
  const def = goalDef(key, new Map(), custom);
  if (def.dirs.length === 1) return def.dirs[0];
  if (current == null || target == null) return 'min';
  return target >= current ? 'min' : 'max';
}
