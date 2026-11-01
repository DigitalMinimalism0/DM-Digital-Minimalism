import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
  rmdirSync,
} from 'node:fs';
import { join } from 'node:path';
import { encodeAbiParameters, parseAbiParameters } from 'viem';

export const lockPath = (dir) => join(dir, '.pending-offline-lock');
export function acquireDeploymentLock(dir, attempt) {
  mkdirSync(dir, { recursive: true });
  // Atomic mkdir prevents two terminals from both passing the manifest check.
  const lock = lockPath(dir);
  try {
    mkdirSync(lock);
  } catch {
    throw new Error('Deployment locked. Reconcile the earlier attempt before retrying.');
  }
  // Keep the lock even on RPC, signer, broadcast or verification failure.
  writeFileSync(join(lock, 'attempt.json'), JSON.stringify(attempt, null, 2) + '\n', {
    flag: 'wx',
  });
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (
      !entry.isDirectory() ||
      !entry.name.startsWith('.pending-') ||
      entry.name === '.pending-offline-lock'
    )
      continue;
    const file = join(dir, entry.name, '1.json');
    if (!existsSync(file)) continue;
    const staged = JSON.parse(readFileSync(file, 'utf8'));
    if (staged.protocol === 'dm-offline-v1')
      throw new Error(
        'Unresolved Offline manifest. Recover the previous deployment before retrying.',
      );
  }
  return lock;
}
export function releaseDeploymentLock(dir) {
  const lock = lockPath(dir);
  if (!existsSync(lock)) return;
  const file = join(lock, 'attempt.json');
  if (existsSync(file)) unlinkSync(file);
  rmdirSync(lock); // Refuse to remove a lock containing any unexpected files.
}
export function assertRuntimeMatches(code, artifact) {
  const expected = artifact.deployedBytecode.object.slice(2).toLowerCase().split('');
  const actual = (code ?? '').slice(2).toLowerCase().split('');
  if (expected.length === 0 || actual.length !== expected.length)
    throw new Error('Runtime size mismatch.');
  for (const references of Object.values(artifact.deployedBytecode.immutableReferences)) {
    for (const { start, length } of references) {
      expected.fill('0', start * 2, (start + length) * 2);
      actual.fill('0', start * 2, (start + length) * 2);
    }
  }
  if (actual.join('') !== expected.join(''))
    throw new Error('Runtime differs from the locally compiled contract.');
}
export function assertCreation(
  tx,
  receipt,
  cfg,
  artifact,
  expectedAddress = receipt.contractAddress,
) {
  if (
    receipt.status !== 'success' ||
    !receipt.contractAddress ||
    tx.to !== null ||
    tx.from.toLowerCase() !== cfg.admin.toLowerCase() ||
    receipt.contractAddress.toLowerCase() !== expectedAddress?.toLowerCase() ||
    tx.value !== 0n ||
    tx.chainId !== cfg.chainId
  ) {
    throw new Error('Not a successful direct deployment by the configured creator.');
  }
  const args = encodeAbiParameters(parseAbiParameters('address,address,address'), [
    cfg.stockereum.hook,
    cfg.weth,
    cfg.admin,
  ]);
  if (tx.input.toLowerCase() !== (artifact.bytecode.object + args.slice(2)).toLowerCase()) {
    throw new Error('Creation bytecode or constructor arguments differ from the reviewed build.');
  }
}
