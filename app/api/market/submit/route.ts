import { NextResponse, type NextRequest } from "next/server";
import { submitListing } from "@/lib/market";
import { allow } from "@/lib/store";

export const dynamic = "force-dynamic";

/** A seller lists a paid endpoint. It is checked live before it appears. */
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";
  if (!(await allow(`market-submit:${ip}`, 10, 3600))) return NextResponse.json({ error: "Too many submissions. Try again in an hour." }, { status: 429 });
  const body = (await req.json().catch(() => null)) as { url?: unknown; method?: unknown } | null;
  if (typeof body?.url !== "string" || body.url.length > 500) return NextResponse.json({ error: "Send { url } of your paid endpoint." }, { status: 400 });
  const result = await submitListing(body.url, body.method === "POST" ? "POST" : "GET");
  if ("error" in result) return NextResponse.json(result, { status: 422 });
  return NextResponse.json({ listing: result });
}
