// Formatage des nombres, durées et charges (locale française).

const NF = new Map();
function nf(dec) {
  if (!NF.has(dec)) {
    NF.set(dec, new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: dec }));
  }
  return NF.get(dec);
}

/** 12500 -> "12 500" ; 2.5 -> "2,5" */
export function fmtNum(n, dec = 0) {
  if (n == null || Number.isNaN(n)) return '–';
  return nf(dec).format(n).replace(/ | /g, ' ');
}

/** Charge en kg : 102.5 -> "102,5" ; 80 -> "80" */
export const fmtKg = (w) => fmtNum(w, 2);

/** Minutes -> "7 h 30" (ou "45 min"). */
export function fmtSleep(min) {
  if (min == null || Number.isNaN(min)) return '–';
  const m = Math.round(min);
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r} min`;
  return `${h} h ${String(r).padStart(2, '0')}`;
}

/** Secondes -> "1:05" ou "1:02:03". */
export function fmtClock(totalSec) {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

/** Durée en ms -> "1 h 12" ou "48 min". */
export function fmtDuration(ms) {
  const min = Math.round(ms / 60000);
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`;
}

/** Repos en secondes -> "2:30" / "90 s". */
export function fmtRest(sec) {
  if (!sec) return 'aucun';
  if (sec < 60) return `${sec} s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s ? `${m}:${String(s).padStart(2, '0')}` : `${m} min`;
}

/** Volume en kg -> "4 250 kg" ou "12,4 t". */
export function fmtVolume(kg) {
  if (kg >= 10000) return `${fmtNum(kg / 1000, 1)} t`;
  return `${fmtNum(Math.round(kg))} kg`;
}

/** Fourchette de reps : (8, 12) -> "8-12" ; (8, 8) -> "8". */
export const fmtRange = (min, max) => (min === max || !max ? `${min}` : `${min}-${max}`);

/** Parse un nombre saisi ("102,5", " 8 500 ") ; null si vide/invalide. */
export function parseNum(str) {
  if (str == null) return null;
  const s = String(str).replace(/[\s   ]/g, '').replace(',', '.');
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Variation signée avec flèche : "▲ 12 min" / "▼ 3 %". */
export function fmtDelta(delta, formatter) {
  if (delta == null || Number.isNaN(delta)) return '';
  const txt = formatter(Math.abs(delta));
  // Variation qui s'arrondit à zéro (« 0 », « 0 min », « 0,0 ») : stable
  if (Math.abs(delta) < 1e-9 || /^0(,0+)?(\s|$)/.test(txt)) return '= stable';
  return `${delta > 0 ? '▲' : '▼'} ${txt}`;
}
