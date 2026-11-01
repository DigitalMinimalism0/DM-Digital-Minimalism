import {
  readFileSync,
  writeFileSync,
  existsSync,
  rmSync,
  mkdirSync,
  cpSync,
  readdirSync,
} from 'node:fs';
import { resolve, join, relative, isAbsolute } from 'node:path';
import { build } from 'esbuild';
import { looksKeyed } from './keyed.mjs';
const root = resolve(import.meta.dirname, '..');
const out = resolve(process.argv[2] ?? join(root, 'dist'));
const rel = relative(root, out);
if (
  !rel ||
  rel.startsWith('..') ||
  isAbsolute(rel) ||
  ['web', 'contracts', 'scripts', 'core', 'lib', 'node_modules'].includes(rel.split(/[\\/]/)[0])
)
  throw new Error('Build output must be a dedicated directory inside this checkout.');
const cfg = JSON.parse(
  readFileSync(process.env.DM_CONFIG ?? join(root, 'config.json'), 'utf8').replace(/^\uFEFF/, ''),
);
const file = join(process.env.DM_DEPLOYMENTS ?? join(root, 'deployments'), `${cfg.chainId}.json`);
const dep = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
if (
  dep &&
  (dep.protocol !== 'dm-offline-v1' ||
    dep.chainId !== cfg.chainId ||
    !/^0x[0-9a-fA-F]{40}$/.test(dep.offline))
)
  throw new Error(
    'Deployment is not a matching DM Offline deployment. Legacy addresses are refused.',
  );
if (looksKeyed(cfg.rpc)) throw new Error('The browser requires a keyless public RPC.');
const vercel = JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8').replace(/^\uFEFF/, ''));
const csp = vercel.headers[0].headers.find((h) => h.key === 'Content-Security-Policy').value;
if (!process.env.DM_LOCAL_BUILD && !csp.includes(new URL(cfg.rpc).origin))
  throw new Error('CSP does not allow the public RPC.');
const publicCfg = {
  chainId: cfg.chainId,
  rpc: cfg.rpc,
  weth: cfg.weth,
  admin: cfg.admin,
  brand: cfg.brand,
  stockereum: cfg.stockereum,
  explorer: cfg.explorer,
  links: cfg.links,
};
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
for (const name of [
  'index.html',
  'style.css',
  'favicon.svg',
  'whitepaper.html',
  'robots.txt',
  'fonts',
  'images',
])
  cpSync(join(root, 'web', name), join(out, name), { recursive: true });
writeFileSync(
  join(out, 'admin.html'),
  readFileSync(join(root, 'web/index.html'), 'utf8').replace(
    '<head>',
    '<head><meta name="robots" content="noindex,nofollow">',
  ),
);
const generated = `export const cfg=${JSON.stringify(publicCfg)};export const dep=${JSON.stringify(dep)};`;
await build({
  entryPoints: [join(root, 'web/app.js')],
  bundle: true,
  format: 'esm',
  target: ['es2022'],
  minify: true,
  outfile: join(out, 'app.js'),
  plugins: [
    {
      name: 'public-config',
      setup(b) {
        b.onResolve({ filter: /site-config\.js$/ }, () => ({
          path: 'site-config',
          namespace: 'generated',
        }));
        b.onLoad({ filter: /.*/, namespace: 'generated' }, () => ({
          contents: generated,
          loader: 'js',
        }));
      },
    },
  ],
});
for (const f of readdirSync(out, { recursive: true, withFileTypes: true })) {
  if (!f.isFile() || !/\.(js|json|html|css|txt|svg)$/.test(f.name)) continue;
  const text = readFileSync(join(f.parentPath ?? f.path, f.name), 'utf8');
  for (const [url] of text.matchAll(/https?:\/\/[^\s"'`)<>\\]+/g))
    if (looksKeyed(url)) throw new Error('A keyed URL was detected in build output: ' + f.name);
}
console.log(
  `Built ${relative(root, out)} · ${dep ? 'DM contract connected' : 'honest pre-launch state'} · no CLI distribution`,
);
