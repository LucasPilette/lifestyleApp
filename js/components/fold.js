// Sous-menus dépliables (Profil, Paramètres) : une ligne avec icône, titre et résumé ; toucher déplie le contenu.
// Un seul ouvert à la fois par écran ; celui qui était ouvert le reste au retour sur l'écran.

import { h, icon } from '../core/dom.js';

/**
 * @param {string} page clé de l'écran (mémorise la section ouverte pendant la session)
 * @returns {(o: { id: string, icon: string, title: string, sub?: string, color?: string, body: () => Node|Node[] }) => HTMLElement & { setSub(t: string): void }}
 */
export function foldGroup(page) {
  const key = `fold:${page}`;
  const folds = [];
  let openId = sessionStorage.getItem(key);

  const setOpen = (id) => {
    openId = id;
    if (id) sessionStorage.setItem(key, id);
    else sessionStorage.removeItem(key);
    folds.forEach((f) => f.sync());
  };

  return ({ id, icon: iconName, title, sub = '', color = 'var(--accent)', body }) => {
    const subEl = h('span', { class: 'fold-sub' }, sub);
    const head = h('button', { class: 'fold-head', 'aria-expanded': 'false', onClick: () => setOpen(openId === id ? null : id) },
      h('span', { class: 'card-icon' }, icon(iconName, 18)),
      h('span', { class: 'fold-txt' }, h('b', null, title), subEl),
      icon('down', 18, 'fold-caret'));
    const inner = h('div', { class: 'fold-inner' });
    const panel = h('div', { class: 'fold-body', role: 'region', 'aria-label': title }, inner);
    const el = h('section', { class: 'fold', style: { '--c': color } }, head, panel);
    let built = false;
    el.sync = () => {
      const open = openId === id;
      if (open && !built) {
        inner.append(...[].concat(body()).filter(Boolean));
        built = true;
      }
      el.classList.toggle('open', open);
      head.setAttribute('aria-expanded', String(open));
      panel.inert = !open;
      // Une fois déplié, rien n'est rogné (ombres, glisser-déposer des widgets)
      clearTimeout(el.shownTimer);
      if (open) el.shownTimer = setTimeout(() => inner.classList.add('shown'), 300);
      else inner.classList.remove('shown');
      if (open) setTimeout(() => el.getBoundingClientRect().bottom > window.innerHeight && head.scrollIntoView({ behavior: 'smooth', block: 'start' }), 260);
    };
    el.setSub = (t) => { subEl.textContent = t || ''; };
    folds.push(el);
    el.sync();
    return el;
  };
}
