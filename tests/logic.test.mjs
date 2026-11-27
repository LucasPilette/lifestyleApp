// Tests de la logique pure. Lancer : node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { addDays, weekStart, diffDays, keysBetween, monthEnd, dateKey } from '../js/core/date.js';
import { parseNum, fmtSleep, fmtClock, fmtRest } from '../js/core/format.js';
import {
  e1rm, planGroup, warmupPlan, createSession, nextPending, restAfter, lastPerformance,
  propagateWeight, pruneSession, normalizeWarmups, sessionStats, sessionRecords, suggestTemplate, exerciseRecords,
} from '../js/core/training.js';
import { periodData, summary, streak, meetsGoal, rollingAvg, weightRequired, dayChecklist, perfectStreak, lastValueBefore, weekTraining } from '../js/core/metrics.js';
import { SEED_EXERCISES, seedTemplates } from '../js/data/seed.js';

const exercises = new Map(SEED_EXERCISES.map((e) => [e.id, e]));
const templates = seedTemplates();
const upperA = templates.find((t) => t.id === 'upper-a');

/** Fabrique une séance terminée : sets = { exerciseId: [[w, r, tag], ...] } */
function done(templateId, startedAt, sets) {
  return {
    id: `s${startedAt}`, templateId, name: templateId, startedAt, endedAt: startedAt + 3600e3, status: 'done',
    blocks: Object.entries(sets).map(([exerciseId, list]) => ({
      id: 'b', rest: 120,
      items: [{ id: 'i', exerciseId, sets: list.map(([w, r, tag = '']) => ({ kind: 'work', tag, w, r, done: true })) }],
    })),
  };
}

// --- Dates & formats ---
test('dates locales', () => {
  assert.equal(addDays('2026-02-28', 1), '2026-03-01');
  assert.equal(addDays('2026-03-29', 1), '2026-03-30'); // changement d'heure
  assert.equal(weekStart('2026-11-27'), '2026-11-23'); // vendredi -> lundi
  assert.equal(weekStart('2026-11-23'), '2026-11-23');
  assert.equal(diffDays('2026-11-27', '2026-10-25'), 33);
  assert.equal(keysBetween('2026-01-30', '2026-02-02').length, 4);
  assert.equal(monthEnd('2026-02-10'), '2026-02-28');
  assert.equal(dateKey(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
});

test('formats', () => {
  assert.equal(parseNum('102,5'), 102.5);
  assert.equal(parseNum(' 8 500 '), 8500);
  assert.equal(parseNum(''), null);
  assert.equal(parseNum('abc'), null);
  assert.equal(fmtSleep(450), '7 h 30');
  assert.equal(fmtSleep(45), '45 min');
  assert.equal(fmtClock(65), '1:05');
  assert.equal(fmtClock(3723), '1:02:03');
  assert.equal(fmtRest(90), '1:30');
  assert.equal(fmtRest(180), '3 min');
});

// --- Progression ---
test('e1rm Epley', () => {
  assert.equal(e1rm(100, 1), 100);
  assert.ok(Math.abs(e1rm(100, 5) - 116.67) < 0.01);
  assert.equal(e1rm(0, 5), 0);
});

test('double progression : haut de fourchette atteint partout => +incrément', () => {
  const g = { n: 3, min: 3, max: 5, tag: 'Lourd' };
  const r = planGroup(g, [{ w: 100, r: 5 }, { w: 100, r: 5 }, { w: 100, r: 5 }], exercises.get('bench'));
  assert.equal(r.progressed, true);
  assert.deepEqual(r.plan.map((p) => p.pw), [102.5, 102.5, 102.5]);
  assert.deepEqual(r.plan.map((p) => p.pr), [3, 3, 3]);
  assert.match(r.hint, /102,5/);
});

test('double progression : pas encore => même charge, +1 rep', () => {
  const g = { n: 3, min: 3, max: 5, tag: '' };
  const r = planGroup(g, [{ w: 100, r: 5 }, { w: 100, r: 4 }, { w: 100, r: 3 }], exercises.get('bench'));
  assert.equal(r.progressed, false);
  assert.deepEqual(r.plan.map((p) => p.pw), [100, 100, 100]);
  assert.deepEqual(r.plan.map((p) => p.pr), [5, 5, 4]);
});

test('sans historique : pas de charge proposée', () => {
  const r = planGroup({ n: 2, min: 8, max: 12 }, [], exercises.get('bench'));
  assert.deepEqual(r.plan.map((p) => p.pw), [null, null]);
  assert.equal(r.hint, null);
});

test('une seule série d’échauffement (~60 %)', () => {
  assert.deepEqual(warmupPlan(100, exercises.get('bench')), [{ pw: 60, pr: 6 }]);
  assert.deepEqual(warmupPlan(25, exercises.get('bench')), [{ pw: 20, pr: 6 }]); // jamais sous la barre vide
  assert.deepEqual(warmupPlan(140, exercises.get('leg_press')), [{ pw: 85, pr: 6 }]);
  assert.deepEqual(warmupPlan(25, exercises.get('dips_weighted')), [{ pw: 0, pr: 8 }]); // au poids du corps
  assert.deepEqual(warmupPlan(null, exercises.get('bench')), [{ pw: null, pr: 8 }]);
});

test('migration : échauffement uniquement sur le 1er exercice', () => {
  const t = seedTemplates().find((x) => x.id === 'upper-b');
  t.blocks[2].items[0].warmup = true;
  normalizeWarmups(t);
  const flags = t.blocks.flatMap((b) => b.items.map((it) => it.warmup));
  assert.equal(flags[0], true);
  assert.ok(flags.slice(1).every((f) => f === false));
  assert.ok(seedTemplates().every((x) => x.blocks[0].items[0].warmup));
});

test('dernière performance : priorité au même modèle', () => {
  const sessions = [
    done('upper-b', 3000, { lateral_raise: [[10, 15]] }),
    done('upper-a', 2000, { lateral_raise: [[8, 20]] }),
  ];
  assert.equal(lastPerformance('lateral_raise', 'upper-a', sessions).sets[0].w, 8);
  assert.equal(lastPerformance('lateral_raise', 'lower-a', sessions).sets[0].w, 10); // repli
  assert.equal(lastPerformance('bench', 'upper-a', sessions), null);
});

// --- Déroulé de séance ---
test('création de séance : échauffement + groupes + propositions', () => {
  const hist = [done('upper-a', 1000, { bench: [[100, 5, 'Lourd'], [100, 5, 'Lourd'], [100, 5, 'Lourd'], [85, 8, 'Léger'], [85, 7, 'Léger']] })];
  const s = createSession(upperA, { sessions: hist, exercises, now: 5000 });
  const bench = s.blocks[0].items[0];
  const warm = bench.sets.filter((x) => x.kind === 'warmup');
  const heavy = bench.sets.filter((x) => x.tag === 'Lourd');
  const light = bench.sets.filter((x) => x.tag === 'Léger');
  assert.deepEqual(warm.map((x) => x.pw), [62.5]); // 60 % de 102,5 kg
  assert.deepEqual(heavy.map((x) => x.pw), [102.5, 102.5, 102.5]);
  assert.equal(light.length, 2);
  assert.deepEqual(light.map((x) => x.pw), [85, 85]); // 8 puis 7 : pas encore de montée
  assert.deepEqual(light.map((x) => x.pr), [8, 8]);
  assert.equal(s.status, 'active');
  assert.equal(s.blocks.length, 5);
});

test('superset : alternance A1, B1, A2… et repos seulement après B', () => {
  const s = createSession(upperA, { sessions: [], exercises });
  // on valide tout sauf le superset final
  s.blocks.slice(0, 4).forEach((b) => b.items.forEach((it) => it.sets.forEach((x) => { x.done = true; })));
  const bi = 4;
  let n = nextPending(s);
  assert.deepEqual([n.bi, n.ii, n.si], [bi, 0, 0]);
  s.blocks[bi].items[0].sets[0].done = true;
  assert.equal(restAfter(s, bi, 0, 0, {}), 0); // enchaîner vers B
  n = nextPending(s);
  assert.deepEqual([n.ii, n.si], [1, 0]);
  s.blocks[bi].items[1].sets[0].done = true;
  assert.equal(restAfter(s, bi, 1, 0, {}), 90); // repos du bloc après B1
  n = nextPending(s);
  assert.deepEqual([n.ii, n.si], [0, 1]); // A2
});

test('repos : échauffement court, aucun repos après la dernière série', () => {
  const s = createSession(upperA, { sessions: [], exercises });
  const bench = s.blocks[0].items[0];
  bench.sets[0].done = true; // échauffement
  assert.equal(restAfter(s, 0, 0, 0, { warmupRest: 45 }), 45);
  s.blocks.forEach((b) => b.items.forEach((it) => it.sets.forEach((x) => { x.done = true; })));
  assert.equal(nextPending(s), null);
  assert.equal(restAfter(s, 4, 1, 2, {}), 0);
});

test('propagation de la charge et des reps aux séries suivantes du même groupe', () => {
  const s = createSession(upperA, { sessions: [], exercises });
  const it = s.blocks[1].items[0]; // tractions lestées 4×4-6
  it.sets[0].w = 15;
  it.sets[0].r = 5;
  it.sets[0].done = true;
  it.sets[2].r = 4; // déjà saisi : on ne l'écrase pas
  propagateWeight(it, 0);
  assert.deepEqual(it.sets.map((x) => x.pw), [null, 15, 15, 15]);
  assert.deepEqual(it.sets.slice(1).map((x) => x.pr), [5, 4, 5]);
});

test('fin de séance : purge, stats et records', () => {
  const prev = done('upper-a', 1000, { bench: [[100, 5, 'Lourd']] });
  const s = createSession(upperA, { sessions: [prev], exercises, now: 2000 });
  const bench = s.blocks[0].items[0];
  const heavy = bench.sets.find((x) => x.tag === 'Lourd');
  Object.assign(heavy, { w: 105, r: 3, done: true });
  pruneSession(s);
  s.status = 'done';
  s.endedAt = 2000 + 45 * 60e3;
  assert.equal(s.blocks.length, 1);
  assert.equal(s.blocks[0].items[0].sets.length, 1);
  const st = sessionStats(s, exercises, 80);
  assert.equal(st.sets, 1);
  assert.equal(st.volume, 315);
  const recs = sessionRecords(s, [s, prev], exercises, 80);
  assert.equal(recs.length, 1);
  assert.equal(recs[0].type, 'weight');
  assert.equal(recs[0].w, 105);
});

test('records lestés : 1RM inclut le poids de corps', () => {
  const sessions = [done('upper-a', 1000, { pullup_weighted: [[20, 5]] })];
  const rec = exerciseRecords('pullup_weighted', sessions, exercises.get('pullup_weighted'), 80);
  assert.ok(Math.abs(rec.e1rm.value - 100 * (1 + 5 / 30)) < 0.01);
});

test('séance suggérée : rotation dans l’ordre du programme', () => {
  assert.equal(suggestTemplate(templates, []).id, 'upper-a');
  assert.equal(suggestTemplate(templates, [done('upper-a', 1, {})]).id, 'lower-a');
  assert.equal(suggestTemplate(templates, [done('lower-b', 1, {})]).id, 'upper-a');
});

// --- Indicateurs quotidiens ---
test('objectifs', () => {
  assert.equal(meetsGoal(10000, 10000, 'min'), true);
  assert.equal(meetsGoal(9999, 10000, 'min'), false);
  assert.equal(meetsGoal(2400, 2600, 'target'), true);
  assert.equal(meetsGoal(2000, 2600, 'target'), false);
});

test('moyennes, série et périodes', () => {
  const today = '2026-11-27';
  const days = new Map();
  for (let i = 0; i < 20; i++) {
    const k = addDays(today, -i);
    days.set(k, { date: k, steps: i < 5 ? 12000 : 6000 });
  }
  days.delete(addDays(today, -10)); // un trou
  assert.equal(streak(days, 'steps', 10000, 'min', today), 5);
  const sm = summary(days, 'steps', 10000, today);
  assert.equal(sm.count7, 7);
  assert.equal(Math.round(sm.avg7), Math.round((5 * 12000 + 2 * 6000) / 7));
  assert.equal(sm.hits, 5);
  const p = periodData(days, 'steps', 'jours', today);
  assert.equal(p.points.length, 30);
  assert.equal(p.points[29].value, 12000);
  assert.equal(p.overlay.length, 30);
  const w = periodData(days, 'steps', 'semaines', today);
  assert.equal(w.points.length, 12);
  assert.equal(w.points[11].key, '2026-11-23');
  assert.equal(w.current, 12000); // lun.-ven. de cette semaine
  const m = periodData(days, 'steps', 'mois', today);
  assert.equal(m.points.length, 12);
  assert.equal(m.points[11].key, '2026-11-01');
  const r = rollingAvg(days, 'steps', [today], 3);
  assert.equal(r[0], 12000);
});

test('streak tolère que la journée ne soit pas encore saisie', () => {
  const today = '2026-11-27';
  const days = new Map([[addDays(today, -1), { steps: 11000 }], [addDays(today, -2), { steps: 11000 }]]);
  assert.equal(streak(days, 'steps', 10000, 'min', today), 2);
});

test('échauffement : la charge validée ne se propage pas aux séries suivantes', () => {
  const hist = [done('upper-a', 1000, { bench: [[100, 4, 'Lourd'], [100, 4, 'Lourd'], [95, 4, 'Lourd']] })];
  const s = createSession(upperA, { sessions: hist, exercises, now: 5000 });
  const bench = s.blocks[0].items[0];
  const before = bench.sets.filter((x) => x.kind === 'warmup').map((x) => x.pw);
  Object.assign(bench.sets[0], { w: 20, r: 10, done: true });
  propagateWeight(bench, 0);
  assert.deepEqual(bench.sets.filter((x) => x.kind === 'warmup').map((x) => x.pw), before);
  // pas de progression : charge de travail du groupe (100) pour toutes les séries
  assert.deepEqual(bench.sets.filter((x) => x.tag === 'Lourd').map((x) => x.pw), [100, 100, 100]);
});

test('première fois : la charge de travail est déduite de l’échauffement', () => {
  const lowerA = templates.find((t) => t.id === 'lower-a');
  const s = createSession(lowerA, { sessions: [], exercises, now: 1 });
  const rdl = s.blocks[0].items[0];
  Object.assign(rdl.sets[0], { w: 40, r: 8, done: true });
  propagateWeight(rdl, 0);
  assert.deepEqual(rdl.sets.filter((x) => x.kind === 'work').map((x) => x.pw), [67.5, 67.5, 67.5]);
  // avec un historique, les propositions existantes ne sont pas remplacées
  const hist = [done('lower-a', 0, { rdl: [[100, 7], [100, 7], [100, 6]] })];
  const s2 = createSession(lowerA, { sessions: hist, exercises, now: 1 });
  const r2 = s2.blocks[0].items[0];
  Object.assign(r2.sets[0], { w: 40, r: 8, done: true });
  propagateWeight(r2, 0);
  assert.deepEqual(r2.sets.filter((x) => x.kind === 'work').map((x) => x.pw), [100, 100, 100]);
});

// --- Poids, jour parfait, flamme ---
const full = (extra = {}) => ({ sleepMin: 450, sleepQ: 4, mood: 4, kcal: 2500, prot: 150, steps: 6000, ...extra });

test('rappel du poids tous les 3 jours', () => {
  const days = new Map([['2026-11-20', { weight: 78.4 }]]);
  assert.equal(lastValueBefore(days, 'weight', '2026-11-22').value, 78.4);
  assert.equal(weightRequired(days, '2026-11-21'), false);
  assert.equal(weightRequired(days, '2026-11-22'), false);
  assert.equal(weightRequired(days, '2026-11-23'), true); // 3 jours après
  assert.equal(weightRequired(new Map(), '2026-11-23'), true); // jamais pesé
});

test('jour parfait : sommeil + nutrition + humeur (pas et poids facultatifs)', () => {
  const d = '2026-11-27';
  const days = new Map([[d, full({ steps: undefined })]]);
  let c = dayChecklist(days, d);
  assert.equal(c.perfect, true); // pas de pas, pas de poids : parfait quand même
  assert.equal(c.done, 3);
  days.set(d, full({ mood: undefined }));
  c = dayChecklist(days, d);
  assert.equal(c.perfect, false);
  assert.deepEqual(c.missing, ['humeur']);
  days.set(d, { sleepMin: 450 }); // qualité manquante
  assert.deepEqual(dayChecklist(days, d).missing, ['sommeil', 'nutrition', 'humeur']);
});

test('flamme : jours parfaits, éteinte par une semaine terminée à moins de 3 séances', () => {
  // vendredi 27/11/2026 ; semaine courante = lundi 23/11 ; semaine précédente = 16-22/11
  const today = '2026-11-27';
  const days = new Map();
  for (let i = 0; i < 12; i++) days.set(addDays(today, -i), full()); // du 16/11 au 27/11
  const prevWeek3 = ['2026-11-16', '2026-11-18', '2026-11-20'];
  // semaine précédente avec 3 séances, semaine en cours avec 0 (non pénalisée) -> 12 jours
  assert.equal(perfectStreak(days, today, { sessionDates: prevWeek3, minSessions: 3 }), 12);
  // semaine précédente avec seulement 2 séances -> la flamme repart de lundi 23/11 : 5 jours
  assert.equal(perfectStreak(days, today, { sessionDates: prevWeek3.slice(0, 2), minSessions: 3 }), 5);
  // semaine de démarrage de l'app épargnée
  assert.equal(perfectStreak(days, today, { sessionDates: [], minSessions: 3, graceUntil: '2026-11-17' }), 12);
  // aujourd'hui pas encore renseigné : la série court jusqu'à hier
  days.set(today, { sleepMin: 400 });
  assert.equal(perfectStreak(days, today, { sessionDates: prevWeek3, minSessions: 3 }), 11);
  // un jour incomplet casse la série
  days.set('2026-11-25', { mood: 3 });
  assert.equal(perfectStreak(days, today, { sessionDates: prevWeek3, minSessions: 3 }), 1);
});

test('semaine d’entraînement : séances restantes et jours restants', () => {
  const wk = weekTraining(['2026-11-23', '2026-11-25', '2026-11-18'], '2026-11-27', 3);
  assert.deepEqual(wk, { count: 2, min: 3, needed: 1, daysLeft: 3 }); // ven., sam., dim.
  assert.equal(weekTraining([], '2026-11-29', 3).daysLeft, 1); // dimanche
});

test('couronne : record de charge ou de charge totale de la série', async () => {
  const { setRecordType } = await import('../js/core/training.js');
  const bench = exercises.get('bench');
  const hist = [done('upper-a', 1000, { bench: [[100, 5], [100, 5], [95, 8]] })];
  const rec = exerciseRecords('bench', hist, bench, 80);
  assert.equal(rec.setVolume.value, 760); // 95 × 8
  const mk = (w, r) => ({ kind: 'work', done: true, w, r });
  assert.equal(setRecordType(mk(102.5, 3), bench, rec, 80), 'weight');
  assert.equal(setRecordType(mk(100, 8), bench, rec, 80), 'volume'); // 800 > 760
  assert.equal(setRecordType(mk(100, 7), bench, rec, 80), null); // 700
  assert.equal(setRecordType({ ...mk(110, 5), kind: 'warmup' }, bench, rec, 80), null);
  // première fois : jamais de couronne
  assert.equal(setRecordType(mk(60, 10), bench, exerciseRecords('bench', [], bench, 80), 80), null);
});

// --- Objectifs ---
test('objectifs : valeurs calculées depuis les données', async () => {
  const g = await import('../js/core/goals.js');
  const today = '2026-11-27';
  const days = new Map([
    ['2026-11-20', { weight: 79.2, sleepMin: 420, kcal: 2400 }],
    ['2026-11-26', { weight: 78.6, sleepMin: 480, kcal: 2800 }],
  ]);
  const sessions = [done('upper-a', 1000, { bench: [[120, 5], [125, 3]] })]; // e1RM 140 et 137,5
  const ctx = { days, sessions, exercises, today };
  assert.equal(g.currentValue('weight', {}, ctx).value, 78.6); // dernière pesée
  assert.equal(g.currentValue('sleep', {}, ctx).value, 450); // moyenne 30 j
  assert.equal(g.currentValue('kcal', {}, ctx).value, 2600);
  // bench : max entre le 1RM enregistré (147) et l'historique (140)
  assert.equal(g.currentValue('bench', { current: 147 }, ctx).value, 147);
  assert.equal(Math.round(g.currentValue('bench', { current: 130 }, ctx).value), 140);
});

test('objectifs : statut atteint / à reconquérir et progression', async () => {
  const g = await import('../js/core/goals.js');
  const ctx = { days: new Map([['2026-11-26', { weight: 78 }]]), sessions: [], exercises, today: '2026-11-27' };
  // perte de poids : au plus 76 kg, départ 80 -> 50 %
  let r = g.evaluateGoal('weight', { target: 76, dir: 'max', start: 80 }, ctx);
  assert.equal(r.status, 'progress');
  assert.equal(r.progress, 0.5);
  r = g.evaluateGoal('weight', { target: 79, dir: 'max', start: 80 }, ctx);
  assert.equal(r.status, 'met');
  // atteint puis repassé au-dessus -> à reconquérir
  r = g.evaluateGoal('weight', { target: 77, dir: 'max', start: 80, achievedAt: '2026-11-20' }, ctx);
  assert.equal(r.status, 'lost');
  assert.equal(g.evaluateGoal('weight', { target: null }, ctx).status, 'unset');
  assert.equal(g.suggestDir('weight', 75, 78), 'max');
  assert.equal(g.suggestDir('weight', 82, 78), 'min');
});

test('objectifs : 1RM bench d’une séance', async () => {
  const g = await import('../js/core/goals.js');
  const s = done('upper-a', 1, { bench: [[130, 5], [140, 2]] });
  assert.ok(Math.abs(g.sessionBenchE1rm(s) - 151.67) < 0.01); // 130 × (1 + 5/30)
});
