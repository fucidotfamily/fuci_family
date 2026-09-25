import { parseEventLogs, type Address, type Hex, type TransactionReceipt } from "viem";
import { ARC_CHAIN, ARC_NETWORK, EXPLORER_URL } from "./config";
import { readClient } from "./chain";
import { kvGet, kvSet } from "./store";

export * from "./erc8004Abi";
import { ERC8004, IDENTITY_ABI, REPUTATION_ABI, VALIDATION_ABI } from "./erc8004Abi";

/** CAIP-10-style registry reference used in agent registration files. */
export const AGENT_REGISTRY_REF = `eip155:${ARC_CHAIN.id}:${ERC8004.identity}`;
export const explorerAgent = (agentId: number) => `${EXPLORER_URL}/token/${ERC8004.identity}/instance/${agentId}`;

const client = () => readClient(ARC_CHAIN);

// Small per-instance cache for registry reads.
const cache = new Map<string, { at: number; value: unknown }>();
async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as T;
  const value = await fn();
  cache.set(key, { at: Date.now(), value });
  return value;
}

// ---------------------------------------------------------------------------
// Identity

const HOUSE_KEY = `erc8004:${ARC_NETWORK}:house`;
export const getHouseAgentId = () => kvGet<number>(HOUSE_KEY);
export const setHouseAgentId = (id: number) => kvSet(HOUSE_KEY, id);

/** The agentId minted to `to` in a registration receipt (from the registry's Transfer event). */
export function mintedAgentId(receipt: TransactionReceipt, to?: Address): number | null {
  const logs = parseEventLogs({ abi: IDENTITY_ABI, eventName: "Transfer", logs: receipt.logs }).filter(
    (l) =>
      l.address.toLowerCase() === ERC8004.identity.toLowerCase() &&
      /^0x0+$/.test(l.args.from) &&
      (!to || l.args.to.toLowerCase() === to.toLowerCase()),
  );
  return logs.length ? Number(logs[logs.length - 1].args.tokenId) : null;
}

export async function readAgent(agentId: number) {
  const [owner, uri] = await Promise.all([
    client().readContract({ address: ERC8004.identity, abi: IDENTITY_ABI, functionName: "ownerOf", args: [BigInt(agentId)] }),
    client().readContract({ address: ERC8004.identity, abi: IDENTITY_ABI, functionName: "tokenURI", args: [BigInt(agentId)] }),
  ]);
  return { agentId, owner, uri };
}

// ---------------------------------------------------------------------------
// Reputation

export type Reputation = { count: number; score: number | null; clients: number };

export function reputationOf(agentId: number): Promise<Reputation> {
  return cached(`rep:${agentId}`, 60_000, async () => {
    const clients = await client().readContract({ address: ERC8004.reputation, abi: REPUTATION_ABI, functionName: "getClients", args: [BigInt(agentId)] });
    if (!clients.length) return { count: 0, score: null, clients: 0 };
    const [count, value, decimals] = await client().readContract({
      address: ERC8004.reputation,
      abi: REPUTATION_ABI,
      functionName: "getSummary",
      args: [BigInt(agentId), [...clients], "", ""],
    });
    return { count: Number(count), score: Number(value) / 10 ** decimals, clients: clients.length };
  });
}

// ---------------------------------------------------------------------------
// Validation

export type ValidationStatus = {
  requestHash: Hex;
  validator: Address;
  agentId: number;
  response: number;
  tag: string;
  lastUpdate: number;
  responded: boolean;
};

export async function validationStatus(requestHash: Hex): Promise<ValidationStatus | null> {
  const [validator, agentId, response, responseHash, tag, lastUpdate] = await client().readContract({
    address: ERC8004.validation,
    abi: VALIDATION_ABI,
    functionName: "getValidationStatus",
    args: [requestHash],
  });
  if (/^0x0+$/.test(validator)) return null;
  return { requestHash, validator, agentId: Number(agentId), response, tag, lastUpdate: Number(lastUpdate), responded: tag !== "" || !/^0x0+$/.test(responseHash) };
}

export function validationsOf(agentId: number, limit = 10): Promise<ValidationStatus[]> {
  return cached(`val:${agentId}`, 30_000, async () => {
    const hashes = await client().readContract({ address: ERC8004.validation, abi: VALIDATION_ABI, functionName: "getAgentValidations", args: [BigInt(agentId)] });
    const recent = [...hashes].reverse().slice(0, limit);
    const out = await Promise.all(recent.map((h) => validationStatus(h).catch(() => null)));
    return out.filter((v): v is ValidationStatus => v !== null);
  });
}

// ---------------------------------------------------------------------------
// Registry size (ids are sequential from 0). The searchable directory is in lib/agentIndex.ts.

async function agentExists(id: number) {
  return client()
    .readContract({ address: ERC8004.identity, abi: IDENTITY_ABI, functionName: "ownerOf", args: [BigInt(id)] })
    .then(() => true)
    .catch(() => false);
}

/** Number of registered agents, found by exponential + binary search over ownerOf. */
export function agentCount(): Promise<number> {
  return cached("count", 120_000, async () => {
    if (!(await agentExists(0))) return 0;
    let lo = 0;
    let hi = 1;
    while (await agentExists(hi)) {
      lo = hi;
      hi *= 2;
      if (hi > 1 << 24) break;
    }
    while (hi - lo > 1) {
      const mid = Math.floor((lo + hi) / 2);
      if (await agentExists(mid)) lo = mid;
      else hi = mid;
    }
    return lo + 1;
  });
}
