# Launch guide

Deployer / original creator: `0x4fc6e37d6aefb348cff3791f493ce49754af905a`.

**Prepare the companion contract and website first. Launch the token last.** The project owner must review and sign mainnet transactions locally. Keep private keys out of chat, the repository, the website, Vercel and script arguments.

## 1. Install and verify

This deployment uses Solidity **0.8.38**. Read the [pre-deployment security review](docs/REVIEW-2026-11-01.md) first and avoid mixing old build artifacts with the current build.

```powershell
pnpm install --frozen-lockfile
forge build
pnpm test
pnpm build
pnpm test:e2e
pnpm preflight:mainnet
```

`preflight:mainnet` only reads public on-chain data and never signs transactions. It can run without access to the production wallet. For a mainnet-fork rehearsal:

```powershell
$env:MAINNET_RPC_URL = 'YOUR_ETHEREUM_RPC_URL'
pnpm test:fork
```

The logo and X account are pending. Replace `web/favicon.svg` and the text mark when final assets are ready. Leaving `links.twitter` as `null` in `config.json` prevents an incorrect social link from appearing. Configure the displayed token symbol through `brand.symbol`.

## 2. Configure local signing

Use an encrypted keystore:

```powershell
.\scripts\prepare-mainnet.ps1 -ImportKey
```

Enter the new wallet's private key only in Foundry's hidden interactive prompt, and set a keystore password. The keystore is stored at `$HOME\.foundry\keystores\dm-deployer`, outside the project. The script prompts privately for the RPC URL and Etherscan key, keeps them only in the current process environment and does not read `$HOME\.web3\secrets.env`.

With an existing keystore:

```powershell
.\scripts\prepare-mainnet.ps1
```

With a Ledger:

```powershell
.\scripts\prepare-mainnet.ps1 -Ledger
```

## 3. Execute the mainnet deployment yourself

Confirm that `config.admin` is the new address, `config.token` is the zero address and all tests pass. Then run this in the same PowerShell session:

```powershell
pnpm deploy:mainnet
```

The script checks the signer, reads the platform's critical settings again, deploys one non-upgradeable Offline contract and requests Etherscan source verification. It does not launch a token or require its contract address in advance.

Forge's simulated address is written to ignored `deployments/.pending-*` staging files. The script writes `deployments/1.json` only after a successful broadcast and confirmation that code exists on-chain. An existing deployment manifest prevents another deployment. If any broadcast step fails, inspect `broadcast/` and staging before retrying.

Before broadcasting, the script creates an atomic lock at `deployments/.pending-offline-lock/`. A failure preserves the lock to prevent another terminal or retry from deploying again accidentally. After success, it checks the creation transaction, deployer, constructor arguments and complete runtime bytecode before publishing the manifest and releasing the lock.

If the transaction succeeded but explorer verification or a later step failed, run `forge build` and recover the original address using the actual deployment transaction hash:

```powershell
pnpm recover:deployment -- 0xYOUR_DEPLOYMENT_TRANSACTION_HASH
```

Recovery only reads on-chain data and writes the public manifest. It neither signs nor redeploys. It accepts only a creation transaction that exactly matches the current build artifacts, configuration and deployer. Recovery does not replace Etherscan source verification. If no transaction was broadcast, inspect the on-chain nonce, transactions and staging before handling the lock; do not delete the lock to bypass that investigation.

```powershell
pnpm verify:deployment
```

Also confirm that the source is verified on Etherscan. If the platform API fails temporarily, resume verification without redeploying.

## 4. Publish the website and verify the admin panel

Commit the new public deployment manifest to GitHub. Vercel builds the static site using the repository configuration:

```powershell
pnpm build
vercel --prod
```

Connect the new wallet at `/admin` and check the chain, contract, creator and unbound state. Before the token launches, the public page must clearly show that participation has not started and keep deposits disabled. Verify the mobile layout, wallet switching and error feedback.

## 5. Launch the token on Stockereum last

Use the original creator wallet, `0x4fc6e37d6aefb348cff3791f493ce49754af905a`, with these settings:

- Project name: `digital minimalism`; token symbol: `DM`, matching the `brand` configuration.
- ETH trading pair.
- Normal trading fee: 3%.
- **Holder Rewards OFF**; the creator claims fees manually.

The normal platform split is 1% for the platform and 2% for the creator. A temporary higher anti-snipe fee applies during the first 20 seconds after launch. Check the actual platform interface again before publishing.

## 6. Bind the token contract in the admin panel

Open `/admin`, enter the newly launched token's full contract address, click Review token binding, read the confirmation and sign in the wallet. Binding is permanent and can happen only once.

The contract checks the official factory/hook, original creator, one-billion-token supply, WETH quote, 3% fee and creator fee-recipient mode. Once binding succeeds, the website reads the on-chain state and opens participation without further code changes or redeployment.

## 7. Fees and rewards

Use the admin panel in this order, signing each step separately:

1. Claim WETH: claim from Stockereum escrow into the original creator's own wallet.
2. Unwrap WETH: convert the selected WETH amount into ETH in that wallet.
3. Enter an ETH amount and select Review ETH funding: fund Offline and immediately allocate rewards using the active time weights at that moment.

Funding requires at least one depositor and a positive total time weight. If there are no participants, keep the ETH in the creator's wallet instead of funding in advance.

If WETH is accidentally sent directly to Offline, the admin panel detects the balance and offers `fundWeth` conversion. The WETH transfer itself does not allocate rewards; allocation happens at conversion, which anyone can trigger.

## Operating boundaries

Users can withdraw some or all of their principal at any time, without a fixed term, cooldown, exit fee or reward forfeiture. An administrator pause affects only new deposits. Transferring the administrator role does not transfer the original Stockereum creator's fee rights.

The website publishes rewards, addresses and funding records. It promises neither privacy nor returns. Open source code and automated tests do not constitute an external audit.
