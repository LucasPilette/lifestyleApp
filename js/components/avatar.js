// Photos de profil : affichage (photo ou initiale), choix et recadrage (cercle, déplacer et zoomer) sur le téléphone.

import { h, icon } from '../core/dom.js';
import { actionSheet, toast } from '../core/ui.js';

const initialOf = (name) => (name || '?').trim().charAt(0).toUpperCase() || '?';
const SAFE_URL = /^(data:image\/(jpeg|png|webp);base64,|https:\/\/)/;

/** Pastille ronde : photo si disponible, sinon initiale sur la couleur du thème. */
export function avatarEl({ name, url, size = 'small', cls = '' } = {}) {
  const el = h('span', { class: `pf-avatar ${size} ${cls}` });
  if (url && SAFE_URL.test(url)) {
    const img = h('img', { src: url, alt: '', loading: 'lazy', decoding: 'async' });
    img.addEventListener('error', () => el.replaceChildren(initialOf(name)));
    el.append(img);
  } else el.append(initialOf(name));
  return el;
}

/** Avatar d'un groupe : les deux premiers membres superposés. */
export function groupAvatarEl(members = [], cls = '') {
  const two = members.slice(0, 2);
  if (two.length < 2) return h('span', { class: `pf-avatar small group-solo ${cls}` }, icon('users', 18));
  return h('span', { class: `group-avatar ${cls}` }, two.map((m) => avatarEl({ name: m.name, url: m.avatar_url, size: 'tiny' })));
}

const loadImage = (url) => new Promise((resolve, reject) => {
  const i = new Image();
  i.onload = () => resolve(i);
  i.onerror = () => reject(new Error('Image illisible'));
  i.src = url;
});

/**
 * Recadrage de la photo : un doigt déplace l'image, deux doigts (ou le curseur) zooment ; le cercle montre
 * ce qui sera gardé. Résout un JPEG carré de `size` px (environ 15 à 30 ko), ou undefined si annulé.
 */
export async function cropAvatar(file, size = 256) {
  const url = URL.createObjectURL(file);
  let img;
  try {
    img = await loadImage(url);
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
  const W = img.naturalWidth;
  const H = img.naturalHeight;
  return new Promise((resolve) => {
    const pic = h('img', { class: 'crop-img', src: url, alt: '', draggable: 'false' });
    Object.assign(pic.style, { width: `${W}px`, height: `${H}px` }); // taille réelle, mise à l'échelle par transform
    const frame = h('div', { class: 'crop-frame' }, pic, h('div', { class: 'crop-ring', 'aria-hidden': 'true' }));
    const zoom = h('input', { class: 'crop-zoom', type: 'range', min: '1', max: '4', step: '0.01', value: '1', 'aria-label': 'Zoom' });
    const screen = h('div', { class: 'crop-screen', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Recadrer la photo' },
      h('div', { class: 'crop-top' }, h('b', null, 'Recadre ta photo'), h('span', null, 'Fais glisser pour cadrer, pince pour zoomer.')),
      frame,
      h('div', { class: 'crop-zoom-row' }, icon('minus', 18), zoom, icon('plus', 18)),
      h('div', { class: 'crop-actions' },
        h('button', { class: 'btn ghost', onClick: () => close(undefined) }, 'Annuler'),
        h('button', { class: 'btn primary', onClick: () => close(render()) }, icon('check', 18), 'Valider')));

    // Image : largeur W × échelle ; (x, y) = coin haut gauche dans le cadre (V × V).
    let V = 1;
    let base = 1; // échelle où l'image couvre juste le cadre
    let z = 1; // zoom (1 à 4)
    let x = 0;
    let y = 0;
    const scale = () => base * z;
    const clamp = () => {
      const sc = scale();
      x = Math.min(0, Math.max(V - W * sc, x));
      y = Math.min(0, Math.max(V - H * sc, y));
    };
    const apply = () => {
      pic.style.transform = `translate(${x}px, ${y}px) scale(${scale()})`;
      zoom.value = String(z);
    };
    const zoomAt = (nz, fx, fy) => {
      const s0 = scale();
      z = Math.min(4, Math.max(1, nz));
      const s1 = scale();
      x = fx - (fx - x) * (s1 / s0);
      y = fy - (fy - y) * (s1 / s0);
      clamp();
      apply();
    };
    const layout = () => {
      V = frame.clientWidth || 300;
      const keep = { cx: (V / 2 - x) / scale(), cy: (V / 2 - y) / scale() };
      base = V / Math.min(W, H);
      if (!layout.done) {
        keep.cx = W / 2;
        keep.cy = H / 2;
        layout.done = true;
      }
      x = V / 2 - keep.cx * scale();
      y = V / 2 - keep.cy * scale();
      clamp();
      apply();
    };

    // Gestes : un doigt = déplacer, deux doigts = zoomer autour de leur milieu.
    const pts = new Map();
    const local = (e) => {
      const r = frame.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    let pinch = null;
    frame.addEventListener('pointerdown', (e) => {
      frame.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, local(e));
      pinch = null;
    });
    frame.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) return;
      const prev = pts.get(e.pointerId);
      const cur = local(e);
      pts.set(e.pointerId, cur);
      if (pts.size === 1) {
        x += cur.x - prev.x;
        y += cur.y - prev.y;
        clamp();
        apply();
      } else if (pts.size === 2) {
        const [p, q] = [...pts.values()];
        const d = Math.hypot(p.x - q.x, p.y - q.y);
        const m = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
        if (pinch) {
          x += m.x - pinch.m.x;
          y += m.y - pinch.m.y;
          zoomAt(z * (d / pinch.d), m.x, m.y);
        }
        pinch = { d, m };
      }
    });
    const up = (e) => {
      pts.delete(e.pointerId);
      pinch = null;
    };
    frame.addEventListener('pointerup', up);
    frame.addEventListener('pointercancel', up);
    frame.addEventListener('wheel', (e) => {
      e.preventDefault();
      const p = local(e);
      zoomAt(z * (1 - e.deltaY * 0.002), p.x, p.y);
    }, { passive: false });
    // Safari : empêcher le zoom de la page pendant le pincement
    const noGesture = (e) => e.preventDefault();
    screen.addEventListener('gesturestart', noGesture);
    screen.addEventListener('gesturechange', noGesture);
    zoom.addEventListener('input', () => zoomAt(Number(zoom.value), V / 2, V / 2));
    window.addEventListener('resize', layout);

    function render() {
      const sc = scale();
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, -x / sc, -y / sc, V / sc, V / sc, 0, 0, size, size);
      return canvas.toDataURL('image/jpeg', 0.82);
    }
    function close(v) {
      window.removeEventListener('resize', layout);
      screen.classList.add('leaving');
      setTimeout(() => screen.remove(), 200);
      URL.revokeObjectURL(url);
      resolve(v);
    }

    document.body.append(screen);
    requestAnimationFrame(layout);
  });
}

/**
 * Choisir (ou retirer) une photo de profil. Résout les données de l'image, null pour retirer,
 * ou undefined si l'utilisateur annule.
 */
export function pickAvatar({ hasPhoto = false } = {}) {
  // iOS n'ouvre la photothèque que pendant le geste de l'utilisateur : input.click() doit être appelé
  // directement depuis un toucher (pas après une attente). À appeler sans await avant.
  return new Promise((resolve) => {
    let settled = false;
    const done = (v) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(v);
    };
    const input = h('input', { type: 'file', accept: 'image/*', style: { display: 'none' } });
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return done(undefined);
      try {
        done(await cropAvatar(file));
      } catch (e) {
        toast(e.message || 'Image illisible');
        done(undefined);
      }
    });
    input.addEventListener('cancel', () => done(undefined));
    document.body.append(input);
    if (!hasPhoto) {
      input.click();
      return;
    }
    actionSheet('Photo de profil', [
      { id: 'change', label: 'Choisir une autre photo', icon: 'edit', onClick: () => input.click() },
      { id: 'remove', label: 'Retirer la photo', icon: 'trash', danger: true, onClick: () => done(null) },
    ]).then((choice) => {
      if (!choice) done(undefined);
    });
  });
}
