import crypto from "node:crypto";
import type { Address } from "viem";
import { ARC_CHAIN, ARC_NETWORK, SITE_URL } from "./config";
import { readClient } from "./chain";
import { ERC8004, IDENTITY_ABI, REPUTATION_ABI, VALIDATION_ABI, agentCount, getHouseAgentId } from "./erc8004";
import { getAgent, kvGet, kvSet, pushHistory, saveAgent } from "./store";
import { COMPLETENESS_CHECKS, type IndexedAgent } from "./agentQuery";

export { queryIndex, type IndexedAgent, type SortKey } from "./agentQuery";

/**
 * The searchable, ranked directory of every ERC-8004 agent on Arc.
 *
 * Rank score (0–100):
 *   x402 support        40  (registration file sets x402Support: true)
 *   completeness        50  (8-point checklist over the registration file, below)
 *   on-chain trust      10  (5 for reputation feedback, 5 for a validation)
 *   built on Fuci      +10  (card served by Fuci), capped at 100
 * Ties: more ratings first, then the newest agent.
 */

export type AgentIndex = { network: string; total: number; builtAt: number; agents: IndexedAgent[] };

const INDEX_KEY = `erc8004:${ARC_NETWORK}:index:v2`;
const STALE_MS = 10 * 60_000;
const client = () => readClient(ARC_CHAIN);

/** The stored index, and whether it is due for a rebuild. */
export async function storedIndex(): Promise<{ index: AgentIndex | null; stale: boolean }> {
  const index = await kvGet<AgentIndex>(INDEX_KEY).catch(() => null);
  return { index, stale: !index || Date.now() - index.builtAt > STALE_MS };
}

export async function rebuildIndex(): Promise<AgentIndex> {
  const index = await buildIndex();
  await kvSet(INDEX_KEY, index);
  return index;
}

// ---------------------------------------------------------------------------

async function multicallAll<T>(calls: readonly object[], batch = 100): Promise<({ status: "success"; result: T } | { status: "failure" })[]> {
  const out: ({ status: "success"; result: T } | { status: "failure" })[] = [];
  for (let i = 0; i < calls.length; i += batch) {
    const res = await client().multicall({ allowFailure: true, contracts: calls.slice(i, i + batch) as never });
    out.push(...(res as typeof out));
  }
  return out;
}

async function buildIndex(): Promise<AgentIndex> {
  const total = await agentCount();
  const ids = Array.from({ length: total }, (_, i) => i);
  const big = ids.map(BigInt);

  const [owners, uris, clients, validations] = await Promise.all([
    multicallAll<Address>(big.map((id) => ({ address: ERC8004.identity, abi: IDENTITY_ABI, functionName: "ownerOf", args: [id] }))),
    multicallAll<string>(big.map((id) => ({ address: ERC8004.identity, abi: IDENTITY_ABI, functionName: "tokenURI", args: [id] }))),
    multicallAll<readonly Address[]>(big.map((id) => ({ address: ERC8004.reputation, abi: REPUTATION_ABI, functionName: "getClients", args: [id] }))),
    multicallAll<readonly `0x${string}`[]>(big.map((id) => ({ address: ERC8004.validation, abi: VALIDATION_ABI, functionName: "getAgentValidations", args: [id] }))),
  ]);

  // Reputation summaries only for agents that have feedback.
  const rated = ids.filter((i) => clients[i]?.status === "success" && (clients[i] as { result: readonly Address[] }).result.length > 0);
  const summaries = await multicallAll<readonly [bigint, bigint, number]>(
    rated.map((i) => ({
      address: ERC8004.reputation,
      abi: REPUTATION_ABI,
      functionName: "getSummary",
      args: [BigInt(i), [...(clients[i] as { result: readonly Address[] }).result], "", ""],
    })),
  );
  const reputation = new Map<number, { count: number; score: number | null }>();
  rated.forEach((id, k) => {
    const s = summaries[k];
    if (s?.status === "success") reputation.set(id, { count: Number(s.result[0]), score: Number(s.result[1]) / 10 ** s.result[2] });
  });

  const uriOf = (i: number) => (uris[i]?.status === "success" ? (uris[i] as { result: string }).result : null);
  const cards = await mapLimit(ids, 12, async (i) => {
    const uri = uriOf(i);
    return uri ? fetchCard(uri, 3_000) : null;
  });
  // Slow hosts time out under parallel load; give failed https cards one gentler retry.
  const retry = ids.filter((i) => !cards[i] && uriOf(i)?.startsWith("https://"));
  await mapLimit(retry, 4, async (i) => {
    cards[i] = await fetchCard(uriOf(i)!, 6_000);
  });

  // Self-heal: a frond whose owner minted its identity but never finished linking it on the site.
  const linked = new Set<number>();
  for (const id of ids) {
    const frondId = fuciFrondId(uriOf(id));
    const owner = owners[id]?.status === "success" ? (owners[id] as { result: Address }).result : null;
    if (!frondId || !owner || cards[id]?.registeredIds.includes(id)) continue;
    const frond = await getAgent(frondId).catch(() => null);
    if (frond && frond.erc8004Id === undefined && frond.owner.toLowerCase() === owner.toLowerCase()) {
      frond.erc8004Id = id;
      await saveAgent(frond);
      await pushHistory(frond.id, { kind: "identity", label: `Registered on ERC-8004 as agent #${id}` });
      await forgetCard(uriOf(id)!);
      linked.add(id);
    }
  }

  const agents: IndexedAgent[] = ids.map((id) => {
    const uri = uriOf(id);
    const card = cards[id];
    const checks = [
      Boolean(card),
      Boolean(card?.name),
      Boolean(card?.description),
      Boolean(card?.image),
      (card?.services ?? 0) > 0,
      Boolean(card?.x402Support),
      // A frond linked during this build serves its registration from now on.
      Boolean(card?.registeredIds.includes(id)) || linked.has(id),
      Boolean(card?.trust),
    ];
    const complete = checks.filter(Boolean).length;
    const rep = reputation.get(id) ?? null;
    const vals = validations[id]?.status === "success" ? (validations[id] as { result: readonly string[] }).result.length : 0;
    const x402 = Boolean(card?.x402Support);
    const host = uri ? hostOf(uri) : null;
    const fuci = Boolean(host && FUCI_HOSTS.has(host));
    const bonus = fuci ? FUCI_BONUS : 0;
    const score = Math.min(100, Math.round((x402 ? 40 : 0) + (50 * complete) / checks.length + (rep && rep.count > 0 ? 5 : 0) + (vals > 0 ? 5 : 0) + bonus));
    return {
      agentId: id,
      owner: owners[id]?.status === "success" ? (owners[id] as { result: Address }).result : null,
      host,
      url: uri && /^https:\/\//.test(uri) ? uri.slice(0, 300) : null,
      fuci,
      bonus,
      image: typeof card?.image === "string" ? card.image : null,
      name: card?.name ?? null,
      description: card?.description ?? null,
      x402,
      complete,
      missing: COMPLETENESS_CHECKS.filter((_, k) => !checks[k]),
      reputation: rep,
      validations: vals,
      score,
      rank: 0,
    };
  });

  // Fuci's house agent runs the site behind the scenes; the directory shows the agents people made.
  const house = await getHouseAgentId().catch(() => null);
  const listed = agents.filter((a) => a.agentId !== house);

  [...listed]
    .sort((a, b) => b.score - a.score || (b.reputation?.count ?? 0) - (a.reputation?.count ?? 0) || b.agentId - a.agentId)
    .forEach((a, i) => (a.rank = i + 1));

  return { network: ARC_NETWORK, total: listed.length, builtAt: Date.now(), agents: listed };
}

// ---------------------------------------------------------------------------
// Registration files

async function mapLimit<T, R>(items: T[], n: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    }),
  );
  return out;
}

const SITE_HOST = (() => {
  try {
    return new URL(SITE_URL).hostname;
  } catch {
    return null;
  }
})();

/** Hosts that serve Fuci agent cards (current and earlier domains). */
const FUCI_HOSTS = new Set(["www.fuci.family", "fuci.family", "fuci.vercel.app", ...(SITE_HOST ? [SITE_HOST] : [])]);
const FUCI_BONUS = 10;

const hostOf = (uri: string) => {
  if (uri.startsWith("data:")) return "inline";
  if (uri.startsWith("ipfs://")) return "ipfs";
  try {
    return new URL(uri).hostname;
  } catch {
    return null;
  }
};

type Card = {
  name: string | null;
  description: string | null;
  /** Safe image URL (https or small inline data URI); older cached cards stored a boolean. */
  image: string | boolean | null;
  services: number;
  x402Support: boolean;
  trust: boolean;
  /** agentIds this file lists under `registrations` for this registry. */
  registeredIds: number[];
};

/** The spawned-frond id when `uri` is a card served by this Fuci site (/api/agent/<id>/card). */
function fuciFrondId(uri: string | null) {
  if (!uri || !SITE_HOST) return null;
  try {
    const u = new URL(uri);
    return FUCI_HOSTS.has(u.hostname) ? (/^\/api\/agent\/([^/]+)\/card$/.exec(u.pathname)?.[1] ?? null) : null;
  } catch {
    return null;
  }
}

const cardKey = (uri: string) => `card2:${crypto.createHash("sha256").update(uri).digest("hex").slice(0, 32)}`;

/** Drop a cached registration file (e.g. after its agent was linked to an ERC-8004 id). */
export const forgetCard = (uri: string) => kvSet(cardKey(uri), null, 1).catch(() => undefined);

/** Successful reads are cached in Redis for an hour; failures are retried on the next build. */
async function fetchCard(uri: string, timeoutMs: number): Promise<Card | null> {
  const key = cardKey(uri);
  // Fuci's own cards are always read fresh, so a rename or new image shows on the next rebuild.
  const own = (() => {
    try {
      return FUCI_HOSTS.has(new URL(uri).hostname);
    } catch {
      return false;
    }
  })();
  const hit = own ? null : await kvGet<Card>(key).catch(() => null);
  if (hit) return hit;
  try {
    const card = await readCard(uri, timeoutMs);
    await kvSet(key, card, 3600).catch(() => undefined);
    return card;
  } catch {
    return null;
  }
}

/** An image URL we can show: https, ipfs (via a public gateway), or a small inline data:image. */
function safeImage(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (s.startsWith("data:image/")) return s.length <= 20_000 ? s : null;
  if (s.startsWith("ipfs://")) return `https://ipfs.io/ipfs/${s.slice(7)}`.slice(0, 500);
  return /^https:\/\/[^\s"']+$/.test(s) && s.length <= 500 ? s : null;
}

type CardFile = {
  name?: unknown;
  description?: unknown;
  image?: unknown;
  services?: unknown;
  endpoints?: unknown;
  x402Support?: unknown;
  x402support?: unknown;
  supportedTrust?: unknown;
  registrations?: unknown;
};

/**
 * Read an agent's registration file. Only https (and ipfs via a public gateway) or inline data:
 * URIs; no IP-literal or local hosts, no redirects, 64 KB max.
 */
async function readCard(uri: string, timeoutMs: number): Promise<Card> {
  let json: CardFile;
  if (uri.startsWith("data:")) {
    const [meta, payload = ""] = uri.slice(5).split(",", 2);
    json = JSON.parse(meta.includes("base64") ? Buffer.from(payload, "base64").toString("utf8") : decodeURIComponent(payload));
  } else {
    const url = new URL(uri.startsWith("ipfs://") ? `https://ipfs.io/ipfs/${uri.slice(7)}` : uri);
    const host = url.hostname;
    const blocked = url.protocol !== "https:" || host === "localhost" || /\.(local|internal)$/.test(host) || /^[\d.]+$/.test(host) || host.includes(":") || host.startsWith("[");
    if (blocked) throw new Error("URI not allowed");
    const res = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(timeoutMs), headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    if (text.length > 65_536) throw new Error("too large");
    json = JSON.parse(text);
  }
  if (!json || typeof json !== "object") throw new Error("not a JSON object");
  const str = (v: unknown, n: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, n) : null);
  const services = Array.isArray(json.services) ? json.services : Array.isArray(json.endpoints) ? json.endpoints : [];
  const registrations = Array.isArray(json.registrations) ? json.registrations : [];
  const registry = ERC8004.identity.toLowerCase();
  return {
    name: str(json.name, 80),
    description: str(json.description, 240),
    image: safeImage(json.image),
    services: services.filter((s) => s && typeof s === "object" && typeof (s as { endpoint?: unknown }).endpoint === "string").length,
    x402Support: json.x402Support === true || json.x402support === true,
    trust: Array.isArray(json.supportedTrust) && json.supportedTrust.length > 0,
    registeredIds: registrations
      .filter((r) => r && typeof r === "object" && String((r as { agentRegistry?: unknown }).agentRegistry ?? "").toLowerCase().endsWith(registry))
      .map((r) => Number((r as { agentId?: unknown }).agentId))
      .filter((n) => Number.isInteger(n)),
  };
}
