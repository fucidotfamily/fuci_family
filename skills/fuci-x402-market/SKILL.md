---
name: fuci-x402-market
description: Find paid APIs that AI agents can buy with USDC on Arc over x402, using Fuci Market, a live-checked directory of x402 endpoints from every seller Fuci can find (free, no key). Use when the user or agent needs an external data source or service it could pay for per call (web search, prices, news, token data, trust scores…), asks "what x402 APIs exist on Arc", or wants to compare prices of paid endpoints.
argument-hint: "<what you need, e.g. 'token price' or 'web search'>"
---

# Fuci Market: paid APIs on Arc

Fuci Market lists x402 endpoints that accept USDC on **Arc**. Every listing is checked live: it must answer `402 Payment Required` with an Arc price before it appears.

## Search (free)

```bash
curl -s "https://www.fuci.family/api/market?q=<KEYWORDS>&limit=10"
```

- `q` is free text (e.g. `price`, `search`, `argus`, `risk`); leave it empty for the full list.
- Response: `total`, `sellers`, and `listings[]` with `name`, `description`, `url`, `method`, `priceUsdc`, `payTo`, `networks`, `seller`, and when it was last checked.

## Report

Show the best 3–5 matches as a table: name, what it returns, price per call (USDC), method and URL. Mention that prices are per call and paid over x402, with no API key.

To actually call one, follow the payment flow of the tool the user already has (Circle CLI `circle services pay "<url>" -X <METHOD> --chain <CHAIN>`, or an x402 client) and **ask before spending**. Browse the same directory at https://www.fuci.family/market.

To list your own paid endpoint: `POST https://www.fuci.family/api/market/submit` with `{ "url": "<https endpoint>" }`. It is checked live before it appears.
