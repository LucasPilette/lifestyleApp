// Prépare une publication : calcule la version (empreinte des fichiers) et
// régénère la liste des fichiers mis en cache par le service worker.
// Usage : node tools/release.mjs

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(import.meta.url), '..', '..');
const INCLUDE = ['index.html', 'manifest.webmanifest', 'css', 'js', 'icons'];
const EXCLUDE = new Set(['js/version.js']);

function walk(p) {
  const full = join(root, p);
  if (statSync(full).isDirectory()) return readdirSync(full).flatMap((f) => walk(join(p, f)));
  return [p.split(sep).join('/')];
}

const files = INCLUDE.flatMap(walk).filter((f) => !EXCLUDE.has(f) && !f.endsWith('.DS_Store')).sort();
const hash = createHash('sha256');
for (const f of files) {
  hash.update(f);
  hash.update(readFileSync(join(root, f)));
}
const d = new Date();
const pad = (n) => String(n).padStart(2, '0');
const version = `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}-${hash.digest('hex').slice(0, 7)}`;

writeFileSync(join(root, 'js/version.js'), `// Généré par tools/release.mjs — ne pas modifier à la main.\nexport const VERSION = '${version}';\n`);

const assets = ['./', ...files.map((f) => `./${f}`), './js/version.js'];
const swPath = join(root, 'sw.js');
const sw = readFileSync(swPath, 'utf8');
const block = `// <generated>\nconst VERSION = '${version}';\nconst ASSETS = ${JSON.stringify(assets, null, 2)};\n// </generated>`;
const next = sw.replace(/\/\/ <generated>[\s\S]*?\/\/ <\/generated>/, block);
if (next === sw && !sw.includes(version)) throw new Error('Bloc <generated> introuvable dans sw.js');
writeFileSync(swPath, next);

console.log(`Version ${version} — ${assets.length} fichiers en cache.`);
