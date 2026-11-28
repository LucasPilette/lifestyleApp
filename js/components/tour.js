// Tutoriel : visite guidée (élément mis en lumière + bulle d'explication) et aides affichées
// une seule fois à la première ouverture d'un écran.

import { h, icon } from '../core/dom.js';
import { state, updateMeta } from '../core/store.js';
import { sheet, trackOverlay } from '../core/ui.js';

/**
 * Visite guidée. Les étapes dont l'élément est absent sont ignorées.
 * @param {{ sel: string, title: string, text: string }[]} steps
 * @param {{ onDone?: Function }} opts appelé à la fin ou si la visite est passée
 */
export function startTour(steps, { onDone } = {}) {
  const list = steps.filter((s) => document.querySelector(s.sel));
  if (!list.length) return;
  let i = 0;
  let closed = false;
  const hole = h('div', { class: 'tour-hole' });
  const counter = h('span', { class: 'tour-count' });
  const title = h('h2');
  const text = h('p');
  const nextBtn = h('button', { class: 'btn primary small', onClick: () => go(i + 1) });
  const tip = h('div', { class: 'tour-tip', role: 'dialog', 'aria-live': 'polite' },
    h('div', { class: 'tour-tip-head' }, counter, h('button', { class: 'link-btn', onClick: () => finish() }, 'Passer')),
    title, text,
    h('div', { class: 'tour-tip-actions' }, h('button', { class: 'btn ghost small', onClick: () => go(i - 1) }, 'Retour'), nextBtn));
  // Le calque capte les touchers : on ne déclenche rien par erreur pendant la visite.
  const wrap = h('div', { class: 'tour' }, h('div', { class: 'tour-catch', onClick: () => go(i + 1) }), hole, tip);
  const untrack = trackOverlay(() => finish(false));

  function place() {
    const el = document.querySelector(list[i].sel);
    if (!el) return;
    const r = el.getBoundingClientRect();
    const pad = 6;
    Object.assign(hole.style, {
      top: `${r.top - pad}px`, left: `${r.left - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px`,
      borderRadius: getComputedStyle(el).borderRadius === '0px' ? '14px' : `calc(${getComputedStyle(el).borderRadius} + ${pad}px)`,
    });
    const below = r.top + r.height / 2 < innerHeight / 2;
    tip.classList.toggle('below', below);
    tip.style.top = below ? `${Math.min(innerHeight - 220, r.bottom + 16)}px` : '';
    tip.style.bottom = below ? '' : `${Math.min(innerHeight - 220, innerHeight - r.top + 16)}px`;
  }

  function go(n) {
    if (n < 0) return;
    if (n >= list.length) return finish();
    i = n;
    const s = list[i];
    counter.textContent = `${i + 1} / ${list.length}`;
    title.textContent = s.title;
    text.textContent = s.text;
    nextBtn.textContent = i === list.length - 1 ? 'C’est parti' : 'Suivant';
    tip.querySelector('.btn.ghost').style.visibility = i === 0 ? 'hidden' : 'visible';
    const el = document.querySelector(s.sel);
    const r = el.getBoundingClientRect();
    if (r.top < 70 || r.bottom > innerHeight - 110) el.scrollIntoView({ block: 'center' });
    requestAnimationFrame(place);
  }

  function finish(done = true) {
    if (closed) return;
    closed = true;
    untrack();
    wrap.classList.remove('open');
    setTimeout(() => wrap.remove(), 250);
    removeEventListener('resize', place);
    if (done) onDone?.();
  }

  addEventListener('resize', place);
  document.getElementById('overlays').append(wrap);
  go(0);
  requestAnimationFrame(() => wrap.classList.add('open'));
}

/** Aide affichée une seule fois, à la première ouverture d'un écran. */
export function helpOnce(key, { title, text, iconName = 'info' }) {
  if (state.meta.help?.[key] || !state.meta.onboarded) return;
  setTimeout(() => {
    sheet((close) => [
      h('div', { class: 'help-icon' }, icon(iconName, 26)),
      ...[].concat(text).map((t) => h('p', { class: 'sheet-text' }, t)),
      h('button', { class: 'btn primary block', onClick: () => close() }, 'Compris'),
    ], { title, cls: 'help-sheet', onClose: () => updateMeta({ help: { ...(state.meta.help || {}), [key]: true } }) });
  }, 450);
}
