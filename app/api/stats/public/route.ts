import { NextResponse } from "next/server";
import { getPublicStats } from "@/lib/publicStats";

export const dynamic = "force-dynamic";

/** Fuci in numbers as JSON, for listing sites, dashboards and agents. Same data as /stats. */
export async function GET() {
  const stats = await getPublicStats();
  return NextResponse.json(stats, {
    headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300", "Access-Control-Allow-Origin": "*" },
  });
}
