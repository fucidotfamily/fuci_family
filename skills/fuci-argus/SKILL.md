---
name: fuci-argus
description: Live Argus launchpad data on Arc from Fuci, paid per call in USDC over x402 (no API key). Use when the user asks for new token launches on Argus or Arc, what just launched, who launched a token and its buy/sell tax, a token's bonding progress, price and recent buys/sells, or the overall market mood / net USDC flow on Argus.
argument-hint: "launches | bonding <0x token> | tide"
---

# Fuci × Argus (paid x402 tools)

Three live tools read Argus, the token launchpad on **Arc**, straight from the chain. Each call is paid in USDC over x402 through Circle Gateway (gas-free for the buyer). Prices are per call:

| Ask | Endpoint | Price | Returns |
| --- | --- | ---: | --- |
| Newest launches | `GET https://www.fuci.family/api/x402/argus/launches?limit=8` | 0.001 USDC | token, symbol, creator, pool, buy/sell tax, block |
| One token's bonding | `GET https://www.fuci.family/api/x402/argus/bonding?token=<0x…>` | 0.002 USDC | price, progress to bonding (0–1), bonded, taxes, recent trades |
| Market mood | `GET https://www.fuci.family/api/x402/fucus/oracle?launches=4` | 0.0005 USDC | one-sentence reading, net USDC flow, trade count |

Machine-readable spec with inputs and outputs: `https://www.fuci.family/openapi.json`.

## Before paying

- **Ask the user once before spending**, and say the price. Never loop paid calls without a limit the user set.
- To see the price and accepted chains without paying: `curl -i <url>` returns `402 Payment Required` with a `payment-required` header, or `circle services inspect "<url>"`.

## How to pay

Pick whichever the user already has:

1. **Circle CLI (Circle agent wallet):** `circle services pay "<url>" -X GET --chain <CHAIN>`. Always pass `-X GET`. Fuci accepts Gateway payments on Arc, Base, Arbitrum, Ethereum, Optimism, Polygon, Avalanche and more; follow Circle's `wallet-pay` skill to choose the chain and fund the wallet.
2. **Fuci MCP server** (pays from the user's own key with a spending cap): add
   `{ "mcpServers": { "fuci": { "command": "npx", "args": ["-y", "https://www.fuci.family/fuci-mcp.tgz"], "env": { "FUCI_PRIVATE_KEY": "0x…", "FUCI_MAX_CALL": "0.01", "FUCI_DAILY": "1" } } } }`
   and call the `argus_launches`, `argus_bonding` or `fucus_oracle` tools.
3. **Code:** `@circle-fin/x402-batching` `GatewayClient.pay(url)`: see https://www.fuci.family/docs.

If a tool fails (HTTP ≥ 400) the payment is not settled: the user is not charged.

## Reporting

- **Launches:** a short table (symbol, creator short address, buy/sell tax, age). Link each token to `https://argus.world/token/<token>`.
- **Bonding:** price in USDC, progress as a percent, whether it bonded, and the last few trades (side, USDC).
- **Tide:** quote `reading` and give `netFlowUsdc` and `trades`.
- Before anyone buys a token, suggest checking it with the `fuci-risk` skill (free).
- Data describes the chain; it is not financial advice.
