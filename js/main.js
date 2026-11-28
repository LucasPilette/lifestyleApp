import { initStore, activeSession, needsOnboarding, subscribe, state } from './core/store.js';
import { route, startRouter, currentPath } from './core/router.js';
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
import goalsView from './views/goals.js';
import welcomeView from './views/welcome.js';
import profileView from './views/profile.js';
import { friendsView, chatView } from './views/friends.js';
import widgetEditView from './views/widget-edit.js';
import coachView from './views/coach.js';
import { applyTheme } from './core/theme.js';
import { schedulePushStatus } from './core/social.js';
import { subscribePush } from './core/push.js';

route(/^\/$/, homeView);
route(/^\/day\/(\d{4}-\d{2}-\d{2})$/, homeView);
route(/^\/metric\/(sommeil|nutrition|pas|poids|humeur)$/, metricView);
route(/^\/train$/, trainView);
route(/^\/workout$/, workoutView);
route(/^\/summary\/([\w-]+)$/, summaryView);
route(/^\/history$/, historyView);
route(/^\/log\/([\w-]+)$/, logView);
route(/^\/exercise\/([\w-]+)$/, exerciseView);
route(/^\/programs$/, programsView);
route(/^\/programs\/([\w-]+)$/, programEditView);
route(/^\/settings$/, settingsView);
route(/^\/goals$/, goalsView);
route(/^\/welcome$/, welcomeView);
route(/^\/profile$/, profileView);
route(/^\/friends$/, friendsView);
route(/^\/friends\/([0-9a-f-]{36})$/, chatView);
route(/^\/widgets\/(new|cw_\w+)$/, widgetEditView);
route(/^\/coach$/, coachView);

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
  applyTheme(state.settings);
  // Première ouverture (ou installation existante pas encore passée par l'accueil) : onboarding.
  if (needsOnboarding() && currentPath() !== '/welcome') history.replaceState(null, '', '#/welcome');
  startRouter();
  registerServiceWorker();
  // Statut partagé avec les amis (humeur du jour, dernière séance), si activé.
  subscribe((type) => (type === 'days' || type === 'sessions' || type === 'settings') && schedulePushStatus());
  schedulePushStatus();
  // Notifications : l'abonnement de l'appareil peut changer, on le renvoie au serveur à chaque ouverture.
  if (state.settings.notifications?.enabled) subscribePush().catch((e) => console.warn('Push', e.message));
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

  // Notification touchée alors que l'app était ouverte : aller sur l'écran visé.
  navigator.serviceWorker.addEventListener('message', (e) => {
    if (e.data?.type === 'open' && e.data.url) location.hash = new URL(e.data.url).hash || '#/';
  });

  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    location.reload();
  });
}

boot();
