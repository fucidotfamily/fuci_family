import { graduatedTokens } from "./argusRegistry";
import { cachedRisk, type RiskReport } from "./risk";
import { tokenRisk } from "./risk/token";
import { kvGet, kvSet } from "./store";

/**
 * Token picks that passed a safety screen, for "which token looks good / bullish" questions.
 * Fuci agents only name tokens from this list, never a fresh launch with no holders or a likely rug.
 *
 *   1. Candidates: Argus tokens that graduated (bonded), from the on-chain registry (lib/argusRegistry.ts).
 *   2. Market screen: liquidity, 24h volume, 24h trades and pool age above the thresholds below.
 *   3. Safety screen: Fuci's own risk check (holders and top-10 concentration, contract powers such as mint,
 *      freeze and upgradeable code, liquidity depth). Grade D or F, or a rug red flag, is out.
 *   4. Rank: buy pressure (24h buys vs sells), price trend and volume.
 */

export const SCREEN = {
  minLiquidityUsd: 20_000,
  minVolume24hUsd: 10_000,
  minTxns24h: 50,
  minAgeHours: 24,
  minHolders: 100,
  maxTop10Pct: 50,
};

export type Pick = {
  symbol: string;
  name: string;
  token: string;
  priceUsd: number | null;
  change24hPct: number | null;
  liquidityUsd: number;
  volume24hUsd: number;
  buys24h: number;
  sells24h: number;
  ageDays: number | null;
  grade: string | null;
  riskLabel: string;
  holders: number | null;
  top10Pct: number | null;
  redFlags: string[];
  url: string;
};

export type Screen = {
  at: number;
  rules: typeof SCREEN;
  picks: Pick[];
  /** Graduated Argus tokens looked at. */
  checked: number;
  rejected: { market: number; safety: number };
};

type Pair = {
  chainId: string;
  url: string;
  baseToken: { address: string; name: string; symbol: string };
  quoteToken: { symbol: string };
  priceUsd?: string;
  priceChange?: { h24?: number };
  liquidity?: { usd?: number };
  volume?: { h24?: number };
  txns?: { h24?: { buys: number; sells: number } };
  pairCreatedAt?: number;
};

const KEY = "picks:v1";
const TTL_SEC = 15 * 60;
const MAX_RISK_CHECKS = 10;

/** Fuci's risk report for a token: the cached one, or a fresh check with a time budget (no request hooks, so it
 *  also runs from the cron's background work). Finished reports are cached like the Risk page's. */
async function riskOf(token: string): Promise<RiskReport | null> {
  const hit = await cachedRisk(token);
  if (hit) return hit;
  const r = await tokenRisk(token, { scanBudgetMs: 12_000 }).catch(() => null);
  if (r && !r.partial) await kvSet(`risk:v2:${token.toLowerCase()}`, r, 15 * 60).catch(() => undefined);
  return r;
}

const get = async <T>(url: string): Promise<T | null> => {
  const r = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8000) }).catch(() => null);
  return r?.ok ? ((await r.json().catch(() => null)) as T | null) : null;
};

/** One row per token: its pairs on Arc summed, with the deepest pair's URL and price. */
function byToken(pairs: Pair[]) {
  const m = new Map<string, Pair[]>();
  for (const p of pairs) {
    if (p.chainId !== "arc") continue;
    const k = p.baseToken.address.toLowerCase();
    m.set(k, [...(m.get(k) ?? []), p]);
  }
  return [...m.entries()].map(([token, ps]) => {
    const top = ps.reduce((a, b) => ((b.liquidity?.usd ?? 0) > (a.liquidity?.usd ?? 0) ? b : a));
    const created = ps.map((p) => p.pairCreatedAt).filter((x): x is number => typeof x === "number");
    return {
      token,
      symbol: top.baseToken.symbol,
      name: top.baseToken.name,
      url: top.url,
      priceUsd: top.priceUsd ? Number(top.priceUsd) : null,
      change24hPct: top.priceChange?.h24 ?? null,
      liquidityUsd: ps.reduce((s, p) => s + (p.liquidity?.usd ?? 0), 0),
      volume24hUsd: ps.reduce((s, p) => s + (p.volume?.h24 ?? 0), 0),
      buys24h: ps.reduce((s, p) => s + (p.txns?.h24?.buys ?? 0), 0),
      sells24h: ps.reduce((s, p) => s + (p.txns?.h24?.sells ?? 0), 0),
      ageDays: created.length ? (Date.now() - Math.min(...created)) / 86_400_000 : null,
    };
  });
}

/** Holder count and top-10 share, read from the risk report's holders check. */
function holdersOf(r: RiskReport) {
  const f = r.factors.find((x) => x.key === "holders");
  const count = f?.summary.match(/([\d,]+) holders in total/)?.[1];
  const top10 = f?.summary.match(/10 largest holders hold ([\d.]+)%/)?.[1];
  return { holders: count ? Number(count.replace(/,/g, "")) : null, top10Pct: top10 ? Number(top10) : null };
}

/** Rug signals from the risk check that rule a token out whatever its grade. */
const RUG = /upgradeable|mint|pause|blacklist|thin or no liquidity|one holder has|top 10 holders have|high trading tax|brand new/i;

async function screen(): Promise<Screen> {
  // 1. Candidates: graduated Argus tokens, their market data from DexScreener (30 tokens per call, 3 calls at a time).
  const tokens = await graduatedTokens();
  const batches: string[][] = [];
  for (let i = 0; i < tokens.length; i += 30) batches.push(tokens.slice(i, i + 30));
  const pairs: Pair[] = [];
  for (let i = 0; i < batches.length; i += 3) {
    const got = await Promise.all(batches.slice(i, i + 3).map((b) => get<Pair[]>(`https://api.dexscreener.com/tokens/v1/arc/${b.join(",")}`)));
    for (const g of got) if (Array.isArray(g)) pairs.push(...g);
  }
  const rows = byToken(pairs).filter((r) => tokens.includes(r.token));

  // 2. Market screen
  const market = rows.filter(
    (r) =>
      r.liquidityUsd >= SCREEN.minLiquidityUsd &&
      r.volume24hUsd >= SCREEN.minVolume24hUsd &&
      r.buys24h + r.sells24h >= SCREEN.minTxns24h &&
      (r.ageDays === null || r.ageDays * 24 >= SCREEN.minAgeHours),
  );

  // 3. Safety screen on the most traded ones
  const shortlist = market.sort((a, b) => b.volume24hUsd - a.volume24hUsd).slice(0, MAX_RISK_CHECKS);
  const checked: { r: (typeof shortlist)[number]; risk: RiskReport | null }[] = [];
  for (let i = 0; i < shortlist.length; i += 5) {
    checked.push(
      ...(await Promise.all(
        shortlist.slice(i, i + 5).map(async (r) => ({ r, risk: await Promise.race([riskOf(r.token), new Promise<null>((res) => setTimeout(() => res(null), 30_000))]) })),
      )),
    );
  }
  const picks: Pick[] = [];
  let unsafe = 0;
  for (const { r, risk } of checked) {
    if (!risk) {
      unsafe++;
      continue;
    }
    const { holders, top10Pct } = holdersOf(risk);
    const ok =
      risk.grade !== null &&
      !["D", "F"].includes(risk.grade) &&
      !risk.redFlags.some((f) => RUG.test(f)) &&
      (holders === null || holders >= SCREEN.minHolders) &&
      (top10Pct === null || top10Pct <= SCREEN.maxTop10Pct);
    if (!ok) {
      unsafe++;
      continue;
    }
    picks.push({ ...r, grade: risk.grade, riskLabel: risk.label, holders, top10Pct, redFlags: risk.redFlags });
  }

  // 4. Rank: buy pressure first, then price trend, then volume.
  const score = (p: Pick) => {
    const pressure = p.buys24h / Math.max(1, p.buys24h + p.sells24h);
    return pressure * 2 + Math.max(-1, Math.min(1, (p.change24hPct ?? 0) / 50)) + Math.log10(Math.max(1, p.volume24hUsd)) / 10;
  };
  picks.sort((a, b) => score(b) - score(a));
  return { at: Date.now(), rules: SCREEN, picks: picks.slice(0, 5), checked: tokens.length, rejected: { market: tokens.length - market.length, safety: unsafe } };
}

/** The current screen (cached 15 minutes; the cron keeps it warm). */
export async function tokenPicks(force = false): Promise<Screen> {
  if (!force) {
    const hit = await kvGet<Screen>(KEY).catch(() => null);
    if (hit) return hit;
  }
  const s = await screen();
  await kvSet(KEY, s, TTL_SEC).catch(() => undefined);
  return s;
}

/** Questions that ask for a token to buy, hold or watch. */
export const wantsPicks = (prompt: string) => /\b(bullish|buy|pick|recommend|best|top|gem|moon|pump|invest|worth|safe(st)?|which token|what token|good token)\b/i.test(prompt);
