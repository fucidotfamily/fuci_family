# Automation withdrawal regressions

Run `npm test` with Node.js 24 after installing the locked dependencies. The test command is shared with the Earn regression tests proposed in PR #2; this fix is based directly on `main` and does not require that PR.

## Problem

The owner-signed automation withdrawal caught token transfer errors as `null`, then cleared all tracked positions. A failed transfer could leave tokens in the agent wallet while subsequent withdrawal and sell operations no longer saw the position. With no stablecoin transfer, the endpoint could even report `nothing: true`.

## Expected behavior

- Keep the complete position when its balance read, transaction submission, or receipt confirmation fails.
- Remove a position only when `sendToken` returns a successful receipt's hash or reports a confirmed zero balance.
- Persist each removal under the existing agent lock before proceeding, including before stablecoin withdrawal. A persistence failure stops the operation.
- Continue attempting other tokens and stablecoin withdrawal after a token transfer failure. Report incomplete token withdrawal with HTTP 502, `ok: false`, `code: TOKEN_WITHDRAWAL_FAILED`, `failedTokens`, and any returned stablecoin transaction fields. `partial` indicates that a token transfer succeeded or a stablecoin transaction result was returned; stablecoin confirmation and error semantics remain unchanged.
- Refresh the owner's positions and balances when withdrawal reports an error. The existing client displays the error response instead of claiming that everything was withdrawn.
- Count a EURC-only result as a withdrawal, rather than an empty wallet.

## Test boundaries and limits

The tests execute the actual route, token-send logic, and trading hook. RPC, signing, authentication and browser/network boundaries use deterministic fixtures. Running them does not read wallet keys, contact Redis or a blockchain, or submit transactions.

These regressions cover the bookkeeping failure, not historical recovery: positions already erased by the old handler still need reconciliation. A receipt timeout can leave an unconfirmed on-chain transaction; the position stays tracked and the message asks the owner to check the wallet before trying again. This change does not add a durable transaction journal, repair the existing lock lease, or handle nonstandard ERC-20 transfers that return `false` without reverting. Stablecoin failures retain the existing error response contract.
