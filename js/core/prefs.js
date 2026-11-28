// Préférences utilisateur : thèmes, objectifs de vie, widgets de l'accueil, flamme, habitudes.
// Pur (aucun DOM) : testable sous Node.

/** Thèmes (couleurs d'aperçu : fond sombre, fond clair, accent, accent 2). */
export const THEMES = {
  spring: { label: 'Spring', sub: 'Vert citron, énergie santé', dark: '#0e130f', light: '#f3f8ec', accent: '#b8f02a', accent2: '#3fcf6e' },
  summer: { label: 'Summer', sub: 'Rose sakura', dark: '#150f15', light: '#fdf2f6', accent: '#ff5f9e', accent2: '#ffa3c7' },
  fall: { label: 'Fall', sub: 'Rouge éclipse', dark: '#0f1119', light: '#fbf3f0', accent: '#ff3b4a', accent2: '#ff7a45' },
  winter: { label: 'Winter', sub: 'Sobre : noir, blanc et bleu', dark: '#08090c', light: '#f3f5f9', accent: '#3d8bff', accent2: '#8cc0ff' },
};
export const THEME_IDS = Object.keys(THEMES);
export const MODES = [['dark', 'Sombre'], ['light', 'Clair'], ['auto', 'Auto']];

/** Widgets de l'accueil (rubriques), dans l'ordre par défaut. */
export const WIDGETS = {
  sleep: { label: 'Sommeil', icon: 'moon', color: 'var(--c-sleep)', short: 'sommeil', desc: 'Durée et qualité de la nuit' },
  mood: { label: 'Humeur', icon: 'smile', color: 'var(--c-mood)', short: 'humeur', desc: 'Comment tu te sens' },
  weight: { label: 'Poids', icon: 'scale', color: 'var(--c-weight)', short: 'poids', desc: 'Pesée, rappel tous les 3 jours' },
  nutrition: { label: 'Nutrition', icon: 'flame', color: 'var(--c-kcal)', short: 'nutrition', desc: 'Calories et protéines' },
  steps: { label: 'Pas', icon: 'steps', color: 'var(--c-steps)', short: 'pas', desc: 'Pas de la journée' },
  training: { label: 'Entraînement', icon: 'dumbbell', color: 'var(--accent)', short: 'séances', desc: 'Séances de la semaine', weekly: true },
  routines: { label: 'Routines', icon: 'check', color: 'var(--c-routine)', short: 'routines', desc: 'Tes habitudes à cocher' },
};
export const WIDGET_IDS = Object.keys(WIDGETS);

/** Objectifs de vie proposés à l'accueil : chacun active des widgets. */
export const FOCUS = [
  { id: 'sport', label: 'Sport', sub: 'Séances, charges, records', icon: 'dumbbell', widgets: ['training'] },
  { id: 'diet', label: 'Diète', sub: 'Calories, protéines, poids', icon: 'flame', widgets: ['nutrition', 'weight'] },
  { id: 'sleep', label: 'Sommeil', sub: 'Mieux dormir, plus régulièrement', icon: 'moon', widgets: ['sleep'] },
  { id: 'wellbeing', label: 'Bien-être', sub: 'Suivre son humeur', icon: 'smile', widgets: ['mood'] },
  { id: 'activity', label: 'Activité', sub: 'Bouger plus au quotidien', icon: 'steps', widgets: ['steps'] },
  { id: 'routines', label: 'Routines', sub: 'Créer de bonnes habitudes', icon: 'check', widgets: ['routines'] },
];

// Réglages historiques (avant l'onboarding) : tout l'accueil, flamme = sommeil + nutrition + humeur + séances.
export const DEFAULT_WIDGETS = ['sleep', 'mood', 'weight', 'nutrition', 'steps', 'training'];
export const DEFAULT_FLAME = ['sleep', 'nutrition', 'mood', 'training'];

/** Widgets proposés pour des objectifs cochés (ordre canonique, sans doublon). */
export function widgetsForFocus(focus = []) {
  const set = new Set(FOCUS.filter((f) => focus.includes(f.id)).flatMap((f) => f.widgets));
  return WIDGET_IDS.filter((w) => set.has(w));
}

/** Objectifs de vie correspondant à des widgets déjà affichés (préremplissage pour un utilisateur existant). */
export function focusForWidgets(widgets = []) {
  return FOCUS.filter((f) => f.widgets.some((w) => widgets.includes(w))).map((f) => f.id);
}

/** Liste de widgets nettoyée (ids connus, sans doublon, ordre de l'utilisateur conservé). */
export function cleanWidgets(list) {
  const seen = new Set();
  return (Array.isArray(list) ? list : []).filter((w) => WIDGETS[w] && !seen.has(w) && seen.add(w));
}

/** Flamme proposée par défaut pour des widgets : tout ce qui se renseigne chaque jour, sauf le poids et les pas. */
export function defaultFlameFor(widgets) {
  return widgets.filter((w) => !['weight', 'steps'].includes(w));
}

/**
 * Critères de flamme effectifs (seuls les widgets affichés comptent).
 * @returns {{ items: string[], weekly: boolean }} items = widgets quotidiens exigés ; weekly = minimum de séances par semaine
 */
export function flameRules(settings = {}) {
  const widgets = cleanWidgets(settings.widgets ?? DEFAULT_WIDGETS);
  const flame = (settings.flame ?? DEFAULT_FLAME).filter((w) => widgets.includes(w));
  return { items: flame.filter((w) => !WIDGETS[w].weekly), weekly: flame.includes('training') };
}

// --- Habitudes (routines) ---------------------------------------------------

export const HABIT_SUGGESTIONS = [
  '💧 Boire 2 L d’eau', '📖 Lire 10 min', '🧘 Méditer', '🤸 S’étirer', '🚶 Marcher 20 min', '🌙 Pas d’écran avant de dormir',
  '🥗 Manger des légumes', '☀️ Sortir le matin', '📝 Écrire sa journée', '💊 Vitamines',
];

/**
 * Coche / décoche une habitude dans une journée. Le nombre d'habitudes du moment est mémorisé dans la journée
 * (habitsTotal) : ajouter une habitude plus tard n'éteint pas les flammes passées.
 * @returns {{ habits: string[]|null, habitsTotal: number|null }} champs à enregistrer
 */
export function toggleHabit(day = {}, habitId, allHabits) {
  const ids = new Set(allHabits.map((x) => x.id));
  const done = new Set((day.habits || []).filter((id) => ids.has(id)));
  if (done.has(habitId)) done.delete(habitId);
  else done.add(habitId);
  const list = allHabits.map((x) => x.id).filter((id) => done.has(id));
  return list.length ? { habits: list, habitsTotal: allHabits.length } : { habits: null, habitsTotal: null };
}

/**
 * Liste d'habitudes modifiée : la journée (aujourd'hui) suit la nouvelle liste.
 * @returns champs à enregistrer, ou null si rien n'était coché ce jour-là
 */
export function reconcileHabits(day, allHabits) {
  if (!day?.habits) return null;
  const ids = new Set(allHabits.map((x) => x.id));
  const kept = day.habits.filter((id) => ids.has(id));
  return kept.length ? { habits: kept, habitsTotal: allHabits.length } : { habits: null, habitsTotal: null };
}

/** Habitudes du jour toutes faites ? (selon le nombre d'habitudes de ce jour-là) */
export function habitsComplete(day) {
  const total = day?.habitsTotal || 0;
  return total > 0 && (day.habits?.length || 0) >= total;
}

// --- Profil ----------------------------------------------------------------

/** Code ami lisible : « 123 456 ». */
export const formatFriendCode = (code) => (code ? `${String(code).slice(0, 3)} ${String(code).slice(3)}` : '');

/** Code saisi par l'utilisateur -> 6 chiffres, ou null. */
export function parseFriendCode(input) {
  const digits = String(input || '').replace(/\D/g, '');
  return digits.length === 6 ? digits : null;
}
