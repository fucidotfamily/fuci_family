import crypto from "node:crypto";
import os from "node:os";
import {
  initiateDeveloperControlledWalletsClient,
  registerEntitySecretCiphertext,
} from "@circle-fin/developer-controlled-wallets";
import type { BatchEvmSigner } from "@circle-fin/x402-batching";
import { ARC_NETWORK, ARC_USDC, CIRCLE_BLOCKCHAIN, CIRCLE_LIVE } from "./config";

/**
 * Circle developer-controlled wallets. Only CIRCLE_API_KEY + CIRCLE_ENTITY_SECRET
 * are needed: the wallets themselves are found (or created on first use) by refId,
 * so no wallet IDs have to be copied into env vars.
 *
 *  - "fuci-house-frond": the house agent that pays for tools over x402
 *  - "fuci-treasury":    receives x402 payments when FUCI_SELLER_ADDRESS is unset
 */

export const WALLET_REFS = { agent: "fuci-house-frond", treasury: "fuci-treasury" } as const;
type WalletRole = keyof typeof WALLET_REFS;
export type CircleWallet = { id: string; address: `0x${string}` };

const GATEWAY_WALLET = ARC_NETWORK === "mainnet" ? "0x77777777Dcc4d5A8B6E418Fd04D8997ef11000eE" : "0x0077777d7EBA4688BDeF3E311b846F25870A19B9";
const GATEWAY_API = ARC_NETWORK === "mainnet" ? "https://gateway-api.circle.com/v1" : "https://gateway-api-testnet.circle.com/v1";
const ARC_GATEWAY_DOMAIN = 26;

let client: ReturnType<typeof initiateDeveloperControlledWalletsClient> | null = null;

export function circle() {
  if (!client) {
    client = initiateDeveloperControlledWalletsClient({
      apiKey: process.env.CIRCLE_API_KEY!,
      entitySecret: process.env.CIRCLE_ENTITY_SECRET!,
    });
  }
  return client;
}

const walletCache = new Map<WalletRole, Promise<CircleWallet>>();

/** Find the wallet for a role by refId, creating it (and a wallet set) the first time. */
export function getWallet(role: WalletRole): Promise<CircleWallet> {
  let p = walletCache.get(role);
  if (!p) {
    p = findOrCreate(role);
    walletCache.set(role, p);
    p.catch(() => walletCache.delete(role)); // retry on the next call after a failure
  }
  return p;
}

async function findOrCreate(role: WalletRole): Promise<CircleWallet> {
  const refId = WALLET_REFS[role];
  const found = await circle().listWallets({ refId, blockchain: CIRCLE_BLOCKCHAIN });
  const existing = found.data?.wallets?.[0];
  if (existing) return { id: existing.id, address: existing.address as `0x${string}` };

  const sets = await circle().listWalletSets({});
  const walletSetId =
    sets.data?.walletSets?.find((s) => (s as { name?: string }).name === "Fuci")?.id ??
    (await circle().createWalletSet({ name: "Fuci" })).data?.walletSet?.id;
  if (!walletSetId) throw new Error("Could not create a Circle wallet set");

  const res = await circle().createWallets({
    accountType: "EOA",
    blockchains: [CIRCLE_BLOCKCHAIN],
    count: 1,
    walletSetId,
    metadata: [{ name: refId, refId }],
  });
  const w = res.data?.wallets?.[0];
  if (!w) throw new Error("Circle createWallets returned no wallet");
  return { id: w.id, address: w.address as `0x${string}` };
}

let signerCache: BatchEvmSigner | null = null;

/** An x402 signer backed by the house agent's Circle wallet (Circle signs; no private key here). */
export async function circleSigner(): Promise<BatchEvmSigner> {
  if (signerCache) return signerCache;
  const { id: walletId, address } = await getWallet("agent");
  signerCache = {
    address,
    async signTypedData(params) {
      const out = await circle().signTypedData({
        walletId,
        data: JSON.stringify(params, (_k, v) => (typeof v === "bigint" ? v.toString() : v)),
        memo: "Fuci x402 payment",
      });
      const sig = out.data?.signature;
      if (!sig) throw new Error("Circle signTypedData returned no signature");
      return sig as `0x${string}`;
    },
  };
  return signerCache;
}

/** Where x402 payments go: FUCI_SELLER_ADDRESS, else the Circle treasury wallet, else null (not configured). */
export async function sellerAddress(): Promise<`0x${string}` | null> {
  const env = process.env.FUCI_SELLER_ADDRESS;
  if (env && /^0x[0-9a-fA-F]{40}$/.test(env)) return env as `0x${string}`;
  if (!CIRCLE_LIVE) return null;
  return (await getWallet("treasury")).address;
}

// ---------------------------------------------------------------------------
// Balances, faucet, Gateway deposit (used by /setup)

export async function usdcBalance(walletId: string): Promise<number> {
  const res = await circle().getWalletTokenBalance({ id: walletId });
  const usdc = res.data?.tokenBalances?.find((b) => b.token?.symbol?.toUpperCase().startsWith("USDC"));
  return Number(usdc?.amount ?? 0);
}

export async function gatewayBalance(address: string): Promise<number> {
  const res = await fetch(`${GATEWAY_API}/balances`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: "USDC", sources: [{ depositor: address, domain: ARC_GATEWAY_DOMAIN }] }),
  });
  const body = (await res.json()) as { balances?: { balance: string }[] };
  return Number(body.balances?.[0]?.balance ?? 0);
}

export async function requestFaucet(address: string) {
  if (ARC_NETWORK === "mainnet") throw new Error("The faucet is testnet only");
  await circle().requestTestnetTokens({ address, blockchain: "ARC-TESTNET", usdc: true });
}

/** approve + deposit USDC into Circle Gateway so x402 payments settle gas-free. */
export async function depositToGateway(walletId: string, amountUsdc: number) {
  const atomic = String(Math.round(amountUsdc * 1e6));
  const fee = { type: "level" as const, config: { feeLevel: "MEDIUM" as const } };
  const run = async (contractAddress: string, abiFunctionSignature: string, abiParameters: string[]) => {
    const tx = await circle().createContractExecutionTransaction({ walletId, contractAddress, abiFunctionSignature, abiParameters, fee });
    const id = tx.data?.id;
    if (!id) throw new Error(`${abiFunctionSignature} was not accepted by Circle`);
    for (let i = 0; i < 18; i++) {
      await new Promise((r) => setTimeout(r, 1500));
      const t = (await circle().getTransaction({ id })).data?.transaction;
      if (t?.state === "COMPLETE" || t?.state === "CONFIRMED") return t.txHash ?? id;
      if (t && ["FAILED", "DENIED", "CANCELLED"].includes(t.state)) throw new Error(`${abiFunctionSignature} ${t.state}: ${t.errorReason ?? ""}`);
    }
    throw new Error(`${abiFunctionSignature} still pending, check again in a minute`);
  };
  const approve = await run(ARC_USDC, "approve(address,uint256)", [GATEWAY_WALLET, atomic]);
  const deposit = await run(GATEWAY_WALLET, "deposit(address,uint256)", [ARC_USDC, atomic]);
  return { approve, deposit };
}

/** One-time: generate + register an entity secret for this Circle account. */
export async function registerEntitySecret(apiKey: string) {
  const entitySecret = crypto.randomBytes(32).toString("hex");
  // The SDK also writes the recovery file to disk; only /tmp is writable on Vercel.
  const res = await registerEntitySecretCiphertext({ apiKey, entitySecret, recoveryFileDownloadPath: os.tmpdir() });
  return { entitySecret, recoveryFile: res.data?.recoveryFile ?? "" };
}

// ---------------------------------------------------------------------------
// Diagnostics for /setup: call Circle directly so status codes and error codes are visible.

export type Probe = { ok: boolean; status: number; code?: number | string; message?: string };

async function probe(path: string, apiKey: string): Promise<Probe> {
  try {
    const res = await fetch(`https://api.circle.com${path}`, { headers: { Authorization: `Bearer ${apiKey}` }, cache: "no-store" });
    const body = (await res.json().catch(() => ({}))) as { code?: number | string; message?: string };
    return { ok: res.ok, status: res.status, code: body.code, message: body.message };
  } catch (e) {
    return { ok: false, status: 0, message: e instanceof Error ? e.message : String(e) };
  }
}

export async function diagnoseCircle(apiKey: string) {
  const [publicKey, entity, ip] = await Promise.all([
    probe("/v1/w3s/config/entity/publicKey", apiKey),
    probe("/v1/w3s/config/entity", apiKey),
    fetch("https://api.ipify.org?format=json", { cache: "no-store" })
      .then((r) => r.json() as Promise<{ ip?: string }>)
      .then((b) => b.ip ?? null)
      .catch(() => null),
  ]);
  return { publicKey, entity, serverIp: ip };
}

/** Fresh entity secret + ciphertext, for registering by hand in the Circle Console. */
export async function entitySecretCiphertext(apiKey: string) {
  const entitySecret = crypto.randomBytes(32).toString("hex");
  const c = initiateDeveloperControlledWalletsClient({ apiKey, entitySecret });
  const ciphertext = await c.generateEntitySecretCiphertext();
  return { entitySecret, ciphertext };
}
