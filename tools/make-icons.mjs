// Génère les icônes PNG de l'app (haltère citron vert sur fond sombre), sans dépendance.
// Usage : node tools/make-icons.mjs

import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = join(fileURLToPath(import.meta.url), '..', '..', 'icons');

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, pixel) {
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b] = pixel(x, y);
      const i = y * (size * 3 + 1) + 1 + x * 3;
      raw[i] = r;
      raw[i + 1] = g;
      raw[i + 2] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// Rectangle arrondi centré (cx, cy), demi-dimensions (hw, hh), rayon r — distance signée
function sdRoundRect(px, py, cx, cy, hw, hh, r) {
  const qx = Math.abs(px - cx) - hw + r;
  const qy = Math.abs(py - cy) - hh + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

function dumbbell(u, v, scale) {
  // repère tourné de -32°
  const a = (-32 * Math.PI) / 180;
  const x = ((u - 0.5) * Math.cos(a) - (v - 0.5) * Math.sin(a)) / scale;
  const y = ((u - 0.5) * Math.sin(a) + (v - 0.5) * Math.cos(a)) / scale;
  const shapes = [
    [0, 0, 0.2, 0.032, 0.03],
    [-0.16, 0, 0.042, 0.175, 0.035],
    [0.16, 0, 0.042, 0.175, 0.035],
    [-0.245, 0, 0.032, 0.115, 0.028],
    [0.245, 0, 0.032, 0.115, 0.028],
  ];
  return Math.min(...shapes.map(([cx, cy, hw, hh, r]) => sdRoundRect(x, y, cx, cy, hw, hh, r)));
}

const LIME = [198, 244, 50];
function render(size, scale) {
  const ss = 4;
  return png(size, (px, py) => {
    let cov = 0;
    for (let i = 0; i < ss; i++) for (let j = 0; j < ss; j++) {
      const u = (px + (i + 0.5) / ss) / size;
      const v = (py + (j + 0.5) / ss) / size;
      if (dumbbell(u, v, scale) <= 0) cov++;
    }
    cov /= ss * ss;
    const u = (px + 0.5) / size;
    const v = (py + 0.5) / size;
    // fond : dégradé vertical + léger halo derrière l'haltère
    const glow = Math.max(0, 1 - Math.hypot(u - 0.5, v - 0.5) / 0.55) ** 2 * 0.12;
    const bg = [26 - 12 * v, 31 - 14 * v, 39 - 18 * v].map((c, k) => c + glow * LIME[k] * 0.35);
    return bg.map((c, k) => Math.round(c * (1 - cov) + LIME[k] * cov));
  });
}

const targets = [
  ['apple-touch-icon.png', 180, 1],
  ['icon-192.png', 192, 1],
  ['icon-512.png', 512, 1],
  ['icon-512-maskable.png', 512, 0.78],
];
for (const [name, size, scale] of targets) {
  writeFileSync(join(out, name), render(size, scale));
  console.log('icons/' + name);
}
