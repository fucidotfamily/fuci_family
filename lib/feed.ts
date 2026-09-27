import { explorerAddress, X402_NETWORKS } from "./config";
import { getForest } from "./forest";
import { getStats } from "./store";
import { toolById } from "./tools";

/** One line of the live activity feed on the home page. */
export type FeedItem = {
  kind: "payment" | "agent" | "buy" | "sell";
  text: string;
  /** Where it can be checked: the payer's wallet or the on-chain transaction. */
  href?: string;
  /** Small print: network and payer, or "on-chain". */
  sub?: string;
  at: number;
};

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const networkName = (n?: string) =>
  X402_NETWORKS.find((x) => x.network === n)?.name ?? "Arc";

function who(agent: string) {
  if (!agent) return "An agent";
  if (agent === "house-frond") return "Fuci's house agent";
  return `Agent ${agent}`;
}

/** Real x402 payments (settled through Circle Gateway) and on-chain agent events, newest first. */
export async function liveFeed(limit = 12): Promise<FeedItem[]> {
  const [stats, forest] = await Promise.all([
    getStats().catch(() => null),
    getForest().catch(() => null),
  ]);
  const payments: FeedItem[] = (stats?.recent ?? [])
    .filter((e) => e.kind === "payment" && e.tool)
    .map((e) => {
      const name = toolById(e.tool!)?.name ?? e.tool!;
      const net = networkName(e.network);
      return {
        kind: "payment" as const,
        text: `${who(e.agent)} paid ${e.usdc} USDC for ${name}`,
        href: e.payer && net === "Arc" ? explorerAddress(e.payer) : undefined,
        sub: `x402 · ${net}${e.payer ? ` · ${short(e.payer)}` : ""}`,
        at: e.at,
      };
    });
  const onchain: FeedItem[] = (forest?.forest.events ?? []).map((e) => ({
    kind: e.kind,
    text: e.label,
    href: e.href,
    sub: "on-chain · Arc",
    at: e.at,
  }));
  return [...payments, ...onchain].sort((a, b) => b.at - a.at).slice(0, limit);
}

/** The feed plus the server time it was read at (so the first client render matches). */
export async function liveFeedNow(limit = 12) {
  const items = await liveFeed(limit).catch(() => [] as FeedItem[]);
  return { items, now: Date.now() };
}
