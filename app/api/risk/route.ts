import { NextResponse, type NextRequest } from "next/server";
import { allow } from "@/lib/store";
import { getRisk, RiskInputError } from "@/lib/risk";
import { errorResponse } from "@/lib/http";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Free risk report for people using fuci.family/risk (rate-limited). Agents use the x402 route. */
export async function GET(req: NextRequest) {
  const target = req.nextUrl.searchParams.get("token") ?? req.nextUrl.searchParams.get("protocol") ?? req.nextUrl.searchParams.get("target") ?? "";
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";
  if (!(await allow(`risk:${ip}`, 30, 600))) return NextResponse.json({ error: "Too many checks. Try again in a few minutes." }, { status: 429 });
  try {
    return NextResponse.json(await getRisk(target));
  } catch (e) {
    if (e instanceof RiskInputError) return NextResponse.json({ error: e.message }, { status: 400 });
    return errorResponse(e, "risk");
  }
}
