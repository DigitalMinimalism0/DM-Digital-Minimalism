import { parseAbi } from 'viem';

export const offlineAbi = parseAbi([
  'function token() view returns (address)',
  'function expectedCreator() view returns (address)',
  'function stockereumHook() view returns (address)',
  'function weth() view returns (address)',
  'function admin() view returns (address)',
  'function pendingAdmin() view returns (address)',
  'function depositsPaused() view returns (bool)',
  'function totalDeposited() view returns (uint256)',
  'function totalTokenSeconds() view returns (uint256)',
  'function totalFunded() view returns (uint256)',
  'function totalClaimed() view returns (uint256)',
  'function lastFundedAt() view returns (uint256)',
  'function participantCount() view returns (uint256)',
  'function participants(uint256) view returns (address)',
  'function account(address) view returns (uint256 amount, uint256 tokenSeconds, uint256 claimable, uint256 claimed, uint256 startedAt)',
  'function deposit(uint256 amount)',
  'function withdraw(uint256 amount)',
  'function claim(address recipient)',
  'function bindToken(address candidate)',
  'function fund() payable',
  'function fundWeth()',
  'function setDepositsPaused(bool paused)',
  'function transferAdmin(address newAdmin)',
  'function acceptAdmin()',
  'event Funded(address indexed from, uint256 amount, uint256 tokenSeconds, uint256 cumulative)',
  'event Deposited(address indexed user, uint256 amount)',
  'event Withdrawn(address indexed user, uint256 amount)',
  'event Claimed(address indexed user, address indexed recipient, uint256 amount)',
  'error NoEligibleDeposits()',
  'error NotBound()',
  'error BadAmount()',
  'error InvalidLaunch()',
  'error AlreadyBound()',
  'error NotAdmin()',
  'error DepositsPaused()',
  'error NothingToClaim()',
  'error TransferMismatch()',
  'error EthTransferFailed()',
  'error FundingTooSmall()',
]);
export const tokenAbi = parseAbi([
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address,address) view returns (uint256)',
  'function approve(address,uint256) returns (bool)',
  'function transfer(address,uint256) returns (bool)',
  'function withdraw(uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function creator() view returns (address)',
]);
export const escrowAbi = parseAbi([
  'function claimable(address account,address currency) view returns (uint256)',
  'function claim(address currency,address to) returns (uint256)',
]);
export const ZERO = '0x0000000000000000000000000000000000000000';
export function rankAccounts(accounts) {
  return [...accounts].sort((a, b) => {
    const x = a.claimable + a.claimed,
      y = b.claimable + b.claimed;
    return x === y
      ? a.address.toLowerCase().localeCompare(b.address.toLowerCase())
      : x > y
        ? -1
        : 1;
  });
}
export function describeError(error) {
  if (error?.code === 4001 || /user rejected|user denied/i.test(error?.message ?? ''))
    return 'You cancelled the request. Nothing was changed.';
  const text = String(error?.shortMessage ?? error?.message ?? error);
  const reasons = {
    NoEligibleDeposits:
      'Funding needs at least one deposit with some time offline. No ETH was accepted.',
    NotBound: 'The token has not launched here yet.',
    InvalidLaunch:
      'This token does not match the expected creator, ETH pair and 3% launch settings.',
    AlreadyBound: 'A token is already connected. This binding cannot be replaced.',
    DepositsPaused: 'New deposits are paused. Existing deposits can still be withdrawn.',
    NotAdmin: 'This wallet is not the current administrator.',
    NothingToClaim: 'There is no ETH ready to collect yet.',
    EthTransferFailed:
      'Your wallet could not receive ETH. Your reward remains yours; choose another receiving address.',
    BadAmount: 'Check the amount and your available balance.',
  };
  for (const [key, value] of Object.entries(reasons)) if (text.includes(key)) return value;
  if (/insufficient funds/i.test(text))
    return 'Your wallet needs enough ETH for this transaction and network fees.';
  if (/fetch failed|HTTP request|network error|timeout|timed out/i.test(text))
    return 'The network is taking longer than expected. Please try again.';
  return text.slice(0, 280);
}
