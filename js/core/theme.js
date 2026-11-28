// Application du thème (data-theme / data-mode sur <html>).
// Le choix est aussi mémorisé dans localStorage : le petit script de index.html l'applique
// avant le premier affichage (pas de flash de l'ancien thème au démarrage).

import { THEMES } from './prefs.js';

const KEY = 'eclipse-theme';
const lightQuery = matchMedia('(prefers-color-scheme: light)');
let current = { theme: 'fall', mode: 'dark' };

export function resolvedMode(mode) {
  return mode === 'auto' ? (lightQuery.matches ? 'light' : 'dark') : mode === 'light' ? 'light' : 'dark';
}

export function applyTheme({ theme, mode } = current) {
  current = { theme: THEMES[theme] ? theme : 'fall', mode: mode || 'dark' };
  const root = document.documentElement;
  const m = resolvedMode(current.mode);
  root.dataset.theme = current.theme;
  root.dataset.mode = m;
  root.style.colorScheme = m;
  const t = THEMES[current.theme];
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', m === 'light' ? t.light : t.dark);
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* stockage indisponible */
  }
}

// Mode « Auto » : suit le réglage clair/sombre de l'iPhone.
lightQuery.addEventListener?.('change', () => {
  if (current.mode === 'auto') applyTheme(current);
});
