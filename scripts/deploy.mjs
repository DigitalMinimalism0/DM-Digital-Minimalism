// Run only after the owner reviews the source and deployment settings.
import { mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { root, cfg, depDir, rpc, client, loadJson, checks } from './checks.mjs';
const fail = (message) => {
  console.error(message);
  process.exit(1);
};
if (process.argv.slice(2).length) fail('No overwrite or unsafe deployment flags are supported.');
if (!process.env.MAINNET_RPC_URL) fail('Configure MAINNET_RPC_URL locally.');
if (await checks({ requireSigner: true })) fail('Preflight failed. Nothing broadcast.');
const file = join(depDir, `${cfg.chainId}.json`);
if (existsSync(file)) fail('Deployment already exists. Inspect it; do not deploy again.');
const run = (cmd, args, env = process.env) => {
  const r = spawnSync(cmd, args, { cwd: root, env, stdio: 'inherit', windowsHide: true });
  if (r.status !== 0)
    fail('Command failed. If broadcast started, inspect broadcast/ before retrying.');
};
const signer = process.env.DEPLOY_ACCOUNT
  ? ['--account', process.env.DEPLOY_ACCOUNT]
  : [
      '--ledger',
      ...(process.env.DEPLOY_HD_PATH
        ? ['--mnemonic-derivation-path', process.env.DEPLOY_HD_PATH]
        : []),
    ];
const addr = spawnSync('cast', ['wallet', 'address', ...signer], {
  cwd: root,
  stdio: ['inherit', 'pipe', 'inherit'],
  encoding: 'utf8',
  windowsHide: true,
});
const addresses = addr.stdout?.match(/0x[0-9a-fA-F]{40}/g) ?? [];
if (addr.status !== 0 || addresses.at(-1)?.toLowerCase() !== cfg.admin.toLowerCase())
  fail('Signer is not the configured new creator. Nothing broadcast.');
run('forge', ['build', '--sizes']);
mkdirSync(depDir, { recursive: true });
const staging = join(depDir, '.pending-' + randomUUID());
mkdirSync(staging);
const env = {
  ...process.env,
  DM_DEPLOY_RPC: rpc,
  DM_DEPLOYMENTS: staging,
  DM_CONFIG: process.env.DM_CONFIG ?? join(root, 'config.json'),
};
console.log('Owner-authorized mainnet deployment. Creator: ' + cfg.admin);
run(
  'forge',
  [
    'script',
    'contracts/script/Deploy.s.sol:Deploy',
    '--rpc-url',
    'deploy',
    '--sender',
    cfg.admin,
    ...signer,
    '--broadcast',
    '--slow',
    '--verify',
    '--retries',
    '10',
    '--delay',
    '10',
  ],
  env,
);
const dep = loadJson(join(staging, `${cfg.chainId}.json`));
if (!(await client.getCode({ address: dep.offline })))
  fail('No confirmed code. Manifest remains staged.');
writeFileSync(file, JSON.stringify(dep, null, 2) + '\n', { flag: 'wx' });
if (await checks({ deployment: true }))
  fail('Deployed, but post-deployment checks failed. Do not redeploy blindly.');
console.log(
  'Next: commit the deployment manifest, rebuild/publish the website, verify /admin, then launch the token LAST.',
);
