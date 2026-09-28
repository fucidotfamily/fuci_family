import { erc20Abi, type Address } from "viem";
import { ARGUS, HOOK, launchLogs, launchOf, arcClient } from "./argus";
import { EXPLORER_URL } from "./config";
import * as market from "./trade";
import { NotEnoughUsdc, type TradeResult } from "./trade";
import {
  acquireLock,
  addTradeSpend,
  getAgent,
  kvGet,
  kvSet,
  pushHistory,
  releaseLock,
  saveAgent,
  setTradingActive,
  tradeSpentToday,
  tradingAgents,
  withAgentLock,
  type AgentCard,
} from "./store";
import {
  DEFAULT_MAX_BUY_TAX_PCT,
  RULE_LABEL,
  type TradeRule,
} from "./tradingRules";
import { recordAgentTrade } from "./forest";
import { inWindow, judge, signalsOf, trimCreators, type Signals, type Watch } from "./tradeSignals";
import { addTrade } from "./tradePnl";

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
  /** Highest price seen since the buy (for the trailing stop). */
  peak?: number;
};

const MAX_TRADES_PER_TICK = 3;
const MAX_FAILURES = 3;
const LOG_WINDOW = 5_000n;
const posKey = (agentId: string) => `positions:${agentId}`;

export const getPositions = async (agentId: string) =>
  (await kvGet<Record<string, Position>>(posKey(agentId))) ?? {};
const savePositions = (agentId: string, p: Record<string, Position>) =>
  kvSet(posKey(agentId), p);

// ---------------------------------------------------------------------------
// One Argus scan per tick, shared by every agent.

type Scan = {
  lastBlock: number;
  open: { token: Address; hook: Address }[];
  /** Smart entry: tokens being watched (new launches and fresh bondings), newest last. */
  watch?: (Watch & { checkedAt?: number })[];
  /** Launch timestamps per creator over the last 24 hours (serial-launcher filter). */
  creators?: Record<string, number[]>;
};
const SCAN_KEY = "trade:scan:argus";
/** Stay this many blocks (~20 s) behind the head, so a launch is past Argus' snipe tax when first seen. */
const SNIPE_LAG_BLOCKS = 40n;
/** Most launches looked up per scan. */
const MAX_LOOKUPS = 60;

export type TickContext = {
  newLaunches: Address[];
  newGraduations: Address[];
  /** Smart entry: the watchlist and the signals read this tick (by lowercase token). */
  watch?: Watch[];
  signals?: Map<string, Signals>;
};

/** Blocks on Arc are about half a second apart. */
const BLOCK_MS = 500;
/** Watched tokens are kept this long; signals are read for at most this many per tick. */
const WATCH_MS = 24 * 3_600_000;
const MAX_WATCH = 400;
const SIGNALS_PER_TICK = 8;

/** Launches (with their hook) from the live Portals in [from, to]; non-USDC pairs are dropped. */
async function launchesIn(from: bigint, to: bigint, seen?: { logs: Awaited<ReturnType<typeof launchLogs>> }): Promise<(Scan["open"][number] & { creator: Address; block: number })[]> {
  if (to < from) return [];
  const all = await launchLogs(from, to);
  if (seen) seen.logs = all;
  // Argus sees thousands of launches a day and each lookup costs ~13 RPC reads: take the newest, a few at a time.
  const logs = all.slice(-MAX_LOOKUPS);
  const infos: Awaited<ReturnType<typeof launchOf>>[] = [];
  for (let i = 0; i < logs.length; i += 6)
    infos.push(
      ...(await Promise.all(
        logs
          .slice(i, i + 6)
          .map((l) =>
            launchOf(l.token, { creator: l.creator }).catch(() => null),
          ),
      )),
    );
  return infos
    .filter(
      (i) =>
        i !== null && i.quoteAsset.toLowerCase() === ARGUS.usdc.toLowerCase(),
    )
    .map((i) => ({ token: i!.token, hook: i!.hook, creator: i!.creator, block: logs.find((l) => l.token.toLowerCase() === i!.token.toLowerCase())?.block ?? Number(to) }));
}

/** The creator's balance of each token, to spot a dev sell later. */
async function devBalances(items: { token: Address; creator: Address }[]) {
  if (!items.length) return [];
  const res = await arcClient.multicall({
    contracts: items.map((i) => ({ address: i.token, abi: erc20Abi, functionName: "balanceOf" as const, args: [i.creator] })),
    allowFailure: true,
  });
  return res.map((r) => (r.status === "success" ? String(r.result) : undefined));
}

async function bondedFlags(open: Scan["open"]) {
  return arcClient.multicall({
    contracts: open.map((o) => ({
      address: o.hook,
      abi: HOOK,
      functionName: "bonded" as const,
    })),
    allowFailure: true,
  });
}

async function scanArgus(): Promise<TickContext> {
  const head = (await arcClient.getBlockNumber()) - SNIPE_LAG_BLOCKS;
  let state = await kvGet<Scan>(SCAN_KEY);
  if (!state) {
    // First run: remember recent launches that can still bond, but buy nothing from the past.
    const open = await launchesIn(head - LOG_WINDOW * 20n, head);
    const flags = await bondedFlags(open);
    state = {
      lastBlock: Number(head),
      open: open
        .filter((_, i) => flags[i].status === "success" && flags[i].result === false)
        .map(({ token, hook }) => ({ token, hook })),
    };
    await kvSet(SCAN_KEY, state);
    return { newLaunches: [], newGraduations: [] };
  }

  // New launches since the last tick (a long gap only looks at the latest windows).
  let from = BigInt(state.lastBlock) + 1n;
  if (head - from > LOG_WINDOW * 4n) from = head - LOG_WINDOW * 4n;
  const seen = { logs: [] as Awaited<ReturnType<typeof launchLogs>> };
  const newLaunches = await launchesIn(from, head, seen);

  // Bondings among the launches still below their bond tick.
  const open = [...state.open, ...newLaunches].slice(-400);
  const flags = await bondedFlags(open);
  const isBonded = (i: number) =>
    flags[i].status === "success" && flags[i].result === true;
  const newGraduations = open.filter((_, i) => isBonded(i)).map((o) => o.token);

  // Smart entry bookkeeping: every creator's launches (all of them, not just the ones looked up),
  // and the watchlist of new launches and fresh bondings with the creator's balance at first sight.
  const now = Date.now();
  const creators = { ...(state.creators ?? {}) };
  for (const l of seen.logs) {
    const k = l.creator.toLowerCase();
    creators[k] = [...(creators[k] ?? []), now - Number(head - BigInt(l.block)) * BLOCK_MS];
  }
  const grads = await Promise.all(
    newGraduations.slice(0, 20).map(async (token) => ({ token, creator: (await launchOf(token).catch(() => null))?.creator })),
  );
  const fresh = [
    ...newLaunches.map((l) => ({ token: l.token, creator: l.creator, kind: "launch" as const, seenAt: now - Number(head - BigInt(l.block)) * BLOCK_MS, seenBlock: l.block })),
    ...grads.filter((g): g is { token: Address; creator: Address } => Boolean(g.creator)).map((g) => ({ ...g, kind: "bonded" as const, seenAt: now, seenBlock: Number(head) })),
  ];
  const devs = await devBalances(fresh).catch(() => fresh.map(() => undefined));
  const watch = [...(state.watch ?? []), ...fresh.map((w, i) => ({ ...w, devStart: devs[i] }))]
    .filter((w) => now - w.seenAt < WATCH_MS)
    .slice(-MAX_WATCH);

  await kvSet(SCAN_KEY, {
    lastBlock: Number(head),
    open: open.filter((_, i) => !isBonded(i)).map(({ token, hook }) => ({ token, hook })),
    watch,
    creators: trimCreators(creators, now),
  } satisfies Scan);
  return { newLaunches: newLaunches.map((l) => l.token), newGraduations, watch };
}

// ---------------------------------------------------------------------------

type Action =
  | { side: "buy"; token: Address; usdc: number; why: string; rule?: TradeRule }
  | {
      side: "sell";
      token: Address;
      pct: number;
      why: string;
      rule?: TradeRule;
    };

const fmtPrice = (p: number) => (p >= 1 ? p.toFixed(4) : p.toPrecision(3));
const txLink = (tx: string) => `${EXPLORER_URL}/tx/${tx}`;

/** Trades use the shared per-agent wallet lock (see withAgentLock in lib/store). */
export { AgentBusyError as TradeBusyError } from "./store";
const withTradeLock = <T>(agentId: string, fn: () => Promise<T>) =>
  withAgentLock(agentId, fn);

/** Run the autopilot for every trading agent. Called from the automation tick. */
export async function runTradingTick(budgetMs = 35_000) {
  const started = Date.now();
  if (!(await acquireLock("trading", 55)))
    return { skipped: "another tick is trading" };
  try {
    const ids = await tradingAgents();
    if (!ids.length) return { agents: 0 };
    const ctx = await scanArgus();
    // Smart entry: read signals once per tick for the watched tokens some agent's rule is waiting on.
    const smart = (await Promise.all(ids.map((id) => getAgent(id).catch(() => null))))
      .flatMap((a) => (a?.trading?.enabled ? a.trading.rules : []))
      .filter((r): r is Extract<TradeRule, { kind: "smart-buy" }> => r.kind === "smart-buy");
    if (smart.length && ctx.watch?.length) ctx.signals = await readSignals(ctx.watch, smart).catch(() => new Map());
    const results: { agent: string; status: string }[] = [];
    for (const id of ids) {
      if (Date.now() - started > budgetMs) break;
      const agent = await getAgent(id);
      if (!agent?.trading?.enabled) {
        await setTradingActive(id, false);
        continue;
      }
      try {
        results.push({
          agent: id,
          status: await withTradeLock(id, () => runAgentTrading(agent, ctx)),
        });
      } catch (e) {
        results.push({
          agent: id,
          status: `error: ${(e as Error).message.slice(0, 160)}`,
        });
      }
    }
    return {
      agents: ids.length,
      launches: ctx.newLaunches.length,
      graduations: ctx.newGraduations.length,
      results,
    };
  } finally {
    await releaseLock("trading");
  }
}

/** Signals for the watched tokens inside any smart rule's window, least recently checked first. */
async function readSignals(watch: Watch[], rules: Extract<TradeRule, { kind: "smart-buy" }>[]) {
  const state = await kvGet<Scan>(SCAN_KEY);
  const now = Date.now();
  const due = (state?.watch ?? (watch as (Watch & { checkedAt?: number })[]))
    .filter((w) => rules.some((r) => inWindow(w, r, now)))
    .sort((a, b) => (a.checkedAt ?? 0) - (b.checkedAt ?? 0))
    .slice(0, SIGNALS_PER_TICK);
  const out = new Map<string, Signals>();
  const creators = state?.creators ?? {};
  // Bounded: the whole read stays inside the tick's time, and one slow token can't hold it up.
  const deadline = now + 20_000;
  const within = <T,>(p: Promise<T>, ms: number) => Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), ms))]);
  for (let i = 0; i < due.length && Date.now() < deadline; i += 4) {
    const got = await Promise.all(due.slice(i, i + 4).map((w) => within(signalsOf(w, creators).catch(() => null), 12_000)));
    got.forEach((sig, k) => sig && out.set(due[i + k].token.toLowerCase(), sig));
  }
  if (state?.watch) {
    const checked = new Set(due.map((w) => w.token.toLowerCase()));
    await kvSet(SCAN_KEY, { ...state, watch: state.watch.map((w) => (checked.has(w.token.toLowerCase()) ? { ...w, checkedAt: now } : w)) });
  }
  return out;
}

/** Tokens an agent already bought through smart entry, so it never buys the same one twice. */
const boughtKey = (agentId: string) => `trade:bought:${agentId}`;
const summaryKey = (agentId: string) => `trade:summary:${agentId}`;
/** DCA progress per plan (kept outside the owner-signed settings): last buy and USDC spent so far. */
type DcaState = { lastAt: number; spentUsdc: number };
const dcaKey = (agentId: string, ruleId: string, token: string) => `trade:dca:${agentId}:${ruleId}:${token.toLowerCase()}`;

/** What the engine needs from the chain; tests swap these for stubs. */
export type Deps = Pick<
  typeof market,
  "buy" | "sell" | "marketOf" | "priceOf" | "tokenBalance"
>;

export async function runAgentTrading(
  agent: AgentCard,
  ctx: TickContext,
  deps: Deps = market,
): Promise<string> {
  const { buy, sell, marketOf, priceOf, tokenBalance } = deps;
  const t = agent.trading!;
  const positions = await getPositions(agent.id);
  const sells: Action[] = [];
  const buys: Action[] = [];
  const notes: string[] = [];

  // Tokens a DCA plan keeps: the automatic exits never sell them (limit sells still can).
  const kept = new Set(t.rules.filter((r): r is Extract<TradeRule, { kind: "dca" }> => r.kind === "dca" && r.hold).map((r) => r.token.toLowerCase()));

  // Open positions: stop loss, take profit, limit sell, dev sold.
  for (const [key, p] of Object.entries(positions)) {
    const m = await marketOf(p.token).catch(() => null);
    if (!m) continue;
    const held = await tokenBalance(p.token, agent.wallet as Address).catch(
      () => null,
    );
    if (held !== null && held === 0n) {
      delete positions[key]; // sold or moved outside the autopilot
      continue;
    }
    if (held !== null && held < BigInt(p.amount)) p.amount = held.toString();
    const price = await priceOf(m).catch(() => null);
    if (price === null) continue;
    p.lastPrice = price;
    p.peak = Math.max(p.peak ?? 0, price);
    const whole = Number(p.amount) / 10 ** p.decimals;
    const entry = whole > 0 ? p.costUsdc / whole : 0;
    const change = entry > 0 ? (price / entry - 1) * 100 : 0;
    const devNow = await tokenBalance(p.token, m.creator).catch(() => null);
    const devSold =
      devNow !== null &&
      p.devBalance !== undefined &&
      BigInt(p.devBalance) > 0n &&
      devNow * 100n < BigInt(p.devBalance) * 99n;
    if (devNow !== null) p.devBalance = devNow.toString();

    let action: Action | null = null;
    for (const r of t.rules) {
      if (kept.has(key) && r.kind !== "limit-sell") continue;
      if (r.kind === "stop-loss" && entry > 0 && change <= -r.pct)
        action = {
          side: "sell",
          token: p.token,
          pct: 100,
          why: "stop loss",
          rule: r,
        };
      else if (r.kind === "trailing-stop" && entry > 0 && (p.peak ?? 0) > entry && price <= (p.peak ?? 0) * (1 - r.pct / 100))
        action = {
          side: "sell",
          token: p.token,
          pct: 100,
          why: `trailing stop, ${r.pct}% off the peak`,
          rule: r,
        };
      else if (r.kind === "time-exit" && entry > 0 && Date.now() - p.openedAt >= r.hours * 3_600_000 && change < r.minGainPct)
        action = {
          side: "sell",
          token: p.token,
          pct: 100,
          why: `time exit after ${r.hours}h`,
          rule: r,
        };
      else if (r.kind === "dev-sell" && devSold)
        action = {
          side: "sell",
          token: p.token,
          pct: 100,
          why: "the dev sold",
          rule: r,
        };
      if (action?.side === "sell" && action.pct === 100) break;
      if (
        r.kind === "take-profit" &&
        entry > 0 &&
        change >= r.pct &&
        !(p.fired ?? []).includes(r.id)
      )
        action ??= {
          side: "sell",
          token: p.token,
          pct: r.sellPct,
          why: "take profit",
          rule: r,
        };
      if (
        r.kind === "limit-sell" &&
        !r.done &&
        r.token === p.token.toLowerCase() &&
        price >= r.price
      )
        action ??= {
          side: "sell",
          token: p.token,
          pct: r.pct,
          why: `limit sell at ${fmtPrice(price)}`,
          rule: r,
        };
    }
    if (action) sells.push(action);
  }

  // Buy rules.
  const holding = new Set(Object.keys(positions));
  let smartSeen = 0;
  const skips: Record<string, number> = {};
  for (const r of t.rules) {
    if (r.kind === "snipe-new" || r.kind === "buy-graduated") {
      const tokens =
        r.kind === "snipe-new" ? ctx.newLaunches : ctx.newGraduations;
      const maxTax = r.maxBuyTaxPct ?? DEFAULT_MAX_BUY_TAX_PCT;
      for (const token of tokens) {
        const m = await marketOf(token).catch(() => null);
        if (!m) continue;
        if (m.buyTaxPct > maxTax) {
          await pushHistory(agent.id, {
            kind: "trade",
            label: `Skipped $${m.symbol}: its ${m.buyTaxPct}% buy tax is above your ${maxTax}% limit`,
          });
          continue;
        }
        buys.push({
          side: "buy",
          token,
          usdc: r.usdc,
          why: r.kind === "snipe-new" ? "new launch" : "just bonded",
          rule: r,
        });
      }
    }
    if (r.kind === "smart-buy" && ctx.watch && ctx.signals) {
      const already = new Set((await kvGet<string[]>(boughtKey(agent.id)).catch(() => null)) ?? []);
      for (const w of ctx.watch) {
        const sig = ctx.signals.get(w.token.toLowerCase());
        if (!sig || !inWindow(w, r) || already.has(w.token.toLowerCase()) || holding.has(w.token.toLowerCase())) continue;
        const v = judge(sig, r);
        smartSeen++;
        if (!v.ok) {
          skips[v.reason] = (skips[v.reason] ?? 0) + 1;
          continue;
        }
        buys.push({ side: "buy", token: w.token, usdc: r.usdc, why: v.why, rule: r });
      }
    }
    if (r.kind === "dca") {
      const st = (await kvGet<DcaState>(dcaKey(agent.id, r.id, r.token)).catch(() => null)) ?? { lastAt: 0, spentUsdc: 0 };
      const due = Date.now() - st.lastAt >= r.everyHours * 3_600_000 - 60_000;
      const budgetLeft = r.totalUsdc > 0 ? r.totalUsdc - st.spentUsdc : Infinity;
      if (due && budgetLeft >= 0.1) buys.push({ side: "buy", token: r.token as Address, usdc: Math.min(r.usdc, budgetLeft), why: `DCA every ${r.everyHours}h`, rule: r });
    }
    if (r.kind === "limit-buy" && !r.done) {
      const m = await marketOf(r.token as Address).catch(() => null);
      const price = m ? await priceOf(m).catch(() => null) : null;
      if (m && price !== null && price > 0 && price <= r.price)
        buys.push({
          side: "buy",
          token: m.token,
          usdc: r.usdc,
          why: `limit buy at ${fmtPrice(price)}`,
          rule: r,
        });
    }
  }

  let trades = 0;
  let smartBought = 0;
  let spent = await tradeSpentToday(agent.id);
  const bought = new Set<string>();
  for (const a of [...sells, ...buys]) {
    if (trades >= MAX_TRADES_PER_TICK) break;
    const key = a.token.toLowerCase();
    if (a.side === "buy") {
      if (bought.has(key) || (a.rule?.kind !== "limit-buy" && a.rule?.kind !== "dca" && holding.has(key)))
        continue;
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
        if (a.rule?.kind === "dca") {
          const k = dcaKey(agent.id, a.rule.id, a.rule.token);
          const st = (await kvGet<DcaState>(k).catch(() => null)) ?? { lastAt: 0, spentUsdc: 0 };
          await kvSet(k, { lastAt: Date.now(), spentUsdc: Math.round((st.spentUsdc + r.usdc) * 100) / 100 });
        }
        if (a.rule?.kind === "smart-buy") {
          const prev = (await kvGet<string[]>(boughtKey(agent.id)).catch(() => null)) ?? [];
          await kvSet(boughtKey(agent.id), [...prev, key].slice(-500)).catch(() => undefined);
          smartBought++;
        }
        await logTrade(agent.id, r, a.why);
        t.failures = 0;
      } catch (e) {
        if (
          e instanceof NotEnoughUsdc ||
          (e as Error).name === "NotEnoughUsdc"
        ) {
          notes.push((e as Error).message);
          break;
        }
        await failed(
          agent,
          `buy ${key.slice(0, 6)}…${key.slice(-4)}: ${(e as Error).message}`,
        );
      }
    } else {
      const p = positions[key];
      if (!p) continue;
      const amount =
        a.pct >= 100
          ? BigInt(p.amount)
          : (BigInt(p.amount) * BigInt(Math.round(a.pct * 100))) / 10_000n;
      try {
        const r = await sell(agent.id, a.token, amount, t.slippagePct);
        trades++;
        const left = BigInt(p.amount) - r.tokens;
        const soldCost = p.costUsdc * (Number(r.tokens) / Number(p.amount));
        const pnl = soldCost > 0 ? (r.usdc / soldCost - 1) * 100 : 0;
        if (left <= 0n || a.pct >= 100) delete positions[key];
        else
          positions[key] = {
            ...p,
            amount: left.toString(),
            costUsdc: p.costUsdc - soldCost,
            fired:
              a.rule?.kind === "take-profit"
                ? [...(p.fired ?? []), a.rule.id]
                : p.fired,
          };
        if (a.rule?.kind === "limit-sell") a.rule.done = true;
        await logTrade(
          agent.id,
          r,
          `${a.why}, ${pnl >= 0 ? "+" : ""}${pnl.toFixed(0)}%`,
        );
        t.failures = 0;
      } catch (e) {
        await failed(agent, `sell $${p.symbol}: ${(e as Error).message}`);
      }
    }
    if (!agent.trading?.enabled) break;
  }

  // One smart-entry summary line: after a buy, or at most every 30 minutes.
  if (smartSeen > 0) {
    const last = (await kvGet<number>(summaryKey(agent.id)).catch(() => null)) ?? 0;
    if (smartBought > 0 || Date.now() - last > 30 * 60_000) {
      const why = Object.entries(skips)
        .sort((a, b) => b[1] - a[1])
        .map(([k, n]) => `${k} ${n}`)
        .join(", ");
      await pushHistory(agent.id, {
        kind: "trade",
        label: `Smart entry checked ${smartSeen} token${smartSeen === 1 ? "" : "s"}: bought ${smartBought}${why ? ` · skipped: ${why}` : ""}`,
      });
      await kvSet(summaryKey(agent.id), Date.now()).catch(() => undefined);
    }
  }

  await savePositions(agent.id, positions);
  t.lastRunAt = Date.now();
  {
    const why = Object.entries(skips)
      .sort((a, b) => b[1] - a[1])
      .map(([k, n]) => `${k} ${n}`)
      .join(", ");
    const parts = [
      trades ? `${trades} trade${trades === 1 ? "" : "s"}` : null,
      smartSeen ? `checked ${smartSeen} token${smartSeen === 1 ? "" : "s"}, bought ${smartBought}${why ? ` (skipped: ${why})` : ""}` : null,
      Object.keys(positions).length ? `watching ${Object.keys(positions).length} position${Object.keys(positions).length === 1 ? "" : "s"}` : null,
      notes[0] ?? null,
    ].filter(Boolean);
    t.lastResult = parts.length ? parts.join(" · ") : "No new tokens to check yet";
  }
  // One history note per new problem (an empty wallet, the daily max), not one per tick.
  const note = notes[0];
  if (note && t.pausedReason !== note)
    await pushHistory(agent.id, {
      kind: "trade",
      label: `Trading waits: ${note}`,
    });
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
  const done = new Set(
    t.rules.filter((r) => "done" in r && r.done).map((r) => r.id),
  );
  f.rules = f.rules.map((r) =>
    done.has(r.id) && (r.kind === "limit-buy" || r.kind === "limit-sell")
      ? { ...r, done: true }
      : r,
  );
  f.failures = t.failures;
  f.lastRunAt = t.lastRunAt;
  f.lastResult = t.lastResult;
  f.pausedReason = t.pausedReason;
  if (!t.enabled) f.enabled = false;
  await saveAgent(fresh);
}

async function failed(agent: AgentCard, why: string) {
  const t = agent.trading!;
  t.failures = (t.failures ?? 0) + 1;
  if (t.failures === 1)
    await pushHistory(agent.id, {
      kind: "trade",
      label: `Trade failed: ${why.slice(0, 180)}`,
    });
  if (t.failures >= MAX_FAILURES) {
    t.enabled = false;
    t.pausedReason = `paused after ${MAX_FAILURES} failed trades: ${why.slice(0, 140)}`;
    await setTradingActive(agent.id, false);
    await pushHistory(agent.id, {
      kind: "trade",
      label: `Trading ${t.pausedReason}`,
    });
  }
}

async function logTrade(agentId: string, r: TradeResult, why: string) {
  // Totals for the PnL first (the first call rebuilds them from the history, before this line is in it).
  await addTrade(agentId, r.side, r.usdc).catch(() => undefined);
  const label =
    r.side === "buy"
      ? `Bought $${r.symbol} for ${r.usdc.toFixed(2)} USDC at ${fmtPrice(r.price)} (${why})`
      : `Sold $${r.symbol} for ${r.usdc.toFixed(2)} USDC at ${fmtPrice(r.price)} (${why})`;
  await pushHistory(agentId, {
    kind: "trade",
    label,
    usdc: r.usdc,
    href: txLink(r.tx),
  });
  // The public on-chain feed on the home page (every entry links to its transaction).
  const agent = await getAgent(agentId).catch(() => null);
  await recordAgentTrade({
    agent: agent?.name ?? agentId,
    agentId,
    side: r.side,
    symbol: r.symbol,
    usdc: r.usdc,
    tx: r.tx,
  }).catch(() => undefined);
}

/** The position after a filled buy (adds to an existing one). */
async function positionAfterBuy(
  prev: Position | undefined,
  r: TradeResult,
  deps: Pick<Deps, "marketOf" | "tokenBalance"> = market,
): Promise<Position> {
  const m = await deps.marketOf(r.token).catch(() => null);
  return {
    token: r.token,
    symbol: r.symbol,
    amount: ((prev ? BigInt(prev.amount) : 0n) + r.tokens).toString(),
    decimals: m?.decimals ?? 18,
    costUsdc: (prev?.costUsdc ?? 0) + r.usdc,
    openedAt: prev?.openedAt ?? Date.now(),
    devBalance: m
      ? (
          await deps.tokenBalance(r.token, m.creator).catch(() => undefined)
        )?.toString()
      : prev?.devBalance,
    fired: prev?.fired,
    lastPrice: r.price,
  };
}

/** Owner action: buy `usdc` of `token` now, within the agent's per-trade and daily limits. */
export async function buyNow(agentId: string, token: Address, usdc: number) {
  return withTradeLock(agentId, () => buyNowLocked(agentId, token, usdc));
}

async function buyNowLocked(agentId: string, token: Address, usdc: number) {
  const agent = await getAgent(agentId);
  if (!agent?.wallet) throw new Error("Fund the agent wallet first");
  const t = agent.trading;
  const perTrade = t?.perTradeUsdc ?? 2;
  const daily = t?.dailyUsdc ?? 10;
  if (usdc > perTrade + 1e-9)
    throw new Error(`Max ${perTrade} USDC per trade (change it under Limits)`);
  if ((await tradeSpentToday(agentId)) + usdc > daily + 1e-9)
    throw new Error(`That would pass today's max of ${daily} USDC`);
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
export async function sellNow(
  agentId: string,
  token: Address | "all",
  pct = 100,
) {
  return withTradeLock(agentId, () => sellNowLocked(agentId, token, pct));
}

async function sellNowLocked(
  agentId: string,
  token: Address | "all",
  pct: number,
) {
  const agent = await getAgent(agentId);
  if (!agent?.wallet) throw new Error("This agent has no wallet");
  const positions = await getPositions(agentId);
  const keys = token === "all" ? Object.keys(positions) : [token.toLowerCase()];
  const out: TradeResult[] = [];
  const errors: string[] = [];
  for (const key of keys) {
    const p = positions[key];
    if (!p) continue;
    const amount =
      pct >= 100
        ? BigInt(p.amount)
        : (BigInt(p.amount) * BigInt(Math.round(pct * 100))) / 10_000n;
    try {
      const r = await market.sell(
        agentId,
        p.token,
        amount,
        // The owner's own slippage setting (default 10%), never silently widened.
        agent.trading?.slippagePct ?? 10,
      );
      out.push(r);
      const left = BigInt(p.amount) - r.tokens;
      if (left <= 0n || pct >= 100) delete positions[key];
      else
        positions[key] = {
          ...p,
          amount: left.toString(),
          costUsdc: p.costUsdc * (Number(left) / Number(p.amount)),
        };
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
      const price = m
        ? await market.priceOf(m).catch(() => p.lastPrice ?? null)
        : (p.lastPrice ?? null);
      const whole = Number(p.amount) / 10 ** p.decimals;
      const value = price !== null ? price * whole : null;
      return {
        token: p.token,
        symbol: p.symbol,
        amount: whole,
        costUsdc: p.costUsdc,
        price,
        valueUsdc: value,
        pnlPct:
          value !== null && p.costUsdc > 0
            ? (value / p.costUsdc - 1) * 100
            : null,
        /** False for a token that isn't on Argus (e.g. left from FOCI): the owner can only withdraw it. */
        tradable: Boolean(m),
        bonded: m?.bonded ?? false,
        openedAt: p.openedAt,
      };
    }),
  );
}

export const ruleSummary = (r: TradeRule) => RULE_LABEL[r.kind];
