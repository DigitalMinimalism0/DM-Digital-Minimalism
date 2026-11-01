import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawn, execFileSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';
import { createPublicClient, createWalletClient, http, parseEther, parseAbi } from 'viem';
import { chromium } from 'playwright-core';
import { offlineAbi } from '../core/offline.js';
const root = resolve(import.meta.dirname, '..'),
  dir = join(root, '.e2e', 'dm');
mkdirSync(dir, { recursive: true });
const rpc = 'http://127.0.0.1:18555',
  origin = 'http://127.0.0.1:4185';
const childEnv = { ...process.env };
const anvil = spawn('anvil', ['--port', '18555', '--chain-id', '31337', '--silent'], {
  cwd: root,
  stdio: 'ignore',
  windowsHide: true,
});
let server, browser, page;
const wait = async (fn) => {
  for (let n = 0; n < 100; n++) {
    try {
      return await fn();
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  throw new Error('Local test service did not start.');
};
const artifact = (name) =>
  JSON.parse(readFileSync(join(root, 'out', name + '.sol', name + '.json'), 'utf8'));
const mocks = (name) =>
  JSON.parse(readFileSync(join(root, 'out', 'Offline.t.sol', name + '.json'), 'utf8'));
try {
  const publicClient = createPublicClient({ transport: http(rpc) });
  await wait(() => publicClient.getChainId());
  const accounts = await publicClient.request({ method: 'eth_accounts' }),
    admin = accounts[0],
    user = accounts[1];
  const wallet = createWalletClient({ account: admin, transport: http(rpc) });
  async function deploy(a, args = []) {
    const hash = await wallet.deployContract({
      abi: a.abi,
      bytecode: a.bytecode.object,
      args,
      chain: null,
    });
    return (await publicClient.waitForTransactionReceipt({ hash })).contractAddress;
  }
  async function write(address, abi, functionName, args = [], value = 0n) {
    const hash = await wallet.writeContract({
      address,
      abi,
      functionName,
      args,
      value,
      chain: null,
    });
    return publicClient.waitForTransactionReceipt({ hash });
  }
  const hook = await deploy(mocks('MockHook')),
    weth = await deploy(mocks('MockWeth'));
  const escrow = await deploy(mocks('MockEscrow'));
  const offline = await deploy(artifact('Offline'), [hook, weth, admin]);
  const factory = await publicClient.readContract({
    address: hook,
    abi: mocks('MockHook').abi,
    functionName: 'factory',
  });
  const token = await deploy(mocks('MockToken'), [factory, admin]);
  await write(hook, mocks('MockHook').abi, 'configure', [token, weth, admin, 30000, false]);
  await write(token, mocks('MockToken').abi, 'mint', [user, parseEther('1000')]);
  const cfg = JSON.parse(readFileSync(join(root, 'config.json'), 'utf8'));
  Object.assign(cfg, { chainId: 31337, admin, rpc, weth });
  cfg.stockereum = { ...cfg.stockereum, hook, escrow };
  writeFileSync(join(dir, 'config.json'), JSON.stringify(cfg));
  writeFileSync(
    join(dir, '31337.json'),
    JSON.stringify({ protocol: 'dm-offline-v1', chainId: 31337, offline, admin, startBlock: 0 }),
  );
  execFileSync(process.execPath, ['scripts/build-web.mjs', '.e2e/dm/dist'], {
    cwd: root,
    env: {
      ...childEnv,
      DM_CONFIG: join(dir, 'config.json'),
      DM_DEPLOYMENTS: dir,
      DM_LOCAL_BUILD: '1',
    },
    stdio: 'pipe',
  });
  server = spawn(process.execPath, ['scripts/serve.mjs', join(dir, 'dist'), '4185', rpc], {
    cwd: root,
    stdio: 'ignore',
    windowsHide: true,
  });
  await wait(async () => {
    const r = await fetch(origin);
    if (!r.ok) throw new Error();
    return r;
  });
  browser = await chromium.launch({
    channel: process.env.E2E_BROWSER ?? (process.platform === 'win32' ? 'msedge' : 'chromium'),
    headless: true,
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: 'reduce',
  });
  await context.addInitScript(
    ({ rpc, user, admin }) => {
      const handlers = {};
      let selected = user;
      window.ethereum = {
        isMetaMask: true,
        on: (name, fn) => (handlers[name] ??= []).push(fn),
        removeListener: (name, fn) => {
          handlers[name] = (handlers[name] ?? []).filter((f) => f !== fn);
        },
        request: async ({ method, params = [] }) => {
          if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [selected];
          if (method === 'wallet_switchEthereumChain') return null;
          const response = await fetch(rpc, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
          });
          const body = await response.json();
          if (body.error) throw Object.assign(new Error(body.error.message), body.error);
          return body.result;
        },
      };
      window.testSelect = (a) => {
        selected = a;
        for (const fn of handlers.accountsChanged ?? []) fn([a]);
      };
    },
    { rpc, user, admin },
  );
  page = await context.newPage();
  page.setDefaultTimeout(25000);
  page.setDefaultNavigationTimeout(25000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (msg) => {
    if (msg.type() === 'warning' || msg.type() === 'error')
      console.log('BROWSER', msg.text().slice(0, 400));
  });
  await page.goto(origin);
  await page.waitForFunction(() =>
    document.getElementById('protocol-state').textContent.includes('Waiting for the token'),
  );
  assert.equal(await page.locator('#submit-action').isDisabled(), true);
  await page.goto(origin + '/admin');
  await page.locator('[data-connect]').click();
  await page.getByRole('button', { name: 'MetaMask', exact: true }).click();
  await page.evaluate((a) => window.testSelect(a), admin);
  await page.waitForFunction(() => !document.getElementById('admin-controls').hidden);
  await page.locator('#token-address').fill(token);
  await page.locator('#bind-token').click();
  await page.locator('#confirm-transaction').click();
  await page.waitForFunction(() =>
    document.getElementById('binding-status').textContent.includes('Connected permanently'),
  );
  await page.goto(origin + '/#participate');
  await page.locator('[data-connect]').click();
  await page.getByRole('button', { name: 'MetaMask', exact: true }).click();
  await page.waitForFunction(() =>
    document.getElementById('available').textContent.includes('1,000'),
  );
  await page.locator('#amount').fill('100');
  await page.locator('#submit-action').click();
  assert.match(await page.locator('#review-description').textContent(), /100/);
  await page.locator('#confirm-transaction').click();
  await page.waitForFunction(() => document.getElementById('my-deposited').textContent === '100');
  await publicClient.request({ method: 'evm_increaseTime', params: [86400] });
  await publicClient.request({ method: 'evm_mine' });
  await write(weth, mocks('MockWeth').abi, 'deposit', [], parseEther('1'));
  await write(weth, mocks('MockWeth').abi, 'transfer', [escrow, parseEther('1')]);
  await write(escrow, mocks('MockEscrow').abi, 'credit', [admin, weth, parseEther('1')]);
  await page.goto(origin + '/admin');
  await page.locator('[data-connect]').click();
  await page.getByRole('button', { name: 'MetaMask', exact: true }).click();
  await page.evaluate((a) => window.testSelect(a), admin);
  await page.waitForFunction(
    () => document.getElementById('creator-fees').textContent === '1 WETH',
  );
  await page.locator('#claim-fees').click();
  await page.locator('#confirm-transaction').click();
  await page.waitForFunction(
    () => document.getElementById('creator-weth').textContent === '1 WETH',
  );
  await page.locator('#unwrap-weth').click();
  await page.locator('#confirm-transaction').click();
  await page.waitForFunction(
    () => document.getElementById('creator-weth').textContent === '0 WETH',
  );
  await page.locator('#fund-amount').fill('1');
  await page.locator('#fund-form button').click();
  await page.locator('#confirm-transaction').click();
  await page.waitForFunction(() =>
    document.getElementById('transaction-status').textContent.includes('Confirmed'),
  );
  assert.equal(
    await publicClient.readContract({
      address: offline,
      abi: offlineAbi,
      functionName: 'totalFunded',
    }),
    parseEther('1'),
  );
  console.log('PASS creator fee claim, WETH unwrap and ETH funding through administrator UI');
  await page.goto(origin + '/#participate');
  await page.locator('[data-connect]').click();
  await page.getByRole('button', { name: 'MetaMask', exact: true }).click();
  await page.waitForFunction(
    () =>
      document.getElementById('my-reward').textContent !== '—' &&
      document.getElementById('my-reward').textContent !== '0',
  );
  await page.locator('#refresh-leaderboard').click();
  await page.waitForSelector('#leaderboard-rows tr');
  assert.equal(await page.locator('#leaderboard-rows tr').count(), 1);
  assert.match(await page.locator('#my-rank').textContent(), /1 of 1/);
  await page.locator('#participate').screenshot({ path: join(dir, 'participation.png') });
  await page.locator('#home').screenshot({ path: join(dir, 'hero.png') });
  await page.screenshot({ path: join(dir, 'desktop.png'), fullPage: true });
  console.log('PASS deposit, weighted funding and leaderboard');
  const before = await publicClient.readContract({
    address: offline,
    abi: offlineAbi,
    functionName: 'account',
    args: [user],
  });
  await page.locator('#claim-reward').click();
  await page.locator('#confirm-transaction').click();
  await page.waitForFunction(() => document.getElementById('my-reward').textContent === '0');
  console.log('PASS ETH collection');
  const after = await publicClient.readContract({
    address: offline,
    abi: offlineAbi,
    functionName: 'account',
    args: [user],
  });
  assert.ok(after[1] >= before[1]);
  assert.ok(after[3] > 0n);
  await page.locator('#tab-withdraw').click();
  await page.locator('#max-amount').click();
  await page.locator('#submit-action').click();
  await page.locator('#confirm-transaction').click();
  await page.waitForFunction(() => document.getElementById('my-deposited').textContent === '0');
  assert.equal(
    await publicClient.readContract({
      address: token,
      abi: mocks('MockToken').abi,
      functionName: 'balanceOf',
      args: [user],
    }),
    parseEther('1000'),
  );
  await page.locator('#tab-deposit').click();
  await page.locator('#amount').fill('10');
  await page.locator('#submit-action').click();
  await page.evaluate((a) => window.testSelect(a), admin);
  assert.equal(await page.locator('#transaction-review').isVisible(), false);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(origin);
  await page.waitForFunction(() =>
    document.getElementById('protocol-state').textContent.includes('Offline is open'),
  );
  await page.screenshot({ path: join(dir, 'mobile.png'), fullPage: true });
  assert.ok(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    'No horizontal page overflow',
  );
  await page.setViewportSize({ width: 320, height: 700 });
  assert.ok(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    'No horizontal overflow at 320px',
  );
  await page.goto(origin + '/whitepaper');
  assert.equal(await page.locator('h1').count(), 1);
  assert.deepEqual(errors, []);
  console.log(
    'PASS local browser rehearsal: unbound → admin bind → exact approval → deposit → time-weighted ETH → leaderboard → claim → full withdrawal → account-change cancellation → mobile → paper',
  );
  console.log('Screenshots: .e2e/dm/desktop.png and mobile.png');
} catch (error) {
  if (page) {
    console.error(
      'Browser status:',
      await page
        .locator('#transaction-status')
        .textContent()
        .catch(() => ''),
    );
    await page.screenshot({ path: join(dir, 'failure.png'), fullPage: true }).catch(() => {});
  }
  throw error;
} finally {
  await browser?.close();
  server?.kill();
  anvil.kill();
}
