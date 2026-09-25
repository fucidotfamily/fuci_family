import { NextResponse } from "next/server";
import { explorerAgent, readAgent, reputationOf, validationsOf } from "@/lib/erc8004";
import { errorResponse } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Identity, reputation summary and recent validations for one ERC-8004 agent. */
export async function GET(_req: Request, { params }: { params: Promise<{ agentId: string }> }) {
  const { agentId } = await params;
  const id = Number(agentId);
  if (!Number.isInteger(id) || id < 0) return NextResponse.json({ error: "Bad agentId" }, { status: 400 });
  try {
    const [agent, reputation, validations] = await Promise.all([readAgent(id), reputationOf(id), validationsOf(id).catch(() => [])]);
    return NextResponse.json(
      { ...agent, explorer: explorerAgent(id), reputation, validations },
      { headers: { "Cache-Control": "public, s-maxage=20, stale-while-revalidate=60" } },
    );
  } catch (e) {
    return errorResponse(e, "erc8004/agent");
  }
}
