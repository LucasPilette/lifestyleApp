// Dates locales au format "YYYY-MM-DD" (jamais toISOString : décalage UTC).

const pad = (n) => String(n).padStart(2, '0');

export function dateKey(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export const todayKey = () => dateKey(new Date());

export function addDays(key, n) {
  const d = parseKey(key);
  d.setDate(d.getDate() + n);
  return dateKey(d);
}

/** Nombre de jours entre a et b (a - b). */
export function diffDays(a, b) {
  return Math.round((parseKey(a) - parseKey(b)) / 86400000);
}

/** Lundi de la semaine contenant `key`. */
export function weekStart(key) {
  const d = parseKey(key);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return dateKey(d);
}

export function monthStart(key) {
  return key.slice(0, 7) + '-01';
}

export function addMonths(key, n) {
  const d = parseKey(monthStart(key));
  d.setMonth(d.getMonth() + n);
  return dateKey(d);
}

export function monthEnd(key) {
  return addDays(addMonths(key, 1), -1);
}

/** Liste des clés de `start` à `end` inclus. */
export function keysBetween(start, end) {
  const out = [];
  for (let k = start; k <= end; k = addDays(k, 1)) out.push(k);
  return out;
}

const fmt = (opts) => new Intl.DateTimeFormat('fr-FR', opts);
const F_LONG = fmt({ weekday: 'long', day: 'numeric', month: 'long' });
const F_LONG_Y = fmt({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const F_SHORT = fmt({ day: 'numeric', month: 'short' });
const F_COMPACT = fmt({ weekday: 'short', day: 'numeric', month: 'short' });
const F_SHORT_Y = fmt({ day: 'numeric', month: 'short', year: 'numeric' });
const F_MONTH = fmt({ month: 'short' });
const F_MONTH_LONG = fmt({ month: 'long', year: 'numeric' });
const F_WEEKDAY = fmt({ weekday: 'short' });
const F_TIME = fmt({ hour: '2-digit', minute: '2-digit' });

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export function formatLong(key) {
  const sameYear = key.slice(0, 4) === todayKey().slice(0, 4);
  return cap((sameYear ? F_LONG : F_LONG_Y).format(parseKey(key)));
}

/** « Jeu. 26 nov. » (barre du haut de l'accueil). */
export const formatCompact = (key) => cap(F_COMPACT.format(parseKey(key)));

export function formatShort(key) {
  const sameYear = key.slice(0, 4) === todayKey().slice(0, 4);
  return (sameYear ? F_SHORT : F_SHORT_Y).format(parseKey(key));
}

export const formatMonth = (key) => F_MONTH.format(parseKey(key)).replace('.', '');
export const formatMonthLong = (key) => cap(F_MONTH_LONG.format(parseKey(key)));
export const formatWeekday = (key) => F_WEEKDAY.format(parseKey(key)).replace('.', '');
export const formatTime = (ts) => F_TIME.format(new Date(ts));
export const dayMonth = (key) => `${parseKey(key).getDate()}/${pad(parseKey(key).getMonth() + 1)}`;

/** "Aujourd'hui", "Hier", "Avant-hier" ou la date longue. */
export function relativeDay(key, today = todayKey()) {
  const d = diffDays(today, key);
  if (d === 0) return "Aujourd'hui";
  if (d === 1) return 'Hier';
  if (d === 2) return 'Avant-hier';
  return formatLong(key);
}

/** "aujourd'hui", "hier", "il y a 3 j", "il y a 2 sem.", "le 3 mars". */
export function agoLabel(key, today = todayKey()) {
  const d = diffDays(today, key);
  if (d <= 0) return "aujourd'hui";
  if (d === 1) return 'hier';
  if (d < 14) return `il y a ${d} j`;
  if (d < 60) return `il y a ${Math.round(d / 7)} sem.`;
  return `le ${formatShort(key)}`;
}
