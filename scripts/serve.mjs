// Tiny static server for local preview and e2e. Applies the same security headers as vercel.json.
// usage: node scripts/serve.mjs <dir> [port] [extra-connect-src]
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, resolve, extname, normalize, sep } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const dir = resolve(process.argv[2] ?? 'dist');
const port = Number(process.argv[3] ?? 4173);
const extraConnect = process.argv[4];

const vercel = JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8'));
const headers = Object.fromEntries(vercel.headers[0].headers.map((h) => [h.key, h.value]));
delete headers['Strict-Transport-Security'];
headers['Content-Security-Policy'] = headers['Content-Security-Policy'].replace(
  '; upgrade-insecure-requests',
  '',
);
if (extraConnect)
  headers['Content-Security-Policy'] = headers['Content-Security-Policy'].replace(
    'connect-src ',
    `connect-src ${extraConnect} `,
  );

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

createServer((req, res) => {
  let p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (p.endsWith(sep) || p === '/') p = join(p, 'index.html');
  let file = join(dir, p);
  if (!extname(file) && existsSync(file + '.html')) file += '.html';
  if (!file.startsWith(dir) || !existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404, headers).end('not found');
    return;
  }
  res.writeHead(200, {
    ...headers,
    'Content-Type': types[extname(file)] ?? 'application/octet-stream',
  });
  res.end(readFileSync(file));
}).listen(port, '127.0.0.1', () => console.log(`serving ${dir} on http://127.0.0.1:${port}`));
