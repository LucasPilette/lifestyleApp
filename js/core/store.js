// État applicatif en mémoire, persisté dans IndexedDB à chaque écriture.
// Les volumes sont petits (quelques Mo sur des années) : tout est chargé au démarrage.

import * as db from './db.js';
import { SEED_EXERCISES, SEED_VERSION, TEMPLATE_COLORS, TEMPLATE_RENAMES, seedTemplates } from '../data/seed.js';
import { clone, mergeDeep, uid } from './util.js';
import { normalizeWarmups, createSession } from './training.js';
import { dateKey, parseKey, todayKey } from './date.js';
import { DEFAULT_OBJECTIVES } from './goals.js';

export const DAY_FIELDS = ['sleepMin', 'sleepQ', 'kcal', 'prot', 'steps', 'weight', 'mood', 'moodNote'];

export const DEFAULT_SETTINGS = {
  name: 'Lucas', // prénom affiché dans le message d'accueil
  objectives: DEFAULT_OBJECTIVES, // objectifs à long terme (voir core/goals.js)
  goals: { sleepMin: 480, kcal: 2600, prot: 150, steps: 10000, minSessions: 3 }, // minSessions : minimum hebdo pour garder la flamme
  bodyweight: null, // kg, utilisé pour les exercices au poids du corps / lestés
  sound: true,
  countdown: true, // bips à 3-2-1 secondes
  haptics: true,
  keepAwake: true,
  warmupRest: 60,
  lastBackupAt: null,
};

export const state = {
  settings: clone(DEFAULT_SETTINGS),
  days: new Map(),
  exercises: new Map(),
  templates: [],
  sessions: [], // triées par date de début décroissante
  meta: {},
};

// --- Événements ------------------------------------------------------------
const listeners = new Set();
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
const emit = (type) => listeners.forEach((fn) => fn(type));

function persist(promise) {
  return promise.catch((err) => {
    console.error(err);
    window.dispatchEvent(new CustomEvent('store-error', { detail: err }));
  });
}

// --- Initialisation ------------------------------------------------------
export async function initStore() {
  const [settings, meta, days, exercises, templates, sessions] = await Promise.all([
    db.kvGet('settings'),
    db.kvGet('meta'),
    db.getAll('days'),
    db.getAll('exercises'),
    db.getAll('templates'),
    db.getAll('sessions'),
  ]);
  state.settings = mergeDeep(DEFAULT_SETTINGS, settings || {});
  state.meta = meta || {};
  state.days = new Map(days.map((d) => [d.date, d]));
  state.exercises = new Map(exercises.map((e) => [e.id, e]));
  state.templates = templates.sort((a, b) => a.order - b.order);
  state.sessions = sessions;
  sortSessions();

  await applySeed();
  await backfillWeek48();
  requestPersistentStorage();
}

async function applySeed() {
  const v = state.meta.seedVersion || 0;
  if (v >= SEED_VERSION) return;
  // Ajoute les exercices manquants sans jamais écraser ceux de l'utilisateur.
  const missing = SEED_EXERCISES.filter((e) => !state.exercises.has(e.id));
  missing.forEach((e) => state.exercises.set(e.id, { ...e }));
  if (missing.length) await db.putMany('exercises', missing);
  if (v === 0 && state.templates.length === 0) {
    state.templates = seedTemplates();
    await db.putMany('templates', state.templates);
  }
  // v2 : une seule série d'échauffement, sur le premier exercice de chaque séance.
  if (v >= 1 && v < 2 && state.templates.length) {
    state.templates.forEach(normalizeWarmups);
    await db.putMany('templates', state.templates);
  }
  // v3 : séances renommées (Zeus, Gojo, Toji, Atlas) si elles portent encore le nom d'origine.
  if (v >= 1 && v < 3) {
    const OLD_SUBTITLES = { 'upper-a': 'Force au bench et aux tractions', 'lower-a': 'Chaîne arrière', 'upper-b': 'Force aux dips, volume au bench', 'lower-b': 'Quadriceps et fessiers' };
    const fresh = new Map(seedTemplates().map((t) => [t.id, t]));
    const changedT = [];
    for (const t of state.templates) {
      const r = TEMPLATE_RENAMES[t.id];
      if (!r || t.name !== r[0]) continue;
      t.name = r[1];
      if (t.subtitle === OLD_SUBTITLES[t.id]) t.subtitle = fresh.get(t.id).subtitle;
      changedT.push(t);
    }
    if (changedT.length) await db.putMany('templates', changedT);
    const changedS = state.sessions.filter((s) => TEMPLATE_RENAMES[s.templateId]?.[0] === s.name);
    changedS.forEach((s) => { s.name = TEMPLATE_RENAMES[s.templateId][1]; });
    if (changedS.length) await db.putMany('sessions', changedS);
  }
  state.meta = { ...state.meta, seedVersion: SEED_VERSION, createdAt: state.meta.createdAt || Date.now() };
  await db.kvSet('meta', state.meta);
}

async function requestPersistentStorage() {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) {
      await navigator.storage.persist();
    }
  } catch {
    /* non supporté */
  }
}

export async function isStoragePersisted() {
  try {
    return (await navigator.storage?.persisted?.()) ?? null;
  } catch {
    return null;
  }
}

// --- Réglages ------------------------------------------------------------
export function updateSettings(patch) {
  state.settings = mergeDeep(state.settings, patch);
  persist(db.kvSet('settings', state.settings));
  emit('settings');
}

// --- Journal quotidien ---------------------------------------------------
export const getDay = (date) => state.days.get(date) || null;

export function setDayField(date, field, value) {
  const day = { ...(state.days.get(date) || { date }) };
  if (value == null || value === '' || Number.isNaN(value)) delete day[field];
  else day[field] = value;
  day.updatedAt = Date.now();
  if (!DAY_FIELDS.some((f) => day[f] != null)) {
    state.days.delete(date);
    persist(db.del('days', date));
  } else {
    state.days.set(date, day);
    persist(db.put('days', day));
  }
  emit('days');
}

// --- Exercices -----------------------------------------------------------
export const getExercise = (id) => state.exercises.get(id);

export function exerciseName(id) {
  return state.exercises.get(id)?.name || 'Exercice supprimé';
}

export function saveExercise(exercise) {
  const e = { ...exercise, id: exercise.id || uid() };
  state.exercises.set(e.id, e);
  persist(db.put('exercises', e));
  emit('exercises');
  return e;
}

export function sortedExercises() {
  return [...state.exercises.values()].sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}

// --- Séances types -------------------------------------------------------
export const getTemplate = (id) => state.templates.find((t) => t.id === id);

const DEFAULT_COLORS = { 'upper-a': '#8b93ff', 'lower-a': '#2dd4bf', 'upper-b': '#f472b6', 'lower-b': '#fbbf24' };

/** Couleur d'une séance type (choisie, sinon par défaut selon sa place dans le programme). */
export function templateColor(t) {
  if (!t) return null;
  return t.color || DEFAULT_COLORS[t.id] || TEMPLATE_COLORS[Math.max(0, state.templates.indexOf(t)) % TEMPLATE_COLORS.length];
}

/** Couleur d'une séance réalisée (copiée au démarrage, sinon celle de son modèle). */
/**
 * Ajoute une séance réalisée un jour passé (à 18 h). Les séries ne sont pas inventées :
 * elles restent à valider via « Modifier » (propositions pré-remplies) ou peuvent rester vides.
 */
export async function addPastSession(templateId, date) {
  const t = templateId ? getTemplate(templateId) : null;
  const startedAt = parseKey(date).getTime() + 18 * 3600e3;
  const s = createSession(t, { sessions: doneSessions(), exercises: state.exercises, now: startedAt });
  s.status = 'done';
  s.endedAt = startedAt + 60 * 60e3;
  s.manual = true;
  s.color = templateColor(t);
  await saveSession(s);
  return s;
}

/** Ajout ponctuel demandé par Lucas : Atlas mardi 24/11 et Zeus mercredi 25/11/2026 (une seule fois). */
async function backfillWeek48() {
  if (state.meta.backfillW48 || todayKey() > '2026-12-06') return;
  for (const [id, date] of [['lower-b', '2026-11-24'], ['upper-a', '2026-11-25']]) {
    if (!getTemplate(id)) continue;
    const exists = state.sessions.some((s) => s.status === 'done' && s.templateId === id && dateKey(new Date(s.startedAt)) === date);
    if (!exists) await addPastSession(id, date);
  }
  state.meta = { ...state.meta, backfillW48: true };
  await db.kvSet('meta', state.meta);
}

export function sessionColor(s) {
  return s?.color || templateColor(getTemplate(s?.templateId)) || null;
}

export function saveTemplate(t) {
  t.updatedAt = Date.now();
  if (!state.templates.includes(t)) {
    const i = state.templates.findIndex((x) => x.id === t.id);
    if (i >= 0) state.templates[i] = t;
    else state.templates.push(t);
  }
  state.templates.sort((a, b) => a.order - b.order);
  persist(db.put('templates', t));
  emit('templates');
}

export function deleteTemplate(id) {
  state.templates = state.templates.filter((t) => t.id !== id);
  persist(db.del('templates', id));
  emit('templates');
}

export function reorderTemplates(ids) {
  ids.forEach((id, i) => {
    const t = getTemplate(id);
    if (t) t.order = i;
  });
  state.templates.sort((a, b) => a.order - b.order);
  persist(db.putMany('templates', state.templates));
  emit('templates');
}

// --- Séances réalisées ---------------------------------------------------
function sortSessions() {
  state.sessions.sort((a, b) => b.startedAt - a.startedAt);
}

export const getSession = (id) => state.sessions.find((s) => s.id === id);
export const activeSession = () => state.sessions.find((s) => s.status === 'active') || null;
export const doneSessions = () => state.sessions.filter((s) => s.status === 'done');

export function saveSession(s) {
  s.updatedAt = Date.now();
  if (!state.sessions.includes(s)) {
    state.sessions = state.sessions.filter((x) => x.id !== s.id);
    state.sessions.push(s);
    sortSessions();
  }
  return persist(db.put('sessions', s)).then(() => emit('sessions'));
}

export function deleteSession(id) {
  state.sessions = state.sessions.filter((s) => s.id !== id);
  persist(db.del('sessions', id));
  emit('sessions');
}

// --- Sauvegarde / restauration -------------------------------------------
export function exportData() {
  return {
    app: 'lifestyleApp',
    format: 1,
    exportedAt: new Date().toISOString(),
    settings: state.settings,
    meta: state.meta,
    days: [...state.days.values()],
    exercises: [...state.exercises.values()],
    templates: state.templates,
    sessions: state.sessions,
  };
}

export async function importData(data) {
  if (!data || data.app !== 'lifestyleApp' || !Array.isArray(data.sessions)) {
    throw new Error("Ce fichier n'est pas une sauvegarde Eclipse valide.");
  }
  const arrays = ['days', 'exercises', 'templates', 'sessions'];
  for (const k of arrays) {
    if (!Array.isArray(data[k])) throw new Error(`Sauvegarde incomplète (${k}).`);
  }
  await db.replaceAll({
    kv: { settings: data.settings || {}, meta: { ...(data.meta || {}), seedVersion: data.meta?.seedVersion || SEED_VERSION } },
    days: data.days.filter((d) => d && d.date),
    exercises: data.exercises.filter((e) => e && e.id),
    templates: data.templates.filter((t) => t && t.id),
    sessions: data.sessions.filter((s) => s && s.id),
  });
}
