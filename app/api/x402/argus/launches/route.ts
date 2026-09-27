import { NextResponse } from "next/server";
import { getLaunches } from "@/lib/argus";
import { errorResponse } from "@/lib/http";
import { recordLaunchesScanned } from "@/lib/store";
import { toolById } from "@/lib/tools";
import { paid } from "@/lib/x402";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export const GET = paid(toolById("argus_launches")!, async (req) => {
  try {
    const n = Number(req.nextUrl.searchParams.get("limit") ?? 8);
    const launches = await getLaunches(
      Number.isFinite(n) ? Math.min(20, Math.max(1, Math.round(n))) : 8,
    );
    await recordLaunchesScanned(launches.data.length);
    return NextResponse.json({ tool: "argus_launches", ...launches });
  } catch (e) {
    return errorResponse(e, "argus_launches");
  }
});
