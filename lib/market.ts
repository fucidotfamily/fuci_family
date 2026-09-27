import { createHash } from "node:crypto";
import { X402_NETWORK } from "./config";
import { TOOLS, priceToNumber } from "./tools";
import { acquireLock, kvGet, kvSet, releaseLock } from "./store";
import type { Listing } from "./marketSearch";

export { searchMarket, type Listing } from "./marketSearch";

/**
 * Fuci Market: every paid API an agent can buy with USDC on Arc, over x402.
 *
 * Listings come from three public sources, and each one is checked live (it must answer
 * 402 Payment Required with an Arc USDC price) before it is shown:
 * - Fuci's own tools,
 * - ERC-8004 agents on Arc whose registration file lists an x402 service (a manifest or an endpoint),
 * - Coinbase's public x402 discovery catalogue, keeping the APIs that accept payment on Arc,
 * plus URLs that sellers submit on /market.
 */

export type Market = { listings: Listing[]; sellers: number; builtAt: number };

const KEY = "market:v2";
const SUBMITTED = "market:submitted:v1";
const STALE_MS = 30 * 60_000;
const CATALOGUE = "https://api.cdp.coinbase.com/platform/v2/x402/discovery/resources";
const MAX_PROBES = 150;

const NETWORK_NAMES: Record<string, string> = {
  [X402_NETWORK]: "Arc",
  "eip155:5042": "Arc",
  "eip155:8453": "Base",
  "eip155:84532": "Base Sepolia",
  "eip155:137": "Polygon",
  "eip155:42161": "Arbitrum",
  "eip155:10": "Optimism",
  "eip155:43114": "Avalanche",
  "eip155:1": "Ethereum",
  "eip155:5042002": "Arc Testnet",
  "eip155:480": "World Chain",
  "eip155:130": "Unichain",
  "eip155:146": "Sonic",
  "eip155:1329": "Sei",
  "eip155:999": "HyperEVM",
  "eip155:42220": "Celo",
  "eip155:56": "BNB Chain",
  "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp": "Solana",
  base: "Base",
  solana: "Solana",
};
const netName = (n: string) => NETWORK_NAMES[n] ?? (n.startsWith("algorand:") ? "Algorand" : n.startsWith("xrpl:") ? "XRPL" : n.startsWith("stellar:") ? "Stellar" : n.startsWith("solana:") ? "Solana" : n);
const isArc = (n: string) => n === X402_NETWORK || n === "eip155:5042";

type Accept = { network?: string; amount?: string; maxAmountRequired?: string; payTo?: string; asset?: string; description?: string; resource?: string };
type Required = { accepts?: Accept[]; resource?: { url?: string; description?: string } | string; description?: string };

export const listingId = (method: string, url: string) => createHash("sha256").update(`${method} ${url}`).digest("hex").slice(0, 16);

/** https only, no IP literals or local hosts: the market never calls into private networks. */
export function safeUrl(raw: string): URL | null {
  try {
    const url = new URL(raw);
    const host = url.hostname;
    if (url.protocol !== "https:" || host === "localhost" || /\.(local|internal|localhost)$/.test(host) || /^[\d.]+$/.test(host) || host.includes(":") || host.startsWith("[")) return null;
    return url;
  } catch {
    return null;
  }
}

async function getJson(url: URL, timeoutMs = 6000, maxBytes = 512_000): Promise<unknown> {
  const res = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(timeoutMs), headers: { accept: "application/json" }, cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  if (text.length > maxBytes) throw new Error("too large");
  return JSON.parse(text);
}

/** The Arc price an endpoint asks for, read from its 402 answer (x402 v2 header or v1 body). */
export async function probe(raw: string, method: "GET" | "POST" = "GET"): Promise<{ req: Required; arc: Accept } | null> {
  const url = safeUrl(raw);
  if (!url) return null;
  try {
    const res = await fetch(url, {
      method,
      redirect: "error",
      signal: AbortSignal.timeout(6000),
      headers: { accept: "application/json", ...(method === "POST" ? { "content-type": "application/json" } : {}) },
      body: method === "POST" ? "{}" : undefined,
      cache: "no-store",
    });
    if (res.status !== 402) return null;
    let req: Required | null = null;
    const header = res.headers.get("PAYMENT-REQUIRED") ?? res.headers.get("X-PAYMENT-REQUIRED");
    if (header) {
      try {
        req = JSON.parse(Buffer.from(header, "base64").toString("utf8")) as Required;
      } catch {
        req = null;
      }
    }
    if (!req?.accepts) req = ((await res.json().catch(() => null)) as Required | null) ?? null;
    const arc = req?.accepts?.find((a) => a.network && isArc(a.network) && a.payTo && Number(a.amount ?? a.maxAmountRequired) > 0);
    return arc && req ? { req, arc } : null;
  } catch {
    return null;
  }
}

const clean = (s: unknown, n: number) => (typeof s === "string" ? s.replace(/\s+/g, " ").trim().slice(0, n) : "");
const titleOf = (url: URL) => {
  const noise = /^(api|x402|paid|v\d+)$/i;
  const path = url.pathname.replace(/\/+$/, "").split("/").filter((p) => p && !noise.test(p)).slice(-2).join(" / ");
  return path ? path.replace(/[-_]/g, " ") : url.hostname;
};

type Candidate = {
  url: string;
  method: "GET" | "POST";
  name?: string;
  description?: string;
  seller: Listing["seller"];
  source: Listing["source"];
};

async function toListing(c: Candidate): Promise<Listing | null> {
  // URL templates ({mint}, :id) are not callable as listed.
  if (/%7B|[{}]|\/:/i.test(c.url)) return null;
  const hit = await probe(c.url, c.method);
  if (!hit) return null;
  const url = new URL(c.url);
  const resource = typeof hit.req.resource === "object" ? hit.req.resource : null;
  const amount = Number(hit.arc.amount ?? hit.arc.maxAmountRequired ?? 0);
  return {
    id: listingId(c.method, c.url),
    name: clean(c.name, 60) || titleOf(url),
    description: clean(c.description || resource?.description || hit.req.description || hit.arc.description, 280),
    url: c.url,
    method: c.method,
    priceUsdc: amount / 1e6,
    payTo: hit.arc.payTo!,
    networks: ["Arc", ...new Set((hit.req.accepts ?? []).map((a) => netName(a.network ?? "")).filter((n) => n && n !== "Arc"))],
    seller: c.seller,
    source: c.source,
    checkedAt: Date.now(),
  };
}

// ---------------------------------------------------------------------------
// Sources

function fuciListings(origin: string, payTo: string | null, agentId: number | null): Listing[] {
  if (!payTo) return [];
  return TOOLS.map((t) => ({
    id: listingId(t.method, `${origin}${t.path}`),
    name: t.name,
    description: t.description,
    url: `${origin}${t.path}`,
    method: t.method,
    priceUsdc: priceToNumber(t.price),
    payTo,
    networks: ["Arc"],
    seller: { name: "Fuci", host: new URL(origin).host, agentId },
    source: "fuci" as const,
    checkedAt: Date.now(),
  }));
}

type ManifestResource = { url?: string; resource?: string; name?: string; description?: string; method?: string };

/** Candidates from ERC-8004 agents on Arc that list an x402 service. */
async function agentCandidates(skipHost: string): Promise<Candidate[]> {
  const { storedIndex } = await import("./agentIndex");
  const index = (await storedIndex()).index;
  const agents = (index?.agents ?? []).filter((a) => a.x402 && a.url && a.host && a.host !== skipHost);
  const out: Candidate[] = [];
  await Promise.all(
    agents.slice(0, 40).map(async (a) => {
      const cardUrl = safeUrl(a.url!);
      if (!cardUrl) return;
      const card = (await getJson(cardUrl).catch(() => null)) as { services?: unknown; endpoints?: unknown } | null;
      const services = (Array.isArray(card?.services) ? card.services : Array.isArray(card?.endpoints) ? card.endpoints : []) as { name?: string; endpoint?: string }[];
      const seller = { name: a.name ?? a.host!, host: a.host!, agentId: a.agentId };
      for (const s of services.filter((s) => typeof s?.endpoint === "string" && /x402/i.test(s.name ?? "")).slice(0, 4)) {
        const u = safeUrl(s.endpoint!);
        if (!u) continue;
        // A manifest lists many paid resources; anything else is a paid endpoint itself.
        const manifest = (await getJson(u).catch(() => null)) as { resources?: ManifestResource[]; items?: ManifestResource[]; routes?: { pattern?: string; description?: string }[] } | null;
        // Route lists ("GET /v1/paid/x") are relative to the manifest's host; routes with path parameters are skipped.
        const routes = (manifest?.routes ?? []).flatMap((r): ManifestResource[] => {
          const m = /^(GET|POST)\s+(\/\S*)$/.exec(r.pattern ?? "");
          return m && !/[:{*]/.test(m[2]) ? [{ url: new URL(m[2], u).toString(), method: m[1], description: r.description }] : [];
        });
        const resources = manifest?.resources ?? manifest?.items ?? (routes.length ? routes : undefined);
        if (Array.isArray(resources)) {
          for (const r of resources.slice(0, 25)) {
            const url = r.url ?? r.resource;
            if (typeof url === "string" && safeUrl(url)) out.push({ url, method: r.method?.toUpperCase() === "POST" ? "POST" : "GET", name: r.name, description: r.description, seller, source: "erc8004" });
          }
        } else {
          out.push({ url: u.toString(), method: "GET", seller, source: "erc8004" });
        }
      }
    }),
  );
  return out;
}

type CatalogueItem = { resource?: string; description?: string; accepts?: Accept[]; extensions?: { bazaar?: { info?: { input?: { method?: string } } } } };

/** Candidates from Coinbase's public x402 catalogue that accept USDC on Arc. */
async function catalogueCandidates(): Promise<Candidate[]> {
  const out: Candidate[] = [];
  for (let offset = 0; offset < 30_000; offset += 1000) {
    const page = (await getJson(new URL(`${CATALOGUE}?limit=1000&offset=${offset}`), 20_000, 16_000_000).catch(() => null)) as { items?: CatalogueItem[] } | null;
    const items = page?.items ?? [];
    for (const it of items) {
      if (!it.resource || !(it.accepts ?? []).some((a) => a.network && isArc(a.network))) continue;
      const u = safeUrl(it.resource);
      if (!u) continue;
      const method = it.extensions?.bazaar?.info?.input?.method?.toUpperCase() === "POST" ? "POST" : "GET";
      out.push({ url: u.toString(), method, description: it.description, seller: { name: u.hostname.replace(/^(api|www)\./, ""), host: u.hostname, agentId: null }, source: "catalogue" });
    }
    if (items.length < 1000) break;
  }
  return out;
}

// ---------------------------------------------------------------------------

async function mapLimit<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx]);
      }
    }),
  );
  return out;
}

/** The market from storage (fast). `stale` asks for a rebuild. */
export async function getMarket(): Promise<{ market: Market | null; stale: boolean }> {
  const market = await kvGet<Market>(KEY).catch(() => null);
  return { market, stale: !market || Date.now() - market.builtAt > STALE_MS };
}

/** Re-discover and re-check every listing. One run at a time. */
export async function rebuildMarket(origin: string): Promise<Market | null> {
  if (!(await acquireLock("market", 300))) return null;
  try {
    const { sellerAddress } = await import("./circle");
    const { getHouseAgentId } = await import("./erc8004");
    const [payTo, houseId] = await Promise.all([sellerAddress().catch(() => null), getHouseAgentId().catch(() => null)]);
    const host = new URL(origin).host;
    const submitted = ((await kvGet<Candidate[]>(SUBMITTED).catch(() => null)) ?? []).map((c) => ({ ...c, source: "submitted" as const }));
    const [agents, catalogue] = await Promise.all([agentCandidates(host).catch(() => []), catalogueCandidates().catch(() => [])]);
    // One candidate per endpoint: agent-listed first (they carry an on-chain identity).
    const seen = new Set<string>();
    const candidates = [...agents, ...submitted, ...catalogue].filter((c) => {
      const k = listingId(c.method, c.url);
      if (seen.has(k) || c.url.startsWith(origin)) return false;
      seen.add(k);
      return true;
    });
    const checked = (await mapLimit(candidates.slice(0, MAX_PROBES), 10, toListing)).filter((l): l is Listing => l !== null);
    const listings = [...fuciListings(origin, payTo, houseId ?? null), ...checked];
    const market: Market = { listings, sellers: new Set(listings.map((l) => l.seller.host)).size, builtAt: Date.now() };
    await kvSet(KEY, market);
    return market;
  } finally {
    await releaseLock("market");
  }
}

/** A seller adds an endpoint: it must answer 402 with an Arc USDC price right now. */
export async function submitListing(raw: string, method: "GET" | "POST"): Promise<Listing | { error: string }> {
  const url = safeUrl(raw.trim());
  if (!url) return { error: "Use a public https URL." };
  const listing = await toListing({ url: url.toString(), method, seller: { name: url.hostname.replace(/^(api|www)\./, ""), host: url.hostname, agentId: null }, source: "submitted" });
  if (!listing) return { error: "That URL did not answer 402 Payment Required with a USDC price on Arc." };
  const list = (await kvGet<Candidate[]>(SUBMITTED).catch(() => null)) ?? [];
  if (!list.some((c) => listingId(c.method, c.url) === listing.id)) {
    list.unshift({ url: listing.url, method, seller: listing.seller, source: "submitted" });
    await kvSet(SUBMITTED, list.slice(0, 200));
  }
  // Show it right away.
  const { market } = await getMarket();
  if (market && !market.listings.some((l) => l.id === listing.id)) {
    market.listings.push(listing);
    market.sellers = new Set(market.listings.map((l) => l.seller.host)).size;
    await kvSet(KEY, market);
  }
  return listing;
}
