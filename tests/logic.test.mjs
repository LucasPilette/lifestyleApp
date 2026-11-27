// Tests de la logique pure. Lancer : node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { addDays, weekStart, diffDays, keysBetween, monthEnd, dateKey } from '../js/core/date.js';
import { parseNum, fmtSleep, fmtClock, fmtRest } from '../js/core/format.js';
import {
  e1rm, planGroup, warmupPlan, createSession, nextPending, restAfter, lastPerformance,
  propagateWeight, pruneSession, normalizeWarmups, sessionStats, sessionRecords, suggestTemplate, exerciseRecords,
} from '../js/core/training.js';
import { periodData, summary, streak, meetsGoal, rollingAvg } from '../js/core/metrics.js';
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
