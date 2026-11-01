// Read public chain data and restore a manifest. Never signs or broadcasts.
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { cfg, depDir, root, client, loadJson, checks } from './checks.mjs';
import {
  assertCreation,
  assertRuntimeMatches,
  releaseDeploymentLock,
} from './deployment-safety.mjs';

try {
  const args = process.argv.slice(2).filter((x) => x !== '--');
  if (args.length !== 1 || !/^0x[0-9a-fA-F]{64}$/.test(args[0]))
    throw new Error('Provide one deployment transaction hash.');
  if (existsSync(join(depDir, `${cfg.chainId}.json`)))
    throw new Error('A published manifest already exists; verify it instead.');
  if (await checks()) throw new Error('Read-only preflight failed.');
  const hash = args[0];
  const receipt = await client.getTransactionReceipt({ hash });
  const tx = await client.getTransaction({ hash });
  const artifact = loadJson(join(root, 'out/Offline.sol/Offline.json'));
  assertCreation(tx, receipt, cfg, artifact);
  assertRuntimeMatches(await client.getCode({ address: receipt.contractAddress }), artifact);
  const dep = {
    protocol: 'dm-offline-v1',
    chainId: cfg.chainId,
    startBlock: Number(receipt.blockNumber),
    admin: cfg.admin,
    offline: receipt.contractAddress,
    deploymentTx: hash,
  };
  mkdirSync(depDir, { recursive: true });
  writeFileSync(join(depDir, `${cfg.chainId}.json`), JSON.stringify(dep, null, 2) + '\n', {
    flag: 'wx',
  });
  if (await checks({ deployment: true }))
    throw new Error('Manifest restored but post-deployment checks failed.');
  releaseDeploymentLock(depDir);
  console.log(
    'PASS recovered the existing deployment. No transaction sent. Complete Etherscan verification before launch.',
  );
} catch {
  console.error(
    'Recovery refused or verification failed. Nothing broadcast. Inspect transaction/build/manifest before retrying; endpoint details withheld.',
  );
  process.exitCode = 1;
}
