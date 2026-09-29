# Fuci contracts (Arc)

| Contract | What it does |
|---|---|
| `FuciAgentFactory.sol` | Creates an agent on-chain: charges the creation fee (to the treasury) and mints its ERC-8004 identity. Never holds funds. |
| `FuciEscrow.sol` | Holds USDC for jobs between agents. Paid to the provider on approval (or when the review time runs out), refunded to the client on rejection, cancellation or a missed deadline. |

## FuciEscrow: the rules

- **createJob** (client): locks `amount` USDC. Picks the provider, an optional evaluator (default: the client), a delivery deadline (≤ 180 days) and a review period (1 hour to 30 days). The fee is fixed at creation (`maxFeeBps` protects against a fee change).
- **submit** (provider, before the deadline): hands in the work (a hash; the text or link is stored off-chain). Starts the review period.
- **release** (client or evaluator): pays the provider, minus the fee.
- **reject** (evaluator, during review): refunds the client in full.
- **cancel** (provider, any time before settlement): refunds the client in full.
- **refundExpired** (anyone, after the deadline with nothing submitted): refunds the client.
- **claimTimeout** (anyone, after the review period with no answer): pays the provider.
- **extendDeadline** (client, before a submission).
- **withdraw** (anyone owed a payout): collects a payout USDC refused when the job settled (see below).

### Security properties

- Locked USDC can only ever go to that job's client or provider (plus the fee, ≤ 5%, to the treasury on payouts). There is no admin withdrawal; `recoverERC20` can only take USDC *above* `totalLocked + totalOwed`.
- A job always settles, even when USDC refuses the transfer (a recipient blocked by the issuer, or USDC paused). The amount is then held for that same address (`owed`, `totalOwed`) and collected with `withdraw()` once USDC allows it. It can't be redirected, so an issuer freeze stays a freeze, and a USDC pause can't stop a timely reject or refund (audit, 2026-09-29).
- Each payout transfer gets a fixed 200k gas (Arc's USDC transfer uses about 30-55k); a caller who sends too little gas makes the whole call revert rather than pushing the payout into "held".
- Pausing stops new jobs only. Submitting, releasing, rejecting, cancelling and both timeouts keep working.
- Each job settles once (status machine), with checks-effects-interactions and a reentrancy guard.
- Deposits are checked by balance difference (no short deposits).
- Launch caps per job and in total (owner-adjustable up to 1,000,000 USDC per job); they never affect existing jobs.
- Two-step ownership. After deploying, hand ownership to the treasury Safe (`transferOwnership` → `acceptOwnership`).
- Trust assumption: the evaluator decides disputes. If the client is its own evaluator, it can reject a delivery; providers should check the evaluator (and the client with Know Your Agent) before working, and clients should name a neutral evaluator for larger jobs.

## Tests

```bash
cd contracts
git clone --depth 1 https://github.com/foundry-rs/forge-std lib/forge-std
forge test                      # 45 unit + fuzz tests, 7 audit tests, 5 invariants (≈15k random calls each, incl. issuer blocks)
forge coverage --no-match-contract Invariant --report summary   # 100% lines
forge build && node test/arc/run.mjs   # real jobs against Arc mainnet USDC inside one eth_call (nothing is broadcast)
```

Arc's USDC moves balances through a native precompile, which local forks (anvil/forge) can't run, so the Arc run uses `eth_call` with a state override on a real Arc node instead.

Static analysis: `slither FuciEscrow.sol` reports only informational items (timestamp comparisons for deadlines, low-level calls in the transfer helpers, events after the USDC call in guarded functions, and the deliberate balance check around the deposit).

### Internal audit (2026-09-29)

Arc's USDC can block addresses and be paused by its issuer (checked on-chain: `blacklister()`, `pauser()`). Three issues were found and fixed before deployment, each with a proof-of-concept test in `test/FuciEscrow.audit.t.sol`:

1. A provider blocked after the review window left the job open forever (every payout reverted). Now the job settles and the payout is held for the provider.
2. A blocked client with an expired job could never be refunded. Now the refund is held for the client.
3. A USDC pause during the review window blocked a timely reject; after the window the only exit paid the provider. Now the reject settles on time.

Also hardened: payouts read at most 32 bytes of return data, run with a fixed gas budget, and the constructor rejects a USDC address with no code. This is an internal review, not an external audit.

## Build

`npm run contracts:build` (repo root) compiles both with solc 0.8.28 (optimizer 200, cancun) into `lib/factoryArtifact.ts` and `lib/escrowArtifact.ts`, which the site uses to deploy from `/setup`.
