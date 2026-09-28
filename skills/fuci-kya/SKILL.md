---
name: fuci-kya
description: Know Your Agent (KYA) with Fuci — check an AI agent on Arc before paying, hiring or trusting it. Returns an A–F trust grade built only from on-chain data: its ERC-8004 identity, registration file, on-chain reputation and validations, wallet activity, USDC balance and x402 payment record, each explained and sourced. Use when the user asks "is this agent legit", "can I trust agent #12", "who is this wallet", "check this agent before I pay it", or wants due diligence on another agent or an x402 seller/buyer.
argument-hint: "<ERC-8004 agent id | 0x wallet address on Arc>"
---

# Fuci Know Your Agent

Fuci KYA grades an AI agent on **Arc** from A (well-established) to F (do not trust yet). Every factor has a plain-English reason and a source. Missing data is shown as *Unknown*, never guessed. No API key, no account.

## 1. Work out the target

- A number (e.g. `12` or `#12`) → an **ERC-8004 agent id** on Arc.
- A `0x…` address (40 hex characters) → the agent's **wallet** (Fuci looks up any ERC-8004 identity it owns or pays from).

## 2. Get the report (free)

```bash
curl -s "https://www.fuci.family/api/kya?agent=<ID_OR_ADDRESS>"
```

- Free for people, rate-limited to about 30 checks per 10 minutes per IP. On HTTP 429, wait or use the paid endpoint.
- On HTTP 400 the `error` explains the input problem (e.g. no such agent id). Relay it.

**Paid, no rate limit (for agents):** the same report over x402 for 0.002 USDC:
`GET https://www.fuci.family/api/x402/kya?agent=<ID_OR_ADDRESS>`. It accepts USDC through Circle Gateway on Arc, Base, Arbitrum, Ethereum, Optimism, Polygon, Avalanche and more. With the Circle CLI: `circle services pay "<url>" -X GET --chain <CHAIN>`. Only pay when the user has agreed to spend.

## 3. Report it

The JSON has `name`, `grade` (A–F or `null`), `score` (0–100), `label`, `confidence`, `redFlags[]`, `limits[]`, `factors[]` (identity, registration, reputation, validation, activity, funds, payments — each `label`, `score`, `summary`, `details[]`), `sources[]` and `subject` (`agentId`, `name`, `owner`, `wallet`, `cardUrl`, `x402Support`, `otherAgentIds`).

Reply in the user's language:

1. **Headline:** `<name> (agent #<agentId> or "no ERC-8004 identity"): grade <grade> · <score>/100 · <label>` and the confidence.
2. **Red flags** first, then **why the grade is capped** (`limits`).
3. **Factors:** one line each, `label: score/100, summary`; `null` scores are *Unknown*.
4. **Who it is:** wallet, owner, registration file link.
5. Link: `https://www.fuci.family/kya?agent=<ID_OR_ADDRESS>`.
6. End with: *A grade is a signal from on-chain data, not a guarantee. New agents start low because they have no history yet.*

Never invent factors, numbers or sources that are not in the response.
