import { NextResponse, type NextRequest } from "next/server";
import { getKya, KyaInputError } from "@/lib/kya";
import { errorResponse } from "@/lib/http";
import { toolById } from "@/lib/tools";
import { paid } from "@/lib/x402";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export const GET = paid(toolById("fuci_kya")!, async (req: NextRequest) => {
  try {
    const agent = req.nextUrl.searchParams.get("agent") ?? req.nextUrl.searchParams.get("address") ?? req.nextUrl.searchParams.get("agentId") ?? "";
    return NextResponse.json({ tool: "fuci_kya", ...(await getKya(agent)) });
  } catch (e) {
    if (e instanceof KyaInputError) return NextResponse.json({ error: e.message }, { status: 400 });
    return errorResponse(e, "fuci_kya");
  }
});
