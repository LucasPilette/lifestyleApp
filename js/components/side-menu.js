// Menu latéral (ouvert depuis le bouton en haut à gauche de l'accueil).

import { h, icon } from '../core/dom.js';
import { state } from '../core/store.js';
import { navigate } from '../core/router.js';
import { drawer } from '../core/ui.js';
import { formatFriendCode } from '../core/prefs.js';
import { inboxCount } from '../core/social.js';
import { avatarEl } from './avatar.js';
import { logoMark } from './plant.js';
import { VERSION } from '../version.js';

const ITEMS = [
  { path: '/profile', icon: 'user', label: 'Profil', sub: 'Code ami, thème, accueil, arrosage', c: 'var(--accent)' },
  { path: '/friends', icon: 'users', label: 'Amis', sub: 'Ajouter, discuter', c: 'var(--c-mood)', badge: true },
  { path: '/history', icon: 'history', label: 'Historique', sub: 'Séances passées et progression', c: 'var(--c-prot)' },
  { path: '/goals', icon: 'trophy', label: 'Objectifs', sub: 'Poids, sommeil, charges…', c: 'var(--c-weight)' },
  { path: '/settings', icon: 'sliders', label: 'Paramètres', sub: 'Séance, objectifs du jour, sauvegarde', c: 'var(--c-sleep)' },
];

export function openSideMenu() {
  const badge = h('span', { class: 'badge hidden' });
  // Demandes reçues + messages non lus (sans bloquer l'ouverture du menu)
  inboxCount().then((n) => {
    if (!n) return;
    badge.textContent = n > 99 ? '99+' : String(n);
    badge.classList.remove('hidden');
  }).catch(() => {});
  const name = state.settings.name || 'Mon profil';
  drawer((close) => [
    h('div', { class: 'drawer-head' },
      h('button', { class: 'drawer-profile', onClick: () => { close(); navigate('/profile'); } },
        avatarEl({ name, url: state.settings.avatar, size: 'big' }),
        h('span', { class: 'drawer-id' },
          h('span', { class: 'drawer-app' }, name),
          h('span', { class: 'drawer-user' }, state.settings.friendCode ? `Code ami · ${formatFriendCode(state.settings.friendCode)}` : 'Grow'))),
      h('button', { class: 'icon-btn', 'aria-label': 'Fermer le menu', onClick: () => close() }, icon('x'))),
    h('div', { class: 'drawer-list' },
      ITEMS.map((it) =>
        h('button', { class: 'drawer-item', style: { '--c': it.c }, onClick: () => { close(); navigate(it.path); } },
          h('span', { class: 'card-icon' }, icon(it.icon, 18)),
          h('span', { class: 'drawer-txt' }, h('b', null, it.label), h('span', null, it.sub)),
          it.badge ? badge : null,
          icon('chevron', 18, 'chev')))),
    h('div', { class: 'drawer-foot' }, logoMark(18), `Grow · ${VERSION}`),
  ], { label: 'Menu principal' });
}
