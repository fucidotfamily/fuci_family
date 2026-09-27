import { createPublicClient, getAddress, http, parseAbi, parseAbiItem, toFunctionSelector, type Address, type Hex } from "viem";
import { arc } from "viem/chains";
import { ARGUS, arcClient as client, HOOK, launchOf } from "../argus";
import { EXPLORER_URL } from "../config";
import { kvGet, kvSet } from "../store";
import { band, clamp100, DAY, finish, pct, usd, type Factor, type Grade, type RiskReport } from "./score";

/**
 * Risk report for an ERC-20 token on Arc, read from the chain (contract code, owner, proxy slots,
 * Transfer history, Argus launch terms) and DexScreener (liquidity, volume, pair age). A check that
 * can't be read is reported as unknown, never assumed safe.
 */

const ERC20 = parseAbi([
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
]);
const OWNER = parseAbi(["function owner() view returns (address)", "function getOwner() view returns (address)"]);
const TRANSFER = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");

const ZERO = "0x0000000000000000000000000000000000000000";
const DEAD = "0x000000000000000000000000000000000000dead";
/** EIP-1967 implementation and admin slots. */
const IMPL_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
const ADMIN_SLOT = "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103";
/** Known Arc addresses that hold tokens on behalf of others (not a single owner's wallet). */
const KNOWN: Record<string, string> = {
  [ARGUS.poolManager.toLowerCase()]: "Uniswap v4 pools",
  "0xfee1d11d4501d66d8ea1024dc198ee5663c2bf6b": "Argus token lock",
};

/** Privileged functions whose presence in the bytecode we report (matched by 4-byte selector). */
const POWERS: { group: "mint" | "freeze" | "fees"; sigs: string[] }[] = [
  { group: "mint", sigs: ["mint(address,uint256)", "mint(uint256)", "mintTo(address,uint256)"] },
  {
    group: "freeze",
    sigs: ["pause()", "blacklist(address)", "addToBlacklist(address)", "setBlacklist(address,bool)", "blacklistAddress(address,bool)", "setBots(address[],bool)", "addBot(address)", "freeze(address)"],
  },
  { group: "fees", sigs: ["setFee(uint256)", "setFees(uint256,uint256)", "setTaxFee(uint256)", "setTaxes(uint256,uint256)", "setBuyFee(uint256)", "setSellFee(uint256)", "setMaxTxAmount(uint256)", "setMaxWalletSize(uint256)"] },
];

/** Blocks in 14 days at Arc's ~0.5 s block time: the most history we replay for holder balances (keeps a busy token under the time limit). */
const MAX_SCAN_BLOCKS = 2_400_000n;
const LOG_WINDOW = 5_000n;

type Dex = { liquidityUsd: number; fdv: number | null; volume24h: number; txns24h: number; buys24h: number; sells24h: number; createdAt: number | null; pairs: number; url: string | null };

async function dexOf(token: Address): Promise<Dex | null> {
  const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${token}`, { cache: "no-store", signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`DexScreener answered ${res.status}`);
  const j = (await res.json()) as { pairs?: { chainId: string; url: string; liquidity?: { usd?: number }; fdv?: number; volume?: { h24?: number }; txns?: { h24?: { buys: number; sells: number } }; pairCreatedAt?: number }[] | null };
  const pairs = (j.pairs ?? []).filter((p) => p.chainId === "arc");
  if (!pairs.length) return null;
  const top = pairs.reduce((a, b) => ((b.liquidity?.usd ?? 0) > (a.liquidity?.usd ?? 0) ? b : a));
  const buys = pairs.reduce((s, p) => s + (p.txns?.h24?.buys ?? 0), 0);
  const sells = pairs.reduce((s, p) => s + (p.txns?.h24?.sells ?? 0), 0);
  const created = pairs.map((p) => p.pairCreatedAt).filter((x): x is number => typeof x === "number");
  return {
    liquidityUsd: pairs.reduce((s, p) => s + (p.liquidity?.usd ?? 0), 0),
    fdv: top.fdv ?? null,
    volume24h: pairs.reduce((s, p) => s + (p.volume?.h24 ?? 0), 0),
    txns24h: buys + sells,
    buys24h: buys,
    sells24h: sells,
    createdAt: created.length ? Math.min(...created) : null,
    pairs: pairs.length,
    url: top.url ?? null,
  };
}

/** First block where `token` has code (binary search), or null if it already existed `MAX_SCAN_BLOCKS` ago. */
async function creationBlock(token: Address, head: bigint): Promise<bigint | null> {
  const floor = head > MAX_SCAN_BLOCKS ? head - MAX_SCAN_BLOCKS : 0n;
  const has = async (b: bigint) => ((await client.getCode({ address: token, blockNumber: b }).catch(() => undefined)) ?? "0x") !== "0x";
  if (floor > 0n && (await has(floor))) return null;
  let lo = floor;
  let hi = head;
  while (hi - lo > 1n) {
    const mid = (lo + hi) / 2n;
    if (await has(mid)) hi = mid;
    else lo = mid;
  }
  return hi;
}

/**
 * Transfer-log readers for the holder replay. Requests rotate across every Arc RPC (a private
 * ARC_RPC_URL / ARGUS_RPC_URL first) instead of queueing on one: the main public endpoint rate-limits
 * bursts, so QuickNode's public endpoint shares the load. (Blockdaemon's public endpoint is pruned: no old logs.)
 */
const LOG_RPCS = [
  ...new Set(
    [process.env.ARC_RPC_URL, process.env.ARGUS_RPC_URL, "https://rpc.mainnet.arc.io", "https://rpc.quicknode.mainnet.arc.io"].filter(
      (u): u is string => Boolean(u),
    ),
  ),
];
const LOG_CLIENTS = LOG_RPCS.map((u) => createPublicClient({ chain: arc, transport: http(u, { timeout: 10_000, retryCount: 0 }) }));
let turn = 0;
const nextClient = () => LOG_CLIENTS[turn++ % LOG_CLIENTS.length];
/**
 * Errors that mean "slow down or ask another RPC". Arc's endpoints answer a burst of parallel
 * requests with "Request exceeds defined limit" even for tiny ranges, so that is a rate limit too.
 */
const RATE_LIMITED = /rate limit|exceeds defined limit|429|too many requests|timed? ?out|fetch failed|pruned|unavailable/i;
/** Errors that mean the answer itself is too large: only then is the range split. */
const TOO_LARGE = /range|too many (results|logs)|response size|more than|10000 results|query returned/i;
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Move = { from: Address; to: Address; value: bigint };

/** Transfer logs in [from, to]. A busy RPC hands the request to the next one; a range too large to return is split in half. */
async function transfersIn(token: Address, from: bigint, to: bigint, deadline: number, depth = 0, tries = 0): Promise<Move[]> {
  const c = nextClient();
  try {
    const logs = await c.getLogs({ address: token, event: TRANSFER, fromBlock: from, toBlock: to });
    return logs.map((l) => l.args as Move);
  } catch (e) {
    const msg = e instanceof Error ? `${e.message} ${(e as { details?: string }).details ?? ""}` : String(e);
    // Rate-limited: back off and try again (on the next endpoint) until the scan's time budget is spent.
    if (RATE_LIMITED.test(msg) && Date.now() < deadline) {
      await pause(Math.min(1500, 150 * 2 ** Math.min(tries, 4)) + Math.random() * 150);
      return transfersIn(token, from, to, deadline, depth, tries + 1);
    }
    if (!TOO_LARGE.test(msg) || to - from < 50n || depth > 8) throw e;
    const mid = (from + to) / 2n;
    const [a, b] = await Promise.all([transfersIn(token, from, mid, deadline, depth + 1), transfersIn(token, mid + 1n, to, deadline, depth + 1)]);
    return [...a, ...b];
  }
}

/** Replay time inside the request, so the report comes back quickly; the rest continues in the background (see getRisk). */
const SCAN_BUDGET_MS = 8_000;
/** Holder balances are kept between checks (up to this many holders) so a re-check only reads new blocks. */
const MAX_CACHED_HOLDERS = 12_000;

type HolderCache = { created: string; to: string; bal: Record<string, string> };

export class ScanInProgress extends Error {}

/**
 * Every holder's balance at `to`, replayed from Transfer logs since creation. Resumes from the saved
 * replay when there is one; when the time budget runs out, the part read so far is saved and
 * ScanInProgress is thrown, so the next check continues instead of starting over.
 */
async function balancesSince(token: Address, created: bigint, to: bigint, budgetMs = SCAN_BUDGET_MS) {
  const key = `risk:holders:v1:${token.toLowerCase()}`;
  const cached = await kvGet<HolderCache>(key).catch(() => null);
  const bal = new Map<string, bigint>();
  let from = created;
  if (cached && cached.created === created.toString() && BigInt(cached.to) < to) {
    for (const [a, v] of Object.entries(cached.bal)) bal.set(a, BigInt(v));
    from = BigInt(cached.to) + 1n;
  }
  const save = async (upTo: bigint) => {
    const entries = [...bal.entries()].filter(([, v]) => v !== 0n);
    if (entries.length > MAX_CACHED_HOLDERS) return;
    await kvSet(key, { created: created.toString(), to: upTo.toString(), bal: Object.fromEntries(entries.map(([a, v]) => [a, v.toString()])) } satisfies HolderCache, 7 * 86_400).catch(() => undefined);
  };
  const deadline = Date.now() + budgetMs;
  const ranges: [bigint, bigint][] = [];
  for (let f = from; f <= to; f += LOG_WINDOW) ranges.push([f, f + LOG_WINDOW - 1n > to ? to : f + LOG_WINDOW - 1n]);
  // A few requests in flight per endpoint: more than that and they start refusing.
  const parallel = LOG_CLIENTS.length * 3;
  for (let i = 0; i < ranges.length; i += parallel) {
    const slice = ranges.slice(i, i + parallel);
    let lastError = "";
    const batch = await Promise.all(slice.map(([f, t]) => transfersIn(token, f, t, deadline))).catch((e: unknown) => {
      lastError = (e instanceof Error ? e.message : String(e)).split("\n")[0].slice(0, 120);
      return null;
    });
    if (!batch || Date.now() > deadline) {
      // Keep what is complete: every range before this batch.
      if (i > 0) await save(ranges[i - 1][1]);
      throw new ScanInProgress(`read ${i} of ${ranges.length} windows from block ${from}${lastError ? `; last error: ${lastError}` : ""}`);
    }
    for (const logs of batch)
      for (const { from: a, to: b, value } of logs) {
        if (a) bal.set(a.toLowerCase(), (bal.get(a.toLowerCase()) ?? 0n) - value);
        if (b) bal.set(b.toLowerCase(), (bal.get(b.toLowerCase()) ?? 0n) + value);
      }
  }
  await save(to);
  return bal;
}

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export class TokenNotFound extends Error {}

export async function tokenRisk(address: string, opts: { scanBudgetMs?: number } = {}): Promise<RiskReport> {
  let token: Address;
  try {
    token = getAddress(address);
  } catch {
    throw new TokenNotFound("Not a valid address");
  }
  const head = await client.getBlockNumber();
  const code = (await client.getCode({ address: token })) ?? "0x";
  if (code === "0x") throw new TokenNotFound("No contract at this address on Arc");

  const read = <T>(functionName: "name" | "symbol" | "decimals" | "totalSupply") => client.readContract({ address: token, abi: ERC20, functionName, blockNumber: head }).then((v) => v as T).catch(() => null);
  const [name, symbol, decimals, supply, owner1, owner2, implRaw, adminRaw, launch, dex] = await Promise.all([
    read<string>("name"),
    read<string>("symbol"),
    read<number>("decimals"),
    read<bigint>("totalSupply"),
    client.readContract({ address: token, abi: OWNER, functionName: "owner" }).catch(() => null),
    client.readContract({ address: token, abi: OWNER, functionName: "getOwner" }).catch(() => null),
    client.getStorageAt({ address: token, slot: IMPL_SLOT }).catch(() => null),
    client.getStorageAt({ address: token, slot: ADMIN_SLOT }).catch(() => null),
    launchOf(token).catch(() => null),
    dexOf(token).catch(() => undefined),
  ]);
  if (supply === null || decimals === null) throw new TokenNotFound("This contract doesn't answer as an ERC-20 token");

  const factors: Factor[] = [];
  const redFlags: string[] = [];
  const caps: { grade: Grade; reason: string }[] = [];
  const explorer = (a: string) => `${EXPLORER_URL}/address/${a}`;

  // ---------- 1. Contract control
  const slotAddr = (v: Hex | null | undefined) => (v && BigInt(v) !== 0n ? (`0x${v.slice(-40)}` as Address) : null);
  const impl = slotAddr(implRaw);
  const minimalProxy = code.slice(2, 22) === "363d3d373d3d3d363d73";
  const upgradeable = Boolean(impl) && !minimalProxy;
  const owner = (owner1 ?? owner2) as Address | null;
  const ownerActive = Boolean(owner && owner.toLowerCase() !== ZERO && owner.toLowerCase() !== DEAD);
  const logic = impl ? ((await client.getCode({ address: impl }).catch(() => undefined)) ?? code) : code;
  const found = (group: string) => POWERS.filter((p) => p.group === group).flatMap((p) => p.sigs).filter((s) => logic.includes(`63${toFunctionSelector(s).slice(2)}`));
  const can = { mint: found("mint"), freeze: found("freeze"), fees: found("fees") };
  let control = 100;
  const controlDetails: string[] = [];
  if (upgradeable) {
    control -= 40;
    controlDetails.push(`Upgradeable proxy: the code behind it (${short(impl!)}) can be swapped${slotAddr(adminRaw) ? ` by ${short(slotAddr(adminRaw)!)}` : ""}.`);
  }
  if (ownerActive) {
    control -= 20;
    controlDetails.push(`Has an active owner (${short(owner!)}).`);
  } else controlDetails.push(owner ? "Ownership is renounced." : "No owner function: nobody holds admin rights through owner().");
  if (ownerActive && can.mint.length) control -= 30;
  if (ownerActive && can.freeze.length) control -= 25;
  if (ownerActive && can.fees.length) control -= 10;
  if (can.mint.length) controlDetails.push(`Has a mint function (${can.mint[0]})${ownerActive ? " an owner may be able to call" : ""}.`);
  if (can.freeze.length) controlDetails.push(`Has pause/blacklist functions (${can.freeze.slice(0, 2).join(", ")}).`);
  if (can.fees.length) controlDetails.push(`Has fee/limit setters (${can.fees.slice(0, 2).join(", ")}).`);
  if (launch) controlDetails.push("Created by the Argus launchpad's standard token factory.");
  factors.push({
    key: "control",
    label: "Contract control",
    weight: 25,
    score: clamp100(control),
    summary: upgradeable
      ? "The token's code can be changed after you buy."
      : ownerActive && (can.mint.length || can.freeze.length)
        ? "An owner keeps powers over the token (minting or freezing)."
        : ownerActive
          ? "An owner exists, but no mint or freeze function was found."
          : "No one controls the token contract: no owner, no upgrade path.",
    details: [...controlDetails, "Functions are found by scanning the contract bytecode for known signatures; unusual names can be missed."],
    evidence: [{ label: "Contract on the Arc explorer", href: explorer(token) }],
  });
  if (upgradeable) {
    redFlags.push("Upgradeable contract: its rules can change");
    caps.push({ grade: "C", reason: "an upgradeable contract" });
  }
  if (ownerActive && can.mint.length) {
    redFlags.push("Owner may be able to mint new tokens");
    caps.push({ grade: "D", reason: "an owner that can mint" });
  }
  if (ownerActive && can.freeze.length) {
    redFlags.push("Owner may be able to pause trading or blacklist wallets");
    caps.push({ grade: "D", reason: "an owner that can freeze wallets or trading" });
  }

  // ---------- 2. Launch terms (Argus)
  let bonded: boolean | null = null;
  if (launch) bonded = await client.readContract({ address: launch.hook, abi: HOOK, functionName: "bonded" }).catch(() => null);
  const tax = launch ? Math.max(launch.buyTaxBps, launch.sellTaxBps) / 100 : null;
  factors.push({
    key: "launch",
    label: "Launch terms",
    weight: 10,
    score: tax === null ? null : clamp100(band(tax, [[1.01, 95], [3.01, 80], [5.01, 60], [10.01, 35]], 10) + (bonded ? 0 : -10)),
    summary:
      tax === null
        ? "Not an Argus launch, so buy/sell taxes can't be read from a standard record."
        : `Argus launch: ${launch!.buyTaxBps / 100}% buy tax, ${launch!.sellTaxBps / 100}% sell tax, ${bonded ? "bonded" : bonded === false ? "not bonded yet" : "bond status unknown"}.`,
    details: tax === null ? [] : ["Taxes are fixed by the Argus hook at launch and apply to every trade.", ...(bonded === false ? ["Before bonding, price moves are sharper and exits can be thin."] : [])],
    evidence: launch ? [{ label: "Launch on Argus", href: `${ARGUS.site}/token/${token}` }] : [],
  });
  if (tax === null) caps.push({ grade: "B", reason: "buy/sell taxes that can't be verified (not an Argus launch)" });
  if (tax !== null && tax > 10) {
    redFlags.push(`High trading tax (${pct(tax, 0)})`);
    caps.push({ grade: "D", reason: "a trading tax above 10%" });
  }

  // ---------- 3. Liquidity
  const liq = dex === undefined ? null : dex ? dex.liquidityUsd : 0;
  const liqRatio = dex && dex.fdv ? dex.liquidityUsd / dex.fdv : null;
  factors.push({
    key: "liquidity",
    label: "Liquidity",
    weight: 20,
    score: liq === null ? null : clamp100(band(liq, [[1e3, 5], [1e4, 30], [5e4, 55], [2.5e5, 75], [1e6, 88]], 95) - (liqRatio !== null && liqRatio < 0.02 ? 20 : 0)),
    summary:
      liq === null
        ? "Couldn't load market data right now."
        : !dex
          ? "No trading pool found on DexScreener for this token on Arc."
          : `${usd(dex.liquidityUsd)} in ${dex.pairs} pool${dex.pairs === 1 ? "" : "s"}${liqRatio !== null ? ` (${pct(liqRatio * 100)} of its ${usd(dex.fdv!)} valuation)` : ""}.`,
    details: ["Liquidity is how much you can sell before the price collapses. Thin pools mean big slippage and easy manipulation."],
    evidence: dex?.url ? [{ label: "Pools on DexScreener", href: dex.url }] : [],
  });
  if (liq !== null && liq < 1_000) redFlags.push("Very thin or no liquidity: selling may be difficult");
  if (liq !== null && liq < 10_000) caps.push({ grade: "D", reason: "liquidity under $10K" });
  else if (liq !== null && liq < 50_000) caps.push({ grade: "C", reason: "liquidity under $50K" });

  // ---------- 4. Holder concentration
  const created = await creationBlock(token, head).catch(() => undefined);
  // A busy token's history can still fail to load; then only this check is unknown.
  let scanning = false;
  let scanNote = "";
  const bal =
    typeof created === "bigint"
      ? await balancesSince(token, created, head, opts.scanBudgetMs).catch((e) => {
          scanning = e instanceof ScanInProgress;
          scanNote = e instanceof Error ? e.message : "";
          return null;
        })
      : null;
  let holdersFactor: Factor;
  if (created === undefined || created === null || !bal) {
    holdersFactor = {
      key: "holders",
      label: "Holder concentration",
      weight: 25,
      score: null,
      summary:
        created === null
          ? "This token is older than 14 days; its full holder history is too long to replay here. Check the holders list on the explorer."
          : scanning
            ? "Still reading this token's transfer history (a busy token). Check again in a minute: the scan continues where it stopped."
            : "Couldn't read the token's transfer history right now; check the holders list on the explorer.",
      details: scanNote ? [`Scan progress: ${scanNote}.`] : [],
      evidence: [{ label: "Holders on the Arc explorer", href: `${EXPLORER_URL}/token/${token}?tab=holders` }],
    };
  } else {
    // Tokens sent to the dead address are out of circulation (burns to 0x0 already lower totalSupply).
    const deadBal = bal.get(DEAD) ?? 0n;
    const burned = deadBal > 0n ? deadBal : 0n;
    const circ = supply - burned > 0n ? supply - burned : supply;
    const holders = [...bal.entries()].filter(([a, v]) => v > 0n && a !== ZERO && a !== DEAD).sort((a, b) => (b[1] > a[1] ? 1 : b[1] < a[1] ? -1 : 0));
    const top = holders.slice(0, 15);
    const codes = await Promise.all(top.map(([a]) => (KNOWN[a] || a === token.toLowerCase() ? Promise.resolve("known") : client.getCode({ address: a as Address }).then((c) => (c && c !== "0x" ? "contract" : "wallet")).catch(() => "wallet"))));
    const share = (v: bigint) => Number((v * 1_000_000n) / (circ || 1n)) / 10_000;
    const labelled = top.map(([a, v], i) => ({
      a,
      pct: share(v),
      kind: KNOWN[a] ? KNOWN[a] : a === token.toLowerCase() ? "The token contract" : launch && a === launch.hook.toLowerCase() ? "Argus launch hook" : codes[i] === "contract" ? "Contract (unknown)" : "Wallet",
    }));
    // Unknown contracts (e.g. smart wallets) count as holders; only known pools, locks and burns are left out.
    const wallets = labelled.filter((h) => h.kind === "Wallet" || h.kind === "Contract (unknown)");
    const top10 = wallets.slice(0, 10).reduce((s, h) => s + h.pct, 0);
    const biggest = wallets[0]?.pct ?? 0;
    let hs = band(top10, [[15, 95], [25, 80], [40, 60], [60, 35]], 10);
    if (biggest > 10) hs -= 15;
    holdersFactor = {
      key: "holders",
      label: "Holder concentration",
      weight: 25,
      score: clamp100(hs),
      summary: `The 10 largest holders hold ${pct(top10)} of the supply; the largest holds ${pct(biggest)}. ${holders.length.toLocaleString("en-US")} holders in total.`,
      details: [
        "Known pools, locks and burn addresses are left out; unknown contracts count, since one could be a single person's smart wallet.",
        ...labelled.slice(0, 8).map((h) => `${h.kind} ${short(h.a)}: ${pct(h.pct, 2)}`),
      ],
      evidence: [{ label: "Holders on the Arc explorer", href: `${EXPLORER_URL}/token/${token}?tab=holders` }],
    };
    if (biggest > 20) {
      redFlags.push(`One holder has ${pct(biggest, 0)} of the supply`);
      caps.push({ grade: "D", reason: "a single holder with over 20%" });
    } else if (top10 > 50) {
      redFlags.push(`The top 10 holders have ${pct(top10, 0)} of the supply`);
      caps.push({ grade: "D", reason: "the top 10 holders owning over half the supply" });
    }
  }
  factors.push(holdersFactor);

  // ---------- 5. Age & activity
  const createdAtMs = dex?.createdAt ?? (typeof created === "bigint" ? Number((await client.getBlock({ blockNumber: created }).catch(() => null))?.timestamp ?? 0n) * 1000 || null : null);
  const ageDays = createdAtMs ? (Date.now() - createdAtMs) / DAY : created === null ? 14 : null;
  let act = ageDays === null ? null : band(ageDays, [[1, 15], [7, 35], [30, 60], [180, 80]], 92);
  if (act !== null && dex) act = clamp100(act + (dex.txns24h >= 50 ? 5 : dex.txns24h < 5 ? -15 : 0));
  factors.push({
    key: "activity",
    label: "Age & activity",
    weight: 20,
    score: act,
    summary:
      ageDays === null
        ? "Couldn't tell how old this token is."
        : `${created === null && !dex?.createdAt ? "Over 14 days old" : ageDays < 2 ? `${Math.round(ageDays * 24)} hours old` : `${Math.round(ageDays)} days old`}${dex ? `; ${dex.txns24h.toLocaleString("en-US")} trades (${dex.buys24h} buys / ${dex.sells24h} sells) and ${usd(dex.volume24h)} volume in 24h` : ""}.`,
    details: ["Most rug pulls happen in a token's first days. A longer, active history is a better (not perfect) sign."],
  });
  if (ageDays !== null && ageDays < 1) {
    redFlags.push("Brand new: under a day old");
    caps.push({ grade: "D", reason: "a token under a day old" });
  } else if (ageDays !== null && ageDays < 7) caps.push({ grade: "C", reason: "a token under a week old" });
  else if (ageDays !== null && ageDays < 30) caps.push({ grade: "B", reason: "a token under a month old" });

  return finish(
    {
      kind: "token",
      id: token.toLowerCase(),
      name: name?.trim() || symbol?.trim() || short(token),
      symbol: symbol?.trim() || undefined,
      redFlags,
      factors,
      block: Number(head),
      partial: scanning || undefined,
      sources: [
        { label: `Arc mainnet, block ${head.toString()}`, href: explorer(token) },
        ...(dex?.url ? [{ label: "DexScreener", href: dex.url }] : []),
        ...(launch ? [{ label: "Argus launchpad", href: `${ARGUS.site}/token/${token}` }] : []),
      ],
    },
    caps,
  );
}
