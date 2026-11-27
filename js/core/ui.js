// Composants d'interface transverses : feuilles (bottom sheets), toasts, confirmations.

import { h, icon } from './dom.js';

const overlays = () => document.getElementById('overlays');
const openSheets = [];

/**
 * Ouvre une feuille en bas d'écran.
 * @param {(close: Function) => Node|Node[]} build contenu
 * @returns {Function} close
 */
export function sheet(build, { title, onClose, cls = '' } = {}) {
  let closed = false;
  const backdrop = h('div', { class: 'sheet-backdrop', onClick: () => close() });
  const panel = h('div', { class: `sheet ${cls}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': title || '' });
  const wrap = h('div', { class: 'sheet-wrap' }, backdrop, panel);

  function close(result) {
    if (closed) return;
    closed = true;
    wrap.classList.remove('open');
    openSheets.splice(openSheets.indexOf(close), 1);
    setTimeout(() => wrap.remove(), 260);
    onClose?.(result);
  }

  const header = title
    ? h('div', { class: 'sheet-head' },
        h('h2', null, title),
        h('button', { class: 'icon-btn', 'aria-label': 'Fermer', onClick: () => close() }, icon('x')))
    : h('div', { class: 'sheet-grip' });
  panel.append(header, h('div', { class: 'sheet-body' }, build(close)));
  overlays().append(wrap);
  openSheets.push(close);
  requestAnimationFrame(() => requestAnimationFrame(() => wrap.classList.add('open')));
  return close;
}

export function closeAllSheets() {
  [...openSheets].forEach((c) => c());
}

/** Liste d'actions (menu contextuel). */
export function actionSheet(title, actions) {
  return new Promise((resolve) => {
    sheet(
      (close) =>
        h('div', { class: 'action-list' },
          actions.filter(Boolean).map((a) =>
            h('button', {
              class: `action-item ${a.danger ? 'danger' : ''}`,
              onClick: () => {
                close();
                resolve(a.id);
                a.onClick?.();
              },
            }, a.icon ? icon(a.icon, 20) : null, h('span', null, a.label)),
          )),
      { title, onClose: () => resolve(null) },
    );
  });
}

/** Confirmation (résout true/false). */
export function confirmSheet({ title, message, confirmLabel = 'Confirmer', cancelLabel = 'Annuler', danger = false }) {
  return new Promise((resolve) => {
    let answered = false;
    sheet(
      (close) => [
        message ? h('p', { class: 'sheet-text' }, message) : null,
        h('div', { class: 'sheet-actions' },
          h('button', { class: 'btn ghost', onClick: () => close() }, cancelLabel),
          h('button', {
            class: `btn ${danger ? 'danger' : 'primary'}`,
            onClick: () => {
              answered = true;
              close();
              resolve(true);
            },
          }, confirmLabel)),
      ],
      { title, onClose: () => !answered && resolve(false) },
    );
  });
}

/** Saisie texte simple. */
export function promptSheet({ title, value = '', placeholder = '', multiline = false, confirmLabel = 'Valider' }) {
  return new Promise((resolve) => {
    let done = false;
    const input = multiline
      ? h('textarea', { class: 'text-input', rows: 4, placeholder }, value)
      : h('input', { class: 'text-input', type: 'text', value, placeholder, enterkeyhint: 'done' });
    sheet(
      (close) => {
        const submit = () => {
          done = true;
          close();
          resolve(input.value.trim());
        };
        if (!multiline) input.addEventListener('keydown', (e) => e.key === 'Enter' && submit());
        setTimeout(() => input.focus(), 280);
        return [input, h('div', { class: 'sheet-actions' }, h('button', { class: 'btn ghost', onClick: () => close() }, 'Annuler'), h('button', { class: 'btn primary', onClick: submit }, confirmLabel))];
      },
      { title, onClose: () => !done && resolve(null) },
    );
  });
}

let toastTimer;
export function toast(message, { action, onAction, duration = 2600 } = {}) {
  const root = overlays();
  root.querySelector('.toast')?.remove();
  const el = h('div', { class: 'toast', role: 'status' },
    h('span', null, message),
    action ? h('button', { class: 'toast-action', onClick: () => { el.remove(); onAction?.(); } }, action) : null);
  root.append(el);
  requestAnimationFrame(() => el.classList.add('show'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 300);
  }, duration);
}

/** En-tête de page standard avec bouton retour. */
export function pageHeader({ title, subtitle, onBack, actions = [] }) {
  return h('header', { class: 'topbar' },
    onBack ? h('button', { class: 'icon-btn back', 'aria-label': 'Retour', onClick: onBack }, icon('back')) : h('div', { class: 'topbar-spacer' }),
    h('div', { class: 'topbar-title' }, h('h1', null, title), subtitle ? h('div', { class: 'topbar-sub' }, subtitle) : null),
    h('div', { class: 'topbar-actions' }, actions));
}

/** Contrôle segmenté. */
export function segmented(options, value, onChange) {
  const el = h('div', { class: 'segmented', role: 'tablist' });
  const render = (val) => {
    el.replaceChildren(
      ...options.map(([v, label]) =>
        h('button', {
          class: `seg ${v === val ? 'active' : ''}`,
          role: 'tab',
          'aria-selected': String(v === val),
          onClick: () => {
            if (v === val) return;
            render(v);
            onChange(v);
          },
        }, label)),
    );
  };
  render(value);
  return el;
}

/** Interrupteur. */
export function toggle(checked, onChange, label) {
  return h('label', { class: 'toggle' },
    h('input', { type: 'checkbox', checked, 'aria-label': label, onChange: (e) => onChange(e.target.checked) }),
    h('span', { class: 'toggle-track' }));
}

/** Stepper −/+ avec affichage formaté. */
export function stepper({ value, step = 1, min = 0, max = Infinity, format = String, onChange }) {
  let v = value;
  const out = h('span', { class: 'stepper-value' }, format(v));
  const set = (nv) => {
    v = Math.min(max, Math.max(min, nv));
    out.textContent = format(v);
    onChange(v);
  };
  return h('div', { class: 'stepper' },
    h('button', { class: 'stepper-btn', type: 'button', 'aria-label': 'Moins', onClick: () => set(v - step) }, icon('minus', 18)),
    out,
    h('button', { class: 'stepper-btn', type: 'button', 'aria-label': 'Plus', onClick: () => set(v + step) }, icon('plus', 18)));
}
