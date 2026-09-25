import { NextResponse } from "next/server";
import { X402_NETWORK, ARC_NETWORK, explorerAddress } from "@/lib/config";
import { AGENT_MODE, agentAddress } from "@/lib/agentWallet";
import { sellerAddress } from "@/lib/circle";

export const dynamic = "force-dynamic";

/** Public info about the house agent wallet and where x402 payments go. */
export async function GET() {
  const [agent, seller] = await Promise.all([agentAddress().catch(() => null), sellerAddress().catch(() => null)]);
  return NextResponse.json({
    network: X402_NETWORK,
    arc: ARC_NETWORK,
    seller: seller ? { address: seller, explorer: explorerAddress(seller) } : null,
    agent: agent ? { address: agent, mode: AGENT_MODE, explorer: explorerAddress(agent) } : null,
    live: { seller: Boolean(seller), agent: Boolean(agent) },
  });
}
