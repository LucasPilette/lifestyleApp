// Graphiques SVG légers : barres (avec moyenne glissante et objectif) et courbes.
// Interaction tactile : glisser le doigt sur le graphique affiche la valeur.

import { h, s } from '../core/dom.js';

/** Échelle "ronde" pour l'axe Y. */
export function niceScale(min, max, ticks = 4) {
  if (max === min) {
    max = min === 0 ? 1 : max * 1.1;
    if (min > 0) min = Math.max(0, min * 0.9);
  }
  const range = max - min;
  const raw = range / ticks;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  return { min: Math.floor(min / step) * step, max: Math.ceil(max / step) * step, step };
}

function roundedTopBar(x, y, w, hgt, r) {
  r = Math.min(r, w / 2, hgt);
  return `M${x},${y + hgt}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + hgt}Z`;
}

/**
 * Monte un graphique dans `host` (re-rendu automatique au redimensionnement).
 * opts : {
 *   type: 'bar'|'line', points: [{ label, value, tip, sub }], color,
 *   overlay?: number[] (courbe neutre superposée), overlayLabel?,
 *   goal?: number, goalLabel?, format: v => string, tick: v => string,
 *   height?: number, maxY?: number, zeroBased?: boolean
 * }
 */
export function mountChart(host, opts) {
  host.classList.add('chart');
  const tooltip = h('div', { class: 'chart-tip', 'aria-hidden': 'true' });
  let svg;
  let geometry;

  function render() {
    const width = Math.max(240, host.clientWidth || 320);
    const height = opts.height || 180;
    const pad = { l: 38, r: 10, t: 14, b: 24 };
    const pw = width - pad.l - pad.r;
    const ph = height - pad.t - pad.b;
    const pts = opts.points;
    const n = pts.length;
    const vals = pts.map((p) => p.value).filter((v) => v != null);
    const extra = [opts.goal, ...(opts.overlay || [])].filter((v) => v != null);
    const all = [...vals, ...extra];
    const zero = opts.zeroBased ?? opts.type === 'bar';
    let lo = zero ? 0 : all.length ? Math.min(...all) : 0;
    let hi = all.length ? Math.max(...all) : 1;
    if (opts.maxY != null) hi = Math.max(hi, opts.maxY);
    if (!zero) lo = Math.max(0, lo - (hi - lo) * 0.15);
    let sc;
    if (opts.step) {
      // pas imposé (ex. 2 h pour le sommeil), doublé si trop de graduations
      let step = opts.step;
      while ((Math.ceil(hi / step) - Math.floor(lo / step)) > 6) step *= 2;
      sc = { min: Math.floor(lo / step) * step, max: Math.max(step, Math.ceil((hi * 1.02) / step) * step), step };
    } else sc = niceScale(lo, hi * (zero ? 1.05 : 1.02), 4);
    if (opts.maxY != null && sc.max > opts.maxY && hi <= opts.maxY) sc.max = opts.maxY;
    const y = (v) => pad.t + ph - ((v - sc.min) / (sc.max - sc.min)) * ph;
    const band = pw / Math.max(1, n);
    const cx = (i) => pad.l + band * i + band / 2;

    svg = s('svg', { class: 'chart-svg', width, height, viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': opts.ariaLabel || '' });

    // Grille + graduations
    const grid = s('g', { class: 'chart-grid' });
    for (let v = sc.min; v <= sc.max + 1e-9; v += sc.step) {
      const yy = Math.round(y(v)) + 0.5;
      grid.append(
        s('line', { x1: pad.l, x2: width - pad.r, y1: yy, y2: yy }),
        s('text', { x: pad.l - 6, y: yy + 3.5, 'text-anchor': 'end' }, opts.tick ? opts.tick(v) : String(v)),
      );
    }
    svg.append(grid);

    // Étiquettes X (au plus ~6)
    const every = Math.max(1, Math.ceil(n / 6));
    const xl = s('g', { class: 'chart-xlabels' });
    for (let i = n - 1; i >= 0; i -= every) {
      xl.append(s('text', { x: cx(i), y: height - 6, 'text-anchor': 'middle' }, pts[i].label));
    }
    svg.append(xl);

    // Objectif
    if (opts.goal != null && opts.goal <= sc.max) {
      const gy = Math.round(y(opts.goal)) + 0.5;
      svg.append(s('line', { class: 'chart-goal', x1: pad.l, x2: width - pad.r, y1: gy, y2: gy }));
    }

    const marks = s('g', { class: 'chart-marks' });
    if (opts.type === 'bar') {
      const bw = Math.max(3, Math.min(24, band - 2));
      const r = bw >= 8 ? 4 : 1.5;
      pts.forEach((p, i) => {
        if (p.value == null) {
          marks.append(s('circle', { class: 'chart-empty', cx: cx(i), cy: y(sc.min) - 2, r: 1.5 }));
          return;
        }
        const top = y(p.value);
        const hgt = Math.max(2, y(sc.min) - top);
        marks.append(s('path', { d: roundedTopBar(cx(i) - bw / 2, y(sc.min) - hgt, bw, hgt, r), fill: opts.color, 'data-i': i }));
      });
    } else {
      let d = '';
      let pen = false;
      pts.forEach((p, i) => {
        if (p.value == null) {
          pen = opts.connectGaps ? pen : false;
          return;
        }
        d += `${pen ? 'L' : 'M'}${cx(i).toFixed(1)},${y(p.value).toFixed(1)}`;
        pen = true;
      });
      marks.append(s('path', { class: 'chart-line', d, stroke: opts.color }));
      pts.forEach((p, i) => {
        if (p.value == null) return;
        marks.append(s('circle', { class: 'chart-dot', cx: cx(i), cy: y(p.value), r: n > 20 ? 2.5 : 4, fill: opts.color, 'data-i': i }));
      });
    }
    svg.append(marks);

    // Courbe neutre superposée (moyenne glissante)
    if (opts.overlay) {
      let d = '';
      let pen = false;
      opts.overlay.forEach((v, i) => {
        if (v == null) {
          pen = false;
          return;
        }
        d += `${pen ? 'L' : 'M'}${cx(i).toFixed(1)},${y(v).toFixed(1)}`;
        pen = true;
      });
      svg.append(s('path', { class: 'chart-overlay', d }));
    }

    const guide = s('line', { class: 'chart-guide', y1: pad.t, y2: pad.t + ph, x1: 0, x2: 0, visibility: 'hidden' });
    svg.append(guide);
    geometry = { pad, pw, band, n, cx, y, guide, width };

    host.replaceChildren(svg, tooltip);
  }

  // --- Interaction ---
  let hideTimer;
  function show(clientX) {
    const rect = svg.getBoundingClientRect();
    const x = clientX - rect.left;
    const { pad, band, n, cx, guide, width } = geometry;
    const i = Math.max(0, Math.min(n - 1, Math.floor((x - pad.l) / band)));
    const p = opts.points[i];
    guide.setAttribute('x1', cx(i));
    guide.setAttribute('x2', cx(i));
    guide.setAttribute('visibility', 'visible');
    svg.querySelectorAll('.is-active').forEach((el) => el.classList.remove('is-active'));
    svg.querySelector(`[data-i="${i}"]`)?.classList.add('is-active');
    tooltip.replaceChildren(
      h('div', { class: 'chart-tip-title' }, p.tip || p.label),
      h('div', { class: 'chart-tip-value' }, p.value != null ? opts.format(p.value) : 'Non renseigné'),
      p.sub ? h('div', { class: 'chart-tip-sub' }, p.sub) : null,
    );
    tooltip.classList.add('show');
    const tw = tooltip.offsetWidth;
    tooltip.style.left = `${Math.max(0, Math.min(width - tw, cx(i) - tw / 2))}px`;
    clearTimeout(hideTimer);
  }
  function hide(delay = 1800) {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      tooltip.classList.remove('show');
      geometry?.guide.setAttribute('visibility', 'hidden');
      svg?.querySelectorAll('.is-active').forEach((el) => el.classList.remove('is-active'));
    }, delay);
  }
  host.addEventListener('pointerdown', (e) => show(e.clientX));
  host.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'mouse' || e.buttons) show(e.clientX);
  });
  host.addEventListener('pointerup', () => hide());
  host.addEventListener('pointercancel', () => hide(0));
  host.addEventListener('pointerleave', (e) => e.pointerType === 'mouse' && hide(0));

  render();
  let lastW = host.clientWidth;
  const ro = new ResizeObserver(() => {
    if (Math.abs(host.clientWidth - lastW) > 2) {
      lastW = host.clientWidth;
      render();
    }
  });
  ro.observe(host);
  return { update: render, destroy: () => ro.disconnect() };
}

/** Mini-histogramme pour les cartes de l'accueil (valeurs des derniers jours). */
export function sparkBars(values, { color, goal, height = 34, width = 112, highlightLast = true } = {}) {
  const n = values.length;
  const max = Math.max(goal || 0, ...values.filter((v) => v != null), 1);
  const gap = 2;
  const bw = (width - gap * (n - 1)) / n;
  const svg = s('svg', { class: 'spark', viewBox: `0 0 ${width} ${height}`, width, height, 'aria-hidden': 'true', preserveAspectRatio: 'none' });
  values.forEach((v, i) => {
    const x = i * (bw + gap);
    if (v == null) {
      svg.append(s('rect', { x, y: height - 2, width: bw, height: 2, rx: 1, class: 'spark-empty' }));
      return;
    }
    const hh = Math.max(2, (v / max) * (height - 2));
    svg.append(s('rect', { x, y: height - hh, width: bw, height: hh, rx: Math.min(2, bw / 2), fill: color, opacity: highlightLast && i === n - 1 ? 1 : 0.55 }));
  });
  if (goal) {
    const gy = height - (goal / max) * (height - 2);
    svg.append(s('line', { x1: 0, x2: width, y1: gy, y2: gy, class: 'spark-goal' }));
  }
  return svg;
}
