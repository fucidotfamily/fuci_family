import { NextResponse } from "next/server";
import { getStats } from "@/lib/store";
import { TITHE_BPS } from "@/lib/config";

export const dynamic = "force-dynamic";

export async function GET() {
  const stats = await getStats();
  // On-chain ERC-8004 reputation for fronds that registered an identity.
  const { reputationOf } = await import("@/lib/erc8004");
  const top = await Promise.all(
    stats.top.map(async (a) => ({ ...a, reputation: a.erc8004Id === undefined ? null : await reputationOf(a.erc8004Id).catch(() => null) })),
  );
  stats.top = top;
  return NextResponse.json(
    { ...stats, titheUsdc: (stats.usdcSettled * TITHE_BPS) / 10_000, titheBps: TITHE_BPS },
    { headers: { "Cache-Control": "public, s-maxage=5, stale-while-revalidate=30" } },
  );
}
