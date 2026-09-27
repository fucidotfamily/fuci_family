import { NextResponse, type NextRequest } from "next/server";
import { searchProtocols } from "@/lib/risk";
import { errorResponse } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Protocol name suggestions for the /risk search box. */
export async function GET(req: NextRequest) {
  try {
    return NextResponse.json({ protocols: await searchProtocols(req.nextUrl.searchParams.get("q") ?? "") });
  } catch (e) {
    return errorResponse(e, "risk/search");
  }
}
