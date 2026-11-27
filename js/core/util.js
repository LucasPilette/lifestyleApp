export function uid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

export const clone = (o) => (globalThis.structuredClone ? structuredClone(o) : JSON.parse(JSON.stringify(o)));

/**
 * Debounce. Note : `d.flush(...args)` exécute immédiatement avec ces arguments ;
 * `d.pending()` exécute l'appel en attente s'il y en a un.
 */
export function debounce(fn, ms) {
  let t;
  let pendingArgs = null;
  const d = (...args) => {
    clearTimeout(t);
    pendingArgs = args;
    t = setTimeout(() => {
      pendingArgs = null;
      fn(...args);
    }, ms);
  };
  d.flush = (...args) => {
    clearTimeout(t);
    pendingArgs = null;
    fn(...args);
  };
  d.pending = () => {
    if (!pendingArgs) return;
    clearTimeout(t);
    const args = pendingArgs;
    pendingArgs = null;
    fn(...args);
  };
  return d;
}

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function slugify(s) {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

export function mergeDeep(base, over) {
  const out = clone(base);
  for (const [k, v] of Object.entries(over || {})) {
    if (v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object') {
      out[k] = mergeDeep(out[k], v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

export const normalize = (s) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
