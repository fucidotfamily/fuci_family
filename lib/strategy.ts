import type { Strategy } from "./store";

/** Display names for an agent's strategy (shared by pages, cards and images). */
export const STRATEGY_LABEL: Record<Strategy, string> = {
  scout: "Argus Launch Scout",
  watcher: "Bonding Watcher",
  oracle: "Tide Oracle",
  custom: "Custom agent",
};

export const STRATEGIES: Strategy[] = ["scout", "watcher", "oracle", "custom"];

/** Longest mission (the owner's own instructions) an agent can have. */
export const MAX_MISSION = 280;

export const cleanMission = (v: unknown) =>
  typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, MAX_MISSION) : "";

/** The label for one agent: a custom agent without a mission yet is a general agent. */
export const strategyName = (a: { strategy: Strategy; mission?: string }) => (a.strategy === "custom" && !a.mission ? "General agent" : STRATEGY_LABEL[a.strategy]);

/** The default description of an agent's registration file (before the owner writes one). */
export const defaultDescription = (a: { name: string; strategy: Strategy; mission?: string }) =>
  a.mission
    ? `${a.name}: ${a.mission} A Fuci agent on Arc that pays for its data in USDC over x402.`
    : `${a.name} is a ${strategyName(a)} in the Fuci kelp forest on Arc. It pays for Argus market data in USDC over x402.`;
