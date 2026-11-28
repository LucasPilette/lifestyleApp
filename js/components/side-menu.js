// Menu latéral (ouvert depuis le bouton en haut à gauche de l'accueil).
// Prévu pour accueillir d'autres entrées (profil, onboarding…) plus tard.

import { h, icon } from '../core/dom.js';
import { state } from '../core/store.js';
import { navigate } from '../core/router.js';
import { drawer } from '../core/ui.js';
import { VERSION } from '../version.js';

const ITEMS = [
  { path: '/history', icon: 'history', label: 'Historique', sub: 'Séances passées et progression', c: 'var(--c-prot)' },
  { path: '/goals', icon: 'trophy', label: 'Objectifs', sub: 'Poids, sommeil, charges…', c: 'var(--c-weight)' },
  { path: '/settings', icon: 'sliders', label: 'Paramètres', sub: 'Objectifs du jour, séance, sauvegarde', c: 'var(--c-sleep)' },
];

export function openSideMenu() {
  drawer((close) => [
    h('div', { class: 'drawer-head' },
      h('div', { class: 'drawer-logo', 'aria-hidden': 'true' }),
      h('div', null,
        h('div', { class: 'drawer-app' }, 'Eclipse'),
        state.settings.name ? h('div', { class: 'drawer-user' }, state.settings.name) : null),
      h('button', { class: 'icon-btn', 'aria-label': 'Fermer le menu', onClick: () => close() }, icon('x'))),
    h('div', { class: 'drawer-list' },
      ITEMS.map((it) =>
        h('button', { class: 'drawer-item', style: { '--c': it.c }, onClick: () => { close(); navigate(it.path); } },
          h('span', { class: 'card-icon' }, icon(it.icon, 18)),
          h('span', { class: 'drawer-txt' }, h('b', null, it.label), h('span', null, it.sub)),
          icon('chevron', 18, 'chev')))),
    h('div', { class: 'drawer-foot' }, `Version ${VERSION}`),
  ], { label: 'Menu principal' });
}
