import { NextResponse } from "next/server";
import { getLaunches } from "@/lib/argus";
import { errorResponse } from "@/lib/http";
import { recordLaunchesScanned } from "@/lib/store";
import { toolById } from "@/lib/tools";
import { paid } from "@/lib/x402";

export const dynamic = "force-dynamic";

export const GET = paid(toolById("argus_launches")!, async () => {
  try {
    const launches = await getLaunches(8);
    await recordLaunchesScanned(launches.data.length);
    return NextResponse.json({ tool: "argus_launches", ...launches });
  } catch (e) {
    return errorResponse(e, "argus_launches");
  }
});
