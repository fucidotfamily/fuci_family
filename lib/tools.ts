/**
 * The Fuci Tools catalog — every paid endpoint an agent can call over x402.
 * Single source of truth for routes, the /.well-known/x402 manifest, the MCP
 * tool list, the docs page and the website catalog.
 */
export type FuciTool = {
  id: string;
  name: string;
  path: string;
  method: "GET" | "POST";
  price: string; // USD, x402 money format
  description: string;
  input?: Record<string, { type: string; description: string }>;
};

export const TOOLS: FuciTool[] = [
  {
    id: "argus_launches",
    name: "Argus Launch Scout",
    path: "/api/x402/argus/launches",
    method: "GET",
    price: "$0.001",
    description: "Latest token launches on Argus, the launchpad on Arc: who launched them, their pool and their buy/sell tax.",
  },
  {
    id: "argus_bonding",
    name: "Bonding Watcher",
    path: "/api/x402/argus/bonding",
    method: "GET",
    price: "$0.002",
    description: "Price, progress toward bonding, taxes and recent buys and sells for one Argus token.",
    input: { token: { type: "string", description: "Token address (0x…) of an Argus launch" } },
  },
  {
    id: "fucus_oracle",
    name: "Tide Oracle",
    path: "/api/x402/fucus/oracle",
    method: "GET",
    price: "$0.0005",
    description: "A tide reading: net USDC flow and sentiment across the newest Argus launches, in one sentence.",
  },
  {
    id: "fuci_agent",
    name: "Ask the Fucus Agent",
    path: "/api/agent/run",
    method: "POST",
    price: "$0.04",
    description: "Pay-per-prompt: a Fuci agent answers your question by buying the tools above and writing a brief (with Claude when enabled).",
    input: { prompt: { type: "string", description: "Your question about Argus launches / Arc markets" } },
  },
];

export const toolById = (id: string) => TOOLS.find((t) => t.id === id);

/** "$0.001" -> 0.001 */
export const priceToNumber = (price: string) => Number(price.replace("$", ""));
