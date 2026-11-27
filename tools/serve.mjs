// Serveur local de développement (aucune dépendance).
// Usage : node tools/serve.mjs [port]  ->  http://localhost:8080
// Le service worker est désactivé sur localhost (ajouter ?sw=1 pour le tester).

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { networkInterfaces } from 'node:os';

const root = join(fileURLToPath(import.meta.url), '..', '..');
const port = Number(process.argv[2]) || 8080;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
};

createServer(async (req, res) => {
  let p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '');
  if (!p || p.endsWith('/') || p.endsWith('\\')) p += 'index.html';
  if (p.startsWith('..')) return res.writeHead(403).end();
  try {
    const data = await readFile(join(root, p));
    res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(data);
  } catch {
    res.writeHead(404).end('404');
  }
}).listen(port, () => {
  console.log(`Lifestyle : http://localhost:${port}`);
  for (const nets of Object.values(networkInterfaces())) {
    for (const n of nets || []) if (n.family === 'IPv4' && !n.internal) console.log(`  réseau local : http://${n.address}:${port}`);
  }
});
