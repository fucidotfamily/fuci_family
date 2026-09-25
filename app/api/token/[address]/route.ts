import { NextResponse } from "next/server";
import { type Address } from "viem";
import { argusTokenUrl, bondProgress, launchOf, poolPrice } from "@/lib/argus";
import { marketOf } from "@/lib/trade";
import { errorResponse } from "@/lib/http";

export const dynamic = "force-dynamic";

/** An Argus token at a glance: symbol, price in USDC, taxes, and how close it is to bonding. */
export async function GET(_req: Request, { params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) return NextResponse.json({ error: "Paste a token contract address (0x…)" }, { status: 400 });
  try {
    const m = await marketOf(address as Address);
    if (!m) return NextResponse.json({ error: "Not an Argus token. Paste the contract of a USDC token launched on Argus." }, { status: 404 });
    const info = (await launchOf(m.token))!;
    const { priceUsdc, tick } = await poolPrice(m, m.decimals);
    return NextResponse.json(
      {
        token: m.token,
        symbol: m.symbol,
        price: priceUsdc,
        bonded: m.bonded,
        progressPct: bondProgress(info, tick, m.bonded) * 100,
        buyTaxPct: m.buyTaxPct,
        sellTaxPct: m.sellTaxPct,
        creator: m.creator,
        argusUrl: argusTokenUrl(m.token),
      },
      { headers: { "Cache-Control": "public, s-maxage=15, stale-while-revalidate=30" } },
    );
  } catch (e) {
    return errorResponse(e, "token");
  }
}
