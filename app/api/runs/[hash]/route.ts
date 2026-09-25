import { NextResponse } from "next/server";
import { getRun, isHash } from "@/lib/runs";

export const dynamic = "force-dynamic";

/** A stored agent run: the ERC-8004 validation requestURI. Its keccak256 is the requestHash. */
export async function GET(_req: Request, { params }: { params: Promise<{ hash: string }> }) {
  const { hash } = await params;
  const run = isHash(hash) ? await getRun(hash) : null;
  if (!run) return NextResponse.json({ error: "Run not found" }, { status: 404 });
  return NextResponse.json(run, { headers: { "Cache-Control": "public, s-maxage=3600", "Access-Control-Allow-Origin": "*" } });
}
