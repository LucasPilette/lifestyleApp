// Mini-helpers DOM : h() pour créer des éléments, icon() pour les icônes SVG.

const SVG_NS = 'http://www.w3.org/2000/svg';

function applyProps(el, props, isSvg) {
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') isSvg ? el.setAttribute('class', v) : (el.className = v);
    else if (k === 'style' && typeof v === 'object') {
      for (const [prop, val] of Object.entries(v)) {
        if (val == null) continue;
        if (prop.startsWith('--')) el.style.setProperty(prop, val);
        else el.style[prop] = val;
      }
    }
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'ref') v(el);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (!isSvg && (k === 'value' || k === 'checked' || k === 'disabled' || k === 'selected')) el[k] = v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
}

function appendChildren(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false || c === true) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

/** h('div', { class: 'x', onClick }, enfant1, [enfant2, …]) */
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  applyProps(el, props, false);
  appendChildren(el, children);
  return el;
}

/** Équivalent SVG de h(). */
export function s(tag, props, ...children) {
  const el = document.createElementNS(SVG_NS, tag);
  applyProps(el, props, true);
  appendChildren(el, children);
  return el;
}

// Icônes au trait (24×24, stroke = currentColor)
const ICONS = {
  back: 'M15 18l-6-6 6-6',
  chevron: 'M9 18l6-6-6-6',
  down: 'M6 9l6 6 6-6',
  up: 'M18 15l-6-6-6 6',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  check: 'M20 6L9 17l-5-5',
  x: 'M18 6L6 18M6 6l12 12',
  sliders: 'M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6',
  history: 'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2',
  moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z',
  flame: 'M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1.1-2.1-.2-4.1 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3a2.5 2.5 0 0 0 2.5 2.5z',
  zap: 'M13 2L3 14h9l-1 8 10-12h-9l1-8z',
  steps: 'M4 16v-2.4C4 11.5 3 10.5 3 8c0-2.7 1.5-6 4.5-6C9.4 2 10 3.8 10 5.5c0 3.1-2 5.7-2 8.7V16a2 2 0 1 1-4 0zM20 20v-2.4c0-2.1 1-3.1 1-5.6 0-2.7-1.5-6-4.5-6-1.9 0-2.5 1.8-2.5 3.5 0 3.1 2 5.7 2 8.7V20a2 2 0 1 0 4 0zM16 17h4M4 13h4',
  dumbbell: 'M6.5 6.5v11M17.5 6.5v11M3 9.5v5M21 9.5v5M6.5 12h11',
  timer: 'M10 2h4M12 14l3-3M12 22a8 8 0 1 0 0-16 8 8 0 0 0 0 16z',
  trophy: 'M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18M4 22h16M10 14.7V17c0 .6-.5 1-1 1.2C7.9 18.8 7 20.2 7 22M14 14.7V17c0 .6.5 1 1 1.2 1.1.6 2 2 2 3.8M18 2H6v7a6 6 0 0 0 12 0V2z',
  edit: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z',
  trash: 'M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6',
  more: 'M12 12h.01M19 12h.01M5 12h.01',
  link: 'M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7',
  unlink: 'M18.8 13.4l1.7-1.7a5 5 0 0 0-7-7l-1.7 1.7M5.2 10.6l-1.7 1.7a5 5 0 0 0 7 7l1.7-1.7M8 2v3M2 8h3M16 22v-3M22 16h-3',
  swap: 'M7 16V4M3 8l4-4 4 4M17 8v12M21 16l-4 4-4-4',
  chart: 'M3 3v18h18M7 15l4-4 3 3 5-6',
  download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
  upload: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12',
  share: 'M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13',
  note: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  flag: 'M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7',
  skip: 'M5 4l10 8-10 8V4zM19 5v14',
  play: 'M7 4l13 8-13 8V4z',
  calendar: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
  info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-4M12 8h.01',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3',
  volume: 'M11 5L6 9H2v6h4l5 4V5zM15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  scale: 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM7.5 10a4.5 4.5 0 0 1 9 0zM12 10l1.5-2.5',
  crown: 'M3 7.5l4.5 4L12 4.5l4.5 7 4.5-4L19 18H5L3 7.5zM5 21h14',
  menu: 'M4 7h16M4 12h16M4 17h10',
  smile:'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01',
};

export function icon(name, size = 22, extraClass = '') {
  const filled = name === 'play' || name === 'crown';
  return s(
    'svg',
    {
      class: `icon ${extraClass}`,
      width: size,
      height: size,
      viewBox: '0 0 24 24',
      fill: filled ? 'currentColor' : 'none',
      stroke: 'currentColor',
      'stroke-width': name === 'more' ? 3.2 : 2,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      'aria-hidden': 'true',
    },
    s('path', { d: ICONS[name] || ICONS.info }),
  );
}

/** Bouton icône accessible. */
export function iconButton(name, label, onClick, cls = '') {
  return h('button', { class: `icon-btn ${cls}`, type: 'button', 'aria-label': label, title: label, onClick }, icon(name));
}

/**
 * iOS « Secouer pour annuler » : chaque frappe native s'empile dans l'historique d'annulation, et le moindre
 * mouvement du téléphone (pendant une série…) affiche « Annuler la saisie ? ». On applique donc nous-mêmes
 * les frappes simples (chiffres, virgule, effacement) : une valeur posée par script n'entre pas dans cet
 * historique. Les cas inhabituels (coller, dictée…) gardent le comportement natif.
 */
function noUndoTyping(e) {
  const el = e.target;
  const t = e.inputType;
  if (t === 'historyUndo' || t === 'historyRedo') {
    e.preventDefault();
    return;
  }
  if (!e.cancelable || !['insertText', 'deleteContentBackward', 'deleteContentForward'].includes(t)) return;
  if (t === 'insertText' && e.data == null) return;
  const v = el.value;
  let a = el.selectionStart ?? v.length;
  let b = el.selectionEnd ?? v.length;
  if (a === b) {
    if (t === 'deleteContentBackward') a = Math.max(0, a - 1);
    else if (t === 'deleteContentForward') b = Math.min(v.length, b + 1);
  }
  const ins = t === 'insertText' ? e.data : '';
  const next = v.slice(0, a) + ins + v.slice(b);
  e.preventDefault();
  if (el.maxLength > 0 && next.length > el.maxLength && ins) return;
  if (next === v) return;
  el.value = next;
  const pos = a + ins.length;
  el.setSelectionRange(pos, pos);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

/** Champ numérique optimisé iOS (clavier numérique, pas de zoom, pas de « Annuler la saisie ? »). */
export function numInput({ value, placeholder = '', decimal = false, cls = '', label, onInput, onChange, maxLength }) {
  return h('input', {
    onBeforeinput: noUndoTyping,
    class: `num-input ${cls}`,
    type: 'text',
    inputmode: decimal ? 'decimal' : 'numeric',
    pattern: decimal ? null : '[0-9]*',
    autocomplete: 'off',
    enterkeyhint: 'done',
    'aria-label': label,
    maxlength: maxLength,
    value: value ?? '',
    placeholder,
    onFocus: (e) => requestAnimationFrame(() => e.target.select()),
    onInput,
    onChange,
    onKeydown: (e) => {
      if (e.key === 'Enter') e.target.blur();
    },
  });
}
