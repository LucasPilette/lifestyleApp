// Photos de profil : affichage (photo ou initiale), choix et recadrage carré sur le téléphone.

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

/** Image -> carré 256 × 256 en JPEG (données de l'image, environ 15 à 30 ko). */
async function squareJpeg(file, size = 256) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('Image illisible'));
      i.src = url;
    });
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, size, size);
    return canvas.toDataURL('image/jpeg', 0.82);
  } finally {
    URL.revokeObjectURL(url);
  }
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
        done(await squareJpeg(file));
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
