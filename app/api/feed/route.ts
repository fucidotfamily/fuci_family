import { NextResponse } from "next/server";
import { liveFeed } from "@/lib/feed";

export const dynamic = "force-dynamic";

/** The live activity feed (x402 payments and on-chain agent events). Cached briefly at the edge. */
export async function GET() {
  const items = await liveFeed().catch(() => []);
  return NextResponse.json(
    { items },
    {
      headers: {
        "Cache-Control":
          "public, max-age=0, s-maxage=10, stale-while-revalidate=30",
      },
    },
  );
}
