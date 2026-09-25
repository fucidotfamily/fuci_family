import { Redis } from "@upstash/redis";
import { slugOf } from "./slug";

export { slugOf } from "./slug";

/**
 * Tide stats, leaderboard, spawned agents, rate limits and the playground budget.
 * Everything here is recorded from real activity. Upstash Redis (Vercel
 * Marketplace) keeps it across deploys and serverless instances; without it an
 * empty per-instance memory store is used and spawning is disabled.
 */

export type Strategy = "scout" | "watcher" | "oracle" | "custom";

export type AgentCard = {
  id: string;
  name: string;
  strategy: Strategy;
  /** The owner's own instructions ("custom" agents; optional for the others). */
  mission?: string;
  /** Public profile for its ERC-8004 registration file (description, links, skills). */
  profile?: import("./agentProfile").AgentProfile;
  owner: string; // holdfast wallet address (verified)
  ownerKind: "browser" | "passkey";
  dailyLimitUsdc: number;
  createdAt: number;
  calls: number;
  spentUsdc: number;
  /** ERC-8004 agentId once the owner registered the frond on Arc. */
  erc8004Id?: number;
  /** Set when it was created on-chain through the Fuci factory (1 USDC). */
  createdVia?: "factory";
  /** Verified X account, from X's OAuth login (no tokens are kept). */
  x?: { id: string; username: string; name: string; avatar: string | null; verified: boolean; connectedAt: number };
  /** Set (to the upload time) when the owner uploaded a profile image. */
  image?: number;
  /** The agent's own wallet (key held encrypted by the server, see lib/agentWallets.ts). */
  wallet?: string;
  /** Automatic runs, paid from the agent's own wallet. */
  automation?: Automation;
  /** Autopilot trading on Argus from the agent's own wallet (see lib/trading.ts). */
  trading?: Trading;
  /** Filled by /api/stats from the ERC-8004 Reputation Registry. */
  reputation?: { count: number; score: number | null } | null;
};

export type Automation = {
  enabled: boolean;
  everyMinutes: number;
  strategy: Strategy;
  prompt: string;
  nextRunAt: number;
  lastRunAt?: number;
  failures: number;
  pausedReason?: string;
};

export type { Trading, TradeRule } from "./tradingRules";
import type { Trading } from "./tradingRules";

export const AUTOMATION_INTERVALS = [5, 15, 30, 60, 180, 360, 720, 1440] as const;

export type TideEvent = {
  at: number;
  kind: "payment" | "agent_run" | "spawn";
  agent: string;
  tool?: string;
  usdc: number;
  tx?: string;
};

export type Stats = {
  calls: number;
  usdcSettled: number;
  agents: number;
  launchesScanned: number;
  recent: TideEvent[];
  top: AgentCard[];
  persistent: boolean;
};

const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const redis = url && token ? new Redis({ url, token }) : null;
export const PERSISTENT = Boolean(redis);

const K = {
  calls: "fuci:v2:calls",
  usdc: "fuci:v2:usdc_micro", // integer micro-USDC to avoid float drift
  launches: "fuci:v2:launches_scanned",
  events: "fuci:v2:events",
  agents: "fuci:v2:agents", // hash id -> AgentCard JSON
  owners: "fuci:v2:owners", // hash owner address (lowercase) -> agent id: one wallet, one agent
  history: (id: string) => `fuci:v2:history:${id}`, // list of HistoryEvent JSON, newest first
  aliases: "fuci:v2:aliases", // hash old agent id -> current id (old share links keep working)
  budget: (day: string) => `fuci:v2:budget:${day}`,
  rate: (key: string, bucket: number) => `fuci:v2:rate:${key}:${bucket}`,
  kv: (key: string) => `fuci:v2:kv:${key}`,
  auto: "fuci:v2:auto", // sorted set: agent id -> next run (ms)
  spend: (id: string, day: string) => `fuci:v2:spend:${id}:${day}`,
  tradeSpend: (id: string, day: string) => `fuci:v2:trade-spend:${id}:${day}`,
  tradeFees: "fuci:v2:trade-fees", // integer micro-USDC, all time
  trading: "fuci:v2:trading", // set of agent ids with trading on
  list: (key: string) => `fuci:v2:list:${key}`,
};

type Mem = { calls: number; usdcMicro: number; launches: number; events: TideEvent[]; agents: Map<string, AgentCard>; kv: Map<string, number>; json: Map<string, unknown>; lists: Map<string, string[]> };
const g = globalThis as unknown as { __fuciMem?: Mem };
const mem: Mem = g.__fuciMem ?? (g.__fuciMem = { calls: 0, usdcMicro: 0, launches: 0, events: [], agents: new Map(), kv: new Map(), json: new Map(), lists: new Map() });
mem.json ??= new Map();
mem.lists ??= new Map();

const parse = <T>(v: T | string) => (typeof v === "string" ? (JSON.parse(v) as T) : v);
/** Skips name reservations that have not been filled yet. */
const isAgent = (a: AgentCard) => Boolean(a && a.owner && !(a as { reserved?: boolean }).reserved);

// ---------------------------------------------------------------------------

export async function recordEvent(e: Omit<TideEvent, "at">) {
  const ev: TideEvent = { ...e, at: Date.now() };
  const isPayment = e.kind === "payment";
  const micro = Math.round(e.usdc * 1e6);
  if (redis) {
    const p = redis.pipeline();
    if (isPayment) {
      p.incr(K.calls);
      p.incrby(K.usdc, micro);
    }
    p.lpush(K.events, JSON.stringify(ev));
    p.ltrim(K.events, 0, 49);
    await p.exec();
  } else {
    if (isPayment) {
      mem.calls += 1;
      mem.usdcMicro += micro;
    }
    mem.events.unshift(ev);
    mem.events.length = Math.min(mem.events.length, 50);
  }
  if (isPayment && e.agent) await bumpAgent(e.agent, e.usdc);
}

export async function recordLaunchesScanned(n: number) {
  if (!n) return;
  if (redis) await redis.incrby(K.launches, n);
  else mem.launches += n;
}

async function bumpAgent(id: string, usdc: number) {
  const a = await getAgent(id);
  if (!a) return;
  a.calls += 1;
  a.spentUsdc = Math.round((a.spentUsdc + usdc) * 1e6) / 1e6;
  await saveAgent(a);
}

export async function saveAgent(a: AgentCard) {
  if (redis) await redis.hset(K.agents, { [a.id]: JSON.stringify(a) });
  else mem.agents.set(a.id, a);
}

export async function deleteAgent(id: string) {
  if (redis) await redis.hdel(K.agents, id);
  else mem.agents.delete(id);
}

export async function getAgent(id: string): Promise<AgentCard | null> {
  if (redis) {
    const raw = await redis.hget<AgentCard | string>(K.agents, id);
    const a = raw ? parse(raw) : null;
    return a && (a as { reserved?: boolean }).reserved ? null : a;
  }
  return mem.agents.get(id) ?? null;
}

/** The agent owned by `owner` (one wallet, one agent), or null. */
export async function agentOf(owner: string): Promise<AgentCard | null> {
  const key = owner.toLowerCase();
  if (redis) {
    let id = await redis.hget<string>(K.owners, key);
    if (!id) {
      // Backfill for fronds spawned before the owner index existed: the oldest one wins.
      const all = ((await redis.hvals(K.agents)) as (AgentCard | string)[]).map(parse).filter(isAgent);
      const mine = all.filter((a) => a.owner.toLowerCase() === key).sort((a, b) => a.createdAt - b.createdAt)[0];
      if (!mine) return null;
      await redis.hsetnx(K.owners, key, mine.id);
      id = (await redis.hget<string>(K.owners, key)) ?? mine.id;
    }
    return getAgent(String(id));
  }
  return [...mem.agents.values()].filter((a) => a.owner.toLowerCase() === key).sort((a, b) => a.createdAt - b.createdAt)[0] ?? null;
}

// ---------------------------------------------------------------------------
// Agent URLs: fuci.family/agent/<name>. Names are unique, first come first served.

/** Atomically claim a name for a new agent. False when another agent has it. */
export async function claimName(id: string) {
  if (redis) return (await redis.hsetnx(K.agents, id, JSON.stringify({ id, reserved: true }))) === 1;
  return !mem.agents.has(id);
}

/**
 * Look up an agent by URL id. Old ids (name + random suffix) move to the clean
 * name when it is free and the agent has no ERC-8004 identity yet (whose card URL
 * is on-chain); the old id then redirects.
 */
export async function resolveAgent(id: string): Promise<{ agent: AgentCard | null; redirect?: string }> {
  const target = redis ? await redis.hget<string>(K.aliases, id) : null;
  if (target) return { agent: await getAgent(String(target)), redirect: String(target) };
  const a = await getAgent(id);
  if (!a || !redis) return { agent: a };
  const slug = slugOf(a.name, a.owner);
  if (!/-[0-9a-f]{6}$/.test(a.id) || a.erc8004Id !== undefined || !slug || slug === a.id) return { agent: a };
  if (!(await claimName(slug))) return { agent: a };
  const moved: AgentCard = { ...a, id: slug };
  await saveAgent(moved);
  const p = redis.pipeline();
  p.hset(K.aliases, { [a.id]: slug });
  p.hset(K.owners, { [a.owner.toLowerCase()]: slug });
  p.hdel(K.agents, a.id);
  await p.exec();
  // Keep its history (RENAME fails harmlessly when there is none yet).
  await redis.rename(K.history(a.id), K.history(slug)).catch(() => undefined);
  return { agent: moved, redirect: slug };
}

/** Atomically reserve `owner` for agent `id`. False when the wallet already has an agent. */
export async function claimOwner(owner: string, id: string) {
  if (redis) return (await redis.hsetnx(K.owners, owner.toLowerCase(), id)) === 1;
  return !(await agentOf(owner));
}

export async function getStats(): Promise<Stats> {
  if (redis) {
    const [calls, usdc, launches, events, agents] = await Promise.all([
      redis.get<number>(K.calls),
      redis.get<number>(K.usdc),
      redis.get<number>(K.launches),
      redis.lrange<TideEvent | string>(K.events, 0, 29),
      redis.hvals(K.agents) as Promise<(AgentCard | string)[]>,
    ]);
    const all = (agents ?? []).map(parse).filter(isAgent);
    return {
      calls: Number(calls ?? 0),
      usdcSettled: Number(usdc ?? 0) / 1e6,
      agents: all.length,
      launchesScanned: Number(launches ?? 0),
      recent: (events ?? []).map(parse),
      top: rank(all),
      persistent: true,
    };
  }
  const all = [...mem.agents.values()];
  return {
    calls: mem.calls,
    usdcSettled: mem.usdcMicro / 1e6,
    agents: all.length,
    launchesScanned: mem.launches,
    recent: mem.events.slice(0, 30),
    top: rank(all),
    persistent: false,
  };
}

const rank = (list: AgentCard[]) => [...list].sort((a, b) => b.spentUsdc - a.spentUsdc || b.calls - a.calls).slice(0, 8);

// ---------------------------------------------------------------------------
// Rate limits + the sponsored playground budget (shared across instances via Redis)

async function incrWithTtl(key: string, by: number, ttlSec: number) {
  if (redis) {
    const p = redis.pipeline();
    p.incrby(key, by);
    p.expire(key, ttlSec);
    const [v] = (await p.exec()) as [number, unknown];
    return Number(v);
  }
  const v = (mem.kv.get(key) ?? 0) + by;
  mem.kv.set(key, v);
  return v;
}

/** Fixed-window limiter: true when this hit is within `max` per `windowSec`. */
export async function allow(key: string, max: number, windowSec: number) {
  const bucket = Math.floor(Date.now() / 1000 / windowSec);
  return (await incrWithTtl(K.rate(key, bucket), 1, windowSec + 5)) <= max;
}

const today = () => new Date().toISOString().slice(0, 10);

/** Reserve `usdc` of today's sponsored budget. Returns false when it would exceed `cap`. */
export async function reserveBudget(usdc: number, cap: number) {
  const micro = Math.round(usdc * 1e6);
  const after = await incrWithTtl(K.budget(today()), micro, 60 * 60 * 26);
  if (after > Math.round(cap * 1e6)) {
    await incrWithTtl(K.budget(today()), -micro, 60 * 60 * 26);
    return false;
  }
  return true;
}

/** Give back the unspent part of a reservation. */
export async function refundBudget(usdc: number) {
  const micro = Math.round(usdc * 1e6);
  if (micro > 0) await incrWithTtl(K.budget(today()), -micro, 60 * 60 * 26);
}

export async function budgetUsed() {
  const key = K.budget(today());
  const v = redis ? await redis.get<number>(key) : mem.kv.get(key);
  return Number(v ?? 0) / 1e6;
}

// ---------------------------------------------------------------------------
// Small JSON records (house agentId, stored runs, job deliverables) and id lists.

export async function kvGet<T>(key: string): Promise<T | null> {
  if (redis) {
    // Upstash already decodes JSON; a value that is itself a string comes back as that string.
    const v = await redis.get<T | string>(K.kv(key));
    if (v === null || v === undefined) return null;
    if (typeof v !== "string") return v as T;
    try {
      return JSON.parse(v) as T;
    } catch {
      return v as T;
    }
  }
  return (mem.json.get(key) as T) ?? null;
}

export async function kvSet(key: string, value: unknown, ttlSec?: number) {
  if (redis) await redis.set(K.kv(key), JSON.stringify(value), ttlSec ? { ex: ttlSec } : undefined);
  else mem.json.set(key, value);
}

/** Newest-first list of ids, capped at `max`. */
export async function listPush(key: string, id: string, max = 200) {
  if (redis) {
    const p = redis.pipeline();
    p.lrem(K.list(key), 0, id);
    p.lpush(K.list(key), id);
    p.ltrim(K.list(key), 0, max - 1);
    await p.exec();
  } else {
    const l = (mem.lists.get(key) ?? []).filter((x) => x !== id);
    l.unshift(id);
    mem.lists.set(key, l.slice(0, max));
  }
}

/**
 * Newest-first list of JSON records. Upstash already decodes JSON elements into objects, so they are
 * returned as they come; plain strings are parsed, and anything unreadable is skipped.
 */
export async function listRangeJson<T>(key: string, n = 50): Promise<T[]> {
  const raw: unknown[] = redis ? ((await redis.lrange<unknown>(K.list(key), 0, n - 1)) ?? []) : (mem.lists.get(key) ?? []).slice(0, n);
  return raw.flatMap((r) => {
    if (r && typeof r === "object") return [r as T];
    if (typeof r !== "string") return [];
    try {
      return [JSON.parse(r) as T];
    } catch {
      return [];
    }
  });
}

export async function listRange(key: string, n = 50): Promise<string[]> {
  if (redis) return ((await redis.lrange<string | number>(K.list(key), 0, n - 1)) ?? []).map(String);
  return (mem.lists.get(key) ?? []).slice(0, n);
}

// ---------------------------------------------------------------------------
// Per-agent history: what the agent did, with on-chain links where there is a tx.

export type HistoryEvent = {
  at: number;
  kind: "spawn" | "run" | "payment" | "identity" | "validation" | "profile" | "trade";
  label: string;
  usdc?: number;
  /** Explorer link for the on-chain transaction, when there is one. */
  href?: string;
};

export async function pushHistory(agentId: string, e: Omit<HistoryEvent, "at"> & { at?: number }) {
  const ev: HistoryEvent = { at: Date.now(), ...e };
  if (redis) {
    const p = redis.pipeline();
    p.lpush(K.history(agentId), JSON.stringify(ev));
    p.ltrim(K.history(agentId), 0, 199);
    await p.exec();
  } else {
    const l = mem.lists.get(`history:${agentId}`) ?? [];
    l.unshift(JSON.stringify(ev));
    mem.lists.set(`history:${agentId}`, l.slice(0, 200));
  }
}

export async function getHistory(agentId: string, n = 100): Promise<HistoryEvent[]> {
  const raw = redis ? await redis.lrange<HistoryEvent | string>(K.history(agentId), 0, n - 1) : (mem.lists.get(`history:${agentId}`) ?? []).slice(0, n);
  return (raw ?? []).map((r) => parse<HistoryEvent>(r));
}

// ---------------------------------------------------------------------------
// Automation: which agents are due, and what each spent today (micro-USDC).

export async function scheduleAgent(agentId: string, at: number) {
  if (redis) await redis.zadd(K.auto, { score: at, member: agentId });
  else mem.json.set(`auto:${agentId}`, at);
}

export async function unscheduleAgent(agentId: string) {
  if (redis) await redis.zrem(K.auto, agentId);
  else mem.json.delete(`auto:${agentId}`);
}

export async function dueAgents(now: number, limit: number): Promise<string[]> {
  if (redis) return ((await redis.zrange(K.auto, 0, now, { byScore: true, offset: 0, count: limit })) as unknown[]).map(String);
  return [...mem.json.entries()]
    .filter(([k, v]) => k.startsWith("auto:") && Number(v) <= now)
    .sort((a, b) => Number(a[1]) - Number(b[1]))
    .slice(0, limit)
    .map(([k]) => k.slice(5));
}

export async function spentToday(agentId: string) {
  const key = K.spend(agentId, today());
  const v = redis ? await redis.get<number>(key) : mem.kv.get(key);
  return Number(v ?? 0) / 1e6;
}

export async function addSpend(agentId: string, usdc: number) {
  const micro = Math.round(usdc * 1e6);
  if (micro > 0) await incrWithTtl(K.spend(agentId, today()), micro, 60 * 60 * 26);
}

// ---------------------------------------------------------------------------
// Trading: which agents trade, what each bought today, and Fuci's trade fees (micro-USDC).

export async function setTradingActive(agentId: string, on: boolean) {
  if (redis) await (on ? redis.sadd(K.trading, agentId) : redis.srem(K.trading, agentId));
  else if (on) mem.json.set(`trading:${agentId}`, 1);
  else mem.json.delete(`trading:${agentId}`);
}

export async function tradingAgents(): Promise<string[]> {
  if (redis) return ((await redis.smembers(K.trading)) as unknown[]).map(String);
  return [...mem.json.keys()].filter((k) => k.startsWith("trading:")).map((k) => k.slice(8));
}

export async function tradeSpentToday(agentId: string) {
  const key = K.tradeSpend(agentId, today());
  const v = redis ? await redis.get<number>(key) : mem.kv.get(key);
  return Number(v ?? 0) / 1e6;
}

export async function addTradeSpend(agentId: string, usdc: number) {
  const micro = Math.round(usdc * 1e6);
  if (micro > 0) await incrWithTtl(K.tradeSpend(agentId, today()), micro, 60 * 60 * 26);
}

export async function addTradeFee(usdc: number) {
  const micro = Math.round(usdc * 1e6);
  if (micro <= 0) return;
  if (redis) await redis.incrby(K.tradeFees, micro);
  else mem.kv.set(K.tradeFees, (mem.kv.get(K.tradeFees) ?? 0) + micro);
}

export async function tradeFeesTotal() {
  const v = redis ? await redis.get<number>(K.tradeFees) : mem.kv.get(K.tradeFees);
  return Number(v ?? 0) / 1e6;
}

/** A short-lived lock so overlapping ticks never trade twice. False when someone else holds it. */
export async function acquireLock(key: string, ttlSec: number) {
  const k = K.kv(`lock:${key}`);
  if (redis) return (await redis.set(k, Date.now(), { nx: true, ex: ttlSec })) === "OK";
  const until = Number(mem.json.get(k) ?? 0);
  if (until > Date.now()) return false;
  mem.json.set(k, Date.now() + ttlSec * 1000);
  return true;
}

export async function releaseLock(key: string) {
  const k = K.kv(`lock:${key}`);
  if (redis) await redis.del(k);
  else mem.json.delete(k);
}

/** Set `key` only if it is not set yet. True when this call wrote it. */
export async function kvSetNx(key: string, value: unknown) {
  if (redis) return (await redis.set(K.kv(key), JSON.stringify(value), { nx: true })) === "OK";
  if (mem.json.has(key)) return false;
  mem.json.set(key, value);
  return true;
}

/** Add `by` to an integer counter (no expiry) and return the new value. */
export async function kvIncr(key: string, by = 1) {
  if (redis) return Number(await redis.incrby(K.kv(key), by));
  const v = Number(mem.json.get(key) ?? 0) + by;
  mem.json.set(key, v);
  return v;
}
