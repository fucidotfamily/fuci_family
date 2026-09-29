import { isAddress, keccak256, toBytes, type Address, type Hex } from "viem";
import { ARC_CHAIN, ARC_NETWORK } from "./config";
import { readClient } from "./chain";
import { ESCROW_ABI } from "./escrowArtifact";
import { kvGet, kvSet } from "./store";

/**
 * FuciEscrow: USDC locked on Arc for jobs between agents (see contracts/FuciEscrow.sol).
 * The address comes from NEXT_PUBLIC_FUCI_ESCROW, or from the deployment the owner made on /setup.
 * Everything here is a read; money only moves from the user's own wallet in the browser.
 */
const KEY = `escrow:${ARC_NETWORK}`;
const client = () => readClient(ARC_CHAIN);

export const ESCROW_STATUS = ["None", "Funded", "Submitted", "Released", "Refunded"] as const;
export type EscrowStatus = (typeof ESCROW_STATUS)[number];

export async function escrowAddress(): Promise<Address | null> {
  const env = (process.env.NEXT_PUBLIC_FUCI_ESCROW ?? "").trim();
  if (isAddress(env)) return env;
  const stored = await kvGet<string>(KEY).catch(() => null);
  return stored && isAddress(stored) ? stored : null;
}

export const saveEscrowAddress = (a: Address) => kvSet(KEY, a);

export type EscrowInfo = {
  address: Address;
  owner: Address;
  treasury: Address;
  feeBps: number;
  paused: boolean;
  maxJobUsdc: number;
  maxTotalUsdc: number;
  /** USDC held for open jobs (what DefiLlama counts as TVL). */
  lockedUsdc: number;
  jobs: number;
};

export async function escrowInfo(): Promise<EscrowInfo | null> {
  const address = await escrowAddress();
  if (!address) return null;
  const fns = ["owner", "treasury", "feeBps", "paused", "maxJobAmount", "maxTotalLocked", "totalLocked", "jobCount"] as const;
  const res = await client().multicall({ allowFailure: false, contracts: fns.map((functionName) => ({ address, abi: ESCROW_ABI, functionName })) });
  const [owner, treasury, feeBps, paused, maxJob, maxTotal, locked, jobs] = res as unknown as [Address, Address, number, boolean, bigint, bigint, bigint, bigint];
  return {
    address,
    owner,
    treasury,
    feeBps: Number(feeBps),
    paused,
    maxJobUsdc: Number(maxJob) / 1e6,
    maxTotalUsdc: Number(maxTotal) / 1e6,
    lockedUsdc: Number(locked) / 1e6,
    jobs: Number(jobs),
  };
}

export type EscrowJob = {
  id: number;
  client: Address;
  provider: Address;
  evaluator: Address;
  amountUsdc: number;
  feeBps: number;
  status: EscrowStatus;
  deadline: number;
  reviewPeriod: number;
  reviewDeadline: number;
  termsHash: Hex;
  deliverable: Hex;
};

type RawJob = {
  client: Address;
  deadline: bigint;
  reviewPeriod: number;
  provider: Address;
  reviewDeadline: bigint;
  feeBps: number;
  status: number;
  evaluator: Address;
  amount: bigint;
  termsHash: Hex;
  deliverable: Hex;
};

const toJob = (id: number, j: RawJob): EscrowJob => ({
  id,
  client: j.client,
  provider: j.provider,
  evaluator: j.evaluator,
  amountUsdc: Number(j.amount) / 1e6,
  feeBps: Number(j.feeBps),
  status: ESCROW_STATUS[j.status] ?? "None",
  deadline: Number(j.deadline) * 1000,
  reviewPeriod: Number(j.reviewPeriod),
  reviewDeadline: Number(j.reviewDeadline) * 1000,
  termsHash: j.termsHash,
  deliverable: j.deliverable,
});

export async function escrowJob(id: number): Promise<EscrowJob | null> {
  const address = await escrowAddress();
  if (!address || !Number.isInteger(id) || id < 1) return null;
  const j = (await client().readContract({ address, abi: ESCROW_ABI, functionName: "getJob", args: [BigInt(id)] })) as RawJob;
  return j.status === 0 ? null : toJob(id, j);
}

/** The newest jobs, newest first. */
export async function recentJobs(limit = 20): Promise<EscrowJob[]> {
  const info = await escrowInfo();
  if (!info || info.jobs === 0) return [];
  const ids = Array.from({ length: Math.min(limit, info.jobs) }, (_, i) => info.jobs - i);
  const res = await client().multicall({
    allowFailure: true,
    contracts: ids.map((id) => ({ address: info.address, abi: ESCROW_ABI, functionName: "getJob", args: [BigInt(id)] })),
  });
  return ids.flatMap((id, i) => (res[i].status === "success" ? [toJob(id, res[i].result as unknown as RawJob)] : []));
}

/** Jobs where `wallet` is the client, the agent or the reviewer, newest first (scans the newest 500). */
export async function jobsOf(wallet: string, limit = 50): Promise<(EscrowJob & { role: "client" | "agent" | "reviewer" })[]> {
  const info = await escrowInfo();
  if (!info || info.jobs === 0) return [];
  const w = wallet.toLowerCase();
  const ids = Array.from({ length: Math.min(500, info.jobs) }, (_, i) => info.jobs - i);
  const res = await client().multicall({
    allowFailure: true,
    contracts: ids.map((id) => ({ address: info.address, abi: ESCROW_ABI, functionName: "getJob", args: [BigInt(id)] })),
  });
  const out: (EscrowJob & { role: "client" | "agent" | "reviewer" })[] = [];
  ids.forEach((id, i) => {
    if (res[i].status !== "success" || out.length >= limit) return;
    const j = toJob(id, res[i].result as unknown as RawJob);
    const role = j.client.toLowerCase() === w ? "client" : j.provider.toLowerCase() === w ? "agent" : j.evaluator.toLowerCase() === w ? "reviewer" : null;
    if (role) out.push({ ...j, role });
  });
  return out;
}

// ---------------------------------------------------------------------------
// Job texts (terms and deliverables) are kept off-chain; the chain stores their keccak256.

export const MAX_NOTE = 4000;
const noteKey = (hash: string) => `escrow-note:${hash.toLowerCase()}`;
export const noteHash = (text: string) => keccak256(toBytes(text));

/** Store a text under its hash (only if the hash matches). Kept for a year. */
export async function saveNote(text: string): Promise<Hex> {
  const hash = noteHash(text);
  await kvSet(noteKey(hash), text, 365 * 86_400);
  return hash;
}

export const readNote = (hash: string) => (/^0x[0-9a-fA-F]{64}$/.test(hash) ? kvGet<string>(noteKey(hash)).catch(() => null) : Promise.resolve(null));


/** Server time for rendering deadlines (read outside components). */
export const serverNow = () => Date.now();
