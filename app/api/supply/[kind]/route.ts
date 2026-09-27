import { parseAbiItem } from "viem";
import { arcClient } from "@/lib/argus";
import { FUCI_TOKEN } from "@/lib/config";

export const dynamic = "force-dynamic";

/** Tokens that are not circulating: the dev wallet's 1-year Argus lock, and the burn address. */
const LOCKED = ["0xFEe1d11d4501D66D8eA1024dc198ee5663c2bf6B"] as const;
const BURNED = ["0x000000000000000000000000000000000000dEaD"] as const;

const TOTAL = parseAbiItem("function totalSupply() view returns (uint256)");
const BALANCE = parseAbiItem("function balanceOf(address) view returns (uint256)");
const units = (v: bigint) => Number(v / 10n ** 12n) / 1e6; // 18 decimals → whole tokens, 6 dp

/**
 * $FUCI supply for listing sites (CoinGecko, CoinMarketCap), read live from Arc. Plain-text number.
 * - /api/supply/total: minted minus burned
 * - /api/supply/circulating: total minus the locked dev tokens
 */
export async function GET(_req: Request, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  if (kind !== "total" && kind !== "circulating") return new Response("Use /api/supply/total or /api/supply/circulating", { status: 404 });
  try {
    const read = (address: `0x${string}`) => arcClient.readContract({ address: FUCI_TOKEN, abi: [BALANCE], functionName: "balanceOf", args: [address] });
    const [minted, burned, locked] = await Promise.all([
      arcClient.readContract({ address: FUCI_TOKEN, abi: [TOTAL], functionName: "totalSupply" }),
      Promise.all(BURNED.map(read)).then((b) => b.reduce((s, x) => s + x, 0n)),
      Promise.all(LOCKED.map(read)).then((b) => b.reduce((s, x) => s + x, 0n)),
    ]);
    const total = minted - burned;
    const value = kind === "total" ? total : total - locked;
    return new Response(String(units(value)), {
      headers: { "content-type": "text/plain; charset=utf-8", "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600", "Access-Control-Allow-Origin": "*" },
    });
  } catch {
    return new Response("Supply unavailable right now", { status: 503 });
  }
}
