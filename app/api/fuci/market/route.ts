import { NextResponse } from "next/server";
import { fuciMarket } from "@/lib/publicStats";

export const dynamic = "force-dynamic";

/** $FUCI price and market cap from DexScreener, for the header chip. Cached for a minute. */
export async function GET() {
  const m = await fuciMarket().catch(() => null);
  return NextResponse.json(
    m ? { priceUsd: m.priceUsd, marketCapUsd: m.marketCapUsd, url: m.url } : null,
    { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } },
  );
}
