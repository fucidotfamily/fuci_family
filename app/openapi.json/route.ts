import { NextResponse, type NextRequest } from "next/server";
import { TOOLS, priceToNumber, type FuciTool } from "@/lib/tools";
import { X402_NETWORKS } from "@/lib/config";

/** Public contact for agents and marketplaces (optional; set FUCI_CONTACT_EMAIL). */
const CONTACT_EMAIL = process.env.FUCI_CONTACT_EMAIL?.trim();

const GUIDANCE =
  "Fuci sells on-chain data about Arc to AI agents, paid per call in USDC over x402 (Circle Gateway, gas-free for the buyer; pay from Arc, Base, Arbitrum, Ethereum, Optimism, Polygon, Avalanche and more). " +
  "Every paid call first returns 402 with the price; pay and retry to get JSON. " +
  "Use argus_launches for the newest token launches on Argus (Arc's launchpad), argus_bonding for one token's price, bonding progress and recent trades, " +
  "fucus_oracle for a one-sentence market mood, and fuci_risk for an A–F risk grade of any Arc token (0x address) or DeFi protocol (DefiLlama slug) before allocating capital, and fuci_kya (Know Your Agent) for an A–F trust grade of another agent (ERC-8004 id or wallet) before paying, hiring or trusting it. " +
  "fuci_agent answers a free-text question by buying the tools it needs. All data is read live from Arc and public sources; unknown values are reported as unknown, never guessed.";

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

const RESPONSES: Record<string, Record<string, unknown>> = {
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

function operation(t: FuciTool) {
  const fields = Object.entries(t.input ?? {});
  const required = fields.filter(([, v]) => !v.optional).map(([k]) => k);
  const amount = priceToNumber(t.price).toFixed(6);
  return {
    operationId: t.id,
    summary: t.name,
    description: `${t.description} Price: ${t.price} USDC per call over x402.`,
    tags: ["Paid tools"],
    ...(t.method === "GET"
      ? {
          parameters: fields.map(([name, v]) => ({
            name,
            in: "query",
            required: !v.optional,
            description: v.description,
            schema: { type: v.type, description: v.description },
          })),
        }
      : {
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  ...(required.length ? { required } : {}),
                  properties: Object.fromEntries(
                    fields.map(([k, v]) => [
                      k,
                      { type: v.type, description: v.description },
                    ]),
                  ),
                },
              },
            },
          },
        }),
    "x-payment-info": {
      price: { mode: "fixed", currency: "USDC", amount },
      protocols: [
        {
          x402: {
            scheme: "exact",
            networks: X402_NETWORKS.map((n) => ({
              network: n.network,
              name: n.name,
              asset: n.usdc,
            })),
          },
        },
      ],
    },
    responses: {
      "200": {
        description: "OK. The data, paid for.",
        content: {
          "application/json": { schema: RESPONSES[t.id] ?? { type: "object" } },
        },
      },
      "400": { description: "Invalid input (not charged)." },
      "402": {
        description:
          "Payment Required. The x402 challenge (PAYMENT-REQUIRED header) with the price, network and receiver.",
      },
    },
  };
}

/** OpenAPI 3.1 description of every paid Fuci endpoint, for agent marketplaces and x402 clients. */
export function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const paths: Record<string, Record<string, unknown>> = {};
  for (const t of TOOLS)
    paths[t.path] = {
      ...paths[t.path],
      [t.method.toLowerCase()]: operation(t),
    };
  return NextResponse.json(
    {
      openapi: "3.1.0",
      info: {
        title: "Fuci",
        version: "1.0.0",
        summary:
          "On-chain data tools for AI agents on Arc, paid per call in USDC over x402.",
        description:
          "Paid data tools for AI agents on Arc: Argus launches, bonding, market mood and A–F risk ratings. Settled in USDC over x402 via Circle Gateway.",
        "x-guidance": GUIDANCE,
        "x-logo": { url: `${origin}/brand/fuci-logo-512.png`, altText: "Fuci" },
        license: { name: "MIT", identifier: "MIT" },
        contact: {
          name: "Fuci",
          url: `${origin}/docs`,
          ...(CONTACT_EMAIL ? { email: CONTACT_EMAIL } : {}),
        },
      },
      // No API keys: every paid call is authorized by its x402 payment.
      security: [],
      externalDocs: {
        description: "Docs, examples and the MCP server",
        url: `${origin}/docs`,
      },
      servers: [{ url: origin }],
      tags: [
        {
          name: "Paid tools",
          description:
            "Each call costs a fixed USDC price, paid over x402 on Arc.",
        },
      ],
      paths,
    },
    {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=300, s-maxage=3600",
      },
    },
  );
}
