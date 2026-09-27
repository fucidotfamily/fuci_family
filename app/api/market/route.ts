import { NextResponse, type NextRequest } from "next/server";
import { after } from "next/server";
import { getMarket, rebuildMarket, searchMarket } from "@/lib/market";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Free: search every paid x402 API on Arc. ?q=web+search&limit=20 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const q = (sp.get("q") ?? "").slice(0, 80);
  const limit = Math.min(100, Math.max(1, Number(sp.get("limit")) || 50));
  let { market, stale } = await getMarket();
  if (!market) {
    market = await rebuildMarket(req.nextUrl.origin).catch(() => null);
    stale = false;
  }
  if (stale) after(() => rebuildMarket(req.nextUrl.origin).catch(() => undefined));
  const hits = searchMarket(market?.listings ?? [], q);
  return NextResponse.json(
    { query: q, total: hits.length, sellers: market?.sellers ?? 0, builtAt: market?.builtAt ?? null, listings: hits.slice(0, limit) },
    { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120", "Access-Control-Allow-Origin": "*" } },
  );
}
