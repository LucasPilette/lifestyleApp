// Phrase d'accueil sous « Bonjour / Bonsoir » : naturelle, selon l'heure, ce qu'il reste à faire,
// la plante (graine, pousse…) et les séances de la semaine. Pur : testable sous Node.

import { STAGES, daysLabel } from './growth.js';

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

/** Ce qu'il reste à noter, en toutes lettres : ['ta nuit', 'ton humeur']. `c` : résultat de dayChecklist. */
export const todoItems = (c) => c.items.filter((i) => !i.ok).map(natural);
/** « ta nuit et ton humeur » */
export const todoText = (c) => frenchList(todoItems(c));

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const plural = (n, word) => `${n} ${word}${n > 1 ? 's' : ''}`;

/** Phrase sur les séances de la semaine (wk = weekTraining), ou ''. */
function trainingSentence(wk, plant) {
  if (!wk || wk.needed <= 0) return '';
  if (wk.needed >= wk.daysLeft) return `Il te faut encore ${plural(wk.needed, 'séance')} d’ici dimanche pour ${plant}.`;
  if (wk.needed === 1) return `Encore une séance cette semaine et ${plant} sera à l’abri.`;
  return `Encore ${wk.needed} séances cette semaine pour ${plant}.`;
}

/**
 * @param {object} c résultat de dayChecklist (items avec id, label, ok)
 * @param {boolean} isToday
 * @param {object|null} wk weekTraining, ou null si les séances ne comptent pas
 * @param {{ hour?: number, streak?: number, stage?: object, next?: object|null, toNext?: number }} opts
 *   heure actuelle et plante (voir growth) : jours arrosés d'affilée, stade, prochain stade et jours restants
 */
export function greetingMessage(c, isToday, wk, { hour = 12, streak = 0, stage = STAGES[0], next = null, toNext = 0 } = {}) {
  const missing = c.items.filter((i) => !i.ok).map(natural);
  if (!isToday) {
    if (!c.items.length) return '';
    return c.perfect ? 'Journée réussie ce jour-là 💧' : `Ce jour-là, il manquait ${frenchList(missing)}.`;
  }
  const plant = stage.ta;
  const training = trainingSentence(wk, plant);
  const withTraining = (s) => (training ? `${s} ${training}` : s);
  if (!c.items.length) return training || 'Belle journée à toi ✨';
  if (c.perfect) {
    if (next && toNext > 0 && toNext <= 3) return withTraining(`${cap(plant)} devient ${next.une} dans ${daysLabel(toNext)} 🌱`);
    return withTraining(streak > 1 ? `${streak} jours d’affilée, ${plant} grandit 💧` : 'Journée réussie, ta graine est arrosée 💧');
  }
  const evening = hour >= 18;
  if (c.done === 0) {
    if (hour < 11 && c.items.some((i) => i.id === 'sleep' && !i.ok)) return withTraining('Bien dormi ? Commence par noter ta nuit.');
    return withTraining(evening ? `${cap(plant)} a soif 💧 Note ${frenchList(missing)} pour l’arroser.` : `Quand tu as une minute, note ${frenchList(missing)}.`);
  }
  if (missing.length === 1) return withTraining(`Plus que ${missing[0]} pour arroser ${plant}${evening ? ' 🌙' : '.'}`);
  return withTraining(`Encore ${frenchList(missing)} pour arroser ${plant}.`);
}
