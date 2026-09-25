import { createPublicClient, encodeFunctionData, encodeAbiParameters, http, maxUint160, maxUint256, parseAbi, parseAbiParameters, type Address, type Hex } from "viem";
import { arc } from "viem/chains";
import { HOOK, arcClient, launchOf, poolKeyOf, poolPrice, symbolOf } from "./argus";
import { ARC_NETWORK, ARC_USDC, FUCI_TREASURY } from "./config";
import { walletClientFor } from "./chain";
import { agentAccount } from "./agentWallets";
import { addTradeFee } from "./store";
import { TRADE_FEE_PCT } from "./tradingRules";

/**
 * Swaps for an agent's own wallet on Argus (Arc mainnet). Every Argus launch trades on its own
 * Uniswap v4 pool (fee 1%, tick spacing 200, the launch's tax hook) from the first block, so every
 * trade goes through the Universal Router (Permit2), quoted with the V4 Quoter.
 * Every swap has a minimum output from a fresh quote minus the owner's slippage, and
 * Fuci's 1% fee goes to the treasury only after the swap succeeded.
 */

export const V4 = {
  poolManager: "0x8366a39cc670b4001a1121b8f6a443a643e40951",
  universalRouter: "0x4fcA4a51Ab4F23A7447b3284fBd7D73289A89Fb1",
  quoter: "0x8dc178efb8111bb0973dd9d722ebeff267c98f94",
  permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
} as const;

/** Keep this much USDC in the agent wallet for gas while trading. */
export const TRADE_GAS_RESERVE = 0.05;
/** Argus adds a snipe tax (up to 99%) that decays within 3 s of launch: never buy before this. */
export const SNIPE_WAIT_SEC = 10;

const ERC20 = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
  "function transfer(address,uint256) returns (bool)",
  "function decimals() view returns (uint8)",
]);
const PERMIT2 = parseAbi([
  "function allowance(address owner, address token, address spender) view returns (uint160 amount, uint48 expiration, uint48 nonce)",
  "function approve(address token, address spender, uint160 amount, uint48 expiration)",
]);
const ROUTER = parseAbi(["function execute(bytes commands, bytes[] inputs, uint256 deadline) payable"]);
const QUOTER = parseAbi([
  "function quoteExactInputSingle(((address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks) poolKey, bool zeroForOne, uint128 exactAmount, bytes hookData) params) returns (uint256 amountOut, uint256 gasEstimate)",
]);

const pub = () => arcClient;

export type Market = {
  token: Address;
  hook: Address;
  /** Who launched it (watched by the "sell when the dev sells" rule). */
  creator: Address;
  symbol: string;
  decimals: number;
  /** Past the bond tick (Argus' milestone, latched by the hook). */
  bonded: boolean;
  buyTaxPct: number;
  sellTaxPct: number;
  /** Unix seconds; 0 when the hook doesn't say. */
  launchedAt: number;
  usdcFirst: boolean;
  poolId: Hex;
  /** Pool key fee (1%, or the dynamic-fee flag on Portal #8 pools). */
  fee: number;
};

const markets = new Map<string, Market>();

/** The Argus launch behind `token` (USDC pairs only), or null when it isn't one. */
export async function marketOf(token: Address): Promise<Market | null> {
  const hit = markets.get(token.toLowerCase());
  if (hit?.bonded) return hit;
  const info = await launchOf(token).catch(() => null);
  if (!info || info.quoteAsset.toLowerCase() !== ARC_USDC.toLowerCase()) return null;
  const [bonded, launchedAt, symbol, decimals] = await Promise.all([
    pub().readContract({ address: info.hook, abi: HOOK, functionName: "bonded" }).catch(() => false),
    hit?.launchedAt ?? pub().readContract({ address: info.hook, abi: HOOK, functionName: "launchedAt" }).then(Number).catch(() => 0),
    hit?.symbol ?? symbolOf(token),
    hit?.decimals ?? pub().readContract({ address: token, abi: ERC20, functionName: "decimals" }).then(Number).catch(() => 18),
  ]);
  const m: Market = {
    token,
    hook: info.hook,
    creator: info.creator,
    symbol,
    decimals,
    bonded,
    buyTaxPct: info.buyTaxBps / 100,
    sellTaxPct: info.sellTaxBps / 100,
    launchedAt,
    usdcFirst: info.usdcFirst,
    poolId: info.poolId,
    fee: info.fee,
  };
  markets.set(token.toLowerCase(), m);
  return m;
}

async function quoteV4(m: Pick<Market, "token" | "hook" | "fee">, usdcIn: boolean, amount: bigint) {
  const { key, usdcFirst } = poolKeyOf(m.token, m.hook, m.fee);
  const { result } = await pub().simulateContract({
    address: V4.quoter,
    abi: QUOTER,
    functionName: "quoteExactInputSingle",
    args: [{ poolKey: key, zeroForOne: usdcIn === usdcFirst, exactAmount: amount, hookData: "0x" }],
  });
  return result[0];
}

// Argus hooks reject the V4 Quoter's dry run on sells, so a sell is quoted by simulating the agent's own
// swap (eth_simulateV1, which Arc's dRPC endpoint serves); failing that, from the mid price minus fee and tax.
const simClient = createPublicClient({ chain: arc, transport: http(process.env.ARC_SIMULATE_RPC_URL || "https://rpc.drpc.mainnet.arc.io", { timeout: 10_000 }) });

async function simulatedOut(m: Pick<Market, "token" | "hook" | "fee">, usdcIn: boolean, amountIn: bigint, me: Address): Promise<bigint> {
  const out = usdcIn ? m.token : ARC_USDC;
  const bal = { to: out, data: encodeFunctionData({ abi: ERC20, functionName: "balanceOf", args: [me] }) };
  const swap = v4SwapCall(m, usdcIn, amountIn, 0n);
  const res = (await simClient.request({
    method: "eth_simulateV1" as never,
    params: [{ blockStateCalls: [{ calls: [bal, { to: swap.address, data: encodeFunctionData(swap as never) }, bal].map((c) => ({ from: me, ...c })) }], validation: false }, "latest"] as never,
  })) as { calls: { status: string; returnData: Hex }[] }[];
  const [before, swapped, after] = res[0].calls;
  if (swapped.status !== "0x1") throw new Error("simulated swap reverted");
  return BigInt(after.returnData) - BigInt(before.returnData);
}

/** What a swap should return: the V4 Quoter, else a simulation of the real swap, else the mid price minus fee and tax. */
async function expectedOut(m: Market, usdcIn: boolean, amountIn: bigint, me: Address): Promise<bigint> {
  try {
    return await quoteV4(m, usdcIn, amountIn);
  } catch {
    try {
      return await simulatedOut(m, usdcIn, amountIn, me);
    } catch {
      const price = await priceOf(m);
      const keep = 1 - 0.01 - (usdcIn ? m.buyTaxPct : m.sellTaxPct) / 100 - 0.02; // pool fee, tax, 2% margin
      const whole = usdcIn ? Number(amountIn) / 1e6 / price : (Number(amountIn) / 10 ** m.decimals) * price;
      if (!(whole > 0) || !(keep > 0)) throw new Error("could not quote this swap");
      return BigInt(Math.floor(whole * keep * (usdcIn ? 10 ** m.decimals : 1e6)));
    }
  }
}

/** Mid price in USDC per whole token, from the pool's slot0. */
export async function priceOf(m: Market): Promise<number> {
  return (await poolPrice(m, m.decimals)).priceUsdc;
}

export const tokenBalance = (token: Address, owner: Address) => pub().readContract({ address: token, abi: ERC20, functionName: "balanceOf", args: [owner] });

/** Where trade fees go: the Fuci treasury (a Safe multisig, see FUCI_TREASURY in lib/config.ts). */
export async function tradeTreasury(): Promise<Address | null> {
  return FUCI_TREASURY;
}

export type TradeResult = {
  side: "buy" | "sell";
  token: Address;
  symbol: string;
  /** USDC spent (buy, fee included) or received (sell, after fee). */
  usdc: number;
  /** Raw token units bought or sold. */
  tokens: bigint;
  /** USDC per whole token on this fill. */
  price: number;
  fee: number;
  tx: Hex;
  venue: "argus";
};

async function signer(agentId: string) {
  if (ARC_NETWORK !== "mainnet") throw new Error("Trading runs on Arc mainnet only");
  const account = await agentAccount(agentId);
  const wallet = walletClientFor(arc, account);
  const send = async (req: { address: Address; abi: readonly unknown[]; functionName: string; args: readonly unknown[] }) => {
    const hash = await wallet.writeContract({ ...(req as Parameters<typeof wallet.writeContract>[0]), account, chain: arc });
    const r = await pub().waitForTransactionReceipt({ hash, timeout: 45_000 });
    if (r.status !== "success") throw new Error(`Transaction reverted (${hash})`);
    return hash;
  };
  return { account, me: account.address, send };
}

async function approveIfNeeded(s: Awaited<ReturnType<typeof signer>>, token: Address, spender: Address, amount: bigint) {
  const allowance = await pub().readContract({ address: token, abi: ERC20, functionName: "allowance", args: [s.me, spender] });
  if (allowance < amount) await s.send({ address: token, abi: ERC20, functionName: "approve", args: [spender, maxUint256] });
}

async function permit2IfNeeded(s: Awaited<ReturnType<typeof signer>>, token: Address, amount: bigint) {
  await approveIfNeeded(s, token, V4.permit2, amount);
  const [allowed, expiration] = await pub().readContract({ address: V4.permit2, abi: PERMIT2, functionName: "allowance", args: [s.me, token, V4.universalRouter] });
  if (allowed < amount || expiration < Math.floor(Date.now() / 1000) + 300) {
    await s.send({ address: V4.permit2, abi: PERMIT2, functionName: "approve", args: [token, V4.universalRouter, maxUint160, Math.floor(Date.now() / 1000) + 30 * 86400] });
  }
}

/** Universal Router V4_SWAP: SWAP_EXACT_IN_SINGLE, SETTLE_ALL, TAKE_ALL (Arc's router takes minHopPriceX36). */
export function v4SwapCall(m: Pick<Market, "token" | "hook" | "fee">, usdcIn: boolean, amountIn: bigint, minOut: bigint) {
  const { key, usdcFirst } = poolKeyOf(m.token, m.hook, m.fee);
  const [inCur, outCur] = usdcIn ? [ARC_USDC, m.token] : [m.token, ARC_USDC];
  const swap = encodeAbiParameters(
    parseAbiParameters(
      "((address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks) poolKey, bool zeroForOne, uint128 amountIn, uint128 amountOutMinimum, uint256 minHopPriceX36, bytes hookData)",
    ),
    [{ poolKey: key, zeroForOne: usdcIn === usdcFirst, amountIn, amountOutMinimum: minOut, minHopPriceX36: 0n, hookData: "0x" }],
  );
  const settle = encodeAbiParameters(parseAbiParameters("address, uint256"), [inCur, amountIn]);
  const take = encodeAbiParameters(parseAbiParameters("address, uint256"), [outCur, minOut]);
  const input = encodeAbiParameters(parseAbiParameters("bytes, bytes[]"), ["0x060c0f", [swap, settle, take]]);
  return { address: V4.universalRouter as Address, abi: ROUTER, functionName: "execute", args: ["0x10", [input], BigInt(Math.floor(Date.now() / 1000) + 300)] as const };
}

const withSlippage = (expected: bigint, slippagePct: number) => (expected * BigInt(10_000 - Math.round(slippagePct * 100))) / 10_000n;
const toUnits = (usdc: number) => BigInt(Math.floor(usdc * 1e6));

async function takeFee(s: Awaited<ReturnType<typeof signer>>, fee: bigint) {
  const to = await tradeTreasury();
  if (!to || fee <= 0n || to.toLowerCase() === s.me.toLowerCase()) return 0;
  // A failed fee transfer must not undo a filled trade.
  try {
    await s.send({ address: ARC_USDC, abi: ERC20, functionName: "transfer", args: [to, fee] });
    await addTradeFee(Number(fee) / 1e6);
    return Number(fee) / 1e6;
  } catch {
    return 0;
  }
}

/** Spend `usdc` (fee included) on `token`. */
export async function buy(agentId: string, token: Address, usdc: number, slippagePct: number): Promise<TradeResult> {
  const m = await marketOf(token);
  if (!m) throw new Error(`${token} is not an Argus token`);
  if (m.launchedAt && Date.now() / 1000 - m.launchedAt < SNIPE_WAIT_SEC) throw new Error(`$${m.symbol} launched seconds ago: waiting out Argus' snipe tax`);
  const s = await signer(agentId);
  const total = toUnits(usdc);
  const fee = (total * BigInt(TRADE_FEE_PCT * 100)) / 10_000n;
  const spend = total - fee;
  const balance = await pub().readContract({ address: ARC_USDC, abi: ERC20, functionName: "balanceOf", args: [s.me] });
  if (balance < total + toUnits(TRADE_GAS_RESERVE)) throw new NotEnoughUsdc(Number(balance) / 1e6);

  const before = await tokenBalance(token, s.me);
  await permit2IfNeeded(s, ARC_USDC, spend);
  const expected = await expectedOut(m, true, spend, s.me);
  const tx = await s.send(v4SwapCall(m, true, spend, withSlippage(expected, slippagePct)));
  const got = (await tokenBalance(token, s.me)) - before;
  const feePaid = await takeFee(s, fee);
  const whole = Number(got) / 10 ** m.decimals;
  return { side: "buy", token, symbol: m.symbol, usdc: Number(spend + (feePaid ? fee : 0n)) / 1e6, tokens: got, price: whole > 0 ? Number(spend) / 1e6 / whole : 0, fee: feePaid, tx, venue: "argus" };
}

/** Sell `amount` raw units of `token` for USDC. */
export async function sell(agentId: string, token: Address, amount: bigint, slippagePct: number): Promise<TradeResult> {
  const m = await marketOf(token);
  if (!m) throw new Error(`${token} is not an Argus token`);
  const s = await signer(agentId);
  const held = await tokenBalance(token, s.me);
  if (amount > held) amount = held;
  if (amount <= 0n) throw new Error(`No ${m.symbol} to sell`);

  const usdcBefore = await pub().readContract({ address: ARC_USDC, abi: ERC20, functionName: "balanceOf", args: [s.me] });
  await permit2IfNeeded(s, token, amount);
  const expected = await expectedOut(m, false, amount, s.me);
  const tx = await s.send(v4SwapCall(m, false, amount, withSlippage(expected, slippagePct)));
  // Gas is paid from the same USDC balance, so this is slightly under the swap's output: the fee errs low.
  const received = (await pub().readContract({ address: ARC_USDC, abi: ERC20, functionName: "balanceOf", args: [s.me] })) - usdcBefore;
  const gross = received > 0n ? received : 0n;
  const fee = (gross * BigInt(TRADE_FEE_PCT * 100)) / 10_000n;
  const feePaid = await takeFee(s, fee);
  const whole = Number(amount) / 10 ** m.decimals;
  const net = gross - (feePaid ? fee : 0n);
  return { side: "sell", token, symbol: m.symbol, usdc: Number(net) / 1e6, tokens: amount, price: whole > 0 ? Number(gross) / 1e6 / whole : 0, fee: feePaid, tx, venue: "argus" };
}

export class NotEnoughUsdc extends Error {
  constructor(public have: number) {
    super(`not enough USDC in the agent wallet (${have.toFixed(2)} USDC, keep ${TRADE_GAS_RESERVE} for gas)`);
    this.name = "NotEnoughUsdc";
  }
}

/** Send a token balance to `to` (used when the owner withdraws). */
export async function sendToken(agentId: string, token: Address, to: Address) {
  const s = await signer(agentId);
  const amount = await tokenBalance(token, s.me);
  if (amount <= 0n) return null;
  return s.send({ address: token, abi: ERC20, functionName: "transfer", args: [to, amount] });
}

export const explorerToken = (token: string) => `${arc.blockExplorers.default.url}/token/${token}`;
