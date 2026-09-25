import { NextResponse, type NextRequest } from "next/server";
import { allow, pushHistory, resolveAgent, saveAgent, setTradingActive, tradeSpentToday } from "@/lib/store";
import { OwnerError, verifyOwner } from "@/lib/ownerAuth";
import { normalizeTrading, tradingDetail, type TradingSettings } from "@/lib/tradingRules";
import { ensureAgentWallet } from "@/lib/agentWallets";
import { ARC_NETWORK } from "@/lib/config";
import { errorResponse } from "@/lib/http";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Trading settings, open positions with live PnL, and today's buys. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { agent } = await resolveAgent((await params).id);
  if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  const { positionsView } = await import("@/lib/trading");
  const positions = agent.wallet ? await positionsView(agent.id).catch(() => []) : [];
  return NextResponse.json(
    { trading: agent.trading ?? null, positions, spentToday: await tradeSpentToday(agent.id), available: ARC_NETWORK === "mainnet" },
    { headers: { "Cache-Control": "no-store" } },
  );
}

type Body = { action?: "save" | "sell" | "buy"; usdc?: number; settings?: Partial<TradingSettings>; token?: string; pct?: number; address?: string; issuedAt?: number; signature?: string };

/** Owner-signed: save trading settings, or sell a position (or all of them) now. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";
  if (!(await allow(`trading:${ip}`, 30, 600))) return NextResponse.json({ error: "Too many requests. Try again later." }, { status: 429 });
  if (ARC_NETWORK !== "mainnet") return NextResponse.json({ error: "Trading runs on Arc mainnet only" }, { status: 400 });
  const b = (await req.json().catch(() => ({}))) as Body;
  try {
    if (b.action === "buy") {
      const token = /^0x[0-9a-fA-F]{40}$/.test(b.token ?? "") ? (b.token!.toLowerCase() as `0x${string}`) : null;
      const usdc = Math.round(Number(b.usdc) * 100) / 100;
      if (!token || !(usdc >= 0.1 && usdc <= 100)) return NextResponse.json({ error: "Pick a token and 0.10–100 USDC" }, { status: 400 });
      const agent = await verifyOwner(id, "buy", b, `${token} ${usdc}`);
      const { buyNow } = await import("@/lib/trading");
      try {
        const r = await buyNow(agent.id, token, usdc);
        return NextResponse.json({ ok: true, symbol: r.symbol, usdc: r.usdc, price: r.price, tx: r.tx });
      } catch (e) {
        return NextResponse.json({ error: (e as Error).message.slice(0, 240) }, { status: 400 });
      }
    }
    if (b.action === "sell") {
      const token = b.token === "all" ? "all" : /^0x[0-9a-fA-F]{40}$/.test(b.token ?? "") ? (b.token!.toLowerCase() as `0x${string}`) : null;
      const pct = Math.round(Number(b.pct ?? 100));
      if (!token || !(pct >= 1 && pct <= 100)) return NextResponse.json({ error: "Pick a position and a percent" }, { status: 400 });
      const agent = await verifyOwner(id, "sell", b, `${token} ${pct}%`);
      const { sellNow } = await import("@/lib/trading");
      const r = await sellNow(agent.id, token, pct);
      if (!r.sold && r.errors.length) return NextResponse.json({ error: r.errors.join("; ") }, { status: 502 });
      return NextResponse.json({ ok: true, ...r });
    }

    let settings: TradingSettings;
    try {
      settings = normalizeTrading(b.settings ?? {});
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 400 });
    }
    const agent = await verifyOwner(id, "set-trading", b, tradingDetail(settings));
    agent.wallet ??= await ensureAgentWallet(agent.id);
    const wasOn = Boolean(agent.trading?.enabled);
    agent.trading = { ...settings, failures: 0, lastRunAt: agent.trading?.lastRunAt };
    await saveAgent(agent);
    await setTradingActive(agent.id, settings.enabled);
    if (settings.enabled !== wasOn) await pushHistory(agent.id, { kind: "trade", label: settings.enabled ? `Trading on: ${settings.rules.length} rule(s), up to ${settings.perTradeUsdc} USDC a trade` : "Trading off" });
    return NextResponse.json({ ok: true, trading: agent.trading, wallet: agent.wallet });
  } catch (e) {
    if (e instanceof OwnerError) return NextResponse.json({ error: e.message }, { status: e.status });
    return errorResponse(e, "trading");
  }
}
