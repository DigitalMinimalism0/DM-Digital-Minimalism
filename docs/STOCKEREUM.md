# Stockereum v3 integration

Verified on 1 November 2026 using the official [docs](https://stockereum.com/docs), Sourcify exact-match sources and Ethereum RPC reads. No transaction was sent.

| Contract   | Ethereum address                             |
| ---------- | -------------------------------------------- |
| Factory v3 | `0xc6B080DEd03C3382476A76345e79f82BD480977B` |
| Hook v3    | `0x322dcEc4958C14e021A9F1cD49DF11b9457968cC` |
| Escrow     | `0xAcefe251da006887dA41C063D06CC82A060824BA` |
| WETH       | `0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2` |

[Factory verified source](https://sourcify.dev/server/v2/contract/1/0xc6B080DEd03C3382476A76345e79f82BD480977B?fields=abi,sources,compilation), [Hook verified source](https://sourcify.dev/server/v2/contract/1/0x322dcEc4958C14e021A9F1cD49DF11b9457968cC?fields=abi,sources,compilation), [Escrow verified source](https://sourcify.dev/server/v2/contract/1/0xAcefe251da006887dA41C063D06CC82A060824BA?fields=abi,sources,compilation).

`hook.getLaunch(bytes32)` returns a single 12-field static `Launch` tuple; its exact order is defined in `contracts/src/StockereumBinding.sol`. `PoolKey` uses sorted token/WETH currencies, LP fee `0`, tick spacing `200`, and the official hook. Hook trade fee is separately `feePpm=30000`; it is not the PoolKey LP fee.

Binding checks token factory, creator, supply 1 billion × 10^18, distributor zero, real hook pool, WETH quote, creator fee recipient, 30000 ppm and `feesToHolders=false`.

`platformFeeFor(30000)=10000`: normal 3% fee is 1% platform and 2% creator. The opening anti-snipe window temporarily charges a higher rate, with excess paid to the platform.

`escrow.claimable(account,currency)` reads an account’s claimable amount. `claim(currency,to)` pays the caller’s entitlement only; an administrator cannot claim another creator’s fees. ETH pairs pay WETH. The normal UI path is creator claim to own wallet → WETH.withdraw → Offline.fund with native ETH. An extra recovery control converts WETH already sent directly to Offline through `fundWeth()`.

The original creator is immutable in Offline even if operational administration transfers. Rerun `pnpm preflight:mainnet` immediately before deployment to recheck these relationships.
