Run `npm test` with Node.js 24 (the tests use Node's TypeScript stripping and experimental VM modules). No additional test dependencies are needed.

The Earn regression tests evaluate `lib/earn.ts` itself. External SDK, signing, blockchain and storage boundaries are replaced with deterministic fixtures, so running the tests never uses wallet keys, connects to Redis or submits a transaction.

Coverage includes withdrawal from held vaults removed by discovery filters, unavailable discovery, partial EURC withdrawal and fees, failed redemption, untracked-vault checks and the existing restrictions on new deposits. These tests do not establish live vault liquidity or SDK service availability.
