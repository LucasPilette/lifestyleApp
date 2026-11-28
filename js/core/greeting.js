// Phrase d'accueil sous « Bonjour / Bonsoir » : naturelle, selon l'heure, ce qu'il reste à faire,
// la série de flammes et les séances de la semaine. Pur : testable sous Node.

/** Ce qu'il reste à faire, dit naturellement. Widgets personnalisés : leur nom. */
const NATURAL = {
  sleep: 'ta nuit',
  nutrition: 'tes repas',
  mood: 'ton humeur',
  weight: 'ta pesée',
  steps: 'tes pas',
  routines: 'tes routines',
};
const natural = (item) => NATURAL[item.id] || `« ${item.label} »`;

/** « a », « a et b », « a, b et c ». */
export function frenchList(items) {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} et ${items[items.length - 1]}`;
}

const plural = (n, word) => `${n} ${word}${n > 1 ? 's' : ''}`;

/** Phrase sur les séances de la semaine (wk = weekTraining), ou ''. */
function trainingSentence(wk) {
  if (!wk || wk.needed <= 0) return '';
  if (wk.needed >= wk.daysLeft) return `Il te faut encore ${plural(wk.needed, 'séance')} d’ici dimanche pour garder ta flamme.`;
  if (wk.needed === 1) return 'Encore une séance cette semaine et ta flamme est à l’abri.';
  return `Encore ${wk.needed} séances cette semaine pour ta flamme.`;
}

/**
 * @param {object} c résultat de dayChecklist (items avec id, label, ok)
 * @param {boolean} isToday
 * @param {object|null} wk weekTraining, ou null si les séances ne comptent pas
 * @param {{ hour?: number, streak?: number }} opts heure actuelle, série de flammes en cours
 */
export function greetingMessage(c, isToday, wk, { hour = 12, streak = 0 } = {}) {
  const missing = c.items.filter((i) => !i.ok).map(natural);
  if (!isToday) {
    if (!c.items.length) return '';
    return c.perfect ? 'Journée parfaite ce jour-là 🔥' : `Ce jour-là, il manquait ${frenchList(missing)}.`;
  }
  const training = trainingSentence(wk);
  const withTraining = (s) => (training ? `${s} ${training}` : s);
  if (!c.items.length) return training || 'Belle journée à toi ✨';
  if (c.perfect) {
    return withTraining(streak > 1 ? `${streak} jours d’affilée, ta flamme brille 🔥` : 'Journée parfaite, ta flamme est allumée 🔥');
  }
  const evening = hour >= 18;
  if (c.done === 0) {
    if (hour < 11 && c.items.some((i) => i.id === 'sleep' && !i.ok)) return withTraining('Bien dormi ? Commence par noter ta nuit.');
    return withTraining(evening ? `Prends une minute pour noter ${frenchList(missing)} 🌙` : `Quand tu as une minute, note ${frenchList(missing)}.`);
  }
  if (missing.length === 1) {
    return withTraining(evening ? `Plus que ${missing[0]} et ta journée est parfaite 🌙` : `Plus que ${missing[0]} pour une journée parfaite.`);
  }
  return withTraining(`Encore ${frenchList(missing)} pour une journée parfaite.`);
}
