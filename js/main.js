import { initStore, activeSession } from './core/store.js';
import { route, startRouter } from './core/router.js';
import { toast } from './core/ui.js';
import { unlockAudio } from './core/feedback.js';
import { h } from './core/dom.js';

import homeView from './views/home.js';
import metricView from './views/metric.js';
import trainView from './views/train.js';
import workoutView from './views/workout.js';
import summaryView from './views/summary.js';
import historyView from './views/history.js';
import logView from './views/log.js';
import exerciseView from './views/exercise.js';
import { programsView, programEditView } from './views/programs.js';
import settingsView from './views/settings.js';

route(/^\/$/, homeView);
route(/^\/day\/(\d{4}-\d{2}-\d{2})$/, homeView);
route(/^\/metric\/(sommeil|nutrition|pas)$/, metricView);
route(/^\/train$/, trainView);
route(/^\/workout$/, workoutView);
route(/^\/summary\/([\w-]+)$/, summaryView);
route(/^\/history$/, historyView);
route(/^\/log\/([\w-]+)$/, logView);
route(/^\/exercise\/([\w-]+)$/, exerciseView);
route(/^\/programs$/, programsView);
route(/^\/programs\/([\w-]+)$/, programEditView);
route(/^\/settings$/, settingsView);

// iOS : l'audio doit être débloqué par un geste utilisateur.
['touchend', 'click'].forEach((ev) => document.addEventListener(ev, unlockAudio, { passive: true }));

window.addEventListener('store-error', () => {
  toast("Erreur d'enregistrement. Vérifie l'espace disponible.", { duration: 5000 });
});

async function boot() {
  try {
    await initStore();
  } catch (err) {
    console.error(err);
    document.getElementById('app').replaceChildren(
      h('div', { class: 'empty' },
        h('p', null, 'Impossible d’ouvrir la base de données.'),
        h('p', { class: 'faint' }, String(err?.message || err))),
    );
    return;
  }
  startRouter();
  registerServiceWorker();
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  const local = ['localhost', '127.0.0.1'].includes(location.hostname) && !location.search.includes('sw=1');
  if (local) return; // pas de cache pendant le développement
  navigator.serviceWorker.register('./sw.js').then((reg) => {
    const promptUpdate = (worker) => {
      // Hors séance : mise à jour immédiate et silencieuse (les données sont dans IndexedDB, rien n'est perdu).
      if (!activeSession()) {
        worker.postMessage('skipWaiting');
        return;
      }
      toast('Nouvelle version disponible', {
        action: 'Mettre à jour',
        duration: 15000,
        onAction: () => worker.postMessage('skipWaiting'),
      });
    };
    if (reg.waiting && navigator.serviceWorker.controller) promptUpdate(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const worker = reg.installing;
      worker?.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) promptUpdate(worker);
      });
    });
    // Vérifie les mises à jour à chaque retour dans l'app.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') reg.update().catch(() => {});
    });
  }).catch((e) => console.warn('SW', e));

  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    location.reload();
  });
}

boot();
