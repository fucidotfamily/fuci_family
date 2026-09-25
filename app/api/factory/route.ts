import { NextResponse } from "next/server";
import { factoryInfo } from "@/lib/factory";
import { errorResponse } from "@/lib/http";

export const dynamic = "force-dynamic";

/** The agent factory the site uses (null until one is deployed). */
export async function GET() {
  try {
    return NextResponse.json({ factory: await factoryInfo() }, { headers: { "Cache-Control": "public, s-maxage=30" } });
  } catch (e) {
    return errorResponse(e, "factory");
  }
}
