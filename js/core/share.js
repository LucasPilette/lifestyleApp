// Cartes à partager dans la discussion : plante, objectif, record, séance, valeur du jour, graphique.
// Chaque carte = { payload, body } : payload s'affiche en bulle colorée, body est le texte de repli
// (aperçu de la liste d'amis, notification, ami qui n'a pas encore mis l'app à jour). Pur : testable sous Node.

import { fmtNum, fmtKg, fmtSleep, fmtDuration, fmtVolume } from './format.js';
import { addDays, keysBetween, formatWeekday, dayMonth } from './date.js';
import { METRICS } from './metrics.js';
import { stageOf, STAGES, daysLabel } from './growth.js';
import { sessionRecords, sessionStats, setsSummary } from './training.js';
import { MOODS } from './metrics.js';
import { WIDGETS, customSummary } from './prefs.js';

const COLOR_RE = /^(#[0-9a-f]{3,8}|var\(--[a-z0-9-]+\))$/i;
const clip = (s, n) => String(s ?? '').slice(0, n);

const int = (v, lo, hi, d = lo) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
};
const num = (v) => (typeof v === 'number' && Number.isFinite(v) && Math.abs(v) < 1e6 ? v : null);
const LOADS = ['kg', 'lest', 'pdc'];

/** Séance type partagée (aussi le contenu d'une séance réalisée), bornée. */
function cleanTemplate(t) {
  if (!t || typeof t !== 'object') return null;
  const blocks = (Array.isArray(t.blocks) ? t.blocks : []).slice(0, 15).map((b) => ({
    rest: int(b?.rest, 0, 600, 120),
    items: (Array.isArray(b?.items) ? b.items : []).slice(0, 3).map((it) => ({
      name: clip(it?.name, 60) || 'Exercice',
      muscle: clip(it?.muscle, 20),
      load: LOADS.includes(it?.load) ? it.load : 'kg',
      warmup: !!it?.warmup,
      note: clip(it?.note, 120),
      plan: (Array.isArray(it?.plan) ? it.plan : []).slice(0, 4).map((g) => {
        const min = int(g?.[1], 1, 50, 8);
        return [int(g?.[0], 1, 8, 3), min, Math.max(min, int(g?.[2], 1, 60, min)), clip(g?.[3], 14)];
      }),
      done: (Array.isArray(it?.done) ? it.done : []).slice(0, 12).map((x) => [num(x?.[0]) ?? 0, int(x?.[1], 0, 200, 0)]),
      record: !!it?.record,
    })).filter((it) => it.name),
  })).filter((b) => b.items.length);
  if (!blocks.length) return null;
  return { name: clip(t.name, 40) || 'Séance', subtitle: clip(t.subtitle, 80), color: COLOR_RE.test(String(t.color || '')) ? t.color : '', blocks };
}

/** Graphique partagé : une donnée sur 7 ou 30 jours. */
function cleanChart(c) {
  if (!c || typeof c !== 'object') return null;
  const field = Object.keys(METRICS).includes(c.field) ? c.field : 'custom';
  const values = (Array.isArray(c.values) ? c.values : []).slice(0, 31).map(num);
  if (!values.some((v) => v != null)) return null;
  return {
    field,
    kind: c.kind === 'line' ? 'line' : 'bar',
    labels: (Array.isArray(c.labels) ? c.labels : []).slice(0, values.length).map((l) => clip(l, 8)),
    values,
    goal: num(c.goal),
    maxY: num(c.maxY),
    unit: clip(c.unit, 12),
    decimals: !!c.decimals,
  };
}

/** Carte nettoyée (les cartes reçues viennent d'un autre téléphone : on ne leur fait pas confiance). */
export function cleanCard(p) {
  if (!p || typeof p !== 'object') return null;
  const type = ['flame', 'goal', 'pr', 'session', 'stat', 'template', 'program', 'chart'].includes(p.type) ? p.type : 'stat';
  const extra = {};
  if (p.session) {
    const s = cleanTemplate(p.session);
    if (s) {
      // Date (horodatage) et durée (ms) : bornes propres, hors du plafond générique des valeurs.
      const date = Number(p.session.date);
      const duration = Number(p.session.duration);
      extra.session = { ...s, date: date > 1e12 && date < 1e13 ? date : null, duration: duration > 0 && duration < 864e5 ? duration : null, volume: num(p.session.volume), sets: int(p.session.sets, 0, 500, 0) };
    }
  }
  if (p.template) {
    const t = cleanTemplate(p.template);
    if (t) extra.template = t;
  }
  if (p.program) {
    const templates = (Array.isArray(p.program.templates) ? p.program.templates : []).slice(0, 8).map(cleanTemplate).filter(Boolean);
    if (templates.length) extra.program = { name: clip(p.program.name, 60) || 'Programme', templates };
  }
  if (p.chart) {
    const ch = cleanChart(p.chart);
    if (ch) extra.chart = ch;
  }
  return {
    ...extra,
    type,
    emoji: clip(p.emoji, 8) || '✨',
    title: clip(p.title, 40),
    value: clip(p.value, 80),
    sub: clip(p.sub, 80),
    color: COLOR_RE.test(String(p.color || '')) ? p.color : '',
    lines: Array.isArray(p.lines) ? p.lines.slice(0, 8).map((l) => clip(l, 70)).filter(Boolean) : [],
  };
}

function card(type, emoji, title, value, sub = '', color = '', lines = [], extra = {}) {
  const payload = cleanCard({ type, emoji, title, value, sub, color, lines, ...extra });
  if (!payload.lines.length) delete payload.lines;
  return { payload, body: `${emoji} ${title} : ${value}${sub ? ` (${sub})` : ''}` };
}

/** Ma plante (type « flame » gardé pour les anciennes versions de l'app). `g` : growth() ou nombre de jours d'affilée. */
export function plantCard(g) {
  const n = Math.max(0, Math.round(typeof g === 'number' ? g : g?.streak || 0));
  const st = stageOf(n);
  const next = STAGES[STAGES.indexOf(st) + 1];
  if (!n) return card('flame', st.emoji, 'Ma graine', 'à arroser aujourd’hui', 'motive-moi !', '#ff8a52');
  return card('flame', st.emoji, st.ta.replace(/^ta /, 'Ma ').replace(/^ton /, 'Mon '), `${daysLabel(n)} d’affilée`,
    next ? `${next.name.toLowerCase()} dans ${daysLabel(next.min - n)}` : 'la vie est revenue 🌍', '#ff8a52');
}

/** Objectif évalué (voir goals.evaluateGoal). */
export function goalCard(r) {
  const target = r.cfg?.target != null ? r.def.fmt(r.cfg.target) : '';
  const value = r.value != null ? r.def.fmt(r.value) : '–';
  if (r.status === 'met') return card('goal', '🏆', 'Objectif atteint', `${r.def.label} : ${value}`, target ? `objectif ${target}` : '', '#ffc23d');
  return card('goal', '🎯', 'Mon objectif', `${r.def.label} : ${value}`, target ? `${Math.round((r.progress || 0) * 100)} % de ${target}` : '', r.def.color);
}

/** Records battus lors des dernières séances (le plus récent d'abord, un par exercice). */
export function recentRecords(sessions, exercises, bodyweight, { maxSessions = 12 } = {}) {
  const done = sessions.filter((s) => s.status === 'done').sort((a, b) => b.startedAt - a.startedAt).slice(0, maxSessions);
  const out = [];
  const seen = new Set();
  for (const s of done) {
    for (const rec of sessionRecords(s, sessions, exercises, bodyweight)) {
      if (seen.has(rec.exerciseId)) continue;
      seen.add(rec.exerciseId);
      out.push({ ...rec, date: s.startedAt });
    }
  }
  return out;
}

export function recordCard(rec, exercise, when = '') {
  const name = exercise?.name || 'Exercice';
  const what = exercise?.load === 'pdc' ? `${rec.r} reps`
    : exercise?.load === 'lest' ? `${rec.w ? `+${fmtKg(rec.w)} kg` : 'PDC'} × ${rec.r}`
    : `${fmtKg(rec.w)} kg × ${rec.r}`;
  const kind = rec.type === 'weight' ? 'charge la plus lourde' : rec.type === 'volume' ? 'meilleure série' : '1RM estimé';
  return card('pr', '👑', 'Nouveau record', `${name} : ${what}`, [kind, when].filter(Boolean).join(' · '), '#ffc23d');
}

/**
 * Séance terminée : durée, séries, volume, records battus, et le détail des exercices (une ligne chacun).
 * `sessions` (toutes les séances) sert à repérer les records ; facultatif.
 */
export function sessionCard(session, exercises, bodyweight, color = '', sessions = null) {
  const st = sessionStats(session, exercises, bodyweight);
  const records = sessions ? sessionRecords(session, sessions, exercises, bodyweight) : [];
  const recIds = new Set(records.map((r) => r.exerciseId));
  const lines = [];
  const blocks = [];
  for (const b of session.blocks || []) {
    const items = [];
    for (const it of b.items) {
      const sets = it.sets.filter((x) => x.done && x.kind === 'work');
      if (!sets.length) continue;
      const ex = exercises.get(it.exerciseId);
      lines.push(`${recIds.has(it.exerciseId) ? '👑 ' : ''}${ex?.name || 'Exercice'} · ${setsSummary(sets, ex)}`);
      // Plan de la séance (pour l'importer) : celui de la séance type, sinon déduit des séries faites.
      const plan = it.plan?.sets?.length
        ? it.plan.sets.map((g) => [g.n, g.min, g.max, g.tag || ''])
        : [[sets.length, Math.min(...sets.map((x) => x.r || 0)) || 8, Math.max(...sets.map((x) => x.r || 0)) || 12, '']];
      items.push({ ...exerciseShare(ex), warmup: !!it.plan?.warmup, note: it.note || '', plan, done: sets.map((x) => [x.w || 0, x.r || 0]), record: recIds.has(it.exerciseId) });
    }
    if (items.length) blocks.push({ rest: b.rest, items });
  }
  const sub = [fmtDuration(st.duration), `${st.sets} séries`, st.volume ? fmtVolume(st.volume) : '', records.length ? `${records.length} record${records.length > 1 ? 's' : ''} 👑` : '']
    .filter(Boolean).join(' · ');
  return card('session', records.length ? '🏆' : '🏋️', 'Séance terminée', session.name || 'Séance', sub, color, lines, {
    session: { name: session.name, color, blocks, date: session.startedAt, duration: st.duration, volume: st.volume, sets: st.sets },
  });
}

const exerciseShare = (ex) => ({ name: ex?.name || 'Exercice', muscle: ex?.muscle || '', load: ex?.load || 'kg' });

/** Séance type (programme) à partager : sa structure, importable par l'ami. */
export function templateShare(t, exercises) {
  return {
    name: t.name, subtitle: t.subtitle || '', color: t.color || '',
    blocks: t.blocks.map((b) => ({
      rest: b.rest,
      items: b.items.map((it) => ({ ...exerciseShare(exercises.get(it.exerciseId)), warmup: !!it.warmup, note: it.note || '', plan: it.sets.map((g) => [g.n, g.min, g.max, g.tag || '']) })),
    })),
  };
}

export function templateCard(t, exercises, color = '') {
  const tpl = templateShare(t, exercises);
  const n = tpl.blocks.reduce((a, b) => a + b.items.length, 0);
  return card('template', '📋', 'Séance à essayer', t.name, `${n} exercice${n > 1 ? 's' : ''}${t.subtitle ? ` · ${t.subtitle}` : ''}`, color || t.color || '',
    tpl.blocks.flatMap((b) => b.items.map((it) => `${it.name} · ${it.plan.map((g) => `${g[0]}×${g[1] === g[2] ? g[1] : `${g[1]}-${g[2]}`}`).join(' + ')}`)),
    { template: tpl });
}

export function programCard(templates, exercises, ownerName = '') {
  const list = templates.slice(0, 8).map((t) => templateShare(t, exercises));
  const name = ownerName ? `Programme de ${ownerName}` : 'Mon programme';
  return card('program', '🗂️', 'Programme à essayer', name, `${list.length} séance${list.length > 1 ? 's' : ''} : ${list.map((t) => t.name).join(', ')}`, '',
    list.map((t) => `${t.name} · ${t.blocks.reduce((a, b) => a + b.items.length, 0)} exercices`), { program: { name, templates: list } });
}

/**
 * Séances partagées -> format du coach (exercices référencés par nom), à convertir ensuite avec
 * programToTemplates : les exercices déjà dans la bibliothèque sont réutilisés, les autres créés.
 */
export function sharedToProgram(templates) {
  const ids = new Map();
  const newExercises = [];
  const sessions = templates.map((t) => ({
    name: t.name, subtitle: t.subtitle, color: t.color,
    blocks: t.blocks.map((b) => ({
      rest_seconds: b.rest,
      items: b.items.map((it) => {
        const key = it.name.toLowerCase();
        if (!ids.has(key)) {
          ids.set(key, `s${ids.size + 1}`);
          newExercises.push({ id: ids.get(key), name: it.name, muscle: it.muscle, load: it.load });
        }
        return { exercise_id: ids.get(key), warmup: it.warmup, note: it.note, sets: it.plan.map(([n, min, max, tag]) => ({ count: n, reps_min: min, reps_max: max, label: tag })) };
      }),
    })),
  }));
  return { name: '', summary: '', new_exercises: newExercises, sessions };
}

// --- Graphiques -------------------------------------------------------------------------
const CHART_INFO = {
  sleepMin: ['😴', 'Mon sommeil'], sleepQ: ['⭐', 'Qualité de mon sommeil'], kcal: ['🍽️', 'Mes calories'], prot: ['🥩', 'Mes protéines'],
  steps: ['👟', 'Mes pas'], weight: ['⚖️', 'Mon poids'], mood: ['🙂', 'Mon humeur'],
};

/**
 * Graphique d'une donnée sur les `range` derniers jours (7 ou 30). `custom` : widget chiffre ou émoji.
 * null s'il n'y a aucune valeur sur la période.
 */
export function chartCard(days, field, today, { range = 7, goal = null, custom = null } = {}) {
  const keys = keysBetween(addDays(today, -(range - 1)), today);
  const values = keys.map((k) => {
    const v = custom ? days.get(k)?.custom?.[custom.id] : days.get(k)?.[field];
    return typeof v === 'number' ? v : null;
  });
  const present = values.filter((v) => v != null);
  if (!present.length) return null;
  const avg = present.reduce((a, b) => a + b, 0) / present.length;
  const labels = keys.map((k) => (range <= 7 ? formatWeekday(k).slice(0, 3) : dayMonth(k)));
  const period = `${range} derniers jours · ${present.length} j renseignés`;
  if (custom) {
    const emoji = custom.kind === 'emoji';
    const fmt = (v) => (emoji ? `${fmtNum(v, 1)}/5` : `${fmtNum(v, custom.decimals ? 1 : 0)}${custom.unit ? ` ${custom.unit}` : ''}`);
    return card('chart', custom.emoji || '📈', custom.name, `${fmt(avg)} en moyenne`, period, custom.color || '', [], {
      chart: { field: 'custom', kind: 'bar', labels, values, goal: emoji ? null : custom.target ?? null, maxY: emoji ? 5 : null, unit: emoji ? '/5' : custom.unit || '', decimals: emoji || !!custom.decimals },
    });
  }
  const m = METRICS[field];
  const [emoji, title] = CHART_INFO[field] || ['📈', m.label];
  const value = field === 'weight' ? `${m.fmt(present[present.length - 1])} (dernière pesée)` : `${m.fmt(avg)} en moyenne`;
  return card('chart', emoji, title, value, period, m.color, [], {
    chart: { field, kind: m.chart || 'bar', labels, values, goal: m.goalType ? goal : null, maxY: m.maxY ?? null },
  });
}

/** Cartes des valeurs du jour, dans l'ordre des widgets affichés (seulement ceux renseignés). */
export function dayCards(day = {}, widgets = [], customs = []) {
  const out = [];
  for (const id of widgets) {
    const c = WIDGETS[id]?.color || '';
    if (id === 'sleep' && day.sleepMin != null) out.push(card('stat', '😴', 'Ma nuit', fmtSleep(day.sleepMin), day.sleepQ ? `qualité ${day.sleepQ}/5` : '', c));
    else if (id === 'mood' && day.mood) out.push(card('stat', MOODS[day.mood].emoji, 'Mon humeur', MOODS[day.mood].label, '', c));
    else if (id === 'weight' && day.weight != null) out.push(card('stat', '⚖️', 'Ma pesée', `${fmtNum(day.weight, 1)} kg`, '', c));
    else if (id === 'nutrition' && (day.kcal != null || day.prot != null)) {
      out.push(card('stat', '🍽️', 'Ma nutrition', [day.kcal != null ? `${fmtNum(day.kcal)} kcal` : '', day.prot != null ? `${fmtNum(day.prot)} g de protéines` : ''].filter(Boolean).join(' · '), '', c));
    } else if (id === 'steps' && day.steps != null) out.push(card('stat', '👟', 'Mes pas', `${fmtNum(day.steps)} pas`, '', c));
    else if (id === 'routines' && day.habits?.length) out.push(card('stat', '✅', 'Mes routines', `${day.habits.length}/${day.habitsTotal || day.habits.length}`, '', c));
    else {
      const def = customs.find((x) => x.id === id);
      const v = def ? day.custom?.[id] : null;
      if (def && v != null) out.push(card('stat', def.emoji || '✨', def.name, customSummary(def, v) || '', '', def.color));
    }
  }
  return out;
}
