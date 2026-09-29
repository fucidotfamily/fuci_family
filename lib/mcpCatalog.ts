import { SITE_URL } from "./config";
import { TOOLS } from "./tools";

/** Names of every tool on Fuci's MCP server (also listed in each agent's registration file). */
export const MCP_TOOL_NAMES = ["fuci_reputation", "market_search", ...TOOLS.map((t) => t.id)];

type PromptArg = { name: string; description: string; required?: boolean };
export type McpPrompt = { name: string; title: string; description: string; arguments: PromptArg[]; text: (args: Record<string, string>) => string };

/** Ready-made prompts an MCP client can offer its user; each one tells the model which Fuci tools to use. */
export const MCP_PROMPTS: McpPrompt[] = [
  {
    name: "launch_scout",
    title: "Scout new launches",
    description: "Find the newest token launches on Argus (Arc) and say which ones look worth watching.",
    arguments: [{ name: "count", description: "How many launches to look at (1-20, default 8)" }],
    text: (a) =>
      `Use the argus_launches tool (paid over x402) with limit ${a.count || "8"}. For the most interesting launches, use argus_bonding to check price and progress toward bonding. Answer with a short ranked list and one line of reasoning each.`,
  },
  {
    name: "token_check",
    title: "Check a token",
    description: "Bonding progress, recent trades and an A-F risk grade for one token on Arc.",
    arguments: [{ name: "token", description: "Token address on Arc (0x...)", required: true }],
    text: (a) =>
      `For token ${a.token}, use argus_bonding (paid over x402) for price, bonding progress and recent buys and sells, then fuci_risk for its risk grade. Summarise whether momentum is rising or fading and the main risks.`,
  },
  {
    name: "market_mood",
    title: "Read the market mood",
    description: "Net USDC flow and sentiment across the newest Argus launches, in plain words.",
    arguments: [],
    text: () => "Use the fucus_oracle tool (paid over x402) and explain the tide reading in plain words: is money flowing in or out, and what does that suggest for new launches?",
  },
  {
    name: "vet_agent",
    title: "Vet an AI agent",
    description: "Check an ERC-8004 agent's identity, reputation and validations before paying or hiring it.",
    arguments: [{ name: "agent", description: "ERC-8004 agent id on Arc, or the agent's wallet address", required: true }],
    text: (a) =>
      `Check agent ${a.agent}. If it is a number, start with the free fuci_reputation tool. Then use fuci_kya (paid over x402) for its A-F trust grade. Say who owns it, how it is rated and whether it looks safe to pay.`,
  },
  {
    name: "find_paid_api",
    title: "Find a paid API",
    description: "Search every x402 API that accepts USDC on Arc for the one you need.",
    arguments: [{ name: "need", description: "What you need, e.g. 'token price' or 'web search'", required: true }],
    text: (a) => `Use the free market_search tool with the query "${a.need}". Compare the best matches by price and what they return, and give the URL to pay for the best one.`,
  },
];

export type McpResource = { uri: string; name: string; title: string; description: string; mimeType: string; url: string };

/** Read-only documents the MCP server exposes; each is the same content as a public URL on the site. */
export const MCP_RESOURCES: McpResource[] = [
  { uri: "fuci://llms.txt", name: "llms.txt", title: "Fuci for LLMs", description: "What Fuci is, its agents, tools, prices and how to pay, in plain text.", mimeType: "text/plain", url: `${SITE_URL}/llms.txt` },
  { uri: "fuci://x402", name: "x402-catalog", title: "x402 catalog", description: "Every paid Fuci endpoint with its price and payment requirements.", mimeType: "application/json", url: `${SITE_URL}/.well-known/x402` },
  { uri: "fuci://openapi", name: "openapi", title: "OpenAPI spec", description: "OpenAPI description of the paid Fuci endpoints.", mimeType: "application/json", url: `${SITE_URL}/openapi.json` },
  { uri: "fuci://agent-card", name: "agent-card", title: "Fuci registration file", description: "Fuci's ERC-8004 registration file.", mimeType: "application/json", url: `${SITE_URL}/.well-known/agent-card.json` },
];
