import { FUCI_LAUNCH, FUCI_TOKEN, FUCI_TREASURY, GITHUB_URL, X_URL } from "./config";
import { ERC8004 } from "./erc8004Abi";
import { factoryAddress } from "./factory";
import { getForest, treasuryBalance, type ForestEvent } from "./forest";
import { storedIndex } from "./agentIndex";
import { getStats, kvGet, kvSet } from "./store";

/**
 * Fuci in numbers, for /stats and /api/stats/public. Every figure comes from Arc (the factory
 * scan, the treasury balance, the ERC-8004 registry) or from settled x402 payments; $FUCI market
 * data comes from DexScreener's public API. A source that fails reads as null, never as a guess.
 */
export type PublicStats = {
  asOf: string;
  agents: {
    /** Created on-chain through the Fuci factory (each paid the creation fee). */
    onChain: number;
    /** Every ERC-8004 agent on Arc, for scale. */
    arcTotal: number | null;
  };
  payments: { x402Calls: number | null; usdcSettled: number | null; launchesScanned: number | null };
  trading: { trades: number; feesUsdc: number };
  revenue: { creationFeesUsdc: number; tradeFeesUsdc: number; totalUsdc: number; treasuryUsdc: number | null; treasury: string };
  token: {
    address: string;
    supply: number;
    buyTaxPct: number;
    sellTaxPct: number;
    market: Market | null;
  };
  contracts: { label: string; address: string }[];
  links: { label: string; url: string }[];
  recent: ForestEvent[];
};

export type Market = { priceUsd: number; marketCapUsd: number; liquidityUsd: number; volume24hUsd: number; txns24h: number; pairs: number; url: string };

// The verified factory on Arc Mainnet, used when this deployment has no factory configured.
const KNOWN_FACTORY = "0x77Fa3Ae9604539Fee8F199adC02f12f318c2bFbc";

const MARKET_KEY = "stats:dexscreener:v1";

/** $FUCI market data from DexScreener, summed over its pairs. Cached for a minute. */
export async function fuciMarket(): Promise<Market | null> {
  const hit = await kvGet<Market>(MARKET_KEY).catch(() => null);
  if (hit) return hit;
  const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${FUCI_TOKEN}`, { cache: "no-store", signal: AbortSignal.timeout(5000) });
  if (!res.ok) return null;
  type Pair = { chainId: string; url: string; priceUsd?: string; marketCap?: number; fdv?: number; liquidity?: { usd?: number }; volume?: { h24?: number }; txns?: { h24?: { buys?: number; sells?: number } } };
  const pairs = (((await res.json()) as { pairs?: Pair[] | null }).pairs ?? []).filter((p) => p.chainId === "arc");
  if (!pairs.length) return null;
  const main = [...pairs].sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0];
  const m: Market = {
    priceUsd: Number(main.priceUsd ?? 0),
    marketCapUsd: main.marketCap ?? main.fdv ?? 0,
    liquidityUsd: pairs.reduce((s, p) => s + (p.liquidity?.usd ?? 0), 0),
    volume24hUsd: pairs.reduce((s, p) => s + (p.volume?.h24 ?? 0), 0),
    txns24h: pairs.reduce((s, p) => s + (p.txns?.h24?.buys ?? 0) + (p.txns?.h24?.sells ?? 0), 0),
    pairs: pairs.length,
    url: `https://dexscreener.com/arc/${FUCI_TOKEN}`,
  };
  await kvSet(MARKET_KEY, m, 60).catch(() => undefined);
  return m;
}

const orNull = <T>(p: Promise<T>) => p.catch(() => null);

export async function getPublicStats(): Promise<PublicStats> {
  const [forest, stats, index, treasury, mkt, factory] = await Promise.all([
    orNull(getForest()),
    orNull(getStats()),
    orNull(storedIndex()),
    orNull(treasuryBalance()),
    orNull(fuciMarket()),
    orNull(factoryAddress()),
  ]);
  const f = forest?.forest;
  const creation = f?.creationFeesUsdc ?? 0;
  const tradeFees = f?.tradeFeesUsdc ?? 0;
  const contracts = [
    { label: "FuciAgentFactory", address: factory ?? KNOWN_FACTORY },
    { label: "Treasury (Safe multisig)", address: treasury?.address ?? FUCI_TREASURY },
    { label: "$FUCI token", address: FUCI_TOKEN },
    { label: "ERC-8004 Identity Registry", address: ERC8004.identity },
    { label: "ERC-8004 Reputation Registry", address: ERC8004.reputation },
  ];
  return {
    asOf: new Date().toISOString(),
    agents: {
      onChain: f?.agentsCreated ?? 0,
      arcTotal: index?.index?.total ?? null,
    },
    payments: { x402Calls: stats?.calls ?? null, usdcSettled: stats?.usdcSettled ?? null, launchesScanned: stats?.launchesScanned ?? null },
    trading: { trades: f?.trades ?? 0, feesUsdc: tradeFees },
    revenue: { creationFeesUsdc: creation, tradeFeesUsdc: tradeFees, totalUsdc: creation + tradeFees, treasuryUsdc: treasury?.usdc ?? null, treasury: treasury?.address ?? FUCI_TREASURY },
    token: { address: FUCI_TOKEN, supply: FUCI_LAUNCH.supply, buyTaxPct: FUCI_LAUNCH.buyTaxPct, sellTaxPct: FUCI_LAUNCH.sellTaxPct, market: mkt },
    contracts,
    links: [
      { label: "DefiLlama", url: "https://defillama.com/protocol/fuci" },
      { label: "DexScreener", url: `https://dexscreener.com/arc/${FUCI_TOKEN}` },
      { label: "Argus", url: `https://argus.world/token/${FUCI_TOKEN}` },
      { label: "GitHub", url: GITHUB_URL },
      { label: "X", url: X_URL },
    ],
    recent: (f?.events ?? []).slice(0, 12),
  };
}
