import { NextResponse, type NextRequest } from "next/server";
import { allow } from "@/lib/store";
import { getKya, KyaInputError } from "@/lib/kya";
import { errorResponse } from "@/lib/http";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Free agent check for people using fuci.family/kya (rate-limited). Agents use the x402 route. */
export async function GET(req: NextRequest) {
  const agent = req.nextUrl.searchParams.get("agent") ?? "";
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";
  if (!(await allow(`kya:${ip}`, 30, 600))) return NextResponse.json({ error: "Too many checks. Try again in a few minutes." }, { status: 429 });
  try {
    return NextResponse.json(await getKya(agent));
  } catch (e) {
    if (e instanceof KyaInputError) return NextResponse.json({ error: e.message }, { status: 400 });
    return errorResponse(e, "kya");
  }
}
