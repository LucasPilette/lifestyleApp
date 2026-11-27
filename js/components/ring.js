// Anneau du jour (double anneau façon « activity rings ») :
// extérieur = priorités du jour renseignées, intérieur = séances de la semaine / minimum.

import { s } from '../core/dom.js';

let gid = 0;

/** Arc de progression. */
function arc(r, stroke, ratio, paint, track = 'rgba(255,255,255,0.08)') {
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(1, ratio));
  return [
    s('circle', { cx: 50, cy: 50, r, fill: 'none', stroke: track, 'stroke-width': stroke }),
    s('circle', {
      class: 'ring-arc', cx: 50, cy: 50, r, fill: 'none', stroke: paint, 'stroke-width': stroke, 'stroke-linecap': 'round',
      'stroke-dasharray': `${c} ${c}`, 'stroke-dashoffset': c * (1 - p), transform: 'rotate(-90 50 50)',
      opacity: p > 0 ? 1 : 0,
    }),
  ];
}

/**
 * @param {{ data: number, activity: number }} v ratios 0..1
 * @returns SVGElement (viewBox 100×100)
 */
export function dayRings({ data, activity }) {
  const id = ++gid;
  const svg = s('svg', { class: 'day-rings', viewBox: '0 0 100 100', 'aria-hidden': 'true' },
    s('defs', null,
      s('linearGradient', { id: `rg-o-${id}`, x1: '0', y1: '0', x2: '1', y2: '1' },
        s('stop', { offset: '0%', 'stop-color': '#ff2d48' }), s('stop', { offset: '100%', 'stop-color': '#ff7a45' })),
      s('linearGradient', { id: `rg-i-${id}`, x1: '0', y1: '1', x2: '1', y2: '0' },
        s('stop', { offset: '0%', 'stop-color': '#ffb340' }), s('stop', { offset: '100%', 'stop-color': '#ffe08a' }))),
    arc(42, 11, data, `url(#rg-o-${id})`),
    arc(28.5, 11, activity, `url(#rg-i-${id})`));
  return svg;
}
