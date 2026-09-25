import type { Address } from "viem";

/** Types and search shared by the agent index (server) and the /agents page (browser). */

export const COMPLETENESS_CHECKS = [
  "reachable card",
  "name",
  "description",
  "image",
  "service endpoint",
  "x402 support",
  "own registration listed",
  "trust model declared",
] as const;

export type IndexedAgent = {
  agentId: number;
  owner: Address | null;
  host: string | null;
  /** http(s) registration file URL, for linking. */
  url: string | null;
  fuci: boolean;
  name: string | null;
  description: string | null;
  x402: boolean;
  /** Profile image from the registration file (https, or an inline data URI). */
  image: string | null;
  /** Bonus points for agents built on Fuci. */
  bonus: number;
  complete: number; // checks passed, 0–8
  missing: string[];
  reputation: { count: number; score: number | null } | null;
  validations: number;
  score: number;
  rank: number;
};

// Search and sort (shared by the API; the page does the same in the browser).

export type SortKey = "ranked" | "newest" | "rated";

export function queryIndex(agents: IndexedAgent[], q: string, sort: SortKey, x402Only = false) {
  const term = q.trim().toLowerCase();
  const byId = /^#?\d+$/.test(term) ? Number(term.replace("#", "")) : null;
  const hits = agents.filter(
    (a) =>
      (!x402Only || a.x402) &&
      (!term ||
        (byId !== null
          ? a.agentId === byId
          : [a.name, a.description, a.host, a.owner].some((f) => f?.toLowerCase().includes(term)))),
  );
  const order: Record<SortKey, (a: IndexedAgent, b: IndexedAgent) => number> = {
    ranked: (a, b) => a.rank - b.rank,
    newest: (a, b) => b.agentId - a.agentId,
    rated: (a, b) => (b.reputation?.count ?? 0) - (a.reputation?.count ?? 0) || (b.reputation?.score ?? 0) - (a.reputation?.score ?? 0) || a.rank - b.rank,
  };
  return hits.sort(order[sort]);
}

