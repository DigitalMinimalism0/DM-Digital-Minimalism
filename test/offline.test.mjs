import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeFunctionData, decodeFunctionResult, getAbiItem, toFunctionSelector } from 'viem';
import { execFileSync } from 'node:child_process';
import { rankAccounts, describeError, offlineAbi } from '../core/offline.js';
import { looksKeyed } from '../scripts/keyed.mjs';

test('leaderboard uses earned = collected + claimable with deterministic ties', () => {
  const rows = [
    { address: '0x02', claimable: 3n, claimed: 5n },
    { address: '0x01', claimable: 0n, claimed: 8n },
    { address: '0x03', claimable: 1n, claimed: 0n },
  ];
  assert.deepEqual(
    rankAccounts(rows).map((r) => r.address),
    ['0x01', '0x02', '0x03'],
  );
  assert.equal(rows[0].address, '0x02');
});
test('cancellation and rejected ETH recipients are explained without losing rewards', () => {
  assert.match(describeError({ code: 4001 }), /cancelled/);
  assert.match(
    describeError({ message: 'execution reverted: EthTransferFailed' }),
    /reward remains yours/,
  );
  assert.match(describeError({ message: 'NoEligibleDeposits' }), /No ETH was accepted/);
});
test('keyed RPC endpoints are refused while public source links remain valid', () => {
  assert.equal(looksKeyed('https://eth-mainnet.g.alchemy.com/v2/12345678901234567890'), true);
  assert.equal(looksKeyed('https://rpc.example.com/?key=hidden'), true);
  assert.equal(looksKeyed('https://ethereum-rpc.publicnode.com'), false);
  assert.equal(looksKeyed('https://github.com/DigitalMinimalism0/DM-Digital-Minimalism'), false);
});
test('browser ABI method selectors match the compiled Solidity artifact', () => {
  const methods = JSON.parse(
    execFileSync('forge', ['inspect', 'Offline', 'methodIdentifiers', '--json'], {
      encoding: 'utf8',
      windowsHide: true,
    }),
  );
  for (const item of offlineAbi.filter((i) => i.type === 'function')) {
    const signature = `${item.name}(${item.inputs.map((i) => i.type).join(',')})`;
    assert.equal(toFunctionSelector(signature).slice(2), methods[signature], signature);
  }
});
