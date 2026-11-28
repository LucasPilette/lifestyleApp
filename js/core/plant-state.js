// Plante de l'utilisateur : croissance calculée avec ses critères (widgets qui arrosent) et ses séances.

import { state, doneSessions } from './store.js';
import { dateKey, todayKey } from './date.js';
import { flameRules } from './prefs.js';
import { growth } from './growth.js';

/** Options de growth() d'après les réglages (settings.flame = ce qui arrose la graine). */
export function growthOptions() {
  const rules = flameRules(state.settings);
  return {
    sessionDates: doneSessions().map((s) => dateKey(new Date(s.startedAt))),
    minSessions: state.settings.goals.minSessions || 3,
    graceUntil: state.meta.createdAt ? dateKey(new Date(state.meta.createdAt)) : null,
    items: rules.items,
    weekly: rules.weekly,
    custom: rules.custom,
  };
}

export const myGrowth = (today = todayKey()) => growth(state.days, today, growthOptions());
