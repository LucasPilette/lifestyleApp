// Routeur par hash (compatible GitHub Pages, aucun 404 possible).

import { closeAllSheets } from './ui.js';

const routes = [];
let cleanup = null;
const stack = [];
const scrollMemory = new Map();
const RESTORE = new Set(['/workout', '/history', '/train']);

export function route(pattern, view) {
  routes.push({ pattern, view });
}

export const currentPath = () => location.hash.slice(1) || '/';

let replacing = false;

export function navigate(path, { replace = false } = {}) {
  if (currentPath() === path) {
    render();
    return;
  }
  if (replace) {
    replacing = true;
    location.replace(`#${path}`);
  } else {
    location.hash = path;
  }
}

/** Retour arrière : historique de l'app si disponible, sinon `fallback`. */
export function back(fallback = '/') {
  if (stack.length > 1) history.back();
  else navigate(fallback, { replace: true });
}

function render() {
  const path = currentPath();
  // Suivi de la pile pour savoir si "retour" doit utiliser history.back()
  if (replacing) {
    replacing = false;
    stack[Math.max(0, stack.length - 1)] = path;
  } else if (stack.length > 1 && stack[stack.length - 2] === path) stack.pop();
  else if (stack[stack.length - 1] !== path) stack.push(path);

  closeAllSheets();
  if (cleanup) {
    try {
      cleanup();
    } catch (e) {
      console.error(e);
    }
    cleanup = null;
  }

  const root = document.getElementById('app');
  for (const { pattern, view } of routes) {
    const m = path.match(pattern);
    if (!m) continue;
    root.replaceChildren();
    const result = view(root, ...m.slice(1).map(decodeURIComponent));
    cleanup = typeof result === 'function' ? result : null;
    const y = RESTORE.has(path) ? scrollMemory.get(path) || 0 : 0;
    window.scrollTo(0, y);
    requestAnimationFrame(() => window.scrollTo(0, y));
    return;
  }
  navigate('/', { replace: true });
}

let lastPath = null;
window.addEventListener('scroll', () => {
  lastPath = currentPath();
  scrollMemory.set(lastPath, window.scrollY);
  document.querySelector('.topbar')?.classList.toggle('scrolled', window.scrollY > 4);
}, { passive: true });

export function startRouter() {
  window.addEventListener('hashchange', render);
  render();
}

/** Re-rend la vue courante (après import de données, par ex.). */
export const refresh = render;
