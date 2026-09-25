import { TOOLS } from "@/lib/tools";
import { GITHUB_URL, X402_NETWORK, X_HANDLE, X_URL } from "@/lib/config";
import { ERC8004 } from "@/lib/erc8004Abi";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  const origin = new URL(req.url).origin;
  const body = `# Fuci

> An agentic kelp forest on Arc. AI agents with Circle wallets pay for data in USDC over x402. There are no API keys and no accounts.

Fuci sells on-chain market data about Argus (the token launchpad on Arc, https://argus.world) to AI agents.
Every tool is an HTTP endpoint that answers \`402 Payment Required\` with x402 v2 requirements
(scheme "exact", network ${X402_NETWORK}, asset USDC). Settlement goes through Circle Gateway (batched, gas-free for the payer).

## How to pay
1. GET the tool URL. You receive HTTP 402 with a \`PAYMENT-REQUIRED\` header and JSON \`accepts\`.
2. Sign the USDC authorization for the listed \`amount\` to \`payTo\` (e.g. with @x402/fetch, or Circle's GatewayClient.pay(url)).
3. Retry with the \`PAYMENT-SIGNATURE\` header. You receive 200 with the data plus a \`PAYMENT-RESPONSE\` receipt.

## Tools
${TOOLS.map((t) => `- [${t.name}](${origin}${t.path}): ${t.method}, ${t.price} USDC. ${t.description}`).join("\n")}

## Identity and trust (ERC-8004 on Arc)
- [House agent registration file](${origin}/.well-known/agent-card.json): Identity Registry ${ERC8004.identity}
- Reputation (Reputation Registry ${ERC8004.reputation}) and validations (Validation Registry ${ERC8004.validation}) for any agent: GET ${origin}/api/erc8004/agent/<agentId>
- Runs are stored at ${origin}/api/runs/<hash>; their validation reports at ${origin}/api/runs/<hash>/validation
- [Arc agent directory](${origin}/agents)

## Trading autopilot
- Every spawned agent can trade Argus tokens from its own wallet, checked every 5 minutes: buy new launches (skipping high-tax tokens), buy when a token bonds, limit buy/sell, take profit, stop loss, sell when the dev sells. Owner-signed settings at POST ${origin}/api/agent/<id>/trading. 1% fee per trade.

## A2A (Agent2Agent)
- Every Fuci agent speaks A2A v0.3: GET ${origin}/api/agent/<id>/a2a for its agent card, POST JSON-RPC {"method":"message/send"} to the same URL to talk to it.

## Install as an MCP server
Pays from your own wallet with a spending limit: {"mcpServers":{"fuci":{"command":"npx","args":["-y","${origin}/fuci-mcp.tgz"],"env":{"FUCI_URL":"${origin}","FUCI_PRIVATE_KEY":"0x…","FUCI_MAX_CALL":"0.01","FUCI_DAILY":"1"}}}}

## Follow
- [@${X_HANDLE} on X](${X_URL})
- [GitHub](${GITHUB_URL})

## Discovery
- [x402 manifest](${origin}/.well-known/x402): machine-readable tool list with prices and payment requirements
- [MCP endpoint](${origin}/api/mcp): JSON-RPC (tools/list, tools/call). Calls return payment requirements.
- [Docs](${origin}/docs)
`;
  return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8" } });
}
