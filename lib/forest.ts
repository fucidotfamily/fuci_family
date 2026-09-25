import { parseAbiItem } from "viem";
import { arcClient } from "./argus";
import { EXPLORER_URL } from "./config";
import { factoryAddress } from "./factory";
import { acquireLock, kvGet, kvIncr, kvSet, listPush, listRangeJson, releaseLock, tradeFeesTotal } from "./store";

/**
 * "The forest right now": what Fuci agents did on Arc. Every entry is an on-chain transaction:
 * - agents created through the Fuci factory (AgentCreated, with the fee paid),
 * - autopilot and owner trades from agent wallets (recorded with their tx hash when they fill).
 * The factory is scanned incrementally (the automation tick and page views refresh it).
 */

export type ForestEvent = { kind: "agent" | "buy" | "sell"; label: string; href: string; at: number };

type FactoryScan = { lastBlock: number; agentsCreated: number; feesUsdc: number; agentIds: number[]; events: ForestEvent[]; updatedAt: number };

export type Forest = {
  agentsCreated: number;
  /** ERC-8004 ids of the agents created through the Fuci factory. */
  agentIds: number[];
  creationFeesUsdc: number;
  trades: number;
  tradeFeesUsdc: number;
  events: ForestEvent[];
  lastBlock: number | null;
  updatedAt: number | null;
};

const SCAN_KEY = "forest:factory:v1";
const TRADES_KEY = "forest:trades";
const TRADE_COUNT_KEY = "forest:trade-count";
const STALE_MS = 60_000;
const WINDOW = 5_000n;
const AGENT_CREATED = parseAbiItem("event AgentCreated(uint256 indexed agentId, address indexed owner, uint256 feePaid, string name, string agentURI)");
// The Fuci factory was deployed at this block (2026-09-24); older blocks can't hold its events.
const FACTORY_DEPLOY_BLOCK = 22474356n;

const c = arcClient;
const txLink = (hash: string) => `${EXPLORER_URL}/tx/${hash}`;

/** Called when a trade fills: it goes into the public feed. */
export async function recordAgentTrade(t: { agent: string; agentId: string; side: "buy" | "sell"; symbol: string; usdc: number; tx: string }) {
  const e: ForestEvent = {
    kind: t.side,
    label: `${t.agent} ${t.side === "buy" ? "bought" : "sold"} $${t.symbol} for ${t.usdc.toFixed(2)} USDC`,
    href: txLink(t.tx),
    at: Date.now(),
  };
  await listPush(TRADES_KEY, JSON.stringify(e), 50);
  await kvIncr(TRADE_COUNT_KEY);
}

/** Everything the home page shows, from storage (fast). `stale` asks for a factory rescan. */
export async function getForest(): Promise<{ forest: Forest; stale: boolean }> {
  const [scan, raw, trades, tradeFeesUsdc] = await Promise.all([
    kvGet<FactoryScan>(SCAN_KEY).catch(() => null),
    listRangeJson<ForestEvent>(TRADES_KEY, 20).catch(() => [] as ForestEvent[]),
    kvGet<number>(TRADE_COUNT_KEY).catch(() => null),
    tradeFeesTotal().catch(() => 0),
  ]);
  const tradeEvents = raw.filter((e) => e && typeof e.href === "string" && typeof e.at === "number");
  const events = [...(scan?.events ?? []), ...tradeEvents].sort((a, b) => b.at - a.at).slice(0, 20);
  return {
    forest: {
      agentsCreated: scan?.agentsCreated ?? 0,
      agentIds: scan?.agentIds ?? [],
      creationFeesUsdc: scan?.feesUsdc ?? 0,
      trades: Number(trades ?? 0),
      tradeFeesUsdc,
      events,
      lastBlock: scan?.lastBlock ?? null,
      updatedAt: scan?.updatedAt ?? null,
    },
    stale: !scan || Date.now() - scan.updatedAt > STALE_MS,
  };
}

/** Read new AgentCreated events from the Fuci factory. One run at a time. */
export async function refreshForest() {
  const factory = await factoryAddress().catch(() => null);
  if (!factory || !(await acquireLock("forest", 120))) return null;
  try {
    const head = await c.getBlockNumber();
    // Older scans kept no ids: rebuild them from the factory's deployment.
    const stored = await kvGet<FactoryScan>(SCAN_KEY);
    const prev = stored?.agentIds ? stored : null;
    const s: FactoryScan = prev ?? { lastBlock: Number(FACTORY_DEPLOY_BLOCK) - 1, agentsCreated: 0, feesUsdc: 0, agentIds: [], events: [], updatedAt: 0 };
    const logs = [];
    for (let f = BigInt(s.lastBlock) + 1n; f <= head; f += WINDOW) {
      const t = f + WINDOW - 1n > head ? head : f + WINDOW - 1n;
      logs.push(...(await c.getLogs({ address: factory, event: AGENT_CREATED, fromBlock: f, toBlock: t })));
    }
    s.agentsCreated += logs.length;
    s.agentIds = [...new Set([...s.agentIds, ...logs.map((l) => Number(l.args.agentId))])];
    s.feesUsdc += logs.reduce((sum, l) => sum + Number(l.args.feePaid ?? 0n) / 1e6, 0);
    const fresh: ForestEvent[] = [];
    for (const l of logs.slice(-10)) {
      const at = Number((await c.getBlock({ blockNumber: l.blockNumber })).timestamp) * 1000;
      const fee = Number(l.args.feePaid ?? 0n) / 1e6;
      fresh.push({ kind: "agent", label: `${(l.args.name ?? "An agent").slice(0, 32)} went on-chain as agent #${l.args.agentId}${fee ? ` (${fee} USDC)` : ""}`, href: txLink(l.transactionHash), at });
    }
    s.events = [...fresh, ...s.events].sort((a, b) => b.at - a.at).slice(0, 20);
    s.lastBlock = Number(head);
    s.updatedAt = Date.now();
    await kvSet(SCAN_KEY, s);
    return s;
  } finally {
    await releaseLock("forest");
  }
}

const ERC20_BALANCE = parseAbiItem("function balanceOf(address) view returns (uint256)");

/** Fuci's treasury and its USDC balance, read live from Arc. */
export async function treasuryBalance(): Promise<{ address: string; usdc: number } | null> {
  const { tradeTreasury } = await import("./trade");
  const address = await tradeTreasury().catch(() => null);
  if (!address) return null;
  const raw = await c.readContract({ address: "0x3600000000000000000000000000000000000000", abi: [ERC20_BALANCE], functionName: "balanceOf", args: [address] });
  return { address, usdc: Number(raw) / 1e6 };
}

/**
 * Whether an agent was created through the Fuci factory (it then carries "Created with Fuci").
 * Brand agents (named Fuci) skip the label.
 */
export async function createdWithFuci(a: { id: string; createdVia?: "factory"; erc8004Id?: number }) {
  if (a.id === "fuci" || a.id.startsWith("fuci-")) return false;
  if (a.createdVia === "factory") return true;
  if (a.erc8004Id === undefined) return false;
  const { forest } = await getForest();
  return forest.agentIds.includes(a.erc8004Id);
}
