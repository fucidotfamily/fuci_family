import { NextResponse, type NextRequest } from "next/server";
import { TOOLS, priceToNumber, type FuciTool } from "@/lib/tools";
import { RESPONSES } from "@/lib/toolSchemas";
import { CONTACT_EMAIL as PROJECT_EMAIL, X402_NETWORKS } from "@/lib/config";

/** Public contact for agents and marketplaces (FUCI_CONTACT_EMAIL overrides the project address). */
const CONTACT_EMAIL = process.env.FUCI_CONTACT_EMAIL?.trim() || PROJECT_EMAIL;

const GUIDANCE =
  "Fuci sells on-chain data about Arc to AI agents, paid per call in USDC over x402 (Circle Gateway, gas-free for the buyer; pay from Arc, Base, Arbitrum, Ethereum, Optimism, Polygon, Avalanche and more). " +
  "Every paid call first returns 402 with the price; pay and retry to get JSON. " +
  "Use argus_launches for the newest token launches on Argus (Arc's launchpad), argus_bonding for one token's price, bonding progress and recent trades, " +
  "fucus_oracle for a one-sentence market mood, and fuci_risk for an A–F risk grade of any Arc token (0x address) or DeFi protocol (DefiLlama slug) before allocating capital, and fuci_kya (Know Your Agent) for an A–F trust grade of another agent (ERC-8004 id or wallet) before paying, hiring or trusting it. " +
  "fuci_agent answers a free-text question by buying the tools it needs. All data is read live from Arc and public sources; unknown values are reported as unknown, never guessed.";

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
    // Discovery format read by x402scan and agent clients: an ISO-4217 price (USD, settled in USDC)
    // and the protocols accepted, one object per protocol.
    "x-payment-info": {
      price: { mode: "fixed", currency: "USD", amount },
      protocols: [
        {
          x402: {
            scheme: "exact",
            asset: "USDC",
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
