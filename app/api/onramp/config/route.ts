import { NextResponse } from "next/server";
import { ONRAMP_READY } from "@/lib/onramp";

export const dynamic = "force-dynamic";

/** Whether "Buy USDC with card" is available (the kit key is set). */
export function GET() {
  return NextResponse.json({ enabled: ONRAMP_READY }, { headers: { "Cache-Control": "public, s-maxage=60" } });
}
