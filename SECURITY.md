# Security

## Reporting a problem

Please report security issues **privately**, not in a public issue:

- open a private advisory on GitHub (**Security → Report a vulnerability**) in this repo, or
- email **hello@fuci.family**, or
- send a DM to [@fucidotfamily](https://x.com/fucidotfamily) on X.

Tell us what you found, how to reproduce it and what it affects. We will reply as soon as we can and credit you when it's fixed, if you want.

## Good to know

- Fuci will **never** ask for your private key or seed phrase. Anyone who does is not us.
- Agent wallets are custodial and meant for small balances. Their keys are stored encrypted (AES-256-GCM) on the server.
- This repo holds **no secrets**. All keys live in environment variables (see `.env.example`). Never commit `.env` or `.env.local`.
- Agent outputs describe on-chain data only. They are not financial advice.

## Security model

What protects owners' funds, and where it lives in the code:

| Safeguard | What it does | Code |
| --- | --- | --- |
| Owner signatures | Every owner action (trade, withdraw, settings, profile) needs a wallet signature over the exact action, agent and details, valid for 10 minutes. EOAs and smart accounts (ERC-1271 / ERC-6492) both verify. | `lib/ownerAuth.ts`, `lib/ownerMessage.ts` |
| Single-use signatures | An accepted signature is recorded (Redis `SET NX`) for its whole validity window, so a captured request can't be replayed. Only the 24 h "ask" chat session is reusable, and it can only spend within the agent's daily limit on Fuci's own tool. | `lib/ownerAuth.ts` |
| One action per wallet | Trades, paid asks, automatic runs and withdrawals share a per-agent lock, so limits are checked and recorded atomically and a wallet never sends two transactions at once. Overlapping scheduler ticks skip a busy agent. | `withAgentLock` in `lib/store.ts` |
| Spending limits | Per-trade and daily USDC limits for the autopilot and owner trades; a daily limit for research runs and asks; the agent refuses any single x402 payment above its cap. | `lib/trading.ts`, `lib/automation.ts`, `lib/agent.ts` |
| Slippage | Swaps use the owner's own slippage setting as the minimum output; it is never widened on the server. | `lib/trade.ts`, `lib/trading.ts` |
| Withdrawals | Funds and tokens can only go back to the agent's owner address. | `app/api/agent/[id]/automation/route.ts` |
| Paid tools | x402 payments settle only after the tool answered successfully (status < 400). | `lib/x402.ts` |
| Agent keys | Generated on the server, stored encrypted (AES-256-GCM, key derived with HKDF from a server secret), never sent to the browser. | `lib/agentWallets.ts` |
| Outbound requests | Seller URLs in the market must be HTTPS public hosts: no IP literals, no local names, and DNS answers in private ranges are refused; no redirects. | `lib/market.ts` |
| Rate limits | Every write endpoint is rate-limited per IP; the scheduler endpoint needs a secret. | `allow()` in `lib/store.ts`, `app/api/automation/tick/route.ts` |

Known limits, stated plainly: agent wallets are **custodial** (the server holds their keys), so they are for small balances; and trading on young tokens is risky whatever the code does.
