import { readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createPublicClient, http, parseAbi, isAddress, formatEther } from 'viem';
import { offlineAbi, ZERO } from '../core/offline.js';
import { assertCreation, assertRuntimeMatches } from './deployment-safety.mjs';
export const root = resolve(import.meta.dirname, '..');
export const loadJson = (file) => JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
export const cfg = loadJson(process.env.DM_CONFIG ?? join(root, 'config.json'));
export const depDir = resolve(process.env.DM_DEPLOYMENTS ?? join(root, 'deployments'));
export const rpc = process.env.MAINNET_RPC_URL ?? cfg.rpc;
export const client = createPublicClient({
  transport: http(rpc, { retryCount: 2, timeout: 20000 }),
});
export async function checks({ deployment = false, requireSigner = false } = {}) {
  let failed = 0;
  const report = (ok, name, detail = '') => {
    if (!ok) failed++;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' · ' + detail : ''}`);
  };
  report(cfg.chainId === 1, 'Ethereum mainnet configuration');
  report(isAddress(cfg.admin) && cfg.admin !== ZERO, 'new creator configured', cfg.admin);
  report(cfg.token === ZERO, 'launch-last configuration');
  report(
    !['PRIVATE_KEY', 'ETH_PRIVATE_KEY', 'DEPLOY_PRIVATE_KEY'].some((k) => process.env[k]),
    'no plaintext signer key',
  );
  if (requireSigner) {
    report(
      !!process.env.DEPLOY_ACCOUNT !== !!process.env.DEPLOY_LEDGER,
      'exactly one local signer',
    );
    report(!!process.env.ETHERSCAN_API_KEY, 'Etherscan verification credential configured');
  }
  try {
    report((await client.getChainId()) === cfg.chainId, 'RPC chain matches');
    const abi = parseAbi([
      'function factory() view returns(address)',
      'function hook() view returns(address)',
      'function escrow() view returns(address)',
      'function weth() view returns(address)',
      'function platformFeeFor(uint24) view returns(uint24)',
      'function TICK_SPACING() view returns(int24)',
    ]);
    for (const [name, a] of Object.entries({ ...cfg.stockereum, weth: cfg.weth }).filter(([, a]) =>
      isAddress(a),
    ))
      report(!!(await client.getCode({ address: a })), 'code exists: ' + name);
    for (const [a, f, expected] of [
      [cfg.stockereum.hook, 'factory', cfg.stockereum.factory],
      [cfg.stockereum.factory, 'hook', cfg.stockereum.hook],
      [cfg.stockereum.hook, 'escrow', cfg.stockereum.escrow],
      [cfg.stockereum.escrow, 'hook', cfg.stockereum.hook],
      [cfg.stockereum.factory, 'weth', cfg.weth],
    ]) {
      const actual = await client.readContract({ address: a, abi, functionName: f });
      report(actual.toLowerCase() === expected.toLowerCase(), 'platform relationship: ' + f);
    }
    report(
      (await client.readContract({
        address: cfg.stockereum.hook,
        abi,
        functionName: 'platformFeeFor',
        args: [30000],
      })) === 10000,
      '3% launch splits 1% platform / 2% creator',
    );
    report(
      (await client.readContract({
        address: cfg.stockereum.factory,
        abi,
        functionName: 'TICK_SPACING',
      })) === 200,
      'pool tick spacing 200',
    );
    const balance = await client.getBalance({ address: cfg.admin });
    console.log('INFO creator ETH balance: ' + formatEther(balance));
    if (requireSigner) report(balance > 0n, 'creator has ETH for deployment gas');
    if (deployment) {
      const file = join(depDir, `${cfg.chainId}.json`);
      report(existsSync(file), 'deployment manifest exists');
      if (existsSync(file)) {
        const dep = loadJson(file);
        report(dep.protocol === 'dm-offline-v1', 'new protocol manifest');
        report(
          dep.chainId === cfg.chainId && dep.admin?.toLowerCase() === cfg.admin.toLowerCase(),
          'manifest chain and original creator',
        );
        const artifact = loadJson(join(root, 'out/Offline.sol/Offline.json'));
        const receipt = await client.getTransactionReceipt({ hash: dep.deploymentTx });
        const tx = await client.getTransaction({ hash: dep.deploymentTx });
        assertCreation(tx, receipt, cfg, artifact, dep.offline);
        assertRuntimeMatches(await client.getCode({ address: dep.offline }), artifact);
        report(
          true,
          'creation transaction, constructor arguments and runtime match the local build',
        );
        for (const [f, expected] of [
          ['expectedCreator', cfg.admin],
          ['stockereumHook', cfg.stockereum.hook],
          ['weth', cfg.weth],
        ])
          report(
            (
              await client.readContract({ address: dep.offline, abi: offlineAbi, functionName: f })
            ).toLowerCase() === expected.toLowerCase(),
            'Offline ' + f,
          );
        const token = await client.readContract({
          address: dep.offline,
          abi: offlineAbi,
          functionName: 'token',
        });
        console.log(
          token === ZERO
            ? 'PENDING token launch and one-time binding'
            : 'PASS bound token ' + token,
        );
      }
    }
  } catch {
    report(false, 'RPC or contract verification failed; endpoint details withheld');
  }
  return failed;
}
