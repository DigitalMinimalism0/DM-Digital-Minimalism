import {
  createPublicClient,
  createWalletClient,
  http,
  custom,
  parseEther,
  formatEther,
  parseUnits,
  formatUnits,
  isAddress,
  getAddress,
} from 'viem';
import { mainnet } from 'viem/chains';
import {
  offlineAbi,
  tokenAbi,
  escrowAbi,
  ZERO,
  rankAccounts,
  describeError,
} from '../core/offline.js';
import { cfg, dep } from './site-config.js';
const $ = (id) => document.getElementById(id);
$('action-form').noValidate = true;
const chain = {
  ...mainnet,
  id: cfg.chainId,
  name: cfg.chainId === 1 ? 'Ethereum' : 'Local rehearsal',
};
const client = createPublicClient({
  chain,
  transport: http(cfg.rpc, { batch: { batchSize: 40, wait: 20 }, retryCount: 2, timeout: 15000 }),
});
const deployed =
  dep?.protocol === 'dm-offline-v1' && isAddress(dep.offline) && dep.offline !== ZERO;
const wallets = new Map();
let provider,
  wallet,
  address,
  token = ZERO,
  currentAdmin,
  pendingAdmin,
  liveReady = false,
  paused = false,
  balance = 0n;
let position = [0n, 0n, 0n, 0n, 0n],
  mode = 'deposit',
  busy = false,
  review,
  generation = 0;
let refreshVersion = 0,
  boardVersion = 0,
  ranked = [],
  visibleRows = 20,
  fees = 0n,
  walletWeth = 0n,
  poolWeth = 0n,
  fundedTotal = 0n;
let providerHandlers;
const adminPage = /^\/admin(?:\.html)?\/?$/.test(location.pathname) || location.hash === '#admin';
const short = (a) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const same = (a, b) => a?.toLowerCase() === b?.toLowerCase();
const number = (n, decimals = 18, digits = 5) => {
  const raw = formatUnits(n, decimals),
    [whole, frac = ''] = raw.split('.');
  if (n > 0n && Number(raw) < 10 ** -digits) return `<${(10 ** -digits).toFixed(digits)}`;
  return (
    Number(whole).toLocaleString('en-US') +
    (frac.slice(0, digits).replace(/0+$/, '') ? '.' + frac.slice(0, digits).replace(/0+$/, '') : '')
  );
};
const say = (message) => {
  $('transaction-status').textContent = message;
};
const read = (functionName, args = [], blockNumber) =>
  client.readContract({ address: dep.offline, abi: offlineAbi, functionName, args, blockNumber });
const erc = (target, functionName, args = [], blockNumber) =>
  client.readContract({ address: target, abi: tokenAbi, functionName, args, blockNumber });
const guarded = (fn) => async (event) => {
  event?.preventDefault();
  try {
    await fn(event);
  } catch (error) {
    console.warn('DM action:', error.shortMessage ?? error.message);
    say(describeError(error));
  }
};

if (adminPage) {
  document.body.classList.add('admin-mode');
  $('admin').hidden = false;
  $('admin-review-home').append(
    $('transaction-review'),
    $('transaction-status'),
    $('transaction-link'),
  );
  document.title = 'DM · Administration';
  for (const a of document.querySelectorAll('header nav a[href^="#"]'))
    a.href = '/' + a.getAttribute('href');
}
for (const a of document.querySelectorAll('[data-github]')) a.href = cfg.links.github;
if (cfg.links.twitter)
  for (const a of document.querySelectorAll('[data-twitter]')) {
    a.href = cfg.links.twitter;
    a.hidden = false;
  }
$('network-label').textContent = chain.name;
function addWallet(detail) {
  if (!detail?.provider?.request || !detail?.info?.uuid) return;
  wallets.set(detail.info.uuid, detail);
}
window.addEventListener('eip6963:announceProvider', (e) => addWallet(e.detail));
window.dispatchEvent(new Event('eip6963:requestProvider'));
function openWallets() {
  window.dispatchEvent(new Event('eip6963:requestProvider'));
  if (!wallets.size && window.ethereum) {
    const providers = window.ethereum.providers ?? [window.ethereum];
    providers.forEach((p, i) =>
      addWallet({
        provider: p,
        info: {
          uuid: `injected-${i}`,
          name: p.isMetaMask
            ? 'MetaMask'
            : p.isCoinbaseWallet
              ? 'Coinbase Wallet'
              : 'Browser wallet',
        },
      }),
    );
  }
  $('wallet-options').replaceChildren();
  $('wallet-empty').hidden = wallets.size > 0;
  for (const detail of wallets.values()) {
    const button = document.createElement('button');
    button.textContent = String(detail.info.name).slice(0, 60);
    button.addEventListener(
      'click',
      guarded(async () => {
        $('wallet-dialog').close();
        await connect(detail.provider);
      }),
    );
    $('wallet-options').append(button);
  }
  if (address) {
    const button = document.createElement('button');
    button.textContent = 'Disconnect from DM';
    button.onclick = () => {
      disconnect();
      $('wallet-dialog').close();
    };
    $('wallet-options').append(button);
  }
  $('wallet-dialog').showModal();
}
$('close-wallet-dialog').onclick = () => $('wallet-dialog').close();
for (const b of document.querySelectorAll('[data-connect]')) b.onclick = openWallets;
async function connect(selected) {
  const accounts = await selected.request({ method: 'eth_requestAccounts' });
  if (!accounts.length) throw new Error('No wallet account was selected.');
  detachProvider();
  provider = selected;
  address = getAddress(accounts[0]);
  generation++;
  wallet = createWalletClient({ account: address, chain, transport: custom(provider) });
  providerHandlers = {
    accountsChanged: (accounts) => {
      generation++;
      cancelReview();
      if (accounts.length) {
        address = getAddress(accounts[0]);
        wallet = createWalletClient({ account: address, chain, transport: custom(provider) });
      } else {
        address = undefined;
        wallet = undefined;
      }
      position = [0n, 0n, 0n, 0n, 0n];
      balance = 0n;
      paint();
      refresh().catch((e) => say(describeError(e)));
    },
    chainChanged: () => {
      generation++;
      cancelReview();
      paint();
      refresh().catch((e) => say(describeError(e)));
    },
    disconnect: () => disconnect(),
  };
  for (const [event, fn] of Object.entries(providerHandlers)) provider.on?.(event, fn);
  paint();
  await refresh();
}
function detachProvider() {
  if (providerHandlers)
    for (const [event, fn] of Object.entries(providerHandlers))
      provider?.removeListener?.(event, fn);
  providerHandlers = undefined;
}
function disconnect() {
  detachProvider();
  provider = undefined;
  wallet = undefined;
  address = undefined;
  generation++;
  cancelReview();
  position = [0n, 0n, 0n, 0n, 0n];
  balance = 0n;
  paint();
  refresh().catch(() => {});
}
function paint() {
  for (const tab of document.querySelectorAll('[data-tab]')) tab.disabled = busy;
  for (const b of document.querySelectorAll('[data-connect]'))
    b.textContent = address ? short(address) + ' ↗' : 'Connect wallet ↗';
  $('my-deposited').textContent = address ? number(position[0], 18, 3) : '—';
  $('my-reward').textContent = address ? number(position[2], 18, 8) : '—';
  $('available').textContent = address
    ? `${mode === 'deposit' ? 'In your wallet' : 'Available to bring back'}: ${number(mode === 'deposit' ? balance : position[0], 18, 6)} ${cfg.brand.symbol}`
    : 'Connect to see your balance.';
  $('amount-label').textContent =
    mode === 'deposit' ? 'Amount to set aside' : 'Amount to bring back';
  $('amount-note').textContent =
    mode === 'deposit'
      ? 'Added tokens start their own time. Existing tokens keep theirs.'
      : 'No exit fee. Earned ETH stays available to collect. Withdrawn tokens lose their time weight.';
  $('submit-action').textContent = !deployed
    ? 'Awaiting deployment'
    : token === ZERO
      ? 'Awaiting token launch'
      : !address
        ? 'Connect wallet'
        : mode === 'deposit'
          ? 'Review deposit'
          : 'Review withdrawal';
  $('submit-action').disabled =
    busy || !liveReady || !deployed || token === ZERO || (mode === 'deposit' && paused);
  $('claim-reward').disabled = busy || !liveReady || !address || position[2] === 0n;
  $('max-amount').disabled = busy || !address || token === ZERO;
  $('amount').disabled = busy;
  $('age-note').textContent =
    position[0] > 0n
      ? `Average time offline: ${number(position[1] / position[0] / 60n, 0, 0)} minutes. Collecting ETH keeps this time.`
      : 'Your time starts when your deposit is confirmed.';
  $('token-symbol').textContent = cfg.brand.symbol;
  renderLeaderboard();
}
function cancelReview() {
  review = undefined;
  $('transaction-review').hidden = true;
}
function offer(description, detail, action) {
  if (busy) return;
  review = { address, generation, provider, action };
  $('review-description').textContent = description;
  $('review-detail').textContent = detail;
  $('transaction-review').hidden = false;
  $('transaction-link').hidden = true;
  say('');
  $('transaction-review').scrollIntoView({
    block: 'nearest',
    behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
  });
  $('confirm-transaction').focus({ preventScroll: true });
}
$('cancel-transaction').onclick = () => {
  cancelReview();
  say('Cancelled. Nothing was sent.');
};
async function ensureWallet(expectedAddress, expectedGeneration) {
  if (generation !== expectedGeneration || !same(address, expectedAddress))
    throw new Error('The connected account changed. Review this action again.');
  const accounts = await provider.request({ method: 'eth_accounts' });
  if (!same(accounts[0], expectedAddress))
    throw new Error('The selected wallet account changed. Please reconnect.');
  const actual = Number(BigInt(await provider.request({ method: 'eth_chainId' })));
  if (actual !== cfg.chainId) {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: '0x' + cfg.chainId.toString(16) }],
    });
    // Switching deliberately invalidates an old review. The user reviews again on the right network.
    throw new Error('Network changed. Review your action once more on ' + chain.name + '.');
  }
}
async function send(
  target,
  abi,
  functionName,
  args = [],
  value = 0n,
  description = 'transaction',
  context,
) {
  await ensureWallet(context.address, context.generation);
  say(`Review ${description} in your wallet.`);
  const { request } = await client.simulateContract({
    address: target,
    abi,
    functionName,
    args,
    value,
    account: context.address,
  });
  const gas = await client.estimateContractGas({
    address: target,
    abi,
    functionName,
    args,
    value,
    account: context.address,
  });
  request.gas = gas + gas / 5n + 5000n;
  await ensureWallet(context.address, context.generation);
  const hash = await wallet.writeContract(request);
  $('transaction-link').href = `${cfg.explorer}/tx/${hash}`;
  $('transaction-link').hidden = false;
  say(
    `${description[0].toUpperCase() + description.slice(1)} submitted. Waiting for Ethereum confirmation…`,
  );
  const receipt = await client.waitForTransactionReceipt({
    hash,
    confirmations: 1,
    timeout: 180000,
  });
  if (receipt.status !== 'success')
    throw new Error(
      'The transaction reverted. Open your wallet to inspect its receipt before trying again.',
    );
  await ensureWallet(context.address, context.generation);
  return receipt;
}
$('confirm-transaction').onclick = guarded(async () => {
  const current = review;
  if (!current || busy) return;
  busy = true;
  $('confirm-transaction').disabled = true;
  $('cancel-transaction').disabled = true;
  paint();
  try {
    await current.action(current);
    cancelReview();
    say('Confirmed. Your account is up to date.');
    await refresh();
    Promise.allSettled([loadLeaderboard(), loadFunding()]);
  } finally {
    busy = false;
    $('confirm-transaction').disabled = false;
    $('cancel-transaction').disabled = false;
    paint();
  }
});
function selectTab(next) {
  mode = next;
  cancelReview();
  $('amount').value = '';
  $('amount').removeAttribute('aria-invalid');
  for (const tab of document.querySelectorAll('[data-tab]')) {
    const active = tab.dataset.tab === mode;
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
  }
  $('action-form').setAttribute('aria-labelledby', 'tab-' + mode);
  paint();
}
for (const tab of document.querySelectorAll('[data-tab]')) {
  tab.onclick = () => {
    if (!busy) selectTab(tab.dataset.tab);
  };
  tab.onkeydown = (e) => {
    if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
      e.preventDefault();
      if (!busy) {
        selectTab(mode === 'deposit' ? 'withdraw' : 'deposit');
        $('tab-' + mode).focus();
      }
    }
  };
}
$('max-amount').onclick = () => {
  $('amount').value = formatUnits(mode === 'deposit' ? balance : position[0], 18);
};
$('action-form').addEventListener(
  'submit',
  guarded(async () => {
    if (!address) {
      openWallets();
      return;
    }
    if (!deployed || token === ZERO) return;
    let amount;
    try {
      amount = parseUnits($('amount').value.trim(), 18);
      if (amount <= 0n || amount > (mode === 'deposit' ? balance : position[0])) throw new Error();
    } catch {
      $('amount').setAttribute('aria-invalid', 'true');
      $('amount').focus();
      throw new Error('Enter an amount greater than zero and within your available balance.');
    }
    $('amount').removeAttribute('aria-invalid');
    const action = mode;
    offer(
      action === 'deposit'
        ? `Set aside ${formatUnits(amount, 18)} ${cfg.brand.symbol}. No fixed term and no exit fee.`
        : `Bring back ${formatUnits(amount, 18)} ${cfg.brand.symbol}. Your earned ETH stays available.`,
      action === 'deposit'
        ? 'Your wallet may ask for two transactions: approve only this amount, then deposit. Each requires network fees.'
        : 'This removes a proportional part of your time weight. There is no withdrawal penalty.',
      async (context) => {
        if (action === 'deposit') {
          const allowance = await erc(token, 'allowance', [context.address, dep.offline]);
          if (allowance < amount)
            await send(
              token,
              tokenAbi,
              'approve',
              [dep.offline, amount],
              0n,
              'token approval',
              context,
            );
        }
        await send(
          dep.offline,
          offlineAbi,
          action,
          [amount],
          0n,
          action === 'deposit' ? 'offline deposit' : 'token withdrawal',
          context,
        );
        $('amount').value = '';
      },
    );
  }),
);
$('claim-reward').onclick = guarded(async () => {
  if (!address || position[2] === 0n) return;
  const recipient = $('recipient').value.trim() || address;
  if (!isAddress(recipient) || same(recipient, ZERO) || same(recipient, dep.offline))
    throw new Error('Enter a valid ETH receiving address.');
  offer(
    `Collect your available ETH to ${recipient}.`,
    'Your deposit and accumulated time remain unchanged. The final amount is read from the contract when confirmed.',
    (ctx) =>
      send(dep.offline, offlineAbi, 'claim', [getAddress(recipient)], 0n, 'ETH collection', ctx),
  );
});
async function refresh() {
  const version = ++refreshVersion,
    who = address;
  if (!deployed) {
    $('protocol-state').textContent =
      'A little patience. Offline opens after the contract is deployed and the token is launched.';
    $('admin-status').textContent =
      'No DM deployment published yet. Deploy the new Offline contract first.';
    paint();
    renderAddresses();
    return;
  }
  try {
    if ((await client.getChainId()) !== cfg.chainId)
      throw new Error('The public RPC is connected to a different network.');
    const blockNumber = await client.getBlockNumber({ cacheTime: 0 });
    const [bound, admin, pending, isPaused, total, funded, collected] = await Promise.all(
      [
        'token',
        'admin',
        'pendingAdmin',
        'depositsPaused',
        'totalDeposited',
        'totalFunded',
        'totalClaimed',
      ].map((name) => read(name, [], blockNumber)),
    );
    if (version !== refreshVersion) return;
    token = bound;
    currentAdmin = admin;
    pendingAdmin = pending;
    paused = isPaused;
    $('protocol-state').textContent =
      token === ZERO
        ? 'The space is ready. Waiting for the token launch and one-time connection.'
        : paused
          ? 'New deposits are paused. You can still bring tokens back and collect ETH.'
          : 'Offline is open. Take your time; there is no deadline.';
    fundedTotal = funded;
    $('total-deposited').textContent = number(total, 18, 2);
    $('total-funded').textContent = number(funded, 18, 6) + ' ETH';
    $('total-claimed').textContent = number(collected, 18, 6) + ' ETH';
    $('buy-token').hidden = token === ZERO;
    if (token !== ZERO) $('buy-token').href = cfg.stockereum.tradeUrl + token;
    if (who) {
      const [p, b] = await Promise.all([
        read('account', [who], blockNumber),
        token !== ZERO ? erc(token, 'balanceOf', [who], blockNumber) : 0n,
      ]);
      if (version !== refreshVersion || !same(address, who)) return;
      position = p;
      balance = b;
    }
    liveReady = true;
    renderAddresses();
    paint();
    if (adminPage) await refreshAdmin();
  } catch (error) {
    if (version !== refreshVersion) return;
    liveReady = false;
    paint();
    $('protocol-state').textContent =
      'Live data is unavailable. Refresh before making a transaction.';
    say(describeError(error));
    $('admin-controls').hidden = true;
    $('admin-status').textContent = 'Could not verify on-chain permissions. Try refreshing.';
  }
}
function renderAddresses() {
  const target = $('contract-addresses');
  target.replaceChildren();
  for (const [name, a] of [
    ['Network', chain.name],
    ['Offline', deployed ? dep.offline : null],
    ['Token', token !== ZERO ? token : null],
    ['Creator', cfg.admin],
  ]) {
    const row = document.createElement('div');
    row.className = 'address-row';
    const label = document.createElement('span');
    label.textContent = name;
    const code = document.createElement('code');
    code.textContent = a ?? 'Not connected yet';
    row.append(label, code);
    if (a && isAddress(a)) {
      const link = document.createElement('a');
      link.href = `${cfg.explorer}/address/${a}#code`;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = 'Source ↗';
      row.append(link);
    }
    target.append(row);
  }
}
async function batchRead(contracts, blockNumber) {
  return client.multicall({
    contracts,
    blockNumber,
    allowFailure: false,
    deployless: cfg.chainId !== 1,
  });
}
async function loadLeaderboard() {
  if (!deployed || token === ZERO) return;
  const version = ++boardVersion;
  $('refresh-leaderboard').disabled = true;
  try {
    const blockNumber = await client.getBlockNumber({ cacheTime: 0 });
    const count = Number(await read('participantCount', [], blockNumber));
    let rows = [];
    for (let start = 0; start < count; start += 80) {
      if (version !== boardVersion) return;
      $('leaderboard-state').hidden = false;
      $('leaderboard-state').textContent =
        `Reading ${Math.min(start + 80, count)} of ${count} wallets…`;
      const addresses = await batchRead(
        Array.from({ length: Math.min(80, count - start) }, (_, i) => ({
          address: dep.offline,
          abi: offlineAbi,
          functionName: 'participants',
          args: [BigInt(start + i)],
        })),
        blockNumber,
      );
      const values = await batchRead(
        addresses.map((a) => ({
          address: dep.offline,
          abi: offlineAbi,
          functionName: 'account',
          args: [a],
        })),
        blockNumber,
      );
      rows.push(
        ...addresses.map((a, i) => ({
          address: a,
          amount: values[i][0],
          claimable: values[i][2],
          claimed: values[i][3],
        })),
      );
    }
    if (version !== boardVersion) return;
    ranked = rankAccounts(rows);
    visibleRows = 20;
    if (!count) {
      $('leaderboard-rows').replaceChildren();
      $('leaderboard-state').hidden = false;
      $('leaderboard-state').textContent =
        'No one has gone offline yet. The first deposit will appear here.';
      $('my-rank').textContent = '';
      $('more-leaderboard').hidden = true;
    }
    renderLeaderboard();
    $('leaderboard-block').textContent =
      `All ${count} participating wallets · Ethereum block ${blockNumber.toLocaleString()} · one consistent snapshot.`;
  } catch {
    if (version === boardVersion) {
      $('leaderboard-state').hidden = false;
      $('leaderboard-state').textContent =
        'The full leaderboard could not be read. Please refresh. No partial ranking is shown.';
      $('leaderboard-rows').replaceChildren();
    }
  } finally {
    if (version === boardVersion) $('refresh-leaderboard').disabled = false;
  }
}
function renderLeaderboard() {
  if (!ranked.length) return;
  const body = $('leaderboard-rows');
  body.replaceChildren();
  ranked.slice(0, visibleRows).forEach((row, i) => {
    const tr = document.createElement('tr');
    if (same(row.address, address)) tr.className = 'is-you';
    for (const text of [
      String(i + 1),
      short(row.address),
      number(row.amount, 18, 2),
      number(row.claimable + row.claimed, 18, 8),
      number(row.claimed, 18, 8),
    ]) {
      const td = document.createElement('td');
      td.textContent = text;
      tr.append(td);
    }
    const a = document.createElement('a');
    a.href = `${cfg.explorer}/address/${row.address}`;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = short(row.address) + (same(row.address, address) ? ' (you)' : '');
    a.title = row.address;
    tr.children[1].replaceChildren(a);
    body.append(tr);
  });
  $('leaderboard-state').hidden = true;
  $('more-leaderboard').hidden = visibleRows >= ranked.length;
  const index = ranked.findIndex((row) => same(row.address, address));
  $('my-rank').textContent =
    index >= 0 ? `Your place: ${index + 1} of ${ranked.length} participating wallets.` : '';
}
$('refresh-leaderboard').onclick = guarded(loadLeaderboard);
$('more-leaderboard').onclick = () => {
  visibleRows += 20;
  renderLeaderboard();
};
async function loadFunding() {
  if (!deployed || token === ZERO) return;
  try {
    const latest = await client.getBlockNumber({ cacheTime: 0 });
    let end = latest,
      logs = [];
    const start = BigInt(dep.startBlock);
    // Newest first, bounded RPC ranges; records here are explicitly the latest ten, not a full index.
    let ranges = 0;
    while (end >= start && logs.length < 10 && ranges++ < 50) {
      const from = end - start > 1999n ? end - 1999n : start;
      logs.unshift(
        ...(await client.getContractEvents({
          address: dep.offline,
          abi: offlineAbi,
          eventName: 'Funded',
          fromBlock: from,
          toBlock: end,
        })),
      );
      if (from === start) break;
      end = from - 1n;
    }
    $('funding-records').replaceChildren();
    for (const log of logs.slice(-10).reverse()) {
      const row = document.createElement('div');
      row.className = 'funding-record';
      const amount = document.createElement('span');
      amount.textContent = number(log.args.amount, 18, 8) + ' ETH';
      const link = document.createElement('a');
      link.textContent = 'Block ' + log.blockNumber.toLocaleString() + ' ↗';
      link.href = `${cfg.explorer}/tx/${log.transactionHash}`;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      row.append(amount, link);
      $('funding-records').append(row);
    }
    $('funding-state').textContent = logs.length
      ? 'Recent funding transactions, up to ten shown. The explorer contains the complete history.'
      : fundedTotal > 0n
        ? 'No funding in the scanned recent block range. See the explorer for earlier history.'
        : 'No ETH has been funded yet. Time alone does not generate rewards.';
  } catch {
    $('funding-state').textContent =
      'Funding history is unavailable. Check the contract on the explorer or refresh.';
  }
}
async function refreshAdmin() {
  const who = address,
    version = generation,
    admin = same(who, currentAdmin),
    creator = same(who, cfg.admin);
  $('admin-controls').hidden = !admin && !creator;
  $('accept-admin').hidden = !same(who, pendingAdmin);
  $('admin-status').textContent = !who
    ? 'Connect the current administrator or original creator wallet.'
    : admin
      ? 'Administrator verified on Ethereum.'
      : creator
        ? 'Original creator verified. Fee operations remain available.'
        : 'This wallet has no administrative role. Public participation is available on the homepage.';
  $('bind-form').hidden = token !== ZERO || !admin;
  $('binding-status').textContent =
    token !== ZERO
      ? 'Connected permanently: ' + token
      : 'Launch last. Bind once. Until then, deposits and rewards are disabled.';
  $('toggle-pause').disabled = !admin;
  $('toggle-pause').textContent = paused ? 'Resume new deposits' : 'Pause new deposits';
  $('transfer-form').hidden = !admin;
  if (!who) return;
  try {
    const values = await Promise.all([
      client.readContract({
        address: cfg.stockereum.escrow,
        abi: escrowAbi,
        functionName: 'claimable',
        args: [who, cfg.weth],
      }),
      erc(cfg.weth, 'balanceOf', [who]),
      client.getBalance({ address: who }),
      erc(cfg.weth, 'balanceOf', [dep.offline]),
    ]);
    if (version !== generation) return;
    [fees, walletWeth, , poolWeth] = values;
    $('creator-fees').textContent = number(fees, 18, 8) + ' WETH';
    $('creator-weth').textContent = number(walletWeth, 18, 8) + ' WETH';
    $('creator-eth').textContent = number(values[2], 18, 6) + ' ETH';
    $('claim-fees').disabled = !creator || fees === 0n;
    $('unwrap-weth').disabled = walletWeth === 0n;
    $('fund-weth').hidden = poolWeth === 0n;
    $('orphan-weth-note').textContent =
      poolWeth > 0n
        ? `${formatEther(poolWeth)} WETH is already in Offline. Convert it after deposits have positive time weight.`
        : '';
  } catch {
    $('creator-fees').textContent = 'Unavailable';
    $('claim-fees').disabled = true;
    $('unwrap-weth').disabled = true;
  }
}
$('bind-form').onsubmit = guarded(async () => {
  const ca = $('token-address').value.trim();
  if (!isAddress(ca)) throw new Error('Enter the full token contract address.');
  offer(
    'Permanently connect token ' + ca + '.',
    'The contract verifies the official Stockereum launch, original creator, ETH pair and 3% settings. This cannot be changed.',
    (ctx) =>
      send(
        dep.offline,
        offlineAbi,
        'bindToken',
        [getAddress(ca)],
        0n,
        'permanent token binding',
        ctx,
      ),
  );
});
$('claim-fees').onclick = guarded(async () =>
  offer(
    `Claim ${formatEther(fees)} WETH from Stockereum to your connected wallet.`,
    'This does not fund rewards yet. Unwrap the received WETH, then send ETH to Offline.',
    (ctx) =>
      send(
        cfg.stockereum.escrow,
        escrowAbi,
        'claim',
        [cfg.weth, ctx.address],
        0n,
        'creator fee claim',
        ctx,
      ),
  ),
);
$('unwrap-weth').onclick = guarded(async () => {
  const amount = walletWeth;
  offer(
    `Unwrap ${formatEther(amount)} WETH to ETH in your wallet.`,
    'ETH will stay in your wallet until you confirm a separate funding transaction.',
    (ctx) => send(cfg.weth, tokenAbi, 'withdraw', [amount], 0n, 'WETH conversion', ctx),
  );
});
$('fund-form').onsubmit = guarded(async () => {
  const amount = parseEther($('fund-amount').value.trim());
  if (amount <= 0n) throw new Error('Enter a positive ETH amount.');
  offer(
    `Send ${formatEther(amount)} ETH to Offline rewards.`,
    'This funding is irreversible. It is allocated immediately among current deposits by their time weight.',
    (ctx) => send(dep.offline, offlineAbi, 'fund', [], amount, 'ETH reward funding', ctx),
  );
});
$('fund-weth').onclick = guarded(async () =>
  offer(
    'Convert all WETH already in Offline into ETH rewards.',
    'Allocation happens now using current time weights.',
    (ctx) => send(dep.offline, offlineAbi, 'fundWeth', [], 0n, 'WETH reward funding', ctx),
  ),
);
$('toggle-pause').onclick = guarded(async () => {
  const next = !paused;
  offer(
    next ? 'Pause new deposits.' : 'Resume new deposits.',
    'Withdrawals and ETH collection remain available.',
    (ctx) =>
      send(dep.offline, offlineAbi, 'setDepositsPaused', [next], 0n, 'deposit status change', ctx),
  );
});
$('transfer-form').onsubmit = guarded(async () => {
  const a = $('next-admin').value.trim();
  if (!isAddress(a) || same(a, ZERO)) throw new Error('Enter a valid new administrator address.');
  offer(
    'Propose administrator ' + a + '.',
    'The new administrator must connect and accept. Creator fee rights remain with the original creator.',
    (ctx) => send(dep.offline, offlineAbi, 'transferAdmin', [a], 0n, 'administrator proposal', ctx),
  );
});
$('accept-admin').onclick = guarded(async () =>
  offer(
    'Accept the administrator role.',
    'You will manage deposit status. This gives no right to withdraw participant funds.',
    (ctx) => send(dep.offline, offlineAbi, 'acceptAdmin', [], 0n, 'administrator acceptance', ctx),
  ),
);
const identity = document.querySelector('.identity'),
  reduced = matchMedia('(prefers-reduced-motion: reduce)');
identity?.addEventListener('pointermove', (e) => {
  if (reduced.matches || e.pointerType === 'touch') return;
  const r = identity.getBoundingClientRect();
  identity.style.setProperty('--x', `${(e.clientX - r.left - r.width / 2) * 0.025}px`);
  identity.style.setProperty('--y', `${(e.clientY - r.top - r.height / 2) * 0.025}px`);
});
identity?.addEventListener('pointerleave', () => {
  identity.style.setProperty('--x', '0px');
  identity.style.setProperty('--y', '0px');
});
paint();
await refresh();
await Promise.allSettled([loadLeaderboard(), loadFunding()]);
setInterval(() => {
  if (!document.hidden && !busy) refresh().catch(() => {});
}, 30000);
