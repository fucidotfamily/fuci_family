import { createPublicClient, decodeFunctionResult, encodeFunctionData, http, parseAbi, type Hex, type PublicClient } from "viem";

/**
 * Every Argus token that graduated (bonded to its full pool), read from the chain.
 * Argus launches tens of thousands of tokens; only ~1 in 40 graduate. Each launch has its own hook contract,
 * which emits one graduation event when it bonds. We scan for that event (no address filter), then keep
 * only emitters that are real Argus hooks: hook.portal() must be an Argus Portal. hook.token() is the token.
 * Kept in Redis; each cron tick reads new blocks and walks further back until the first Portal's start.
 */

const PORTALS = [
  "0xeed7559b8a6abf64427dc41cb5cc6400109c5d93",
  "0xb021be536808f551b31789422fd28a6c9c6e97da",
  "0xa5628a11c412596e1f63b75a2c0284f843c549d6",
  "0x07a688a001f416cc433c68ff56aa26bc5131cc6e",
  "0xa36c443a797771df82533b8b4a86f0affd970862",
  "0x7a17ab0106c46c0be30623f3eb7f299cc0058338",
];
const FIRST_BLOCK = 19674154n;
/** Emitted once by an Argus hook when its token graduates (topic 1 is the pool id). */
const GRADUATED = "0x8814d8f4c97a690057e2c84624feae7f39849be91a28e77744ab81c0bc910031";
const WINDOW = 5_000n;
const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11";

const MC = parseAbi([
  "struct Call3 { address target; bool allowFailure; bytes callData; }",
  "struct Result { bool success; bytes returnData; }",
  "function aggregate3(Call3[] calls) payable returns (Result[] returnData)",
]);
const HOOK = parseAbi(["function token() view returns (address)", "function portal() view returns (address)"]);

export type Registry = {
  /** Highest and lowest block already scanned. */
  hi: number;
  lo: number;
  /** Verified Argus hooks → their graduated token (lowercase). */
  graduated: Record<string, string>;
  /** Emitters seen but not verified yet. */
  pending: string[];
  at: number;
};

export const emptyRegistry = (): Registry => ({ hi: 0, lo: 0, graduated: {}, pending: [], at: 0 });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Retries a call the public RPC rate-limited, backing off. */
async function retry<T>(fn: () => Promise<T>, tries = 4): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i >= tries - 1 || !/rate limit|429|exceeds defined limit|timeout|fetch failed/i.test(String((e as Error).message))) throw e;
      await sleep(700 * 2 ** i);
    }
  }
}

/** Contracts that emitted the graduation event in [from, to]. */
async function graduationEmitters(c: PublicClient, from: bigint, to: bigint): Promise<string[]> {
  const logs = (await retry(() =>
    c.request({ method: "eth_getLogs", params: [{ topics: [GRADUATED], fromBlock: `0x${from.toString(16)}`, toBlock: `0x${to.toString(16)}` }] } as never),
  )) as { address: string }[];
  return logs.map((l) => l.address.toLowerCase());
}

/** token() and portal() of each hook in one request (Multicall3); only real Argus hooks come back. */
async function verifyHooks(c: PublicClient, hooks: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (let i = 0; i < hooks.length; i += 200) {
    const part = hooks.slice(i, i + 200);
    const calls = part.flatMap((h) => [
      { target: h as Hex, allowFailure: true, callData: encodeFunctionData({ abi: HOOK, functionName: "token" }) },
      { target: h as Hex, allowFailure: true, callData: encodeFunctionData({ abi: HOOK, functionName: "portal" }) },
    ]);
    const r = await retry(() => c.call({ to: MULTICALL3, data: encodeFunctionData({ abi: MC, functionName: "aggregate3", args: [calls] }) }));
    const res = decodeFunctionResult({ abi: MC, functionName: "aggregate3", data: r.data! }) as { success: boolean; returnData: Hex }[];
    part.forEach((h, k) => {
      const [t, p] = [res[2 * k], res[2 * k + 1]];
      if (!t.success || !p.success || t.returnData.length < 66 || p.returnData.length < 66) return;
      const token = `0x${t.returnData.slice(26, 66)}`.toLowerCase();
      const portal = `0x${p.returnData.slice(26, 66)}`.toLowerCase();
      if (PORTALS.includes(portal) && !/^0x0+$/.test(token)) out[h] = token;
    });
  }
  return out;
}

/** Moves the registry forward: new blocks, then older history, then verifies new emitters. Stops at the budget. */
export async function advance(c: PublicClient, reg: Registry, budgetMs: number): Promise<Registry> {
  const started = Date.now();
  const left = () => budgetMs - (Date.now() - started);
  const head = await retry(() => c.getBlockNumber());
  const seen = new Set([...Object.keys(reg.graduated), ...reg.pending]);
  const add = (xs: string[]) => xs.forEach((a) => !seen.has(a) && (seen.add(a), reg.pending.push(a)));
  if (!reg.hi) reg.hi = reg.lo = Number(head);
  // One window at a time (the public RPC rate-limits bursts). A failed window ends this tick's scan;
  // progress is kept and the next tick carries on.
  try {
    while (BigInt(reg.hi) < head && left() > budgetMs * 0.3) {
      const f = BigInt(reg.hi) + 1n;
      const t = f + WINDOW - 1n > head ? head : f + WINDOW - 1n;
      add(await graduationEmitters(c, f, t));
      reg.hi = Number(t);
    }
    while (BigInt(reg.lo) > FIRST_BLOCK && left() > budgetMs * 0.3) {
      const t = BigInt(reg.lo) - 1n;
      const f = t - WINDOW + 1n < FIRST_BLOCK ? FIRST_BLOCK : t - WINDOW + 1n;
      add(await graduationEmitters(c, f, t));
      reg.lo = Number(f);
    }
  } catch {
    // rate-limited or down: keep what we have
  }
  if (reg.pending.length) {
    const ok = await verifyHooks(c, reg.pending).catch(() => null);
    if (ok) {
      Object.assign(reg.graduated, ok);
      reg.pending = []; // anything not verified is not an Argus hook
    }
  }
  reg.at = Date.now();
  return reg;
}

export const registryDone = (reg: Registry) => reg.hi > 0 && BigInt(reg.lo) <= FIRST_BLOCK;

const KEY = "argus:graduated:v1";

/** Called from the cron: load, advance within the budget, save. */
export async function advanceRegistry(budgetMs = 15_000) {
  const { kvGet, kvSet } = await import("./store");
  const { ARC_RPC_URL } = await import("./config");
  const c = createPublicClient({ transport: http(ARC_RPC_URL, { retryCount: 1 }) }) as PublicClient;
  // First run: start from the verified snapshot built from the full history (lib/argusGraduatedSeed.json),
  // so only new graduations need scanning.
  const reg = (await kvGet<Registry>(KEY).catch(() => null)) ?? ((await import("./argusGraduatedSeed.json")).default as Registry);
  const next = await advance(c, structuredClone(reg), budgetMs);
  await kvSet(KEY, next).catch(() => undefined);
  return { graduated: Object.keys(next.graduated).length, done: registryDone(next) };
}

/** Graduated Argus tokens found so far (lowercase addresses). */
export async function graduatedTokens(): Promise<string[]> {
  const { kvGet } = await import("./store");
  const reg = (await kvGet<Registry>(KEY).catch(() => null)) ?? ((await import("./argusGraduatedSeed.json")).default as Registry);
  return [...new Set(Object.values(reg.graduated))];
}
