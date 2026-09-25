# fuci-mcp

MCP server for [Fuci](https://www.fuci.family): on-chain Argus market data on Arc, paid per call in USDC over x402 from your own wallet (Circle Gateway, gas-free), with a spending limit the model cannot change.

```json
{ "mcpServers": { "fuci": {
    "command": "npx",
    "args": ["-y", "https://www.fuci.family/fuci-mcp.tgz"],
    "env": { "FUCI_PRIVATE_KEY": "0x…", "FUCI_MAX_CALL": "0.01", "FUCI_DAILY": "1" }
} } }
```

Tools: `fuci_balance`, `fuci_deposit`, `fuci_reputation` (free) and every paid Fuci tool listed at `/.well-known/x402`.

Use a fresh wallet with only a little USDC on Arc. Deposit into Gateway once with `fuci_deposit`.
