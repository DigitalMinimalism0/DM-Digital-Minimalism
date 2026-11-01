# Contributing

Thank you for taking a close look. Small, reviewable changes are welcome.

Read PRODUCT.md and SECURITY.md first. Preserve flexible exits, earned-reward ownership and the documented accounting formula. Changes to money-handling rules need an explicit rationale and tests demonstrating solvency and age conservation.

Use Node 22, pnpm 10 and Foundry. Run `pnpm test`, `pnpm build` and `pnpm test:e2e`. For Solidity changes also run the real-platform fork rehearsal where connectivity allows. Do not commit keys, RPC credentials, local wallet files, broadcast logs or test run output.

Bug reports should include expected behavior, a reproducible local sequence and relevant transaction hashes when public. Never post a private key or seed phrase. Discuss economic-rule changes before presenting them as accepted behavior.
