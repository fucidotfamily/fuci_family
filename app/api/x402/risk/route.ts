import { NextResponse, type NextRequest } from "next/server";
import { getRisk, RiskInputError } from "@/lib/risk";
import { errorResponse } from "@/lib/http";
import { toolById } from "@/lib/tools";
import { paid } from "@/lib/x402";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const GET = paid(toolById("fuci_risk")!, async (req: NextRequest) => {
  try {
    const target =
      req.nextUrl.searchParams.get("target") ??
      req.nextUrl.searchParams.get("token") ??
      req.nextUrl.searchParams.get("protocol") ??
      "";
    return NextResponse.json({ tool: "fuci_risk", ...(await getRisk(target)) });
  } catch (e) {
    if (e instanceof RiskInputError)
      return NextResponse.json({ error: e.message }, { status: 400 });
    return errorResponse(e, "fuci_risk");
  }
});
