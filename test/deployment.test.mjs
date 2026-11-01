import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { encodeAbiParameters, parseAbiParameters } from 'viem';
import {
  acquireDeploymentLock,
  releaseDeploymentLock,
  assertCreation,
  assertRuntimeMatches,
} from '../scripts/deployment-safety.mjs';

const tempRoot = join(import.meta.dirname, '../.e2e/deployment-tests');
mkdirSync(tempRoot, { recursive: true });
const dir = () => mkdtempSync(join(tempRoot, 'attempt-'));

test('deployment lock rejects concurrent/repeated attempts and preserves interrupted work', () => {
  const root = dir();
  acquireDeploymentLock(root, { chainId: 1 });
  assert.throws(() => acquireDeploymentLock(root, { chainId: 1 }), /locked/);
  releaseDeploymentLock(root);
  acquireDeploymentLock(root, { chainId: 1 });
  releaseDeploymentLock(root);
  const stage = join(root, '.pending-existing');
  mkdirSync(stage);
  writeFileSync(join(stage, '1.json'), JSON.stringify({ protocol: 'dm-offline-v1' }));
  assert.throws(() => acquireDeploymentLock(root, {}), /Unresolved/);
  assert.throws(() => acquireDeploymentLock(root, {}), /locked/);
});

test('runtime verification ignores only compiler-declared immutable slots', () => {
  const artifact = JSON.parse(
    readFileSync(new URL('../out/Offline.sol/Offline.json', import.meta.url)),
  );
  const chars = artifact.deployedBytecode.object.split('');
  for (const refs of Object.values(artifact.deployedBytecode.immutableReferences)) {
    for (const { start, length } of refs) chars.fill('a', 2 + start * 2, 2 + (start + length) * 2);
  }
  assertRuntimeMatches(chars.join(''), artifact);
  assert.throws(() => assertRuntimeMatches('0x', artifact), /size/);
  chars[2] = chars[2] === '0' ? '1' : '0';
  assert.throws(() => assertRuntimeMatches(chars.join(''), artifact), /differs/);
});

test('recovery rejects a different creator, chain, constructor, value or failed transaction', () => {
  const artifact = JSON.parse(
    readFileSync(new URL('../out/Offline.sol/Offline.json', import.meta.url)),
  );
  const cfg = JSON.parse(readFileSync(new URL('../config.json', import.meta.url)));
  const args = encodeAbiParameters(parseAbiParameters('address,address,address'), [
    cfg.stockereum.hook,
    cfg.weth,
    cfg.admin,
  ]);
  const tx = {
    from: cfg.admin,
    to: null,
    value: 0n,
    chainId: 1,
    input: artifact.bytecode.object + args.slice(2),
  };
  const receipt = {
    status: 'success',
    contractAddress: '0x1111111111111111111111111111111111111111',
  };
  assertCreation(tx, receipt, cfg, artifact);
  assert.throws(() => assertCreation(tx, receipt, cfg, artifact, cfg.admin));
  for (const change of [
    { from: cfg.weth },
    { chainId: 97 },
    { to: cfg.admin },
    { value: 1n },
    { input: tx.input.slice(0, -2) + 'ff' },
  ]) {
    assert.throws(() => assertCreation({ ...tx, ...change }, receipt, cfg, artifact));
  }
  assert.throws(() => assertCreation(tx, { ...receipt, status: 'reverted' }, cfg, artifact));
});
