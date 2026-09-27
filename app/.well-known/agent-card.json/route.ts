import { NextResponse } from "next/server";
import { SITE_URL } from "@/lib/config";
import { registrationFile } from "@/lib/agentCard";
import { getHouseAgentId } from "@/lib/erc8004";

export const dynamic = "force-dynamic";

/** ERC-8004 registration file for Fuci's house agent (its tokenURI). */
export async function GET() {
  const agentId = await getHouseAgentId().catch(() => null);
  return NextResponse.json(
    registrationFile({
      name: "Fuci",
      description:
        "Fuci's agent on Arc. It sells live Argus market data over x402 (USDC via Circle Gateway) and trades Argus tokens on autopilot for Fuci agents. Every run can be re-checked by a re-execution validator.",
      image: `${SITE_URL}/brand/fuci-logo.png`,
      agentId,
      web: SITE_URL,
      house: true,
    }),
    { headers: { "Cache-Control": "public, s-maxage=60", "Access-Control-Allow-Origin": "*" } },
  );
}
