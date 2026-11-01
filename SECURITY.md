# Security & trust boundaries

DM is an immutable, non-proxy companion contract. Source availability and tests do not imply an independent audit.

The [2026-11-01 internal pre-deployment review](docs/REVIEW-2026-11-01.md) records the reviewed scope, fixes, adversarial/reference tests and all 14 Slither diagnostics. It is an internal engineering review, not a third-party certification.

## Administrator powers

- Bind one Stockereum token after launch; binding is permanent and validated against the configured official Hook.
- Pause/resume new deposits only.
- Propose an administrator; the recipient must accept separately.
- Renounce only after binding and while deposits are unpaused, preventing an administrator from leaving them permanently paused.

There is no administrator withdrawal, user-principal seizure, reward-rate adjustment, arbitrary execution, upgrade, withdrawal pause, lock term or exit penalty. Original creator identity is immutable; a role transfer cannot change the creator’s platform fee entitlement.

## Accounting

See [the full model](docs/ACCOUNTING.md). Incoming funding is allocated using current token-seconds. A claim checkpoint carries fractions smaller than one wei. Index rounding is downward, so tiny unallocated ETH dust may remain forever. Principal transfer amounts are checked on deposit. All principal/reward-changing paths have a reentrancy guard; a WETH-only receive path accepts the canonical unwrap transfer.

Withdrawals do not send ETH, so an ETH-rejecting smart wallet can always retrieve its principal. A failed ETH claim reverts, preserves the credit, and can be retried to another address. Pausing deposits never pauses withdrawal or claim.

No age or rewards are granted to freshly added tokens. Exited age is removed proportionally, and full exit clears active age. Neither claiming nor waiting requires a keeper, server, daily action or expiry transaction.

## External dependencies and economic limits

- Creator funding is manual, discretionary, and cannot be forced. No fees are earned merely by having a token balance.
- Contributors choose funding timing. Buying/depositing before a known funding can change shares, though newly deposited capital begins at zero age. The model does not eliminate timing strategies, whales, price movement or financial risk.
- Time weight is uncapped and persists across funding rounds. Old positions may dominate new ones.
- Stockereum fees/routing/quote are verified at binding, but its external platform and quote-token behavior remain dependencies. Normal 3% includes the platform’s 1%; the initial anti-snipe fee is higher.
- Transfers of WETH directly into Offline are not rewards until `fundWeth()` succeeds; anyone may trigger conversion when eligible age exists. Native ETH funding without eligible age reverts. Forced native ETH is not automatically distributable.
- Direct token donations cannot be recovered by the administrator and do not grant the sender a principal position. Use the deposit form.
- Ethereum addresses, deposits and reward histories are public. No claim is made about offline screen time or privacy.

## Website and signing

The website uses local assets and a bundled viem client, CSP, no analytics, no third-party font/script hosting and no tracking cookies. It requests exact-amount token approvals. Every action has a review step, simulation and a wallet signature. Account or chain changes invalidate pending reviews and stop a multi-transaction flow before its next signature.

A static site still requires trusting the served JavaScript. Verify contract addresses and transaction details in your wallet. The public RPC can fail, throttle or provide misleading data; it does not hold keys. Leaderboard snapshots use one block and do not display incomplete rankings as a complete result.

Deployment uses local encrypted Foundry keystores or Ledger. Key files and keyed RPC endpoints never belong in public builds or Git. Mainnet execution is an owner action.

## Reporting

Report a suspected vulnerability privately through the repository maintainer’s available GitHub security reporting channel. Do not include private keys or live wallet credentials in issues. The current CI validates source, contracts, build and a local browser rehearsal; it is not an audit certification.
