import { NextResponse } from "next/server";
import { isHash } from "@/lib/runs";
import { kvGet } from "@/lib/store";
import type { ValidationReport } from "@/lib/validator";

export const dynamic = "force-dynamic";

/** The validator's report for a run: the ERC-8004 validation responseURI. */
export async function GET(_req: Request, { params }: { params: Promise<{ hash: string }> }) {
  const { hash } = await params;
  const report = isHash(hash) ? await kvGet<ValidationReport>(`validation:${hash.toLowerCase()}`) : null;
  if (!report) return NextResponse.json({ error: "No validation report for this run yet" }, { status: 404 });
  return NextResponse.json(report, { headers: { "Cache-Control": "public, s-maxage=3600", "Access-Control-Allow-Origin": "*" } });
}
