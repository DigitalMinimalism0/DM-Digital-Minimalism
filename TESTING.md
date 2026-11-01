# Testing and verification

## Contract suite

`pnpm test:contracts` runs Offline unit tests, a 1,000-run fuzz test and a 256-run × 100-call stateful invariant suite. Cases cover quantity/time allocation, zero-age additions, same-block deposits, partial age removal, immediate full exit, claiming without age reset, re-entry, no retroactive rewards, paused-deposit exits, rejecting ETH receivers, WETH conversion and one-time binding.

The invariant handler uses three accounts and random deposits, partial withdrawals, funding, claims and time changes. Every sequence checks principal and age conservation, reward liabilities against ETH, and funded-minus-claimed against balance. Targeted handlers currently produce no unexpected reverts.

`test:js` checks the public ABI selectors against the compiled Solidity artifact, reward ranking, error explanations and public/credential-shaped URL handling.

## Browser rehearsal

`pnpm test:e2e` starts its own local Anvil (port 18555), deploys mock platform contracts plus the actual Offline contract, builds an isolated site under `.e2e/dm`, and starts a local server (port 4185). It uses an injected fixture backed only by unlocked local test accounts.

Coverage: pre-launch disabled state → wallet-gated admin → one-time CA binding → exact token approval → deposit → administrator creator-fee claim, WETH unwrap and ETH funding → consistent-block leaderboard → ETH collection with age retained → complete principal withdrawal → account change invalidating a review → 390px mobile layout → paper navigation. Screenshots are saved locally; CI uploads them as browser evidence. No mainnet wallet, private key, broadcast or money is used.

The leaderboard is also checked directly below participation. An ETH funding submitted outside the browser must update its ranking snapshot automatically without clicking refresh, while preserving the user's amount draft. Portal checks cover the shared table across navigation and the honest pre-launch empty state.

The browser rehearsal waits for the real 12-second polling interval with the participation view open. Funding and reward values come from the local contract. It also checks two-digit leaderboard places and the contract-derived average deposit time rendered as hours:minutes:seconds.

Use installed Edge on Windows by default; CI uses Chromium. `E2E_BROWSER=chromium` selects the latter. Install it with `pnpm exec playwright-core install chromium` if needed.

## Real platform integration

`pnpm test:fork` forks current Ethereum state and interacts with actual Stockereum Factory/Hook/Router/Escrow/WETH contracts. It deploys Offline first, creates a 3% ETH-pair token, binds it, trades, deposits, advances time, claims creator WETH, unwraps, funds ETH, withdraws principal and collects ETH.

A fork-only impersonation installs a local price signer because the real launch API requires a platform-signed price. All state changes exist only inside the fork. This test never broadcasts. `MAINNET_RPC_URL` may be supplied locally; the public endpoint is the fallback. CI’s default local suite does not require external mainnet connectivity.

## Read-only readiness

`pnpm preflight:mainnet` verifies chain, configured creator, code presence, Factory/Hook/Escrow relationships, WETH quote identity, 3% fee split and tick spacing. `--signer` additionally requires local signer selection and verification credentials. No key contents are read or printed.

`pnpm verify:deployment` checks the published deployment on-chain. Explorer source verification is requested by deployment and should also be inspected on Etherscan before launch.

## Limits

The suite tests implemented rules; it does not certify profitability, future platform behavior, external audits, wallet-extension internals, unrestricted RPC availability or mainnet deployment completion. Final artwork and social account are separate from functional verification. Public source and tests are evidence of implementation, not a guarantee.

## Scroll entrance and integrated interface

`pnpm test:portal` verifies the small-image starting bounds, enlargement at half scroll, full-viewport arrival directly in participation, reverse scroll, unchanged form nodes and drafts across navigation, deep links, 390px/320px layouts, reduced motion, browser Back and the fallback without ScrollTimeline. It asserts that no halftone canvas is rendered. Screenshots are saved in `.e2e/portal/`. The economic browser rehearsal also switches views while a transaction review is open and confirms it survives.
