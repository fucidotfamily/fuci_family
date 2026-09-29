import { NextResponse } from "next/server";
import { AGENT_REGISTRY_REF, getHouseAgentId } from "@/lib/erc8004";
import { storedIndex } from "@/lib/agentIndex";

export const dynamic = "force-dynamic";

/**
 * ERC-8004 endpoint domain verification: every agent whose registration file lives on this domain,
 * so explorers (8004scan and others) can confirm the domain belongs to those agents.
 * https://eips.ethereum.org/EIPS/eip-8004#endpoint-domain-verification-optional
 */
export async function GET() {
  const [house, { index }] = await Promise.all([getHouseAgentId().catch(() => null), storedIndex().catch(() => ({ index: null }))]);
  const ids = new Set<number>();
  if (house !== null) ids.add(house);
  for (const a of index?.agents ?? []) if (a.fuci) ids.add(a.agentId);
  return NextResponse.json(
    { registrations: [...ids].sort((a, b) => a - b).map((agentId) => ({ agentId, agentRegistry: AGENT_REGISTRY_REF })) },
    { headers: { "Cache-Control": "public, s-maxage=300", "Access-Control-Allow-Origin": "*" } },
  );
}
