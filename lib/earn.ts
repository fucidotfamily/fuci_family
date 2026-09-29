import { EarnKit } from "@circle-fin/earn-kit";
import { ViemAdapter } from "@circle-fin/adapter-viem-v2";
import { erc20Abi, formatUnits, parseUnits, type Address, type Chain } from "viem";
import { arc } from "viem/chains";
import { agentAccount } from "./agentWallets";
import { readClient, walletClientFor } from "./chain";
import { ARC_NETWORK, ARC_USDC, FUCI_TREASURY } from "./config";
import { kvGet, kvSet, pushHistory } from "./store";

/**
 * Earn: agents put idle USDC or EURC into lending vaults on Arc through Circle's Earn Kit
 * (vault discovery, deposit, position, withdraw). Deposits come from the agent's own wallet and
 * are non-custodial: the vault holds them, and only the agent's key can redeem.
 *
 * Fuci's fee: EARN_FEE_PCT of the yield, taken when yield is withdrawn and sent to the treasury.
 * Never charged on the principal, on deposits, or on a position that lost value.
 */
export const EARN_FEE_PCT = 10;
export const EARN_CHAIN = "Arc";
export const EURC = "0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1" as const; // Circle EURC on Arc mainnet

export type Vault = {
  address: string;
  name: string;
  protocol: string;
  asset: "USDC" | "EURC";
  apy: number;
  vaultFee: number;
  status: string;
  circleGuarded: boolean;
  tvl: number;
  liquidity: number;
};

const VAULTS_KEY = "earn:vaults:v1";
/** Vaults under this TVL are hidden: on Arc they are mostly curators' tests. */
const MIN_TVL = 1_000;

let kitSingleton: EarnKit | null = null;
const kit = () => (kitSingleton ??= new EarnKit());
/** Optional Circle API key with the "App Kits" permission, for a higher rate limit. Server-side only. */
const config = () => (process.env.EARN_API_KEY ? { apiKey: process.env.EARN_API_KEY } : undefined);

type RawVault = {
  vaultAddress: string;
  name: string;
  protocol: string;
  asset: string;
  currentApy: number;
  vaultFee?: number;
  status: string;
  circleGuarded?: boolean;
  totalDeposits?: string;
  liquidity?: string;
};

/** Every real Earn vault on Arc (USDC and EURC), best APY first. Cached for 5 minutes. */
export async function earnVaults(): Promise<Vault[]> {
  const hit = await kvGet<Vault[]>(VAULTS_KEY).catch(() => null);
  if (hit) return hit;
  const { vaults } = (await kit().exploreVaults({ chain: EARN_CHAIN, sortBy: "apy", pageSize: 100, config: config() } as Parameters<EarnKit["exploreVaults"]>[0])) as unknown as { vaults: RawVault[] };
  const list: Vault[] = vaults
    .filter((v) => (v.asset === "USDC" || v.asset === "EURC") && v.name.trim() && !/test/i.test(v.name) && Number(v.totalDeposits ?? 0) >= MIN_TVL)
    .filter((v) => v.status === "active" || v.status === "low_liquidity")
    .map((v) => ({
      address: v.vaultAddress.toLowerCase(),
      name: v.name.trim(),
      protocol: v.protocol,
      asset: v.asset as Vault["asset"],
      apy: v.currentApy,
      vaultFee: v.vaultFee ?? 0,
      status: v.status,
      circleGuarded: Boolean(v.circleGuarded),
      tvl: Number(v.totalDeposits ?? 0),
      liquidity: Number(v.liquidity ?? 0),
    }))
    .sort((a, b) => b.apy - a.apy || b.tvl - a.tvl);
  await kvSet(VAULTS_KEY, list, 300).catch(() => undefined);
  return list;
}

export async function vaultOf(address: string) {
  const v = (await earnVaults()).find((x) => x.address === address.toLowerCase());
  if (!v) throw new Error("That vault isn't listed on Fuci Earn");
  return v;
}

const assetAddress = (asset: Vault["asset"]): Address => (asset === "EURC" ? EURC : (ARC_USDC as Address));

/** The agent's wallet as an Earn Kit signer (its key never leaves the server). */
async function adapterFor(agentId: string) {
  const account = await agentAccount(agentId);
  // Earn only runs on Arc, so both clients use Fuci's Arc RPC rotation.
  const onlyArc = (chain: Chain) => {
    if (chain.id !== arc.id) throw new Error(`Earn uses Arc only (asked for ${chain.name})`);
  };
  const adapter = new ViemAdapter(
    {
      getPublicClient: ({ chain }: { chain: Chain }) => (onlyArc(chain), readClient(arc)),
      getWalletClient: ({ chain }: { chain: Chain }) => (onlyArc(chain), walletClientFor(arc, account)),
    } as unknown as ConstructorParameters<typeof ViemAdapter>[0],
    { addressContext: "user-controlled", supportedChains: await kit().getSupportedChains() } as unknown as ConstructorParameters<typeof ViemAdapter>[1],
  );
  return { adapter, address: account.address };
}

const principalKey = (agentId: string, vault: string) => `earn:principal:${agentId}:${vault.toLowerCase()}`;
const vaultsKey = (agentId: string) => `earn:mine:${agentId}`;
export const EARN_FEES_KEY = "earn:fees:usdc";

async function myVaults(agentId: string) {
  return (await kvGet<string[]>(vaultsKey(agentId)).catch(() => null)) ?? [];
}

/** The agent's USDC and EURC in its wallet, and its Earn positions with Fuci's view of the yield. */
export async function earnState(agentId: string, wallet: string | undefined) {
  const client = readClient(arc);
  const [usdc, eurc] = wallet
    ? await Promise.all(
        ([ARC_USDC, EURC] as Address[]).map((t) =>
          client.readContract({ address: t, abi: erc20Abi, functionName: "balanceOf", args: [wallet as Address] }).then((b) => Number(formatUnits(b, 6))).catch(() => null),
        ),
      )
    : [null, null];
  const addrs = await myVaults(agentId);
  const positions = [];
  if (addrs.length) {
    const { adapter } = await adapterFor(agentId);
    const vaults = await earnVaults();
    for (const a of addrs) {
      const v = vaults.find((x) => x.address === a);
      try {
        const p = (await kit().getPosition({ from: { adapter, chain: EARN_CHAIN }, vaultAddress: a, config: config() } as Parameters<EarnKit["getPosition"]>[0])) as unknown as {
          vaultName: string;
          asset: string;
          currentBalance: string;
          currentApy: number;
        };
        const balance = Number(p.currentBalance);
        if (!(balance > 0)) continue;
        const principal = (await kvGet<number>(principalKey(agentId, a)).catch(() => null)) ?? balance;
        const yieldAmt = Math.max(0, balance - principal);
        positions.push({
          vault: a,
          name: v?.name ?? p.vaultName,
          asset: (v?.asset ?? p.asset) as Vault["asset"],
          apy: p.currentApy ?? v?.apy ?? 0,
          balance,
          principal,
          yield: yieldAmt,
          feeOnWithdraw: (yieldAmt * EARN_FEE_PCT) / 100,
        });
      } catch {
        // The Earn service can lag a new deposit: read the vault shares straight from Arc instead.
        const onChain = await sharesValue(a, wallet).catch(() => 0);
        if (!(onChain > 0)) continue;
        const principal = (await kvGet<number>(principalKey(agentId, a)).catch(() => null)) ?? onChain;
        const yieldAmt = Math.max(0, onChain - principal);
        positions.push({
          vault: a,
          name: v?.name ?? "Earn vault",
          asset: v?.asset ?? "USDC",
          apy: v?.apy ?? 0,
          balance: onChain,
          principal,
          yield: yieldAmt,
          feeOnWithdraw: (yieldAmt * EARN_FEE_PCT) / 100,
        });
      }
    }
  }
  return { wallet: { usdc, eurc }, positions };
}

const round6 = (n: number) => Math.floor(n * 1e6) / 1e6;

const VAULT_ABI = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "convertToAssets", stateMutability: "view", inputs: [{ name: "s", type: "uint256" }], outputs: [{ type: "uint256" }] },
] as const;

/** What the agent's vault shares are worth in the vault's asset (6 decimals), read from the ERC-4626 vault. */
async function sharesValue(vault: string, wallet: string | undefined) {
  if (!wallet) return 0;
  const c = readClient(arc);
  const shares = await c.readContract({ address: vault as Address, abi: VAULT_ABI, functionName: "balanceOf", args: [wallet as Address] });
  if (shares === 0n) return 0;
  const assets = await c.readContract({ address: vault as Address, abi: VAULT_ABI, functionName: "convertToAssets", args: [shares] });
  return Number(formatUnits(assets, 6));
}

/** Deposit from the agent's wallet into a listed, active vault. */
export async function earnDeposit(agentId: string, vaultAddress: string, amount: number) {
  if (ARC_NETWORK !== "mainnet") throw new Error("Earn runs on Arc mainnet only");
  const v = await vaultOf(vaultAddress);
  if (v.status !== "active") throw new Error("This vault is low on liquidity right now: pick another one");
  const amt = round6(amount);
  if (!(amt >= 0.1)) throw new Error("Deposit at least 0.10");
  const { adapter } = await adapterFor(agentId);
  const r = (await kit().deposit({ from: { adapter, chain: EARN_CHAIN }, vaultAddress: v.address, amount: amt.toFixed(6), config: config() } as Parameters<EarnKit["deposit"]>[0])) as unknown as {
    txHash: string;
    explorerUrl?: string;
  };
  const prev = (await kvGet<number>(principalKey(agentId, v.address)).catch(() => null)) ?? 0;
  await kvSet(principalKey(agentId, v.address), round6(prev + amt));
  const mine = await myVaults(agentId);
  if (!mine.includes(v.address)) await kvSet(vaultsKey(agentId), [...mine, v.address]);
  await pushHistory(agentId, { kind: "payment", label: `Put ${amt} ${v.asset} into ${v.name} (Earn)`, usdc: amt, href: r.explorerUrl ?? `https://explorer.arc.io/tx/${r.txHash}` });
  return { tx: r.txHash, vault: v.name, amount: amt, asset: v.asset };
}

/**
 * Withdraw `amount` (or everything) back to the agent's wallet. Fuci's fee is EARN_FEE_PCT of the
 * yield in the withdrawn part, paid to the treasury in the vault's asset right after.
 */
export async function earnWithdraw(agentId: string, vaultAddress: string, amount: number | "all") {
  if (ARC_NETWORK !== "mainnet") throw new Error("Earn runs on Arc mainnet only");
  const v = await vaultOf(vaultAddress);
  const { adapter } = await adapterFor(agentId);
  const pos = (await kit().getPosition({ from: { adapter, chain: EARN_CHAIN }, vaultAddress: v.address, config: config() } as Parameters<EarnKit["getPosition"]>[0])) as unknown as {
    currentBalance: string;
  };
  const balance = Number(pos.currentBalance);
  if (!(balance > 0)) throw new Error("Nothing in this vault");
  const want = amount === "all" ? balance : Math.min(round6(amount), balance);
  if (!(want > 0)) throw new Error("Pick an amount to withdraw");
  const principal = (await kvGet<number>(principalKey(agentId, v.address)).catch(() => null)) ?? balance;
  const share = want / balance;
  const yieldPart = Math.max(0, balance - principal) * share;

  const r = (await kit().withdraw({ from: { adapter, chain: EARN_CHAIN }, vaultAddress: v.address, amount: round6(want).toFixed(6), config: config() } as Parameters<EarnKit["withdraw"]>[0])) as unknown as {
    txHash: string;
    explorerUrl?: string;
    amount?: string;
  };
  const left = Math.max(0, principal * (1 - share));
  await kvSet(principalKey(agentId, v.address), round6(amount === "all" ? 0 : left));
  if (amount === "all") await kvSet(vaultsKey(agentId), (await myVaults(agentId)).filter((x) => x !== v.address));

  let fee = round6((yieldPart * EARN_FEE_PCT) / 100);
  let feeTx: string | undefined;
  if (fee >= 0.000001) {
    try {
      const account = await agentAccount(agentId);
      const hash = await walletClientFor(arc, account).writeContract({
        address: assetAddress(v.asset),
        abi: erc20Abi,
        functionName: "transfer",
        args: [FUCI_TREASURY as Address, parseUnits(fee.toFixed(6), 6)],
        account,
        chain: arc,
      });
      await readClient(arc).waitForTransactionReceipt({ hash, timeout: 45_000 });
      feeTx = hash;
      const total = (await kvGet<number>(EARN_FEES_KEY).catch(() => null)) ?? 0;
      await kvSet(EARN_FEES_KEY, round6(total + fee));
    } catch {
      fee = 0; // The withdrawal itself succeeded; never block the owner's money on the fee.
    }
  }
  const got = Number(r.amount ?? want);
  await pushHistory(agentId, {
    kind: "payment",
    label: `Took ${round6(got)} ${v.asset} out of ${v.name} (Earn)${fee ? `, Fuci fee ${fee} on the yield` : ""}`,
    usdc: round6(got),
    href: r.explorerUrl ?? `https://explorer.arc.io/tx/${r.txHash}`,
  });
  return { tx: r.txHash, amount: round6(got), asset: v.asset, fee, feeTx };
}
