# Accounting specification

Rewards are allocated at discrete ETH funding transactions, not streamed. Let `a_i` be an account’s currently deposited base units, `w_i(t)` its accumulated token-seconds and `F` a funding at time `t`.

`allocation_i = F × w_i(t) / Σ w_j(t)`

Only active deposits participate. A fully exited account has zero active weight but retains settled ETH credits. Weight is uncapped. A base-unit token has the same age rules as a whole token; all arithmetic is integer.

## Principal changes

Before any deposit, withdrawal or claim, settle the account against all fundings since its last checkpoint.

- Deposit `d`: increase amount by `d`; do not increase current age. New amount ages only from this moment.
- Withdraw `d`: remove `floor(age × d / amount)` age; a full withdrawal removes all age exactly. Already earned rewards stay credited. This proportional convention avoids choosing which historical deposit lot exits first.
- Claim: settle and transfer credit; age continues unchanged. Failed ETH sends revert and preserve the credit. Users may nominate another recipient.

## Constant-cost settlement

Use time `t` relative to contract deployment and precision `P = 10^36`. Two cumulative indices at each funding are:

`ΔR = floor(F × P / totalAge(t))`

`R += ΔR`

`T += t × ΔR`

At an account checkpoint time `c`, store amount `a`, age `w`, and paid indices `R_c`, `T_c`. Subsequent scaled earnings are:

`w × (R − R_c) + a × [(T − T_c) − c × (R − R_c)]`

This is exactly the sum over fundings of `ΔR × [w + a × (fundingTime − c)]`. It needs no user loop. The global age is updated linearly between principal changes. Personal and global age change together.

At settlement, add the previous fractional remainder; credit the whole wei and carry `scaled % P` forward. The global per-funding index rounds downward, so allocation never exceeds funding. Residual ETH dust has no administrator withdrawal path.

Funding without positive aggregate age reverts. Fresh same-block deposits have zero age at that funding. Newly added tokens cannot acquire historical age or rewards. Accumulated age remains after earlier funding: the next funding uses all time of the still-deposited principal, not only time since the last funding.

## Example

Alice deposits 100 tokens at day 0; Bob deposits 100 at day 1. At day 2, Alice has 200 token-days, Bob 100. A 0.3 ETH funding allocates approximately 0.2 ETH and 0.1 ETH respectively. This is arithmetic illustration, not a forecast.

## Solvency invariant

`Σ claimable_i ≤ totalFunded − totalClaimed ≤ ETH balance`

`Σ principal_i = totalDeposited ≤ deposited token balance`

`Σ currentAge_i = totalTokenSeconds()`

Forced ETH may make the balance larger than tracked funding. Direct token donations do not mint principal. Neither is automatically allocated or withdrawable by an administrator. WETH received directly is separately convertible through `fundWeth()` once positive aggregate age exists.

## Economic limits

This redistributes contributions; it does not create yield from inactivity, guarantee creator contributions or stabilise token prices. Funding timing is controlled by contributors and can favour accounts active at that moment. An early deposit may accumulate substantial weight. Multiple addresses are allowed; splitting an identical deposit with identical ages does not increase aggregate mathematical entitlement, apart from conservative rounding dust.
