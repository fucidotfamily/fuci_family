import { type Address } from "viem";
import { ARGUS, HOOK, launchLogs, launchOf, arcClient } from "./argus";
import { EXPLORER_URL } from "./config";
import * as market from "./trade";
import { NotEnoughUsdc, type TradeResult } from "./trade";
import { acquireLock, addTradeSpend, getAgent, kvGet, kvSet, pushHistory, releaseLock, saveAgent, setTradingActive, tradeSpentToday, tradingAgents, type AgentCard } from "./store";
import { DEFAULT_MAX_BUY_TAX_PCT, RULE_LABEL, type TradeRule } from "./tradingRules";
import { recordAgentTrade } from "./forest";

/**
 * The trading autopilot. Every tick (about every 5 minutes) it:
 * 1. scans Argus once for new launches and new bondings,
 * 2. for each trading agent, checks its open positions (stop loss, take profit, limit sell, dev sold)
 *    and its buy rules (new launch, bonding, limit buy), skipping tokens taxed above the rule's limit,
 * 3. trades from the agent's own wallet, never above its per-trade and daily limits.
 */

export type Position = {
  token: Address;
  symbol: string;
  /** Raw token units held, as a decimal string. */
  amount: string;
  decimals: number;
  /** USDC paid for what is still held (fees included). */
  costUsdc: number;
  openedAt: number;
  /** The token dev's balance at the last check, to spot a dev sell. */
  devBalance?: string;
  /** Take-profit rules that already fired for this position. */
  fired?: string[];
  lastPrice?: number;
};

const MAX_TRADES_PER_TICK = 3;
const MAX_FAILURES = 3;
const LOG_WINDOW = 5_000n;
const posKey = (agentId: string) => `positions:${agentId}`;

export const getPositions = async (agentId: string) => (await kvGet<Record<string, Position>>(posKey(agentId))) ?? {};
const savePositions = (agentId: string, p: Record<string, Position>) => kvSet(posKey(agentId), p);

// ---------------------------------------------------------------------------
// One Argus scan per tick, shared by every agent.

type Scan = { lastBlock: number; open: { token: Address; hook: Address }[] };
const SCAN_KEY = "trade:scan:argus";
/** Stay this many blocks (~20 s) behind the head, so a launch is past Argus' snipe tax when first seen. */
const SNIPE_LAG_BLOCKS = 40n;

export type TickContext = { newLaunches: Address[]; newGraduations: Address[] };

/** Launches (with their hook) from the live Portals in [from, to]; non-USDC pairs are dropped. */
async function launchesIn(from: bigint, to: bigint): Promise<Scan["open"]> {
  if (to < from) return [];
  const logs = await launchLogs(from, to);
  const infos = await Promise.all(logs.map((l) => launchOf(l.token, { creator: l.creator }).catch(() => null)));
  return infos.filter((i) => i !== null && i.quoteAsset.toLowerCase() === ARGUS.usdc.toLowerCase()).map((i) => ({ token: i!.token, hook: i!.hook }));
}

async function bondedFlags(open: Scan["open"]) {
  return arcClient.multicall({ contracts: open.map((o) => ({ address: o.hook, abi: HOOK, functionName: "bonded" as const })), allowFailure: true });
}

async function scanArgus(): Promise<TickContext> {
  const head = (await arcClient.getBlockNumber()) - SNIPE_LAG_BLOCKS;
  let state = await kvGet<Scan>(SCAN_KEY);
  if (!state) {
    // First run: remember recent launches that can still bond, but buy nothing from the past.
    const open = await launchesIn(head - LOG_WINDOW * 20n, head);
    const flags = await bondedFlags(open);
    state = { lastBlock: Number(head), open: open.filter((_, i) => flags[i].status === "success" && flags[i].result === false) };
    await kvSet(SCAN_KEY, state);
    return { newLaunches: [], newGraduations: [] };
  }

  // New launches since the last tick (a long gap only looks at the latest windows).
  let from = BigInt(state.lastBlock) + 1n;
  if (head - from > LOG_WINDOW * 4n) from = head - LOG_WINDOW * 4n;
  const newLaunches = await launchesIn(from, head);

  // Bondings among the launches still below their bond tick.
  const open = [...state.open, ...newLaunches].slice(-400);
  const flags = await bondedFlags(open);
  const isBonded = (i: number) => flags[i].status === "success" && flags[i].result === true;
  const newGraduations = open.filter((_, i) => isBonded(i)).map((o) => o.token);
  await kvSet(SCAN_KEY, { lastBlock: Number(head), open: open.filter((_, i) => !isBonded(i)) } satisfies Scan);
  return { newLaunches: newLaunches.map((l) => l.token), newGraduations };
}

// ---------------------------------------------------------------------------

type Action = { side: "buy"; token: Address; usdc: number; why: string; rule?: TradeRule } | { side: "sell"; token: Address; pct: number; why: string; rule?: TradeRule };

const fmtPrice = (p: number) => (p >= 1 ? p.toFixed(4) : p.toPrecision(3));
const txLink = (tx: string) => `${EXPLORER_URL}/tx/${tx}`;

/** Run the autopilot for every trading agent. Called from the automation tick. */
export async function runTradingTick(budgetMs = 35_000) {
  const started = Date.now();
  if (!(await acquireLock("trading", 55))) return { skipped: "another tick is trading" };
  try {
    const ids = await tradingAgents();
    if (!ids.length) return { agents: 0 };
    const ctx = await scanArgus();
    const results: { agent: string; status: string }[] = [];
    for (const id of ids) {
      if (Date.now() - started > budgetMs) break;
      const agent = await getAgent(id);
      if (!agent?.trading?.enabled) {
        await setTradingActive(id, false);
        continue;
      }
      try {
        results.push({ agent: id, status: await runAgentTrading(agent, ctx) });
      } catch (e) {
        results.push({ agent: id, status: `error: ${(e as Error).message.slice(0, 160)}` });
      }
    }
    return { agents: ids.length, launches: ctx.newLaunches.length, graduations: ctx.newGraduations.length, results };
  } finally {
    await releaseLock("trading");
  }
}

/** What the engine needs from the chain; tests swap these for stubs. */
export type Deps = Pick<typeof market, "buy" | "sell" | "marketOf" | "priceOf" | "tokenBalance">;

export async function runAgentTrading(agent: AgentCard, ctx: TickContext, deps: Deps = market): Promise<string> {
  const { buy, sell, marketOf, priceOf, tokenBalance } = deps;
  const t = agent.trading!;
  const positions = await getPositions(agent.id);
  const sells: Action[] = [];
  const buys: Action[] = [];
  const notes: string[] = [];

  // Open positions: stop loss, take profit, limit sell, dev sold.
  for (const [key, p] of Object.entries(positions)) {
    const m = await marketOf(p.token).catch(() => null);
    if (!m) continue;
    const held = await tokenBalance(p.token, agent.wallet as Address).catch(() => null);
    if (held !== null && held === 0n) {
      delete positions[key]; // sold or moved outside the autopilot
      continue;
    }
    if (held !== null && held < BigInt(p.amount)) p.amount = held.toString();
    const price = await priceOf(m).catch(() => null);
    if (price === null) continue;
    p.lastPrice = price;
    const whole = Number(p.amount) / 10 ** p.decimals;
    const entry = whole > 0 ? p.costUsdc / whole : 0;
    const change = entry > 0 ? (price / entry - 1) * 100 : 0;
    const devNow = await tokenBalance(p.token, m.creator).catch(() => null);
    const devSold = devNow !== null && p.devBalance !== undefined && BigInt(p.devBalance) > 0n && devNow * 100n < BigInt(p.devBalance) * 99n;
    if (devNow !== null) p.devBalance = devNow.toString();

    let action: Action | null = null;
    for (const r of t.rules) {
      if (r.kind === "stop-loss" && entry > 0 && change <= -r.pct) action = { side: "sell", token: p.token, pct: 100, why: "stop loss", rule: r };
      else if (r.kind === "dev-sell" && devSold) action = { side: "sell", token: p.token, pct: 100, why: "the dev sold", rule: r };
      if (action?.side === "sell" && action.pct === 100) break;
      if (r.kind === "take-profit" && entry > 0 && change >= r.pct && !(p.fired ?? []).includes(r.id)) action ??= { side: "sell", token: p.token, pct: r.sellPct, why: "take profit", rule: r };
      if (r.kind === "limit-sell" && !r.done && r.token === p.token.toLowerCase() && price >= r.price) action ??= { side: "sell", token: p.token, pct: r.pct, why: `limit sell at ${fmtPrice(price)}`, rule: r };
    }
    if (action) sells.push(action);
  }

  // Buy rules.
  const holding = new Set(Object.keys(positions));
  for (const r of t.rules) {
    if (r.kind === "snipe-new" || r.kind === "buy-graduated") {
      const tokens = r.kind === "snipe-new" ? ctx.newLaunches : ctx.newGraduations;
      const maxTax = r.maxBuyTaxPct ?? DEFAULT_MAX_BUY_TAX_PCT;
      for (const token of tokens) {
        const m = await marketOf(token).catch(() => null);
        if (!m) continue;
        if (m.buyTaxPct > maxTax) {
          await pushHistory(agent.id, { kind: "trade", label: `Skipped $${m.symbol}: its ${m.buyTaxPct}% buy tax is above your ${maxTax}% limit` });
          continue;
        }
        buys.push({ side: "buy", token, usdc: r.usdc, why: r.kind === "snipe-new" ? "new launch" : "just bonded", rule: r });
      }
    }
    if (r.kind === "limit-buy" && !r.done) {
      const m = await marketOf(r.token as Address).catch(() => null);
      const price = m ? await priceOf(m).catch(() => null) : null;
      if (m && price !== null && price > 0 && price <= r.price) buys.push({ side: "buy", token: m.token, usdc: r.usdc, why: `limit buy at ${fmtPrice(price)}`, rule: r });
    }
  }

  let trades = 0;
  let spent = await tradeSpentToday(agent.id);
  const bought = new Set<string>();
  for (const a of [...sells, ...buys]) {
    if (trades >= MAX_TRADES_PER_TICK) break;
    const key = a.token.toLowerCase();
    if (a.side === "buy") {
      if (bought.has(key) || (a.rule?.kind !== "limit-buy" && holding.has(key))) continue;
      const usdc = Math.min(a.usdc, t.perTradeUsdc);
      if (spent + usdc > t.dailyUsdc + 1e-9) {
        notes.push("daily max reached");
        continue;
      }
      try {
        const r = await buy(agent.id, a.token, usdc, t.slippagePct);
        trades++;
        spent += r.usdc;
        bought.add(key);
        await addTradeSpend(agent.id, r.usdc);
        positions[key] = await positionAfterBuy(positions[key], r, deps);
        if (a.rule?.kind === "limit-buy") a.rule.done = true;
        await logTrade(agent.id, r, a.why);
        t.failures = 0;
      } catch (e) {
        if (e instanceof NotEnoughUsdc || (e as Error).name === "NotEnoughUsdc") {
          notes.push((e as Error).message);
          break;
        }
        await failed(agent, `buy ${key.slice(0, 6)}…${key.slice(-4)}: ${(e as Error).message}`);
      }
    } else {
      const p = positions[key];
      if (!p) continue;
      const amount = a.pct >= 100 ? BigInt(p.amount) : (BigInt(p.amount) * BigInt(Math.round(a.pct * 100))) / 10_000n;
      try {
        const r = await sell(agent.id, a.token, amount, t.slippagePct);
        trades++;
        const left = BigInt(p.amount) - r.tokens;
        const soldCost = p.costUsdc * (Number(r.tokens) / Number(p.amount));
        const pnl = soldCost > 0 ? (r.usdc / soldCost - 1) * 100 : 0;
        if (left <= 0n || a.pct >= 100) delete positions[key];
        else positions[key] = { ...p, amount: left.toString(), costUsdc: p.costUsdc - soldCost, fired: a.rule?.kind === "take-profit" ? [...(p.fired ?? []), a.rule.id] : p.fired };
        if (a.rule?.kind === "limit-sell") a.rule.done = true;
        await logTrade(agent.id, r, `${a.why}, ${pnl >= 0 ? "+" : ""}${pnl.toFixed(0)}%`);
        t.failures = 0;
      } catch (e) {
        await failed(agent, `sell $${p.symbol}: ${(e as Error).message}`);
      }
    }
    if (!agent.trading?.enabled) break;
  }

  await savePositions(agent.id, positions);
  t.lastRunAt = Date.now();
  // One history note per new problem (an empty wallet, the daily max), not one per tick.
  const note = notes[0];
  if (note && t.pausedReason !== note) await pushHistory(agent.id, { kind: "trade", label: `Trading waits: ${note}` });
  if (t.enabled) t.pausedReason = note;
  await saveMerged(agent);
  return trades ? `${trades} trade(s)` : (note ?? "no signal");
}

/** Save what this tick learned without undoing settings the owner saved meanwhile. */
async function saveMerged(agent: AgentCard) {
  const t = agent.trading!;
  const fresh = (await getAgent(agent.id)) ?? agent;
  const f = fresh.trading;
  if (!f) return;
  const done = new Set(t.rules.filter((r) => "done" in r && r.done).map((r) => r.id));
  f.rules = f.rules.map((r) => (done.has(r.id) && (r.kind === "limit-buy" || r.kind === "limit-sell") ? { ...r, done: true } : r));
  f.failures = t.failures;
  f.lastRunAt = t.lastRunAt;
  f.pausedReason = t.pausedReason;
  if (!t.enabled) f.enabled = false;
  await saveAgent(fresh);
}

async function failed(agent: AgentCard, why: string) {
  const t = agent.trading!;
  t.failures = (t.failures ?? 0) + 1;
  if (t.failures === 1) await pushHistory(agent.id, { kind: "trade", label: `Trade failed: ${why.slice(0, 180)}` });
  if (t.failures >= MAX_FAILURES) {
    t.enabled = false;
    t.pausedReason = `paused after ${MAX_FAILURES} failed trades: ${why.slice(0, 140)}`;
    await setTradingActive(agent.id, false);
    await pushHistory(agent.id, { kind: "trade", label: `Trading ${t.pausedReason}` });
  }
}

async function logTrade(agentId: string, r: TradeResult, why: string) {
  const label =
    r.side === "buy"
      ? `Bought $${r.symbol} for ${r.usdc.toFixed(2)} USDC at ${fmtPrice(r.price)} (${why})`
      : `Sold $${r.symbol} for ${r.usdc.toFixed(2)} USDC at ${fmtPrice(r.price)} (${why})`;
  await pushHistory(agentId, { kind: "trade", label, usdc: r.usdc, href: txLink(r.tx) });
  // The public on-chain feed on the home page (every entry links to its transaction).
  const agent = await getAgent(agentId).catch(() => null);
  await recordAgentTrade({ agent: agent?.name ?? agentId, agentId, side: r.side, symbol: r.symbol, usdc: r.usdc, tx: r.tx }).catch(() => undefined);
}

/** The position after a filled buy (adds to an existing one). */
async function positionAfterBuy(prev: Position | undefined, r: TradeResult, deps: Pick<Deps, "marketOf" | "tokenBalance"> = market): Promise<Position> {
  const m = await deps.marketOf(r.token).catch(() => null);
  return {
    token: r.token,
    symbol: r.symbol,
    amount: ((prev ? BigInt(prev.amount) : 0n) + r.tokens).toString(),
    decimals: m?.decimals ?? 18,
    costUsdc: (prev?.costUsdc ?? 0) + r.usdc,
    openedAt: prev?.openedAt ?? Date.now(),
    devBalance: m ? (await deps.tokenBalance(r.token, m.creator).catch(() => undefined))?.toString() : prev?.devBalance,
    fired: prev?.fired,
    lastPrice: r.price,
  };
}

/** Owner action: buy `usdc` of `token` now, within the agent's per-trade and daily limits. */
export async function buyNow(agentId: string, token: Address, usdc: number) {
  const agent = await getAgent(agentId);
  if (!agent?.wallet) throw new Error("Fund the agent wallet first");
  const t = agent.trading;
  const perTrade = t?.perTradeUsdc ?? 2;
  const daily = t?.dailyUsdc ?? 10;
  if (usdc > perTrade + 1e-9) throw new Error(`Max ${perTrade} USDC per trade (change it under Limits)`);
  if ((await tradeSpentToday(agentId)) + usdc > daily + 1e-9) throw new Error(`That would pass today's max of ${daily} USDC`);
  const r = await market.buy(agentId, token, usdc, t?.slippagePct ?? 10);
  await addTradeSpend(agentId, r.usdc);
  const positions = await getPositions(agentId);
  const key = token.toLowerCase();
  positions[key] = await positionAfterBuy(positions[key], r);
  await savePositions(agentId, positions);
  await logTrade(agentId, r, "bought by owner");
  return r;
}

/** Owner action: sell `pct`% of one position, or of every position. */
export async function sellNow(agentId: string, token: Address | "all", pct = 100) {
  const agent = await getAgent(agentId);
  if (!agent?.wallet) throw new Error("This agent has no wallet");
  const positions = await getPositions(agentId);
  const keys = token === "all" ? Object.keys(positions) : [token.toLowerCase()];
  const out: TradeResult[] = [];
  const errors: string[] = [];
  for (const key of keys) {
    const p = positions[key];
    if (!p) continue;
    const amount = pct >= 100 ? BigInt(p.amount) : (BigInt(p.amount) * BigInt(Math.round(pct * 100))) / 10_000n;
    try {
      const r = await market.sell(agentId, p.token, amount, Math.max(agent.trading?.slippagePct ?? 10, 10));
      out.push(r);
      const left = BigInt(p.amount) - r.tokens;
      if (left <= 0n || pct >= 100) delete positions[key];
      else positions[key] = { ...p, amount: left.toString(), costUsdc: p.costUsdc * (Number(left) / Number(p.amount)) };
      await logTrade(agentId, r, "sold by owner");
    } catch (e) {
      errors.push(`$${p.symbol}: ${(e as Error).message.slice(0, 120)}`);
    }
  }
  await savePositions(agentId, positions);
  return { sold: out.length, errors };
}

/** Positions with live prices and PnL, for the agent page. */
export async function positionsView(agentId: string) {
  const positions = await getPositions(agentId);
  return Promise.all(
    Object.values(positions).map(async (p) => {
      const m = await market.marketOf(p.token).catch(() => null);
      const price = m ? await market.priceOf(m).catch(() => p.lastPrice ?? null) : (p.lastPrice ?? null);
      const whole = Number(p.amount) / 10 ** p.decimals;
      const value = price !== null ? price * whole : null;
      return {
        token: p.token,
        symbol: p.symbol,
        amount: whole,
        costUsdc: p.costUsdc,
        price,
        valueUsdc: value,
        pnlPct: value !== null && p.costUsdc > 0 ? (value / p.costUsdc - 1) * 100 : null,
        /** False for a token that isn't on Argus (e.g. left from FOCI): the owner can only withdraw it. */
        tradable: Boolean(m),
        bonded: m?.bonded ?? false,
        openedAt: p.openedAt,
      };
    }),
  );
}

export const ruleSummary = (r: TradeRule) => RULE_LABEL[r.kind];
