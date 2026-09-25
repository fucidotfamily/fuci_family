import { Hero } from "@/components/Hero";
import { HowItWorks } from "@/components/HowItWorks";
import { TideStats } from "@/components/TideStats";
import { Capabilities } from "@/components/Capabilities";
import { FuciToken } from "@/components/FuciToken";
import { SHOW_FUCI_TOKEN } from "@/lib/config";
import { getStats } from "@/lib/store";
import { storedIndex } from "@/lib/agentIndex";
import { getForest, refreshForest, treasuryBalance } from "@/lib/forest";
import { after } from "next/server";
import type { Forest } from "@/lib/forest";

const EMPTY_FOREST: Forest = { agentsCreated: 0, agentIds: [], creationFeesUsdc: 0, trades: 0, tradeFeesUsdc: 0, events: [], lastBlock: null, updatedAt: null };

// Rendered per request so the hero card and live numbers are always current.
export const dynamic = "force-dynamic";

/**
 * Render a live-data section eagerly so a bad value hides that one section instead of failing the
 * whole page with a 500. (Server-rendered sections are called as functions for this reason.)
 */
function safe(name: string, render: () => React.ReactNode) {
  try {
    return render();
  } catch (e) {
    console.error(`[home] ${name} section failed`, e);
    return null;
  }
}
async function safeAsync(name: string, render: () => Promise<React.ReactNode>) {
  try {
    return await render();
  } catch (e) {
    console.error(`[home] ${name} section failed`, e);
    return null;
  }
}

export default async function Home() {
  // A real agent card for the hero, and the size of the Arc agent registry.
  const [stats, index, forest, treasury] = await Promise.all([
    getStats().catch(() => null),
    storedIndex().catch(() => null),
    getForest().catch(() => ({ forest: EMPTY_FOREST, stale: true })),
    treasuryBalance().catch(() => null),
  ]);
  // Keep the on-chain numbers fresh without making this page wait.
  if (forest.stale) after(() => refreshForest().catch(() => undefined));
  // Fuci agents = the ones created on-chain through the Fuci factory.
  const created = new Set(forest.forest.agentIds);
  const fuciAgents = (index?.index?.agents ?? []).filter((a) => created.has(a.agentId)).sort((a, b) => a.rank - b.rank);
  const pick = stats?.top.find((a) => a.image || a.x) ?? stats?.top[0];
  const showcase = pick ? { id: pick.id, name: pick.name } : null;
  const agentsOnArc = index?.index?.total ?? null;

  return (
    <main className="depth">
      <Hero showcase={showcase} agentsOnArc={agentsOnArc} fuciOnChain={fuciAgents.length} trades={forest.forest.trades} />
      {safe("stats", () => TideStats({ forest: forest.forest, fuciAgents, treasury }))}
      <HowItWorks />
      <Capabilities />
      {SHOW_FUCI_TOKEN && (await safeAsync("fuci", () => FuciToken()))}
    </main>
  );
}
