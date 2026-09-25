import crypto from "node:crypto";
import { parseUnits, type Address } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { GatewayClient } from "@circle-fin/x402-batching/client";
import { ARC_CHAIN, ARC_RPC_URL, ARC_USDC, GATEWAY_CHAIN } from "./config";
import { readClient, walletClientFor } from "./chain";
import { kvGet, kvSetNx } from "./store";

/**
 * Each automated agent has its own wallet so it can pay for its runs by itself.
 * The key is generated here and stored encrypted (AES-256-GCM) in Redis. The encryption
 * key is derived from AGENT_WALLET_SECRET, or from AGENT_PRIVATE_KEY when that is not set,
 * so changing that secret makes existing agent wallets unreadable. Custodial: meant for
 * small balances; owners can withdraw at any time.
 */

function masterSecret() {
  const s = (process.env.AGENT_WALLET_SECRET || process.env.AGENT_PRIVATE_KEY || "").trim();
  if (!s) throw new Error("Agent wallets need AGENT_PRIVATE_KEY (or AGENT_WALLET_SECRET) on the server");
  return s;
}
const derive = (info: string) => Buffer.from(crypto.hkdfSync("sha256", masterSecret(), "fuci", info, 32));

/** Shared secret for the automation tick (Authorization: Bearer …). */
export const tickSecret = () => derive("fuci-automation-tick").toString("hex");

type Sealed = { address: Address; iv: string; tag: string; data: string };
const key = (agentId: string) => `wallet:${agentId}`;

function seal(privateKey: string): Omit<Sealed, "address"> {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", derive("fuci-agent-wallets"), iv);
  const data = Buffer.concat([c.update(privateKey, "utf8"), c.final()]);
  return { iv: iv.toString("base64"), tag: c.getAuthTag().toString("base64"), data: data.toString("base64") };
}

function open(s: Sealed): `0x${string}` {
  const d = crypto.createDecipheriv("aes-256-gcm", derive("fuci-agent-wallets"), Buffer.from(s.iv, "base64"));
  d.setAuthTag(Buffer.from(s.tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(s.data, "base64")), d.final()]).toString("utf8") as `0x${string}`;
}

/** The agent's wallet address, creating the wallet on first use. */
export async function ensureAgentWallet(agentId: string): Promise<Address> {
  const existing = await kvGet<Sealed>(key(agentId));
  if (existing) return existing.address;
  const pk = generatePrivateKey();
  const address = privateKeyToAccount(pk).address;
  // Atomic: if another request created the wallet meanwhile, keep theirs (never overwrite a key).
  if (await kvSetNx(key(agentId), { address, ...seal(pk) } satisfies Sealed)) return address;
  const winner = await kvGet<Sealed>(key(agentId));
  if (!winner) throw new Error("Could not create the agent wallet");
  return winner.address;
}

async function privateKey(agentId: string) {
  const s = await kvGet<Sealed>(key(agentId));
  if (!s) throw new Error("This agent has no wallet yet");
  return open(s);
}

export const agentAccount = async (agentId: string) => privateKeyToAccount(await privateKey(agentId));

export async function agentGatewayFor(agentId: string) {
  return new GatewayClient({ chain: GATEWAY_CHAIN, privateKey: await privateKey(agentId), rpcUrl: ARC_RPC_URL });
}

export async function balancesOf(agentId: string) {
  const b = await (await agentGatewayFor(agentId)).getBalances();
  return { walletUsdc: Number(b.wallet.formatted), gatewayUsdc: Number(b.gateway.formattedAvailable) };
}

const ERC20_TRANSFER = [
  { type: "function", name: "transfer", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }] },
] as const;

/** Keep this much USDC in the agent wallet for gas (USDC is Arc's gas token). */
export const GAS_RESERVE = 0.01;

/** Send everything back to the owner: the Gateway balance (instant transfer) and the wallet's USDC minus gas. */
export async function withdrawAll(agentId: string, to: Address) {
  const gateway = await agentGatewayFor(agentId);
  const { walletUsdc, gatewayUsdc } = await balancesOf(agentId);
  const out: { gateway?: string; wallet?: string } = {};
  if (gatewayUsdc > 0) {
    // Same-chain withdrawal: Gateway mints the USDC straight to the owner on Arc.
    const r = await gateway.withdraw(String(gatewayUsdc), { recipient: to });
    out.gateway = r.mintTxHash;
  }
  const send = Math.floor((walletUsdc - GAS_RESERVE) * 1e6) / 1e6;
  if (send > 0) {
    const account = await agentAccount(agentId);
    const pub = readClient(ARC_CHAIN);
    const hash = await walletClientFor(ARC_CHAIN, account).writeContract({ address: ARC_USDC, abi: ERC20_TRANSFER, functionName: "transfer", args: [to, parseUnits(String(send), 6)] });
    await pub.waitForTransactionReceipt({ hash, timeout: 45_000 });
    out.wallet = hash;
  }
  return out;
}
