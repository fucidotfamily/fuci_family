import { createPublicClient, decodeAbiParameters, erc20Abi, http, pad, type Address, type Hex } from "viem";
import { arc } from "viem/chains";
import { ARGUS, HOOK, POOL_SWAP, TOKEN_CREATED, arcClient, bondProgress, launchOf, poolPrice, symbolOf } from "./argus";
import { kvGet, kvSet } from "./store";
import type { SmartFilters } from "./tradingRules";

/**
 * Smart entry: instead of buying a token the moment it appears, the autopilot keeps a watchlist of
 * new launches and fresh bondings, reads what actually happened on-chain once they have traded for a
 * while, and buys only the ones that pass every filter.
 *
 * Signals (all read from Arc; no off-chain guesses):
 *   buyers       distinct wallets that bought (from each buy transaction's sender)
 *   buy/sell     USDC bought and sold through the token's pool, and the net flow
 *   maxSell      the largest single sell, to spot a dump
 *   devPct       share of the supply the creator still holds
 *   devSold      the creator's balance dropped since the token was first seen
 *   creatorLaunches  tokens the same creator launched in the last 24 hours (serial launchers)
 *   grade        Fuci Risk grade, for bonded tokens
 */

export type Watch = {
  token: Address;
  creator: Address;
  kind: "launch" | "bonded";
  /** When (ms) and at which block the token entered the watchlist: its launch or its bonding. */
  seenAt: number;
  seenBlock: number;
  /** Creator's balance when first seen (raw units, decimal string). */
  devStart?: string;
};

export type Signals = {
  token: Address;
  symbol: string;
  kind: Watch["kind"];
  ageMin: number;
  buyTaxPct: number;
  sellTaxPct: number;
  progress: number;
  buys: number;
  sells: number;
  buyers: number;
  buyUsdc: number;
  sellUsdc: number;
  netUsdc: number;
  maxSellUsdc: number;
  devPct: number | null;
  devSold: boolean;
  creatorLaunches: number;
  grade: string | null;
  /** Real socials in the launch record: "website", "x", "telegram". Null when the record wasn't found. */
  socials: string[] | null;
  /** Share of the supply bought in the first BUNDLE_BLOCKS after launch, and by how many wallets. */
  bundlePct: number | null;
  bundleBuyers: number;
  /** Organic volume: the biggest wallet's share of all volume, and the share from wallets that both bought and sold. */
  topWalletPct: number | null;
  roundTripPct: number | null;
  /** Share of the trades whose wallet could be read (below 0.8 the verdict waits for a better read). */
  resolved: number;
  at: number;
};

const LOG_WINDOW = 5_000n;
/** Swap history read per token: at most this many log windows (~5.5 hours at Arc's ~0.5 s blocks). */
const MAX_WINDOWS = 8;
/** Buy transactions whose sender is looked up per token (distinct buyers). */
const MAX_SENDERS = 60;
const SIGNAL_TTL_SEC = 240;
/** Swaps within this many blocks of the launch (~5 s) count as the launch bundle. */
const BUNDLE_BLOCKS = 10n;
/** Portal #8's launch metadata event: (token indexed) imageURI, website, twitter, telegram, description. */
const META_V8 = "0x81757bd4a3f7375c9021d3bd561d1a8075d765544734931f26896acacda7ccdc";
/** How far back to look for an older token's launch record (log windows, ~17 hours). */
const META_WINDOWS = 24;
const DAY = 86_400_000;

/** A client that batches JSON-RPC calls, for the many small getTransaction lookups. */
let batched: ReturnType<typeof createPublicClient> | null = null;
const batchClient = () =>
  (batched ??= createPublicClient({
    chain: arc,
    transport: http(process.env.ARC_RPC_URL || arc.rpcUrls.default.http[0], { batch: { batchSize: 30 }, timeout: 12_000, retryCount: 1 }),
  }));

const GRADE_ORDER = ["A", "B", "C", "D", "F"];

/** Creator launch counts over the last 24 hours, from the timestamps the scan keeps. */
export function creatorCount(creators: Record<string, number[]>, creator: string, now = Date.now()) {
  return (creators[creator.toLowerCase()] ?? []).filter((t) => now - t < DAY).length;
}

/** Keep the creators map bounded: only the last 24 hours, at most `max` creators. */
export function trimCreators(creators: Record<string, number[]>, now = Date.now(), max = 3000) {
  const kept = Object.entries(creators)
    .map(([k, ts]) => [k, ts.filter((t) => now - t < DAY)] as const)
    .filter(([, ts]) => ts.length > 0)
    .sort((a, b) => Math.max(...b[1]) - Math.max(...a[1]))
    .slice(0, max);
  return Object.fromEntries(kept);
}

type Meta = { block: number; website: string; twitter: string; telegram: string };

/** The launch record (block and socials) of a token, from Portal #8's metadata event or TokenCreated (#6, #7). Cached forever. */
export async function launchMeta(token: Address, near?: number): Promise<Meta | null> {
  const key = `argus:meta:v1:${token.toLowerCase()}`;
  const hit = await kvGet<Meta | { none: true }>(key).catch(() => null);
  if (hit) return "none" in hit ? null : hit;
  const head = await arcClient.getBlockNumber();
  const ranges: [bigint, bigint][] = near
    ? [[BigInt(near), BigInt(near)]]
    : Array.from({ length: META_WINDOWS }, (_, i) => {
        const to = head - BigInt(i) * LOG_WINDOW;
        return [to - LOG_WINDOW + 1n, to] as [bigint, bigint];
      }).filter(([f]) => f > 0n);
  const hex = (n: bigint) => `0x${n.toString(16)}`;
  for (let i = 0; i < ranges.length; i += 6) {
    const found = await Promise.all(
      ranges.slice(i, i + 6).map(async ([from, to]) => {
        const [v8, older] = await Promise.all([
          arcClient
            .request({ method: "eth_getLogs", params: [{ address: ARGUS.portals[0].address, topics: [META_V8, pad(token)], fromBlock: hex(from), toBlock: hex(to) }] } as never)
            .catch(() => []) as Promise<{ data: Hex; blockNumber: Hex }[]>,
          arcClient
            .getLogs({ address: ARGUS.portals.slice(1, 3).map((p) => p.address), event: TOKEN_CREATED, args: { token }, fromBlock: from, toBlock: to })
            .catch(() => []),
        ]);
        if (v8[0]) {
          const [, website, twitter, telegram] = decodeAbiParameters([{ type: "string" }, { type: "string" }, { type: "string" }, { type: "string" }, { type: "string" }], v8[0].data);
          return { block: Number(BigInt(v8[0].blockNumber)), website, twitter, telegram };
        }
        const o = older[0];
        return o ? { block: Number(o.blockNumber), website: o.args.website ?? "", twitter: o.args.twitter ?? "", telegram: o.args.telegram ?? "" } : null;
      }),
    );
    const m = found.find((x) => x);
    if (m) {
      await kvSet(key, m).catch(() => undefined);
      return m;
    }
  }
  if (!near) await kvSet(key, { none: true }, 3600).catch(() => undefined);
  return null;
}

const NOT_ACCOUNTS = new Set(["i", "home", "search", "intent", "hashtag", "share", "explore", "messages", "notifications"]);
/** Which socials are real: a website on its own domain, an X account (not a post-search or trending link), a Telegram. */
export function realSocials(m: Pick<Meta, "website" | "twitter" | "telegram">): string[] {
  const out: string[] = [];
  const url = (s: string) => {
    try {
      return new URL(/^https?:\/\//i.test(s.trim()) ? s.trim() : `https://${s.trim()}`);
    } catch {
      return null;
    }
  };
  const w = m.website.trim() ? url(m.website) : null;
  if (w && /\.[a-z]{2,}$/i.test(w.hostname) && !/(^|\.)(x\.com|twitter\.com|t\.me|telegram\.me|argus\.world)$/i.test(w.hostname)) out.push("website");
  const x = m.twitter.trim();
  const handle = /^@?[A-Za-z0-9_]{1,15}$/.test(x) ? x.replace(/^@/, "") : (/(?:^|\/\/)(?:www\.)?(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})(?:[/?#]|$)/i.exec(x)?.[1] ?? null);
  if (handle && !NOT_ACCOUNTS.has(handle.toLowerCase())) out.push("x");
  const t = m.telegram.trim();
  if (/^@?[A-Za-z0-9_]{5,32}$/.test(t) || /(?:^|\/\/)(?:t\.me|telegram\.me)\/\+?[A-Za-z0-9_-]{4,}/i.test(t)) out.push("telegram");
  return out;
}

/** Read one token's signals (cached for a few minutes, shared by every agent). */
export async function signalsOf(w: Watch, creators: Record<string, number[]>): Promise<Signals | null> {
  const key = `sig:v2:${w.token.toLowerCase()}`;
  const hit = await kvGet<Signals>(key).catch(() => null);
  if (hit && Date.now() - hit.at < SIGNAL_TTL_SEC * 1000) return hit;

  const info = await launchOf(w.token, { creator: w.creator }).catch(() => null);
  if (!info) return null;
  const head = await arcClient.getBlockNumber();
  const [symbol, { tick }, bonded, supply, devNow] = await Promise.all([
    symbolOf(w.token).catch(() => w.token.slice(0, 8)),
    poolPrice(info),
    arcClient.readContract({ address: info.hook, abi: HOOK, functionName: "bonded" }).catch(() => false),
    arcClient.readContract({ address: w.token, abi: erc20Abi, functionName: "totalSupply" }).catch(() => null),
    arcClient.readContract({ address: w.token, abi: erc20Abi, functionName: "balanceOf", args: [info.creator] }).catch(() => null),
  ]);

  // Swaps through the token's pool since it entered the watchlist (bounded).
  const floor = head - LOG_WINDOW * BigInt(MAX_WINDOWS);
  const start = BigInt(Math.max(0, w.seenBlock - 50)) > floor ? BigInt(Math.max(0, w.seenBlock - 50)) : floor;
  const ranges: [bigint, bigint][] = [];
  for (let f = start; f <= head; f += LOG_WINDOW) ranges.push([f, f + LOG_WINDOW - 1n > head ? head : f + LOG_WINDOW - 1n]);
  const logs = (
    await Promise.all(
      ranges.map(([from, to]) =>
        arcClient.getLogs({ address: ARGUS.poolManager, event: POOL_SWAP, args: { id: info.poolId as Hex }, fromBlock: from, toBlock: to }).catch(() => []),
      ),
    )
  ).flat();

  // The launch record: socials, and the launch block for the bundle check.
  const meta = await launchMeta(w.token, w.kind === "launch" ? w.seenBlock : undefined).catch(() => null);
  const bundleLogs = meta
    ? await arcClient
        .getLogs({ address: ARGUS.poolManager, event: POOL_SWAP, args: { id: info.poolId as Hex }, fromBlock: BigInt(meta.block), toBlock: BigInt(meta.block) + BUNDLE_BLOCKS })
        .catch(() => null)
    : null;

  let buyUsdc = 0;
  let sellUsdc = 0;
  let maxSellUsdc = 0;
  let buys = 0;
  let sells = 0;
  // Each swap: its side, USDC size and transaction, to attribute volume to wallets.
  const swaps = logs.map((l) => {
    // Deltas are from the swapper's side: a negative USDC delta means USDC went in (a buy).
    const d = (info.usdcFirst ? l.args.amount0 : l.args.amount1) ?? 0n;
    const usdc = Number(d < 0n ? -d : d) / 1e6;
    if (d < 0n) {
      buys++;
      buyUsdc += usdc;
    } else {
      sells++;
      sellUsdc += usdc;
      maxSellUsdc = Math.max(maxSellUsdc, usdc);
    }
    return { buy: d < 0n, usdc, tx: l.transactionHash };
  });
  const bundleTxs = (bundleLogs ?? []).filter((l) => ((info.usdcFirst ? l.args.amount0 : l.args.amount1) ?? 0n) < 0n);
  const txs = [...new Set([...swaps.slice(-MAX_SENDERS * 2).map((x) => x.tx), ...bundleTxs.map((l) => l.transactionHash)])];
  const senderOf = new Map<string, string>();
  await Promise.all(
    txs.map((hash) =>
      batchClient()
        .getTransaction({ hash })
        .then((t) => senderOf.set(hash, t.from.toLowerCase()))
        .catch(() => undefined),
    ),
  );
  // Lookups a busy RPC dropped: retry them through the rotating multi-RPC client, a few at a time.
  const missing = txs.filter((h) => !senderOf.has(h));
  for (let i = 0; i < missing.length; i += 10)
    await Promise.all(
      missing.slice(i, i + 10).map((hash) =>
        arcClient
          .getTransaction({ hash })
          .then((t) => senderOf.set(hash, t.from.toLowerCase()))
          .catch(() => undefined),
      ),
    );
  const resolved = txs.length ? senderOf.size / txs.length : 1;
  const creator = info.creator.toLowerCase();
  const buyers = new Set(swaps.filter((x) => x.buy).map((x) => senderOf.get(x.tx)).filter((s): s is string => Boolean(s) && s !== creator)).size;

  // Organic volume: how much of it one wallet, and wallets trading both ways, account for.
  const byWallet = new Map<string, { buy: number; sell: number }>();
  for (const x of swaps) {
    const who = senderOf.get(x.tx);
    if (!who) continue;
    const v = byWallet.get(who) ?? { buy: 0, sell: 0 };
    if (x.buy) v.buy += x.usdc;
    else v.sell += x.usdc;
    byWallet.set(who, v);
  }
  const attributed = [...byWallet.values()].reduce((sum, v) => sum + v.buy + v.sell, 0);
  const topWalletPct = attributed > 0 ? (Math.max(...[...byWallet.values()].map((v) => v.buy + v.sell)) / attributed) * 100 : null;
  const roundTripPct = attributed > 0 ? ([...byWallet.values()].filter((v) => v.buy > 0 && v.sell > 0).reduce((sum, v) => sum + v.buy + v.sell, 0) / attributed) * 100 : null;

  // Bundle: tokens bought in the first seconds after launch, as a share of the supply.
  const bundleTokens = bundleTxs.reduce((sum, l) => {
    const t = (info.usdcFirst ? l.args.amount1 : l.args.amount0) ?? 0n;
    return sum + (t > 0n ? t : 0n);
  }, 0n);
  const bundlePct = bundleLogs && supply && supply > 0n ? Number((bundleTokens * 10_000n) / supply) / 100 : null;
  const bundleBuyers = new Set(bundleTxs.map((l) => senderOf.get(l.transactionHash)).filter(Boolean)).size;

  let grade: string | null = null;
  if (w.kind === "bonded") {
    const { cachedRisk, getRisk } = await import("./risk");
    const r = (await cachedRisk(w.token)) ?? (await Promise.race([getRisk(w.token).catch(() => null), new Promise<null>((res) => setTimeout(() => res(null), 9_000))]));
    grade = r?.grade ?? null;
  }

  const sig: Signals = {
    token: w.token,
    symbol,
    kind: w.kind,
    ageMin: (Date.now() - w.seenAt) / 60_000,
    buyTaxPct: info.buyTaxBps / 100,
    sellTaxPct: info.sellTaxBps / 100,
    progress: bondProgress(info, tick, Boolean(bonded)),
    buys,
    sells,
    buyers,
    buyUsdc: Math.round(buyUsdc * 100) / 100,
    sellUsdc: Math.round(sellUsdc * 100) / 100,
    netUsdc: Math.round((buyUsdc - sellUsdc) * 100) / 100,
    maxSellUsdc: Math.round(maxSellUsdc * 100) / 100,
    devPct: supply && devNow !== null && supply > 0n ? Number((devNow * 10_000n) / supply) / 100 : null,
    devSold: Boolean(w.devStart && devNow !== null && BigInt(w.devStart) > 0n && devNow * 100n < BigInt(w.devStart) * 99n),
    creatorLaunches: creatorCount(creators, info.creator),
    grade,
    socials: meta ? realSocials(meta) : null,
    bundlePct,
    bundleBuyers,
    topWalletPct: topWalletPct === null ? null : Math.round(topWalletPct),
    roundTripPct: roundTripPct === null ? null : Math.round(roundTripPct),
    resolved: Math.round(resolved * 100) / 100,
    at: Date.now(),
  };
  await kvSet(key, sig, sig.resolved < 0.8 ? 60 : SIGNAL_TTL_SEC).catch(() => undefined);
  return sig;
}

export type Verdict = { ok: true; why: string } | { ok: false; reason: string };

/** Decide on one token for one agent's smart-entry filters. Pure: easy to test and explain. */
export function judge(s: Signals, f: SmartFilters): Verdict {
  if ((s.resolved ?? 1) < 0.8) return { ok: false, reason: "data incomplete" };
  if (s.buyTaxPct > f.maxBuyTaxPct || s.sellTaxPct > f.maxSellTaxPct) return { ok: false, reason: "tax too high" };
  if (s.devSold) return { ok: false, reason: "dev sold" };
  if (s.devPct === null) return { ok: false, reason: "dev holding unknown" };
  if (s.devPct > f.maxDevPct) return { ok: false, reason: "dev holds too much" };
  if (s.creatorLaunches > f.maxCreatorLaunches) return { ok: false, reason: "serial launcher" };
  if ((f.minSocials ?? 0) > 0 && (s.socials?.length ?? 0) < f.minSocials) return { ok: false, reason: s.socials === null ? "socials unknown" : "no socials" };
  if (f.maxBundlePct !== undefined && s.bundlePct === null) return { ok: false, reason: "bundle unknown" };
  if (f.maxBundlePct !== undefined && s.bundlePct !== null && s.bundlePct > f.maxBundlePct) return { ok: false, reason: "bundled launch" };
  if (s.buyers < f.minBuyers) return { ok: false, reason: "too few buyers" };
  if (s.netUsdc < f.minNetUsdc) return { ok: false, reason: "weak buying" };
  if (s.buyUsdc > 0 && s.maxSellUsdc > s.buyUsdc / 3) return { ok: false, reason: "a big dump" };
  if (f.maxTopWalletPct !== undefined && (s.topWalletPct === null || s.topWalletPct > f.maxTopWalletPct)) return { ok: false, reason: "one wallet drives the volume" };
  if (f.maxRoundTripPct !== undefined && (s.roundTripPct === null || s.roundTripPct > f.maxRoundTripPct)) return { ok: false, reason: "wash trading" };
  if (s.kind === "bonded") {
    if (s.grade === null) return { ok: false, reason: "risk grade pending" };
    if (GRADE_ORDER.indexOf(s.grade) > GRADE_ORDER.indexOf(f.minGrade)) return { ok: false, reason: "risk grade too low" };
  }
  const bits = [`${s.buyers} buyers`, `+${s.netUsdc.toFixed(0)} USDC net`, `dev ${s.devPct.toFixed(1)}%`];
  if (s.bundlePct !== null) bits.push(`bundle ${s.bundlePct.toFixed(1)}%`);
  if (s.socials?.length) bits.push(s.socials.join("+"));
  if (s.kind === "bonded" && s.grade) bits.push(`grade ${s.grade}`);
  return { ok: true, why: `smart entry: ${bits.join(", ")}` };
}

/** Is this watch entry inside a rule's window (source and age)? */
export function inWindow(w: Pick<Watch, "kind" | "seenAt">, f: SmartFilters, now = Date.now()) {
  if (f.source === "launches" && w.kind !== "launch") return false;
  if (f.source === "bonded" && w.kind !== "bonded") return false;
  const age = (now - w.seenAt) / 60_000;
  return age >= f.minAgeMin && age <= f.maxAgeMin;
}
