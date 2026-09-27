---
name: fuci-risk
description: Rate the risk of any token on Arc (0x address) or any DeFi protocol (by name) with Fuci Risk, an A–F grade built only from on-chain and public data, with every factor explained and sourced. Use when the user asks whether a token or protocol is safe, risky, a rug, worth buying, "check this contract", "rate this token", "is <protocol> safe", or wants a due-diligence summary before putting money in. Covers contract control (owner, proxy, mint, pause, blacklist), launch taxes, liquidity, holder concentration, age and activity for tokens; audits, hack history, track record, TVL, governance and yield sustainability for protocols.
argument-hint: "<0x token address on Arc | protocol name or DefiLlama slug>"
---

# Fuci Risk

Fuci Risk grades a token on **Arc** or a **DeFi protocol** from A (lower risk) to F (very high risk). Every factor comes with a plain-English reason and its source. When data is missing it says *Unknown* instead of guessing. No API key, no account.

## 1. Work out the target

- A `0x…` address (40 hex characters) → a **token on Arc**. Use it as is.
- A protocol **name** (e.g. "Morpho", "Aave", "Uniswap") → find its slug first:

```bash
curl -s "https://www.fuci.family/api/risk/search?q=<NAME>"
```

Pick the best match from `protocols[]` (use `slug`; prefer the one whose `chains` include the chain the user cares about, and the larger `tvl` when names collide). If nothing matches, tell the user and stop.

## 2. Get the report (free)

```bash
curl -s "https://www.fuci.family/api/risk?target=<ADDRESS_OR_SLUG>"
```

- Free for people, rate-limited to about 30 checks per 10 minutes per IP. On HTTP 429, wait a few minutes or use the paid endpoint below.
- A new, busy token can take up to ~30 s the first time; if `partial` is `true`, part of the holder scan is still running: say so and suggest checking again in a minute.
- On HTTP 400 the `error` explains the input problem (e.g. not a token on Arc). Relay it.

**Paid, no rate limit (for agents):** the same report over x402 for 0.002 USDC:
`GET https://www.fuci.family/api/x402/risk?target=<ADDRESS_OR_SLUG>`. It accepts USDC through Circle Gateway on Arc, Base, Arbitrum, Ethereum, Optimism, Polygon, Avalanche and more. If the Circle CLI is installed, pay with `circle services pay "<url>" -X GET --chain <CHAIN>` and follow Circle's `wallet-pay` skill for choosing the chain. Only pay when the user has agreed to spend.

## 3. Report it

The JSON has: `name`, `symbol`, `kind` (`token` | `protocol`), `grade` (A–F or `null`), `score` (0–100), `label`, `confidence`, `coverage`, `redFlags[]`, `limits[]` (rules capping the grade), `factors[]` (each `label`, `score`, `summary`, `details[]`), `sources[]`, `generatedAt`.

Reply in the user's language, in this shape:

1. **Headline:** `<name> (<symbol>): grade <grade> · <score>/100 · <label>` and the confidence.
2. **Red flags** (if any), each on its own line, first.
3. **Why the grade is capped** (from `limits`), if any.
4. **Factors:** one line per factor: `label: score/100, summary`. Mark `null` scores as *Unknown*.
5. **Sources:** the links from `sources`.
6. Link to the full report: `https://www.fuci.family/risk?token=<address>` or `https://www.fuci.family/risk?protocol=<slug>`.
7. End with: *A grade describes measurable risk signals, not a promise or an accusation. Not financial advice.*

Never invent factors, numbers or sources that are not in the response. If `grade` is `null`, say there was not enough data to grade it and list what was found.
