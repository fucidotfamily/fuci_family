import { getHistory, kvGet, kvSet } from "./store";

/**
 * An agent's trading totals, for its PnL: every USDC its autopilot (and its owner, from the
 * agent page) spent buying and received selling. PnL = sold + value of what it still holds − bought.
 * Kept as running totals; the first read rebuilds them from the agent's trade history.
 */
export type Totals = { boughtUsdc: number; soldUsdc: number; buys: number; sells: number; since: number | null };

const key = (agentId: string) => `trade:totals:${agentId}`;
const BUY = /^Bought \$\S+ for ([\d.]+) USDC/;
const SELL = /^Sold \$\S+ for ([\d.]+) USDC/;
const r2 = (n: number) => Math.round(n * 1e6) / 1e6;

/** Totals from the trade lines in the agent's history (the latest 200 events). */
async function fromHistory(agentId: string): Promise<Totals> {
  const events = (await getHistory(agentId, 200).catch(() => [])).filter((e) => e.kind === "trade");
  const t: Totals = { boughtUsdc: 0, soldUsdc: 0, buys: 0, sells: 0, since: null };
  for (const e of events) {
    const b = BUY.exec(e.label);
    const s = SELL.exec(e.label);
    if (b) {
      t.boughtUsdc += Number(b[1]);
      t.buys++;
    } else if (s) {
      t.soldUsdc += Number(s[1]);
      t.sells++;
    } else continue;
    t.since = Math.min(t.since ?? e.at, e.at);
  }
  return { ...t, boughtUsdc: r2(t.boughtUsdc), soldUsdc: r2(t.soldUsdc) };
}

export async function totalsOf(agentId: string): Promise<Totals> {
  const hit = await kvGet<Totals>(key(agentId)).catch(() => null);
  if (hit) return hit;
  const t = await fromHistory(agentId);
  await kvSet(key(agentId), t).catch(() => undefined);
  return t;
}

/** Count one trade. Call before the trade's history line is written (the first call rebuilds from history). */
export async function addTrade(agentId: string, side: "buy" | "sell", usdc: number) {
  const t = await totalsOf(agentId);
  const next: Totals =
    side === "buy"
      ? { ...t, boughtUsdc: r2(t.boughtUsdc + usdc), buys: t.buys + 1, since: t.since ?? Date.now() }
      : { ...t, soldUsdc: r2(t.soldUsdc + usdc), sells: t.sells + 1, since: t.since ?? Date.now() };
  await kvSet(key(agentId), next);
}

export type Pnl = Totals & { openValueUsdc: number; pnlUsdc: number; pnlPct: number | null };

/** PnL given the current value of the open positions. */
export function pnlFrom(t: Totals, openValueUsdc: number): Pnl {
  const pnlUsdc = r2(t.soldUsdc + openValueUsdc - t.boughtUsdc);
  return { ...t, openValueUsdc: r2(openValueUsdc), pnlUsdc, pnlPct: t.boughtUsdc > 0 ? Math.round((pnlUsdc / t.boughtUsdc) * 1000) / 10 : null };
}

export async function pnlOf(agentId: string): Promise<Pnl> {
  const { positionsView } = await import("./trading");
  const [t, positions] = await Promise.all([totalsOf(agentId), positionsView(agentId).catch(() => [])]);
  return pnlFrom(t, positions.reduce((s, p) => s + (p.valueUsdc ?? 0), 0));
}
