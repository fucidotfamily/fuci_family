import { band, clamp100, DAY, finish, pct, usd, type Factor, type Grade, type RiskReport } from "./score";

/**
 * Risk report for a DeFi protocol, from DefiLlama's public API: the protocol record (audits, listing
 * date, TVL, chains, governance), its hack history and its yield pools. Nothing is estimated: a field
 * DefiLlama doesn't have becomes an unknown factor.
 */

type LlamaListItem = {
  id: string;
  name: string;
  slug: string;
  category?: string | null;
  chains?: string[];
  tvl?: number | null;
  change_7d?: number | null;
  audits?: string | null;
  audit_links?: string[] | null;
  listedAt?: number | null;
  logo?: string | null;
  url?: string | null;
  forkedFrom?: string[] | null;
  parentProtocol?: string | null;
};
type LlamaDetail = { governanceID?: string[] | null; oracles?: string[] | null; openSource?: boolean | null; github?: string[] | null; description?: string | null };
type Hack = { date: number; name: string; classification?: string; technique?: string; amount?: number | null; returnedFunds?: number | null; defillamaId?: string | number | null };
type Pool = { project: string; chain: string; symbol: string; tvlUsd: number; apy: number | null; apyBase: number | null; apyReward: number | null; outlier?: boolean };

export type ProtocolHit = { slug: string; name: string; category: string | null; tvl: number; chains: string[]; logo: string | null; onArc: boolean };

const TTL = 60 * 60 * 1000;
const mem = new Map<string, { at: number; v: unknown }>();
async function cachedJson<T>(url: string, ttl = TTL): Promise<T> {
  const hit = mem.get(url);
  if (hit && Date.now() - hit.at < ttl) return hit.v as T;
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(20_000), headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`${new URL(url).host} answered ${res.status}`);
  const v = (await res.json()) as T;
  mem.set(url, { at: Date.now(), v });
  return v;
}

const slim = (p: LlamaListItem): LlamaListItem => ({
  id: p.id,
  name: p.name,
  slug: p.slug,
  category: p.category ?? null,
  chains: p.chains ?? [],
  tvl: p.tvl ?? null,
  change_7d: p.change_7d ?? null,
  audits: p.audits ?? null,
  audit_links: p.audit_links ?? null,
  listedAt: p.listedAt ?? null,
  logo: p.logo ?? null,
  url: p.url ?? null,
  forkedFrom: p.forkedFrom ?? null,
  parentProtocol: p.parentProtocol ?? null,
});

/** Every DefiLlama protocol (slimmed), cached for an hour in memory and in KV. */
export async function protocols(): Promise<LlamaListItem[]> {
  const hit = mem.get("protocols");
  if (hit && Date.now() - hit.at < TTL) return hit.v as LlamaListItem[];
  const { kvGet, kvSet } = await import("../store");
  const stored = await kvGet<{ at: number; list: LlamaListItem[] }>("risk:llama:protocols:v1").catch(() => null);
  if (stored && Date.now() - stored.at < TTL) {
    mem.set("protocols", { at: stored.at, v: stored.list });
    return stored.list;
  }
  const list = (await cachedJson<LlamaListItem[]>("https://api.llama.fi/protocols")).map(slim);
  mem.set("protocols", { at: Date.now(), v: list });
  await kvSet("risk:llama:protocols:v1", { at: Date.now(), list }, 2 * 3600).catch(() => undefined);
  return list;
}

const hitOf = (p: LlamaListItem): ProtocolHit => ({
  slug: p.slug,
  name: p.name,
  category: p.category ?? null,
  tvl: p.tvl ?? 0,
  chains: p.chains ?? [],
  logo: p.logo ?? null,
  onArc: (p.chains ?? []).includes("Arc"),
});

/** Protocols matching `q` by name or slug, Arc ones first, then by TVL. */
export async function searchProtocols(q: string, limit = 8): Promise<ProtocolHit[]> {
  const s = q.trim().toLowerCase();
  if (s.length < 2) return [];
  const list = await protocols();
  return list
    .filter((p) => p.name.toLowerCase().includes(s) || p.slug.includes(s))
    .sort((a, b) => {
      const exact = Number(b.name.toLowerCase() === s || b.slug === s) - Number(a.name.toLowerCase() === s || a.slug === s);
      if (exact) return exact;
      const arc = Number((b.chains ?? []).includes("Arc")) - Number((a.chains ?? []).includes("Arc"));
      return arc || (b.tvl ?? 0) - (a.tvl ?? 0);
    })
    .slice(0, limit)
    .map(hitOf);
}

/** The largest protocols on Arc, for the quick picks on /risk. */
export async function arcProtocols(limit = 12): Promise<ProtocolHit[]> {
  const list = await protocols();
  return list
    .filter((p) => (p.chains ?? []).includes("Arc") && (p.tvl ?? 0) > 0)
    .sort((a, b) => (b.tvl ?? 0) - (a.tvl ?? 0))
    .slice(0, limit)
    .map(hitOf);
}

export class ProtocolNotFound extends Error {}

export async function protocolRisk(slug: string): Promise<RiskReport> {
  const list = await protocols();
  const p = list.find((x) => x.slug === slug.toLowerCase());
  if (!p) throw new ProtocolNotFound(`No DefiLlama protocol with slug "${slug}"`);

  const [ownDetail, parentDetail, hacks, pools] = await Promise.all([
    cachedJson<LlamaDetail>(`https://api.llama.fi/protocol/${p.slug}`).catch(() => null),
    // Governance is often recorded on the parent (e.g. "Balancer" for "Balancer V2").
    p.parentProtocol ? cachedJson<LlamaDetail>(`https://api.llama.fi/protocol/${p.parentProtocol.replace(/^parent#/, "")}`).catch(() => null) : Promise.resolve(null),
    cachedJson<Hack[]>("https://api.llama.fi/hacks").catch(() => null),
    cachedJson<{ data: Pool[] }>("https://yields.llama.fi/pools").then((r) => r.data.filter((x) => x.project === p.slug)).catch(() => null),
  ]);
  const detail: LlamaDetail | null = ownDetail
    ? { ...ownDetail, governanceID: ownDetail.governanceID?.length ? ownDetail.governanceID : (parentDetail?.governanceID ?? null), oracles: ownDetail.oracles?.length ? ownDetail.oracles : (parentDetail?.oracles ?? null) }
    : parentDetail;
  const llamaUrl = `https://defillama.com/protocol/${p.slug}`;
  const factors: Factor[] = [];
  const redFlags: string[] = [];
  const caps: { grade: Grade; reason: string }[] = [];

  // 1. Audits
  const audits = p.audits === null || p.audits === undefined ? null : Number(p.audits);
  const links = p.audit_links ?? [];
  factors.push({
    key: "audits",
    label: "Audits",
    weight: 25,
    score: audits === null || Number.isNaN(audits) ? null : audits <= 0 ? 10 : audits === 1 ? 60 : audits === 2 ? 85 : 95,
    summary:
      audits === null || Number.isNaN(audits)
        ? "DefiLlama has no audit information for this protocol."
        : audits <= 0
          ? "No audit is listed. Unaudited code carries a higher risk of bugs."
          : `${audits} audit${audits === 1 ? "" : "s"} listed${links.length ? ` with ${links.length} public report link${links.length === 1 ? "" : "s"}` : ""}.`,
    details: ["Audits lower the chance of bugs but never remove it; audited protocols have still been exploited."],
    evidence: links.slice(0, 4).map((l, i) => ({ label: `Audit report ${i + 1}`, href: l })),
  });
  if (audits === 0) redFlags.push("No audit listed");

  // 2. Security history (hacks recorded by DefiLlama)
  const mine = hacks?.filter((h) => String(h.defillamaId ?? "") === String(p.id) || h.name.toLowerCase() === p.name.toLowerCase()) ?? null;
  const lastHack = mine?.length ? mine.reduce((a, b) => (b.date > a.date ? b : a)) : null;
  const lastAgoDays = lastHack ? (Date.now() - lastHack.date * 1000) / DAY : null;
  factors.push({
    key: "history",
    label: "Security history",
    weight: 20,
    score: mine === null ? null : !lastHack ? 90 : lastAgoDays! < 365 ? 15 : lastAgoDays! < 3 * 365 ? 45 : 60,
    summary:
      mine === null
        ? "Couldn't load DefiLlama's hack database right now."
        : !lastHack
          ? "No hack or exploit is recorded for this protocol."
          : `${mine.length} incident${mine.length === 1 ? "" : "s"} recorded; the latest was ${Math.round(lastAgoDays!)} days ago${lastHack.amount ? ` (${usd(lastHack.amount)} lost)` : ""}.`,
    details: [...(mine ?? [])].sort((a, b) => b.date - a.date).slice(0, 3).map((h) => `${new Date(h.date * 1000).toISOString().slice(0, 10)}: ${h.classification ?? "Exploit"}${h.technique ? ` (${h.technique})` : ""}${h.amount ? `, ${usd(h.amount)}` : ""}${h.returnedFunds ? `, ${usd(h.returnedFunds)} returned` : ""}`),
    evidence: [{ label: "DefiLlama hacks database", href: "https://defillama.com/hacks" }],
  });
  if (lastHack && lastAgoDays! < 365) {
    redFlags.push(`Exploited within the last year (${Math.round(lastAgoDays!)} days ago)`);
    caps.push({ grade: "C", reason: "an exploit in the last 12 months" });
  }

  // 3. Track record (time since DefiLlama listed it)
  const ageDays = p.listedAt ? (Date.now() - p.listedAt * 1000) / DAY : null;
  factors.push({
    key: "age",
    label: "Track record",
    weight: 15,
    score: ageDays === null ? null : band(ageDays, [[30, 15], [90, 35], [365, 60], [2 * 365, 80]], 95),
    summary: ageDays === null ? "DefiLlama has no listing date for this protocol." : `Tracked for ${ageDays < 60 ? `${Math.round(ageDays)} days` : `${(ageDays / 365).toFixed(1)} years`}. Longer without incident means more battle-tested code.`,
    details: p.forkedFrom?.length ? [`Forked from ${p.forkedFrom.join(", ")}.`] : [],
  });

  // 4. TVL depth and stability
  const tvl = p.tvl ?? null;
  const ch7 = p.change_7d ?? null;
  let tvlScore = tvl === null ? null : band(tvl, [[1e5, 15], [1e6, 35], [1e7, 55], [1e8, 75], [1e9, 88]], 95);
  if (tvlScore !== null && ch7 !== null && Math.abs(ch7) > 30) tvlScore = clamp100(tvlScore - 20);
  factors.push({
    key: "tvl",
    label: "TVL depth & stability",
    weight: 20,
    score: tvlScore,
    summary: tvl === null ? "No TVL data." : `${usd(tvl)} locked${ch7 !== null ? `, ${ch7 >= 0 ? "+" : ""}${pct(ch7)} over 7 days` : ""}.`,
    details: [
      "More value locked means more users trust it and more eyes on the code, and exits are easier.",
      ...(ch7 !== null && Math.abs(ch7) > 30 ? [`A ${pct(Math.abs(ch7), 0)} swing in a week is unusually volatile.`] : []),
    ],
    evidence: [{ label: "TVL on DefiLlama", href: llamaUrl }],
  });
  if (ch7 !== null && ch7 < -40) redFlags.push(`TVL fell ${pct(-ch7, 0)} in 7 days`);

  // 5. Governance & decentralization
  const gov = detail?.governanceID?.length ?? 0;
  const chains = p.chains?.length ?? 0;
  factors.push({
    key: "governance",
    label: "Governance & decentralization",
    weight: 10,
    score: detail === null ? null : clamp100((gov ? 60 : 30) + Math.min(25, chains * 5) + (detail.oracles?.length ? 10 : 0)),
    summary:
      detail === null
        ? "Couldn't load the protocol's governance details."
        : `${gov ? "On-chain or Snapshot governance is listed" : "No public governance is listed"}; runs on ${chains} chain${chains === 1 ? "" : "s"}${detail.oracles?.length ? `; oracles: ${detail.oracles.slice(0, 3).join(", ")}` : ""}.`,
    details: ["Public governance and independent oracles spread control away from a single team."],
  });

  // 6. Yield sustainability (reward-token share of APY across its pools)
  const live = pools?.filter((x) => x.tvlUsd > 10_000 && (x.apy ?? 0) > 0) ?? null;
  let yieldScore: number | null = null;
  let rewardShare = 0;
  let outliers = 0;
  if (live && live.length) {
    const w = live.reduce((s, x) => s + x.tvlUsd, 0);
    rewardShare = live.reduce((s, x) => s + x.tvlUsd * ((x.apyReward ?? 0) / Math.max(x.apy ?? 0, 1e-9)), 0) / w;
    outliers = live.filter((x) => x.outlier || (x.apy ?? 0) > 100).length;
    yieldScore = clamp100(band(rewardShare * 100, [[20, 90], [50, 65], [80, 40]], 20) - Math.min(20, outliers * 5));
  }
  factors.push({
    key: "yield",
    label: "Yield sustainability",
    weight: 10,
    score: yieldScore,
    summary:
      yieldScore === null
        ? "No yield pools tracked for this protocol."
        : `${pct(rewardShare * 100, 0)} of the yield (TVL-weighted, ${live!.length} pools) comes from reward tokens rather than real fees${outliers ? `; ${outliers} pool${outliers === 1 ? " shows" : "s show"} outlier APYs` : ""}.`,
    details: ["Yield paid in emitted reward tokens tends to fall as rewards end or the token drops; fee-based yield is more durable."],
    evidence: [{ label: "Yields on DefiLlama", href: `https://defillama.com/yields?project=${p.slug}` }],
  });

  return finish(
    {
      kind: "protocol",
      id: p.slug,
      name: p.name,
      redFlags,
      factors,
      sources: [
        { label: "DefiLlama protocol page", href: llamaUrl },
        { label: "DefiLlama API (protocols, hacks, yields)", href: "https://defillama.com/docs/api" },
      ],
    },
    caps,
  );
}
