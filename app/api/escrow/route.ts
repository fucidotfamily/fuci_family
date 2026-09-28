import { NextResponse } from "next/server";
import { escrowInfo, recentJobs } from "@/lib/escrow";
import { errorResponse } from "@/lib/http";

export const dynamic = "force-dynamic";

/** The escrow contract's state (USDC locked, caps, fee) and its newest jobs. Read from Arc. */
export async function GET() {
  try {
    const info = await escrowInfo();
    const jobs = info ? await recentJobs(20) : [];
    return NextResponse.json({ escrow: info, jobs }, { headers: { "Cache-Control": "public, s-maxage=15, stale-while-revalidate=60" } });
  } catch (e) {
    return errorResponse(e, "escrow");
  }
}
