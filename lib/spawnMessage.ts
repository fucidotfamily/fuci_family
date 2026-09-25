/** Message a browser-wallet owner signs to spawn an agent (shared by client and server). */
export const spawnMessage = (p: { name: string; strategy: string; mission?: string; dailyLimitUsdc: number; owner: string; issuedAt: number }) =>
  [
    "Fuci: spawn an agent",
    `Name: ${p.name}`,
    `Strategy: ${p.strategy}`,
    ...(p.mission ? [`Mission: ${p.mission}`] : []),
    `Daily limit: ${p.dailyLimitUsdc} USDC`,
    `Owner: ${p.owner}`,
    `Issued at: ${p.issuedAt}`,
  ].join("\n");
