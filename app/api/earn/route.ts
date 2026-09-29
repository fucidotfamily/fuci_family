import { NextResponse } from "next/server";
import { EARN_FEE_PCT, earnVaults } from "@/lib/earn";
import { errorResponse } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Earn vaults for USDC and EURC on Arc (Circle Earn Kit), best APY first. Free, cached 5 minutes. */
export async function GET() {
  try {
    const vaults = await earnVaults();
    return NextResponse.json(
      { chain: "Arc", feePctOfYield: EARN_FEE_PCT, vaults },
      { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } },
    );
  } catch (e) {
    return errorResponse(e, "earn");
  }
}
