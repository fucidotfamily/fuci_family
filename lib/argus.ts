import { createPublicClient, encodeAbiParameters, encodeFunctionData, fallback, formatUnits, http, keccak256, parseAbi, parseAbiItem, parseAbiParameters, type Address, type Hex } from "viem";
import { arc } from "viem/chains";

/**
 * Argus — the permissionless token launchpad on Arc mainnet (chain 5042), https://argus.world.
 * Each launch opens a Uniswap v4 pool (fee 1%, tick spacing 200) with its own tax hook; the whole
 * supply sits in one position above the opening price, so there is no separate bonding curve.
 * A launch "bonds" once its price crosses the bond tick (latched forever by the hook).
 *
 * Addresses and events are from Argus' docs (github.com/arguspad/argus-world, onchain/addresses.md)
 * and checked against mainnet. Every value is read from the chain; errors propagate (no fallback data).
 */
export const ARGUS = {
  /**
   * v4 "hooked" Portals, newest first. Legacy v3 Portals (#1, #2) are not supported.
   * #8 (seen on-chain, not yet in Argus' published list) emits its own launch event, stores a shorter
   * record and opens pools with Uniswap v4's dynamic-fee flag instead of a fixed 1% fee.
   */
  portals: [
    { n: 8, address: "0xeed7559b8a6abf64427dc41cb5cc6400109c5d93", startBlock: 22251798n },
    { n: 7, address: "0xB021Be536808f551b31789422Fd28a6c9c6e97Da", startBlock: 20395275n },
    { n: 6, address: "0xA5628A11c412596E1f63b75a2C0284F843C549d6", startBlock: 20240260n },
    { n: 5, address: "0x07a688a001f416cC433c68Ff56Aa26bC5131Cc6E", startBlock: 20081606n },
    { n: 4, address: "0xa36c443A797771Df82533B8B4A86F0AFfd970862", startBlock: 19690658n },
    { n: 3, address: "0x7A17Ab0106C46C0be30623F3EB7F299CC0058338", startBlock: 19674154n },
  ] as const,
  poolManager: "0x8366a39CC670B4001A1121B8F6A443A643e40951",
  stateView: "0xF3334192D15450CdD385c8B70e03f9A6bD9E673b",
  usdc: "0x3600000000000000000000000000000000000000",
  poolFee: 10_000,
  tickSpacing: 200,
  site: "https://argus.world",
} as const;

/** Portals that still create launches with the documented TokenCreated event. */
const LIVE_PORTALS = ARGUS.portals.slice(1, 3).map((p) => p.address);
/** Portal #8: launch event `(address indexed token, address indexed creator, hook, splitter, locker, positionId, tickStart, tickBond)`. */
const PORTAL8 = ARGUS.portals[0].address.toLowerCase();
const PORTAL8_LAUNCH = "0xc32e25061af0b7f7d77b7fb015333ecb0004127b71abbda4d7ba4c18bcd497f3";
/** Uniswap v4 LPFeeLibrary.DYNAMIC_FEE_FLAG: the hook sets the fee on every swap. */
export const DYNAMIC_FEE = 0x800000;

export const TOKEN_CREATED = parseAbiItem(
  "event TokenCreated(address indexed token, address indexed creator, string name, string symbol, bytes32 poolId, string imageURI, string website, string twitter, string telegram)",
);
export const POOL_SWAP = parseAbiItem(
  "event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)",
);
const PORTAL = parseAbi(["function launches(address) view returns (address)"]);
export const HOOK = parseAbi([
  "function bonded() view returns (bool)",
  "function bondTick() view returns (int24)",
  "function launchedAt() view returns (uint256)",
  "function quoteAsset() view returns (address)",
  "function buyTaxBps() view returns (uint16)",
  "function sellTaxBps() view returns (uint16)",
]);
const STATE_VIEW = parseAbi(["function getSlot0(bytes32 poolId) view returns (uint160 sqrtPriceX96, int24 tick, uint24 protocolFee, uint24 lpFee)"]);
export const ERC20_BALANCE = parseAbiItem("function balanceOf(address) view returns (uint256)");
const ERC20_SYMBOL = parseAbiItem("function symbol() view returns (string)");
const ERC20_NAME = parseAbiItem("function name() view returns (string)");

export class NotFoundError extends Error {}

// Arc's public RPC rejects eth_getLogs ranges wider than ~5,000 blocks.
const LOG_WINDOW = 5_000n;
const USDC_DECIMALS = 6;

// Public Arc RPCs rate-limit bursts, so rotate across all of them (a private RPC goes first).
const RPC_URLS = [process.env.ARGUS_RPC_URL, process.env.FOCI_RPC_URL, ...arc.rpcUrls.default.http].filter(Boolean) as string[];
const client = createPublicClient({
  chain: arc,
  transport: fallback(
    RPC_URLS.map((u) => http(u, { timeout: 8_000, retryCount: 2, retryDelay: 350 })),
    { retryCount: 1 },
  ),
});

/** Arc mainnet reader used for Argus (and by the validator, trading and the home stats). */
export const arcClient = client;

/** Latest Arc mainnet block, for health checks. */
export const headBlock = async () => Number(await client.getBlockNumber());

export type Sourced<T> = { source: "chain"; block: number; data: T };

export type Launch = {
  token: Address;
  creator: Address;
  hook: Address;
  poolId: Hex;
  symbol: string;
  buyTaxPct: number;
  sellTaxPct: number;
  block: number;
};

/** A launch's record, as stored by its Portal. */
export type LaunchInfo = {
  token: Address;
  portal: Address;
  creator: Address;
  hook: Address;
  tickStart: number;
  /** Null for Portal #3, whose hooks have no bond tick. */
  tickBond: number | null;
  buyTaxBps: number;
  sellTaxBps: number;
  quoteAsset: Address;
  /** The pool key's fee: 10000 (1%) on Portals #3–#7, the dynamic-fee flag on #8. */
  fee: number;
  poolId: Hex;
  usdcFirst: boolean;
};

export type Trade = { side: "buy" | "sell"; usdc: number; tx: string; block: number };

export type BondingState = {
  token: Address;
  hook: Address;
  poolId: Hex;
  fee: number;
  symbol: string;
  /** USDC per whole token. */
  priceUsdc: number;
  /** 0..1 toward the bond tick (1 once bonded). */
  progress: number;
  bonded: boolean;
  buyTaxPct: number;
  sellTaxPct: number;
  trades: Trade[];
};

// Small per-instance cache so a burst of agent calls doesn't hammer the RPC.
const cache = new Map<string, { at: number; value: unknown }>();
const TTL_MS = 30_000;
async function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value as T;
  const value = await fn();
  cache.set(key, { at: Date.now(), value });
  return value;
}

/** Scan the most recent `windows` log windows, newest first, until `want` hits (a few windows at a time). */
async function scanRecent<T>(fetchWindow: (from: bigint, to: bigint) => Promise<T[]>, want: number, windows = 12, floor = 0n): Promise<T[]> {
  const head = await client.getBlockNumber();
  const ranges: [bigint, bigint][] = [];
  for (let to = head, i = 0; i < windows && to > floor; i++) {
    const from = to > LOG_WINDOW ? to - LOG_WINDOW + 1n : 0n;
    ranges.push([from < floor ? floor : from, to]);
    to = from - 1n;
  }
  const out: T[] = [];
  for (let i = 0; i < ranges.length && out.length < want; i += 6) {
    const batch = await Promise.all(ranges.slice(i, i + 6).map(([f, t]) => fetchWindow(f, t)));
    for (const logs of batch) out.push(...logs.reverse());
  }
  return out.slice(0, want);
}

/** Token symbol; falls back to name(), then the short address, when a token has no readable symbol. */
export async function symbolOf(token: Address) {
  const sym = await client.readContract({ address: token, abi: [ERC20_SYMBOL], functionName: "symbol" }).catch(() => "");
  if (sym.trim()) return sym.trim().slice(0, 16);
  const name = await client.readContract({ address: token, abi: [ERC20_NAME], functionName: "name" }).catch(() => "");
  return name.trim().slice(0, 16) || `${token.slice(0, 6)}…${token.slice(-4)}`;
}

/** Pool key of an Argus launch: (USDC, token) sorted, its fee, tick spacing 200, the launch's own hook. */
export function poolKeyOf(token: Address, hook: Address, fee: number = ARGUS.poolFee) {
  const usdcFirst = ARGUS.usdc.toLowerCase() < token.toLowerCase();
  const key = {
    currency0: (usdcFirst ? ARGUS.usdc : token) as Address,
    currency1: (usdcFirst ? token : ARGUS.usdc) as Address,
    fee,
    tickSpacing: ARGUS.tickSpacing,
    hooks: hook,
  };
  const poolId = keccak256(encodeAbiParameters(parseAbiParameters("address, address, uint24, int24, address"), [key.currency0, key.currency1, key.fee, key.tickSpacing, key.hooks]));
  return { key, poolId, usdcFirst };
}

const word = (hex: string, i: number) => BigInt(`0x${hex.slice(i * 64, i * 64 + 64) || "0"}`);
const signed24 = (v: bigint) => Number(BigInt.asIntN(256, v));
const addrAt = (hex: string, i: number) => `0x${hex.slice(i * 64 + 24, i * 64 + 64)}` as Address;

const launchInfos = new Map<string, LaunchInfo | null>();

/**
 * The Argus launch behind `token`, or null when it isn't one. Portals #3–#7 store the record as
 * (creator, tickStart, tokenIsToken0, locker, hook, splitter, buyTaxBps, sellTaxBps, …); Portal #8 as
 * (hook, splitter, locker, positionId, tickStart, tickBond, …) with the creator only in its launch
 * event. Taxes, bond tick and quote asset are read from the launch's hook.
 */
export async function launchOf(token: Address, hint?: { creator?: Address }): Promise<LaunchInfo | null> {
  const k = token.toLowerCase();
  if (launchInfos.has(k)) return launchInfos.get(k)!;
  const { kvGet, kvSet } = await import("./store");
  const stored = await kvGet<LaunchInfo | { none: true }>(`argus:launch:v3:${k}`).catch(() => null);
  if (stored) {
    const v = "none" in stored ? null : stored;
    launchInfos.set(k, v);
    return v;
  }
  const data = encodeFunctionData({ abi: PORTAL, functionName: "launches", args: [token] });
  const records = await Promise.all(
    ARGUS.portals.map(async (p) => {
      // The getter returns a struct whose width differs per Portal, so decode the raw words.
      const r = await client.call({ to: p.address, data }).catch(() => null);
      return { portal: p.address as Address, hex: (r?.data ?? "0x").slice(2), failed: r === null };
    }),
  );
  const isV8 = (r: { portal: Address }) => r.portal.toLowerCase() === PORTAL8;
  const found = records.find((r) => (isV8(r) ? r.hex.length >= 6 * 64 && word(r.hex, 0) !== 0n : r.hex.length >= 8 * 64 && word(r.hex, 4) !== 0n));
  if (!found) {
    // Remember a miss only when every Portal answered: an RPC hiccup must not mark a real launch "not Argus".
    if (records.every((r) => !r.failed)) {
      await kvSet(`argus:launch:v3:${k}`, { none: true }, 600).catch(() => undefined);
      launchInfos.set(k, null);
    }
    return null;
  }
  const v8 = isV8(found);
  const hook = addrAt(found.hex, v8 ? 0 : 4);
  const [bondTick, quoteAsset, buyTax, sellTax, creator] = await Promise.all([
    client.readContract({ address: hook, abi: HOOK, functionName: "bondTick" }).then(Number).catch(() => null),
    client.readContract({ address: hook, abi: HOOK, functionName: "quoteAsset" }).catch(() => ARGUS.usdc as Address),
    v8 ? client.readContract({ address: hook, abi: HOOK, functionName: "buyTaxBps" }).then(Number) : Number(word(found.hex, 6)),
    v8 ? client.readContract({ address: hook, abi: HOOK, functionName: "sellTaxBps" }).then(Number) : Number(word(found.hex, 7)),
    v8 ? (hint?.creator ?? portal8Creator(token)) : addrAt(found.hex, 0),
  ]);
  const fee = v8 ? DYNAMIC_FEE : ARGUS.poolFee;
  const { poolId, usdcFirst } = poolKeyOf(token, hook, fee);
  const info: LaunchInfo = {
    token,
    portal: found.portal,
    creator,
    hook,
    tickStart: signed24(word(found.hex, v8 ? 4 : 1)),
    tickBond: bondTick ?? (v8 ? signed24(word(found.hex, 5)) : null),
    buyTaxBps: buyTax,
    sellTaxBps: sellTax,
    quoteAsset,
    fee,
    poolId,
    usdcFirst,
  };
  await kvSet(`argus:launch:v3:${k}`, info).catch(() => undefined);
  launchInfos.set(k, info);
  return info;
}

type RawLog = { address: Address; topics: Hex[]; data: Hex; blockNumber: Hex; transactionHash: Hex };
const hex = (n: bigint) => `0x${n.toString(16)}`;
const topicAddr = (t: Hex) => `0x${t.slice(26)}` as Address;

/** Portal #8 launch events in [from, to] (optionally for one token). */
export async function portal8Logs(from: bigint, to: bigint, token?: Address): Promise<RawLog[]> {
  const topics: (Hex | null)[] = [PORTAL8_LAUNCH, token ? (`0x${token.slice(2).toLowerCase().padStart(64, "0")}` as Hex) : null];
  return client.request({ method: "eth_getLogs", params: [{ address: PORTAL8 as Address, topics, fromBlock: hex(from), toBlock: hex(to) }] } as never) as Promise<RawLog[]>;
}

/** The creator of a Portal #8 launch, from its launch event (newest windows first). */
async function portal8Creator(token: Address): Promise<Address> {
  const [log] = await scanRecent((f, t) => portal8Logs(f, t, token), 1, 80, ARGUS.portals[0].startBlock);
  if (!log) throw new Error("launch event not found");
  return topicAddr(log.topics[2]);
}

/** Current pool price (USDC per whole token) and tick. */
export async function poolPrice(info: Pick<LaunchInfo, "poolId" | "usdcFirst">, decimals = 18, blockNumber?: bigint) {
  const [sqrtPriceX96, tick] = await client.readContract({ address: ARGUS.stateView, abi: STATE_VIEW, functionName: "getSlot0", args: [info.poolId], blockNumber });
  const sqrt = Number(sqrtPriceX96) / 2 ** 96;
  const raw = sqrt * sqrt; // currency1 per currency0, raw units
  const usdcPerTokenRaw = raw === 0 ? 0 : info.usdcFirst ? 1 / raw : raw;
  return { priceUsdc: usdcPerTokenRaw * 10 ** (decimals - USDC_DECIMALS), tick: Number(tick), sqrtPriceX96 };
}

/** Progress from the opening tick toward the bond tick, 0..1. */
export function bondProgress(info: Pick<LaunchInfo, "tickStart" | "tickBond">, tick: number, bonded: boolean) {
  if (bonded) return 1;
  if (info.tickBond === null || info.tickBond === info.tickStart) return 0;
  const p = (tick - info.tickStart) / (info.tickBond - info.tickStart);
  return Math.max(0, Math.min(1, p));
}

// ---------------------------------------------------------------------------
// Launches

export function getLaunches(limit = 8): Promise<Sourced<Launch[]>> {
  return cached(`launches:${limit}`, () => fetchLaunches(limit));
}

type StoredLaunches = { lastBlock: number; items: Launch[] };
const LAUNCHES_KEY = "argus:launches:v2";

/** A launch seen in a Portal event. */
export type LaunchLog = { token: Address; creator: Address; symbol?: string; block: number };

/** Launches from the live Portals in one block range: TokenCreated (#6, #7) and Portal #8's own event. */
async function launchWindow(from: bigint, to: bigint): Promise<LaunchLog[]> {
  const [older, v8] = await Promise.all([
    client.getLogs({ address: [...LIVE_PORTALS], event: TOKEN_CREATED, fromBlock: from, toBlock: to }),
    portal8Logs(from, to),
  ]);
  return [
    ...older.map((l) => ({ token: l.args.token!, creator: l.args.creator!, symbol: l.args.symbol, block: Number(l.blockNumber) })),
    ...v8.map((l) => ({ token: topicAddr(l.topics[1]), creator: topicAddr(l.topics[2]), block: Number(BigInt(l.blockNumber)) })),
  ].sort((a, b) => a.block - b.block);
}

/** Launch events from the live Portals in [from, to], a few windows at a time. */
export async function launchLogs(from: bigint, to: bigint): Promise<LaunchLog[]> {
  const ranges: [bigint, bigint][] = [];
  for (let f = from; f <= to; f += LOG_WINDOW) ranges.push([f, f + LOG_WINDOW - 1n > to ? to : f + LOG_WINDOW - 1n]);
  const out: LaunchLog[] = [];
  for (let i = 0; i < ranges.length; i += 6) {
    const batch = await Promise.all(ranges.slice(i, i + 6).map(([f, t]) => launchWindow(f, t)));
    for (const logs of batch) out.push(...logs);
  }
  return out;
}

/** Launches are frequent but scans are windowed: keep the list in Redis and only read new blocks. */
async function fetchLaunches(limit: number): Promise<Sourced<Launch[]>> {
  const head = await client.getBlockNumber();
  const { kvGet, kvSet } = await import("./store");
  const stored = await kvGet<StoredLaunches>(LAUNCHES_KEY).catch(() => null);
  const logs =
    stored && head - BigInt(stored.lastBlock) <= LOG_WINDOW * 24n
      ? await launchLogs(BigInt(stored.lastBlock) + 1n, head)
      : await scanRecent(launchWindow, Math.max(limit, 20), 24, ARGUS.portals[2].startBlock);
  const fresh = (
    await Promise.all(
      logs.map(async (l): Promise<Launch | null> => {
        const info = await launchOf(l.token, { creator: l.creator }).catch(() => null);
        if (!info || info.quoteAsset.toLowerCase() !== ARGUS.usdc.toLowerCase()) return null; // USDC pairs only
        return {
          token: l.token,
          creator: l.creator,
          hook: info.hook,
          poolId: info.poolId,
          symbol: (l.symbol ?? "").trim().slice(0, 16) || (await symbolOf(l.token)),
          buyTaxPct: info.buyTaxBps / 100,
          sellTaxPct: info.sellTaxBps / 100,
          block: l.block,
        };
      }),
    )
  ).filter((x): x is Launch => x !== null);
  const seen = new Set<string>();
  const items = [...fresh, ...(stored?.items ?? [])]
    .sort((a, b) => b.block - a.block)
    .filter((x) => !seen.has(x.token.toLowerCase()) && seen.add(x.token.toLowerCase()))
    .slice(0, 50);
  await kvSet(LAUNCHES_KEY, { lastBlock: Number(head), items } satisfies StoredLaunches).catch(() => undefined);
  return { source: "chain", block: Number(head), data: items.slice(0, limit) };
}

// ---------------------------------------------------------------------------
// One launch: price, bonding progress and recent trades

export function getBonding(token: Address): Promise<Sourced<BondingState>> {
  return cached(`bonding:${token.toLowerCase()}`, () => fetchBonding(token));
}

async function fetchBonding(token: Address): Promise<Sourced<BondingState>> {
  const info = await launchOf(token);
  if (!info) throw new NotFoundError(`${token} is not an Argus launch`);
  const [{ priceUsdc, tick }, bonded, symbol, swaps, head] = await Promise.all([
    poolPrice(info),
    client.readContract({ address: info.hook, abi: HOOK, functionName: "bonded" }).catch(() => false),
    symbolOf(token),
    scanRecent((f, t) => client.getLogs({ address: ARGUS.poolManager, event: POOL_SWAP, args: { id: info.poolId }, fromBlock: f, toBlock: t }), 12, 6),
    client.getBlockNumber(),
  ]);
  const trades: Trade[] = swaps.map((l) => {
    // Deltas are from the swapper's side: a negative USDC delta means USDC went in (a buy).
    const usdcDelta = (info.usdcFirst ? l.args.amount0 : l.args.amount1) ?? 0n;
    return {
      side: usdcDelta < 0n ? "buy" : "sell",
      usdc: Number(formatUnits(usdcDelta < 0n ? -usdcDelta : usdcDelta, USDC_DECIMALS)),
      tx: l.transactionHash,
      block: Number(l.blockNumber),
    };
  });
  return {
    source: "chain",
    block: Number(head),
    data: {
      token,
      hook: info.hook,
      poolId: info.poolId,
      fee: info.fee,
      symbol,
      priceUsdc,
      progress: bondProgress(info, tick, bonded),
      bonded,
      buyTaxPct: info.buyTaxBps / 100,
      sellTaxPct: info.sellTaxBps / 100,
      trades,
    },
  };
}

/** One-sentence market mood across the latest launches. */
export async function getTide(): Promise<Sourced<{ reading: string; netFlowUsdc: number; mood: string; launches: number; trades: number }>> {
  const launches = await getLaunches(8);
  // A pool that can't be read is skipped rather than invented.
  const pools = (await Promise.all(launches.data.slice(0, 4).map((l) => getBonding(l.token).catch(() => null)))).filter((c): c is Sourced<BondingState> => c !== null);
  const trades = pools.flatMap((c) => c.data.trades);
  const netFlowUsdc = trades.reduce((s, t) => s + (t.side === "buy" ? t.usdc : -t.usdc), 0);
  const mood = netFlowUsdc > 500 ? "flood tide" : netFlowUsdc > 0 ? "rising tide" : netFlowUsdc > -500 ? "slack water" : "ebb tide";
  const leader = [...pools].filter((p) => !p.data.bonded).sort((a, b) => b.data.progress - a.data.progress)[0]?.data;
  const reading = `${mood[0].toUpperCase()}${mood.slice(1)} on Argus: ${netFlowUsdc >= 0 ? "+" : ""}${netFlowUsdc.toFixed(0)} USDC net across ${trades.length} recent trades${
    leader ? `; $${leader.symbol} leads at ${(leader.progress * 100).toFixed(0)}% to bonding.` : "."
  }`;
  return { source: "chain", block: launches.block, data: { reading, netFlowUsdc, mood, launches: launches.data.length, trades: trades.length } };
}

/** An Argus token page. */
export const argusTokenUrl = (token: string) => `${ARGUS.site}/token/${token}`;
