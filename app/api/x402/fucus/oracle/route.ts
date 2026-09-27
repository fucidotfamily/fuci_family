import { NextResponse } from "next/server";
import { getTide } from "@/lib/argus";
import { errorResponse } from "@/lib/http";
import { toolById } from "@/lib/tools";
import { paid } from "@/lib/x402";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export const GET = paid(toolById("fucus_oracle")!, async (req) => {
  try {
    const n = Number(req.nextUrl.searchParams.get("launches") ?? 4);
    return NextResponse.json({
      tool: "fucus_oracle",
      ...(await getTide(
        Number.isFinite(n) ? Math.min(6, Math.max(1, Math.round(n))) : 4,
      )),
    });
  } catch (e) {
    return errorResponse(e, "fucus_oracle");
  }
});
