import { concat, keccak256, toHex, type Chain } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { GatewayClient } from "@circle-fin/x402-batching/client";
import type { BatchEvmSigner } from "@circle-fin/x402-batching";
import { ARC_RPC_URL, CIRCLE_LIVE, GATEWAY_CHAIN, SELF_MANAGED } from "./config";
import { readClient, walletClientFor } from "./chain";

/**
 * The house agent's wallet. Two real modes:
 *  - Self-managed (AGENT_PRIVATE_KEY): a plain EOA. Circle Gateway nanopayments
 *    are permissionless, so this needs no Circle account and works on mainnet.
 *  - Circle Wallets (CIRCLE_API_KEY + CIRCLE_ENTITY_SECRET): Circle holds the key.
 * Self-managed wins when both are set.
 */

export type AgentMode = "self-managed" | "circle" | "none";

export const AGENT_MODE: AgentMode = SELF_MANAGED ? "self-managed" : CIRCLE_LIVE ? "circle" : "none";

const account = () => privateKeyToAccount(process.env.AGENT_PRIVATE_KEY!.trim() as `0x${string}`);

export async function agentSigner(): Promise<BatchEvmSigner> {
  if (AGENT_MODE === "self-managed") return account() as unknown as BatchEvmSigner;
  if (AGENT_MODE === "circle") return (await import("./circle")).circleSigner();
  throw new Error("No agent wallet: set AGENT_PRIVATE_KEY (see /setup)");
}

export async function agentAddress(): Promise<`0x${string}` | null> {
  if (AGENT_MODE === "self-managed") return account().address;
  if (AGENT_MODE === "circle") return (await (await import("./circle")).getWallet("agent")).address;
  return null;
}

let gateway: GatewayClient | null = null;
/** GatewayClient for the self-managed agent (balances + deposit). */
export function agentGateway() {
  if (AGENT_MODE !== "self-managed") throw new Error("Gateway deposits from /setup need the self-managed agent key");
  if (!gateway) {
    gateway = new GatewayClient({
      chain: GATEWAY_CHAIN,
      privateKey: process.env.AGENT_PRIVATE_KEY!.trim() as `0x${string}`,
      rpcUrl: ARC_RPC_URL,
    });
  }
  return gateway;
}

/** USDC in the agent's wallet and in its Gateway balance (what x402 payments spend). */
export async function agentBalances() {
  const b = await agentGateway().getBalances();
  return { walletUsdc: Number(b.wallet.formatted), gatewayUsdc: Number(b.gateway.formattedAvailable) };
}

/**
 * Keep the house agent's Gateway balance (what x402 payments spend) topped up from its own wallet.
 * Moves up to `topUp` USDC when the Gateway balance is below `min`, keeping a little for gas.
 */
export async function ensureHouseGateway(min: number, topUp = 0.5) {
  if (AGENT_MODE !== "self-managed") return;
  const { walletUsdc, gatewayUsdc } = await agentBalances();
  if (gatewayUsdc >= min) return;
  const amount = Math.floor(Math.min(topUp, walletUsdc - 0.05) * 1e6) / 1e6;
  if (amount < min) return;
  const { acquireLock, releaseLock } = await import("./store");
  if (!(await acquireLock("house-gateway-deposit", 90))) return;
  try {
    await agentGateway().deposit(String(amount));
  } finally {
    await releaseLock("house-gateway-deposit");
  }
}

/**
 * Fuci's re-execution validator ("Tide checker"). Its key is derived from the agent key, so it
 * needs no extra variable; it is Fuci's own validator and is labelled that way everywhere.
 */
function validatorAccount() {
  if (AGENT_MODE !== "self-managed") throw new Error("The validator needs the self-managed agent key (AGENT_PRIVATE_KEY)");
  const key = process.env.AGENT_PRIVATE_KEY!.trim() as `0x${string}`;
  return privateKeyToAccount(keccak256(concat([key, toHex("fuci-validator")])));
}

export const validatorAddress = () => (AGENT_MODE === "self-managed" ? validatorAccount().address : null);

type WriteArgs = Parameters<ReturnType<typeof walletClientFor>["writeContract"]>[0];

/**
 * Send a contract call from the agent (or validator) wallet on `chain` and wait for it.
 * Contract writes (ERC-8004) need the self-managed key; gas is paid in USDC.
 */
export async function sendFrom(who: "agent" | "validator", chain: Chain, call: Omit<WriteArgs, "account" | "chain">) {
  if (AGENT_MODE !== "self-managed") throw new Error("On-chain agent actions need AGENT_PRIVATE_KEY (see /setup)");
  const signer = who === "agent" ? account() : validatorAccount();
  const pub = readClient(chain);
  const { request } = await pub.simulateContract({ ...(call as object), account: signer, chain } as Parameters<typeof pub.simulateContract>[0]);
  const hash = await walletClientFor(chain, signer).writeContract(request as WriteArgs);
  const receipt = await pub.waitForTransactionReceipt({ hash, timeout: 45_000 });
  if (receipt.status !== "success") throw new Error(`Transaction reverted: ${hash}`);
  return receipt;
}

/** Native USDC balance (gas) of an address on `chain`, in USDC. */
export async function gasBalance(chain: Chain, address: `0x${string}`) {
  return Number(await readClient(chain).getBalance({ address })) / 1e18;
}
