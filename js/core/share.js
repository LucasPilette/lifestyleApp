// Cartes à partager dans la discussion : flamme, objectif, record, séance, valeur du jour.
// Chaque carte = { payload, body } : payload s'affiche en bulle colorée, body est le texte de repli
// (aperçu de la liste d'amis, notification, ami qui n'a pas encore mis l'app à jour). Pur : testable sous Node.

import { fmtNum, fmtKg, fmtSleep, fmtDuration, fmtVolume } from './format.js';
import { sessionRecords, sessionStats } from './training.js';
import { MOODS } from './metrics.js';
import { WIDGETS, customSummary } from './prefs.js';

const COLOR_RE = /^(#[0-9a-f]{3,8}|var\(--[a-z0-9-]+\))$/i;
const clip = (s, n) => String(s ?? '').slice(0, n);

/** Carte nettoyée (les cartes reçues viennent d'un autre téléphone : on ne leur fait pas confiance). */
export function cleanCard(p) {
  if (!p || typeof p !== 'object') return null;
  const type = ['flame', 'goal', 'pr', 'session', 'stat'].includes(p.type) ? p.type : 'stat';
  return {
    type,
    emoji: clip(p.emoji, 8) || '✨',
    title: clip(p.title, 40),
    value: clip(p.value, 80),
    sub: clip(p.sub, 80),
    color: COLOR_RE.test(String(p.color || '')) ? p.color : '',
  };
}

function card(type, emoji, title, value, sub = '', color = '') {
  const payload = cleanCard({ type, emoji, title, value, sub, color });
  return { payload, body: `${emoji} ${title} : ${value}${sub ? ` (${sub})` : ''}` };
}

export function flameCard(streak) {
  const n = Math.max(0, Math.round(streak || 0));
  return n
    ? card('flame', '🔥', 'Ma flamme', `${n} jour${n > 1 ? 's' : ''} d’affilée`, n >= 7 ? 'je ne lâche rien' : 'et ça continue', '#ff7a2f')
    : card('flame', '🔥', 'Ma flamme', 'à rallumer aujourd’hui', 'motive-moi !', '#ff7a2f');
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

export function sessionCard(session, exercises, bodyweight, color = '') {
  const st = sessionStats(session, exercises, bodyweight);
  return card('session', '🏋️', 'Séance terminée', session.name || 'Séance',
    [fmtDuration(st.duration), `${st.sets} séries`, st.volume ? fmtVolume(st.volume) : ''].filter(Boolean).join(' · '), color);
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
