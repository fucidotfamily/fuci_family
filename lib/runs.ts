import { keccak256, toHex, type Hex } from "viem";
import { kvGet, kvSet } from "./store";
import type { RunResult } from "./agent";

/**
 * Agent runs, stored so they can be validated on ERC-8004. A run's hash
 * (keccak256 of its canonical JSON) is the validation `requestHash`, and
 * /api/runs/<hash> serves it as the `requestURI`.
 */
export type StoredRun = {
  hash: Hex;
  agent: string;
  prompt: string;
  wallet: string;
  spentUsdc: number;
  brief: string;
  data: Record<string, unknown>;
  at: number;
};

const TTL = 60 * 60 * 24 * 180;

export async function saveRun(prompt: string, r: RunResult): Promise<Hex | null> {
  if (!Object.keys(r.data).length) return null;
  const body = { agent: r.agent, prompt, wallet: r.wallet, spentUsdc: r.spentUsdc, brief: r.brief, data: r.data, at: Date.now() };
  const hash = keccak256(toHex(JSON.stringify(body)));
  await kvSet(`run:${hash}`, { hash, ...body } satisfies StoredRun, TTL);
  return hash;
}

export const isHash = (s: string): s is Hex => /^0x[0-9a-fA-F]{64}$/.test(s);
export const getRun = (hash: Hex) => kvGet<StoredRun>(`run:${hash.toLowerCase()}`);
