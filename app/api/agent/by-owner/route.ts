import { NextResponse, type NextRequest } from "next/server";
import { isAddress } from "viem";
import { agentOf } from "@/lib/store";

export const dynamic = "force-dynamic";

/** The frond owned by a wallet (one wallet, one agent). Agent cards are public. */
export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address") ?? "";
  if (!isAddress(address)) return NextResponse.json({ error: "A wallet address is required" }, { status: 400 });
  const agent = await agentOf(address).catch(() => null);
  return NextResponse.json({ agent }, { headers: { "Cache-Control": "no-store" } });
}
