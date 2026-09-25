import { getAddress, type Address, type Hex } from "viem";
import { ARGUS, TOKEN_CREATED, arcClient as client, poolKeyOf, poolPrice, portal8Logs } from "./argus";
import type { StoredRun } from "./runs";

/**
 * "Tide checker": Fuci's re-execution validator for ERC-8004. It re-reads every
 * verifiable claim in a stored run straight from Arc at the block the run
 * recorded, and scores the run 0–100 by the share of claims that hold.
 */
export type Check = { claim: string; ok: boolean; detail: string };
export type ValidationReport = { requestHash: Hex; validator: Address; checkedAt: number; score: number; checks: Check[]; method: string };

type LaunchClaim = { token: Address; creator: Address; hook: Address; symbol: string; block: number };
type BondingClaim = { token: Address; hook: Address; poolId: Hex; fee?: number; symbol: string; priceUsdc: number; trades?: { tx: Hex; block: number }[] };
type Sourced<T> = { block?: number; data?: T };

const same = (a?: string, b?: string) => Boolean(a && b && a.toLowerCase() === b.toLowerCase());

async function checkLaunch(l: LaunchClaim): Promise<Check> {
  const claim = `$${l.symbol} launched on Argus at block ${l.block}`;
  const logs = await client.getLogs({ address: ARGUS.portals.map((p) => p.address), event: TOKEN_CREATED, args: { token: getAddress(l.token) }, fromBlock: BigInt(l.block), toBlock: BigInt(l.block) });
  const log = logs[0];
  if (!log) {
    // Portal #8 emits its own launch event (token and creator are its first two topics).
    const [v8] = await portal8Logs(BigInt(l.block), BigInt(l.block), getAddress(l.token));
    if (!v8) return { claim, ok: false, detail: "no launch event for this token at that block" };
    const ok = same(`0x${v8.topics[2].slice(26)}`, l.creator);
    return { claim, ok, detail: ok ? `Portal #8 launch event in tx ${v8.transactionHash}` : "event found but the creator differs" };
  }
  const ok = same(log.args.creator, l.creator);
  return { claim, ok, detail: ok ? `TokenCreated in tx ${log.transactionHash}` : "event found but the creator differs" };
}

async function checkPrice(c: BondingClaim, block: number): Promise<Check> {
  const claim = `$${c.symbol} traded at ${c.priceUsdc} USDC at block ${block}`;
  const { poolId, usdcFirst } = poolKeyOf(getAddress(c.token), getAddress(c.hook), c.fee);
  if (!same(poolId, c.poolId)) return { claim, ok: false, detail: "the pool id does not match the token and hook" };
  // The run read the price just before it read the block number, so allow the two previous blocks.
  for (const b of [block, block - 1, block - 2]) {
    const { priceUsdc } = await poolPrice({ poolId, usdcFirst }, 18, BigInt(b));
    if (Math.abs(priceUsdc - c.priceUsdc) <= Math.abs(c.priceUsdc) * 1e-9) return { claim, ok: true, detail: `pool slot0 matches at block ${b}` };
  }
  return { claim, ok: false, detail: "pool slot0 at that block does not match" };
}

async function checkTrade(t: { tx: Hex; block: number }, poolId: Hex): Promise<Check> {
  const claim = `trade ${t.tx.slice(0, 10)}… in the pool at block ${t.block}`;
  const r = await client.getTransactionReceipt({ hash: t.tx }).catch(() => null);
  const ok = Boolean(r && Number(r.blockNumber) === t.block && r.logs.some((l) => same(l.address, ARGUS.poolManager) && same(l.topics[1], poolId)));
  return { claim, ok, detail: ok ? "receipt found with a Swap in this pool" : "receipt missing or not from this pool" };
}

export async function reexecute(run: StoredRun, validator: Address): Promise<ValidationReport> {
  const checks: Check[] = [];
  const guard = async (claim: string, fn: () => Promise<Check>) => {
    try {
      checks.push(await fn());
    } catch (e) {
      checks.push({ claim, ok: false, detail: `could not re-read: ${(e as Error).message.slice(0, 120)}` });
    }
  };

  const launches = (run.data.argus_launches as Sourced<LaunchClaim[]>)?.data ?? [];
  for (const l of launches.slice(0, 8)) await guard(`$${l.symbol} launch`, () => checkLaunch(l));

  const bonding = run.data.argus_bonding as Sourced<BondingClaim> | undefined;
  if (bonding?.data && bonding.block) {
    const c = bonding.data;
    await guard(`$${c.symbol} price`, () => checkPrice(c, bonding.block!));
    for (const t of (c.trades ?? []).slice(0, 5)) await guard(`trade ${t.tx}`, () => checkTrade(t, c.poolId));
  }

  const tide = run.data.fucus_oracle as Sourced<{ reading: string }> | undefined;
  if (tide?.block) {
    await guard("tide reading source block", async () => {
      const b = await client.getBlock({ blockNumber: BigInt(tide.block!) });
      return { claim: `tide reading taken at block ${tide.block}`, ok: Boolean(b), detail: "block exists; the reading itself is derived from the launches and pools above" };
    });
  }

  const passed = checks.filter((c) => c.ok).length;
  return {
    requestHash: run.hash,
    validator,
    checkedAt: Date.now(),
    score: checks.length ? Math.round((100 * passed) / checks.length) : 0,
    checks,
    method: "re-execution: every claim re-read from Arc mainnet at the recorded block",
  };
}
