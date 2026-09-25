import { getHistory, type AgentCard, type HistoryEvent } from "./store";

/** An agent's history, newest first. Agents spawned before history existed still show their spawn. */
export async function agentHistory(agent: AgentCard): Promise<HistoryEvent[]> {
  const events: HistoryEvent[] = await getHistory(agent.id).catch(() => []);
  if (!events.some((e) => e.kind === "spawn")) {
    events.push({ at: agent.createdAt, kind: "spawn", label: `Spawned by ${agent.owner.slice(0, 6)}…${agent.owner.slice(-4)} (wallet signature)` });
  }
  return events.sort((a, b) => b.at - a.at);
}
