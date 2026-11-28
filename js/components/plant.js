// La plante de Grow : illustrations des stades (graine → arbre-monde), logo, fiche « Ta plante »
// et célébration quand elle change de stade. Les couleurs suivent le thème (--accent, --accent-2).

import { h, icon } from '../core/dom.js';
import { sheet } from '../core/ui.js';
import { STAGES, FERTILIZER_MAX, FERTILIZER_EVERY, daysLabel } from '../core/growth.js';

let uidN = 0;

/** Élément SVG depuis un balisage statique (aucune donnée utilisateur dedans). */
function svgEl(markup, cls) {
  const t = document.createElement('template');
  t.innerHTML = markup.trim();
  const el = t.content.firstElementChild;
  if (cls) el.setAttribute('class', cls);
  return el;
}

// --- Illustrations ------------------------------------------------------------------------
// viewBox 200 × 200. Sol : une planète dont on voit l'horizon. Feuillage : dégradé du thème.

const defs = (id) => `
  <defs>
    <linearGradient id="lf${id}" x1="0" y1="0" x2="0.4" y2="1">
      <stop offset="0" style="stop-color: var(--accent-2)"/><stop offset="1" style="stop-color: var(--accent)"/>
    </linearGradient>
    <linearGradient id="tk${id}" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#a7765f"/><stop offset="1" stop-color="#6b4434"/>
    </linearGradient>
    <linearGradient id="sd${id}" x1="0.2" y1="0" x2="0.8" y2="1">
      <stop offset="0" stop-color="#ffd58c"/><stop offset="0.55" stop-color="#f0904f"/><stop offset="1" stop-color="#c9563d"/>
    </linearGradient>
    <linearGradient id="gd${id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" style="stop-color: rgb(var(--hi)); stop-opacity: 0.09"/><stop offset="0.13" style="stop-color: rgb(var(--hi)); stop-opacity: 0"/>
    </linearGradient>
    <radialGradient id="gl${id}" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" style="stop-color: var(--accent); stop-opacity: 0.35"/><stop offset="1" style="stop-color: var(--accent); stop-opacity: 0"/>
    </radialGradient>
  </defs>`;

const ground = (id, top = 160) => `
  <circle cx="100" cy="${top + 170}" r="170" fill="url(#gd${id})" style="stroke: rgb(var(--hi) / 0.16)" stroke-width="1.5"/>`;

const glow = (id, cy, r) => `<circle cx="100" cy="${cy}" r="${r}" fill="url(#gl${id})"/>`;

const sparkle = (x, y, s = 4, o = 0.8) =>
  `<path d="M${x} ${y - s}L${x + s * 0.28} ${y - s * 0.28}L${x + s} ${y}L${x + s * 0.28} ${y + s * 0.28}L${x} ${y + s}L${x - s * 0.28} ${y + s * 0.28}L${x - s} ${y}L${x - s * 0.28} ${y - s * 0.28}Z" style="fill: color-mix(in srgb, var(--accent-2) 35%, #ffe7b3)" opacity="${o}"/>`;

/** Feuillage : grappe de cercles dans le dégradé du thème, une ombre dessous pour le volume, quelques reflets. */
const canopy = (id, blobs, lights = []) => `<g class="plant-sway">
  ${blobs.map(([x, y, r]) => `<circle cx="${x}" cy="${y + 6}" r="${r}" style="fill: color-mix(in srgb, var(--accent) 62%, #000)"/>`).join('')}
  ${blobs.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="url(#lf${id})"/>`).join('')}
  ${lights.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff" opacity="0.14"/>`).join('')}</g>`;

const SEED_PATH = 'M0 -30C13 -20 18 -4 11 12C7 21 -7 21 -11 12C-18 -4 -13 -20 0 -30Z';
const seed = (id, x, y, scale = 1, rot = -18) => `
  <g transform="translate(${x} ${y}) rotate(${rot}) scale(${scale})">
    <path d="${SEED_PATH}" fill="url(#sd${id})"/>
    <path d="M0 -24C-4 -10 -4 2 0 16" fill="none" stroke="#fff2d6" stroke-opacity="0.55" stroke-width="2" stroke-linecap="round"/>
    <ellipse cx="-5" cy="-10" rx="3" ry="7" fill="#fff" opacity="0.28"/>
  </g>`;

const ART = {
  seed: (id) => `${glow(id, 140, 60)}${seed(id, 100, 146, 1.15)}${ground(id, 160)}
    ${sparkle(64, 110, 5)}${sparkle(138, 98, 4, 0.6)}${sparkle(130, 134, 3, 0.5)}`,

  sprout: (id) => `${glow(id, 118, 70)}
    <g class="plant-sway">
      <path d="M100 164C100 144 97 126 101 104" fill="none" stroke="url(#lf${id})" stroke-width="5" stroke-linecap="round"/>
      <path d="M100 118C88 100 70 98 58 106C70 122 90 124 100 118Z" fill="url(#lf${id})"/>
      <path d="M101 106C110 84 132 78 146 86C138 104 116 112 101 106Z" fill="url(#lf${id})"/>
      <path d="M98 116C88 110 78 108 68 108M103 104C114 96 126 90 138 88" fill="none" stroke="#fff" stroke-opacity="0.25" stroke-width="1.5" stroke-linecap="round"/>
    </g>
    ${seed(id, 100, 168, 0.55, 8)}${ground(id, 160)}${sparkle(150, 70, 4, 0.6)}`,

  shrub: (id) => `${glow(id, 110, 80)}
    <path d="M97 166L98 128L102 128L103 166Z" fill="url(#tk${id})"/>
    ${canopy(id, [[76, 122, 26], [124, 120, 28], [100, 98, 32], [100, 130, 24], [66, 104, 16], [136, 100, 18]], [[90, 88, 10], [118, 110, 8]])}
    ${ground(id, 160)}`,

  tree: (id) => `${glow(id, 96, 88)}
    <path d="M93 166C95 140 96 112 97 92L103 92C104 112 105 140 107 166Z" fill="url(#tk${id})"/>
    <path d="M99 124C92 116 86 112 78 110M101 112C108 106 114 102 122 100" stroke="url(#tk${id})" stroke-width="4" stroke-linecap="round" fill="none"/>
    ${canopy(id, [[100, 76, 40], [68, 94, 26], [132, 94, 26], [100, 44, 26], [78, 58, 22], [124, 60, 22]], [[86, 56, 12], [116, 80, 9]])}
    ${ground(id, 160)}`,

  oak: (id) => `${glow(id, 90, 95)}
    <path d="M86 168C90 146 92 124 84 106L92 102C97 114 99 114 103 102L112 106C105 124 107 146 114 168Z" fill="url(#tk${id})"/>
    <path d="M86 168C80 166 74 167 68 170M114 168C120 166 126 167 132 170" stroke="url(#tk${id})" stroke-width="4" stroke-linecap="round" fill="none"/>
    ${canopy(id, [[56, 92, 30], [144, 92, 30], [100, 68, 44], [70, 58, 28], [130, 58, 28], [100, 100, 30], [100, 30, 24], [40, 70, 18], [160, 70, 18]],
      [[82, 44, 12], [120, 52, 10], [60, 84, 8], [140, 86, 8]])}
    ${ground(id, 162)}`,

  world: (id) => `${glow(id, 84, 100)}
    ${sparkle(22, 26, 4, 0.75)}${sparkle(180, 30, 3, 0.6)}${sparkle(172, 150, 3, 0.5)}${sparkle(26, 150, 3.5, 0.55)}${sparkle(150, 10, 2.5, 0.5)}
    <circle cx="100" cy="166" r="30" style="fill: rgb(var(--hi) / 0.1); stroke: rgb(var(--hi) / 0.22)" stroke-width="1.5"/>
    <path d="M74 152C86 158 114 158 126 152" fill="none" style="stroke: rgb(var(--hi) / 0.12)" stroke-width="1.5"/>
    <ellipse cx="100" cy="168" rx="52" ry="9" transform="rotate(-12 100 168)" fill="none" style="stroke: var(--accent-2)" stroke-opacity="0.5" stroke-width="2"/>
    <path d="M91 140C93 124 93 112 86 98L94 95C98 104 100 104 104 95L113 98C106 112 107 124 109 140Z" fill="url(#tk${id})"/>
    <path d="M91 138C82 140 76 146 72 156M109 138C118 140 124 146 128 156M97 140C95 148 92 156 88 164M103 140C105 148 108 156 112 164"
      stroke="url(#tk${id})" stroke-width="3.5" stroke-linecap="round" fill="none"/>
    ${canopy(id, [[56, 80, 26], [144, 80, 26], [100, 60, 38], [72, 52, 24], [128, 52, 24], [100, 90, 26], [100, 30, 20], [36, 66, 15], [164, 66, 15]],
      [[86, 42, 10], [120, 48, 8]])}
    <g class="plant-fruits">${[[64, 72], [100, 44], [136, 72], [84, 94], [118, 96], [46, 84], [154, 86], [100, 70], [76, 46], [124, 46]]
      .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="7" fill="#ffe7b3" opacity="0.2"/><circle cx="${x}" cy="${y}" r="3.2" fill="#ffe7b3"/>`).join('')}</g>`,
};

/** Illustration d'un stade (id de STAGES). */
export function plantArt(stageId, { size = 160, cls = '' } = {}) {
  const id = `p${++uidN}`;
  const draw = ART[stageId] || ART.seed;
  return svgEl(`<svg viewBox="0 0 200 200" width="${size}" height="${size}" aria-hidden="true">${defs(id)}${draw(id)}</svg>`, `plant-art st-${stageId} ${cls}`);
}

/** Logo de Grow : la graine qui germe (sans fond), comme l'icône de l'app (icons/logo.svg). */
export function logoMark(size = 40, cls = '') {
  const id = `g${++uidN}`;
  return svgEl(`<svg viewBox="0 0 64 64" width="${size}" height="${size}" aria-hidden="true">
    <defs><linearGradient id="${id}" x1="0.1" y1="0" x2="0.9" y2="1">
      <stop offset="0" stop-color="#ffd98a"/><stop offset="0.5" stop-color="#ff8a52"/><stop offset="1" stop-color="#e3436b"/></linearGradient></defs>
    <g transform="translate(29 40) scale(0.22)">
      <g transform="rotate(30)">
        <path d="M0 -104C66 -60 68 46 0 100C-68 46 -66 -60 0 -104Z" fill="url(#${id})"/>
        <path d="M0 -80C14 -30 14 30 0 78" fill="none" stroke="#fff3d9" stroke-opacity="0.55" stroke-width="12" stroke-linecap="round"/>
      </g>
      <path d="M52 -90C56 -110 52 -126 44 -140" fill="none" stroke="#ffcf87" stroke-width="12" stroke-linecap="round"/>
      <path d="M44 -136C30 -160 4 -166 -14 -156C-4 -136 20 -128 44 -136Z" fill="#ffcf87"/>
      <path d="M46 -138C54 -166 78 -178 100 -172C94 -148 72 -136 46 -138Z" fill="#ffcf87"/>
    </g>
  </svg>`, `logo-mark ${cls}`);
}

// --- Fiche « Ta plante » ----------------------------------------------------------------------

/** Réserve d'engrais : 3 emplacements. */
function fertilizerSlots(n) {
  return h('div', { class: 'fert-slots', 'aria-label': `${n} engrais sur ${FERTILIZER_MAX}` },
    Array.from({ length: FERTILIZER_MAX }, (_, i) => h('span', { class: `fert-slot ${i < n ? 'on' : ''}` }, icon('fertilizer', 18))));
}

/**
 * @param {object} g résultat de growth()
 * @param {{ rules?: string, todo?: string }} opts rules = ce qui arrose la plante ; todo = ce qu'il reste aujourd'hui
 */
export function openPlantSheet(g, { rules = '', todo = '' } = {}) {
  sheet(() => {
    const st = g.stage;
    const hero = h('div', { class: `plant-hero st-${st.id}` },
      plantArt(st.id, { size: 190 }),
      h('div', { class: 'plant-hero-text' },
        h('b', { class: 'plant-stage' }, st.name),
        h('span', { class: 'plant-days' }, g.streak ? `${daysLabel(g.streak)} arrosé${g.streak > 1 ? 's' : ''} d’affilée` : 'Fraîchement plantée')));
    const nextBlock = g.next
      ? h('div', { class: 'plant-next' },
        h('div', { class: 'plant-next-line' }, h('span', null, `${g.next.emoji} ${g.next.name}`), h('b', null, `dans ${daysLabel(g.toNext)}`)),
        h('div', { class: 'plant-bar' }, h('i', { style: { width: `${Math.round(g.progress * 100)}%` } })))
      : h('p', { class: 'sheet-text' }, 'Ton arbre-monde a fait renaître la vie sur ta planète. Continue de l’arroser 🌍');
    const today = h('div', { class: `plant-today ${g.todayDone ? 'done' : ''}` }, icon('drop', 18),
      h('span', null, g.todayDone ? 'Arrosée aujourd’hui, bravo.' : todo ? `Pas encore arrosée aujourd’hui : note ${todo}.` : 'Pas encore arrosée aujourd’hui.'));
    const fert = h('div', { class: 'plant-fert' },
      h('div', { class: 'plant-fert-head' }, h('b', null, `Engrais : ${g.fertilizer}`), fertilizerSlots(g.fertilizer)),
      h('p', null, `Chaque semaine parfaite (${FERTILIZER_EVERY} jours arrosés) t’en donne un, ${FERTILIZER_MAX} au plus. Un jour oublié ? Un engrais le rattrape tout seul et ta plante ne fane pas.`),
      g.nextFertilizer ? h('p', { class: 'faint' }, `Prochain engrais dans ${daysLabel(g.nextFertilizer)} arrosé${g.nextFertilizer > 1 ? 's' : ''}.`) : h('p', { class: 'faint' }, 'Réserve pleine.'));
    const ladder = h('div', { class: 'plant-ladder' }, STAGES.map((s, i) => h('div', { class: `pl-step ${i < g.index ? 'past' : i === g.index ? 'now' : ''}` },
      h('span', { class: 'pl-icon' }, icon(`st-${s.id}`, 18)),
      h('span', { class: 'pl-name' }, s.name),
      h('span', { class: 'pl-when' }, s.min === 0 ? 'au départ' : s.min === 7 ? '7 jours' : s.min === 30 ? '1 mois' : s.min === 90 ? '3 mois' : s.min === 180 ? '6 mois' : '1 an'),
      i < g.index ? icon('check', 15, 'pl-ok') : '')));
    return [
      hero, nextBlock, today, fert,
      h('div', { class: 'section-title' }, 'Les étapes'), ladder,
      rules ? h('p', { class: 'sheet-text plant-rules' }, rules) : null,
      g.best > g.streak ? h('p', { class: 'faint plant-best' }, `Ton record : ${g.bestStage.name.toLowerCase()}, ${daysLabel(g.best)} d’affilée.`) : null,
    ];
  }, { title: `Ta plante`, cls: 'plant-sheet' });
}

/** Nouveau stade atteint : petite fête. `onShare` : partager la nouvelle avec ses amis. */
export function celebrateStage(g, { onShare } = {}) {
  const prev = STAGES[Math.max(0, g.index - 1)];
  sheet((close) => [
    h('div', { class: 'plant-celebrate' },
      plantArt(g.stage.id, { size: 220, cls: 'grow-in' }),
      h('h2', null, `${prev.ta[0].toUpperCase()}${prev.ta.slice(1)} est ${prev.ta.startsWith('ta ') ? 'devenue' : 'devenu'} ${g.stage.une} !`),
      h('p', null, `${daysLabel(g.streak)} arrosés d’affilée. ${g.next ? `Prochaine étape : ${g.next.name.toLowerCase()}, dans ${daysLabel(g.toNext)}.` : 'La vie est revenue sur ta planète 🌍'}`)),
    h('div', { class: 'sheet-actions' },
      onShare ? h('button', { class: 'btn', onClick: () => { close(); onShare(); } }, icon('share', 16), 'Partager') : null,
      h('button', { class: 'btn primary', onClick: close }, 'Continuer')),
  ], { title: 'Ta plante grandit', cls: 'plant-sheet' });
}

/**
 * Présentation de Grow (une fois) pour qui utilisait déjà l'app : la flamme devient une graine,
 * ses étapes et l'engrais. Sa série actuelle est reprise telle quelle.
 */
export function introduceGrow(g, { onDone } = {}) {
  sheet((close) => [
    h('div', { class: 'plant-celebrate' },
      plantArt(g.stage.id, { size: 190, cls: 'grow-in' }),
      h('h2', null, 'Ta flamme devient une graine'),
      h('p', null, 'L’app s’appelle maintenant Grow. Chaque journée réussie arrose ta plante 💧 et la fait pousser.'),
      g.streak ? h('p', { class: 'plant-intro-now' }, `Avec tes ${daysLabel(g.streak)} d’affilée, c’est déjà ${g.stage.une} ${g.stage.emoji}`) : null),
    h('div', { class: 'plant-ladder compact' }, STAGES.map((st, i) => h('div', { class: `pl-step ${i < g.index ? 'past' : i === g.index ? 'now' : ''}` },
      h('span', { class: 'pl-icon' }, icon(`st-${st.id}`, 18)), h('span', { class: 'pl-name' }, st.name),
      h('span', { class: 'pl-when' }, ['au départ', '7 jours', '1 mois', '3 mois', '6 mois', '1 an'][i])))),
    h('div', { class: 'plant-fert' },
      h('div', { class: 'plant-fert-head' }, h('b', null, 'L’engrais 🌾'), fertilizerSlots(g.fertilizer)),
      h('p', null, `Chaque semaine parfaite t’en donne un (${FERTILIZER_MAX} au plus). Un jour oublié ? Il le rattrape tout seul. Sans engrais, la plante fane et repart d’une graine.`)),
    h('button', { class: 'btn primary block', onClick: () => close() }, 'C’est parti'),
  ], { title: 'Nouveau : Grow', cls: 'plant-sheet', onClose: () => onDone?.() });
}
