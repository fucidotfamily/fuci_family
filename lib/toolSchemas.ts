/** Response schemas of the paid tools, shared by /openapi.json and the x402 (Bazaar) challenge. */

/** What every tool returns around its data. */
const sourced = (data: Record<string, unknown>) => ({
  type: "object",
  properties: {
    tool: { type: "string", description: "The tool id that answered." },
    source: {
      type: "string",
      description: "Where the data came from (chain = read live from Arc).",
    },
    block: { type: "integer", description: "Arc block the data was read at." },
    data,
  },
});

export const RESPONSES: Record<string, Record<string, unknown>> = {
  argus_launches: sourced({
    type: "array",
    description:
      "Launches, newest first: token, creator, hook, poolId, symbol, buyTaxPct, sellTaxPct, block.",
    items: { type: "object" },
  }),
  argus_bonding: sourced({
    type: "object",
    description:
      "token, symbol, priceUsdc, progress (0..1 toward bonding), bonded, buyTaxPct, sellTaxPct and recent trades.",
  }),
  fucus_oracle: sourced({
    type: "object",
    description:
      "reading (one sentence), netFlowUsdc, mood, launches and trades counted.",
  }),
  fuci_risk: {
    type: "object",
    description:
      "A risk report: grade (A–F or null), score 0–100, label, confidence, redFlags, limits (rules capping the grade), factors (each with score, summary, details and sources).",
  },
  fuci_kya: {
    type: "object",
    description:
      "A Know Your Agent report: grade (A–F or null), score 0–100, label, confidence, redFlags, limits, factors (identity, registration, reputation, validation, activity, funds, payments, each with score, summary, details and sources) and subject (agentId, name, owner, wallet, cardUrl, x402Support, otherAgentIds).",
  },
  fuci_agent: {
    type: "object",
    description:
      "The agent's brief: answer text, the tools it bought, USDC spent and the raw tool data.",
  },
};

/** A short sample answer per tool: marketplaces (x402scan, Bazaar) show it next to the schema. */
export const EXAMPLES: Record<string, Record<string, unknown>> = {
  argus_launches: { tool: "argus_launches", source: "chain", block: 23226013, data: [{ token: "0x…", symbol: "KELP", creator: "0x…", buyTaxPct: 3, sellTaxPct: 3, block: 23225990 }] },
  argus_bonding: { tool: "argus_bonding", source: "chain", block: 23226013, data: { token: "0x…", symbol: "KELP", priceUsdc: 0.0000025, progress: 0.06, bonded: false, buyTaxPct: 3, sellTaxPct: 3, trades: [] } },
  fucus_oracle: { tool: "fucus_oracle", source: "chain", block: 23226013, data: { reading: "Rising tide: +213 USDC net across 16 recent trades.", netFlowUsdc: 213, mood: "rising", launches: 4, trades: 16 } },
  fuci_risk: { grade: "C", score: 58, label: "Moderate risk", confidence: "medium", redFlags: [], limits: [], factors: [] },
  fuci_kya: { grade: "B", score: 74, label: "Trusted", confidence: "medium", redFlags: [], limits: [], factors: [], subject: { agentId: 196, name: "Fuci" } },
  fuci_agent: { brief: "Newest Argus launches: $KELP leads at 6% to bonding; rising tide (+213 USDC net).", spentUsdc: 0.0035, steps: [] },
};
