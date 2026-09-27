import { NextResponse, type NextRequest } from "next/server";
import { TOOLS } from "@/lib/tools";
import { requirementsFor } from "@/lib/x402";
import { X402_NETWORK, X402_NETWORKS } from "@/lib/config";
import { sellerAddress } from "@/lib/circle";

export const dynamic = "force-dynamic";

/** Discovery manifest so other agents can find and pay for Fuci tools. */
export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const payTo = await sellerAddress().catch(() => null);
  return NextResponse.json({
    name: "Fuci",
    description:
      "An agentic kelp forest on Arc. Paid data tools for AI agents, settled in USDC over x402 via Circle Gateway.",
    x402Version: 2,
    network: X402_NETWORK,
    networks: X402_NETWORKS.map((n) => n.network),
    live: Boolean(payTo),
    mcp: `${origin}/api/mcp`,
    openapi: `${origin}/openapi.json`,
    llms: `${origin}/llms.txt`,
    agentCard: `${origin}/.well-known/agent-card.json`,
    resources: TOOLS.map((t) => ({
      id: t.id,
      name: t.name,
      method: t.method,
      url: `${origin}${t.path}`,
      price: t.price,
      input: t.input ?? null,
      accepts: payTo
        ? requirementsFor(t, `${origin}${t.path}`, payTo).accepts
        : [],
    })),
  });
}
