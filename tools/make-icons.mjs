// Génère les icônes PNG de l'app (éclipse rouge sur fond noir), sans dépendance.
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

// Logo « Eclipse » (dessin original) : un disque noir masque un soleil rouge,
// laissant une couronne lumineuse en croissant, sur fond noir.
const RED = [214, 24, 32];
const HOT = [255, 92, 60];

function render(size, scale) {
  const ss = 4;
  const R = 0.27 * scale; // soleil
  const r = 0.245 * scale; // lune
  const off = [0.045 * scale, -0.03 * scale]; // décalage de la lune
  return png(size, (px, py) => {
    let ring = 0;
    for (let i = 0; i < ss; i++) for (let j = 0; j < ss; j++) {
      const x = (px + (i + 0.5) / ss) / size - 0.5;
      const y = (py + (j + 0.5) / ss) / size - 0.5;
      const inSun = Math.hypot(x, y) <= R;
      const inMoon = Math.hypot(x - off[0], y - off[1]) <= r;
      if (inSun && !inMoon) ring++;
    }
    ring /= ss * ss;
    const x = (px + 0.5) / size - 0.5;
    const y = (py + 0.5) / size - 0.5;
    const d = Math.hypot(x, y);
    // halo rouge autour du soleil (plus intense côté croissant), fond quasi noir
    const side = Math.max(0, -(x * off[0] + y * off[1]) / (Math.hypot(...off) * Math.max(d, 1e-6)));
    const glow = d > R ? Math.exp(-(((d - R) / (0.11 * scale)) ** 2)) * (0.35 + 0.45 * side) : 0;
    const inMoon = Math.hypot(x - off[0], y - off[1]) <= r;
    const bg = [7, 6, 7].map((c, k) => c + glow * RED[k] * 0.9);
    // le croissant : rouge vif, plus chaud sur le bord extérieur
    const edge = Math.min(1, Math.max(0, (d - (R - 0.03 * scale)) / (0.03 * scale)));
    const col = RED.map((c, k) => c + (HOT[k] - c) * edge * 0.6);
    const base = inMoon ? [4, 3, 4] : bg;
    return base.map((c, k) => Math.round(Math.min(255, c * (1 - ring) + col[k] * ring)));
  });
}

const targets = [
  ['apple-touch-icon.png', 180, 1],
  ['icon-192.png', 192, 1],
  ['icon-512.png', 512, 1],
  ['icon-512-maskable.png', 512, 0.8],
];
for (const [name, size, scale] of targets) {
  writeFileSync(join(out, name), render(size, scale));
  console.log('icons/' + name);
}
