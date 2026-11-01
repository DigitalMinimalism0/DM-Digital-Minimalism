import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const files = execFileSync(
  'git',
  ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
  { cwd: root, encoding: 'utf8' },
)
  .split('\0')
  .filter(Boolean);
const problems = [];
const denied =
  /(^|\/)(?:\.env[^/]*|\.claude|\.vercel|\.e2e|broadcast|node_modules|\.anchor)(\/|$)|keypair.*\.json$/i;
const signatures = [
  /-----BEGIN (?:EC |RSA |OPENSSH )?PRIVATE KEY-----/,
  /\b(?:PRIVATE_KEY|DEPLOY_PRIVATE_KEY|ETH_PRIVATE_KEY)\s*=\s*["']?(?:0x)?[0-9a-f]{64}\b/i,
  /\bgh[pousr]_[A-Za-z0-9]{30,}\b/,
  /\b(?:xox[baprs]-)[A-Za-z0-9-]{20,}/,
];
for (const file of files) {
  const path = join(root, file);
  if (!existsSync(path) || !statSync(path).isFile()) continue;
  if (denied.test(file)) {
    problems.push(file + ': excluded local file');
    continue;
  }
  if (!/\.(?:md|mjs|js|json|sol|toml|yml|yaml|ps1|html|css|svg)$/.test(file)) continue;
  const content = readFileSync(path, 'utf8');
  if (signatures.some((re) => re.test(content)))
    problems.push(file + ': credential-shaped content');
}
if (problems.length) {
  console.error('Publication check failed (values withheld):\n' + problems.join('\n'));
  process.exit(1);
}
console.log(
  `PASS publication scan: ${files.length} candidate paths; no excluded local files or credential signatures. This is a heuristic check, not a security audit.`,
);
