/** Message an agent's owner signs to change its profile (shared by browser and server). */
export const ownerMessage = (p: { action: "set-image" | "remove-image" | "connect-x" | "disconnect-x" | "set-automation" | "withdraw" | "set-trading" | "sell" | "buy" | "ask" | "set-profile"; agent: string; detail?: string; issuedAt: number }) =>
  ["Fuci: update my agent", `Action: ${p.action}`, `Agent: ${p.agent}`, ...(p.detail ? [`Detail: ${p.detail}`] : []), `Issued at: ${p.issuedAt}`].join("\n");

export type AutomationSettings = { enabled: boolean; everyMinutes: number; strategy: string; prompt: string; dailyLimitUsdc: number };

/** The automation settings as signed by the owner, so a signature can't be replayed for other settings. */
export const automationDetail = (s: AutomationSettings) =>
  `${s.enabled ? "on" : "off"}, every ${s.everyMinutes} min, ${s.strategy}, limit ${s.dailyLimitUsdc} USDC/day, prompt: ${s.prompt.slice(0, 200)}`;
