import { NextResponse, after, type NextRequest } from "next/server";
import { queryIndex, rebuildIndex, storedIndex, type SortKey } from "@/lib/agentIndex";
import { allow } from "@/lib/store";
import { errorResponse } from "@/lib/http";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SORTS: SortKey[] = ["ranked", "newest", "rated"];

/**
 * Every ERC-8004 agent on Arc, ranked by x402 support and completeness.
 * Optional ?q= (name, description, host, owner or #id), ?sort=ranked|newest|rated, ?x402=1.
 * The index is served from storage and rebuilt in the background when it is over 10 minutes old.
 */
export async function GET(req: NextRequest) {
  try {
    const stored = await storedIndex();
    const index = stored.index ?? (await rebuildIndex());
    if (stored.index && stored.stale && (await allow("agent-index-rebuild", 1, 120))) after(() => rebuildIndex().catch(() => undefined));

    const sp = req.nextUrl.searchParams;
    const q = (sp.get("q") ?? "").slice(0, 80);
    const sort = SORTS.includes(sp.get("sort") as SortKey) ? (sp.get("sort") as SortKey) : "ranked";
    const x402 = sp.get("x402") === "1";
    const agents = q || x402 || sort !== "ranked" ? queryIndex([...index.agents], q, sort, x402) : [...index.agents].sort((a, b) => a.rank - b.rank);
    return NextResponse.json(
      { network: index.network, total: index.total, builtAt: index.builtAt, matches: agents.length, agents },
      { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=600" } },
    );
  } catch (e) {
    return errorResponse(e, "erc8004/directory");
  }
}
