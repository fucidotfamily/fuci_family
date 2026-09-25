import { NextResponse } from "next/server";
import { ARC_NETWORK, X402_NETWORK } from "@/lib/config";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

type Check = { ok: boolean; detail?: unknown; error?: string };

async function check(fn: () => Promise<unknown>): Promise<Check> {
  try {
    return { ok: true, detail: await fn() };
  } catch (e) {
    const err = e as { response?: { data?: { message?: string } }; shortMessage?: string; message?: string };
    return { ok: false, error: (err?.response?.data?.message ?? err?.shortMessage ?? err?.message ?? String(e)).slice(0, 300) };
  }
}

/** Live status of every dependency. Public, and never includes secrets. */
export async function GET() {
  const [arc, argus, payments, redis, erc8004] = await Promise.all([
    check(async () => ({ block: await (await import("@/lib/argus")).headBlock() })),
    check(async () => {
      const l = await (await import("@/lib/argus")).getLaunches(3);
      return { latest: l.data.map((x) => ({ symbol: x.symbol, token: x.token, block: x.block })) };
    }),
    check(async () => {
      const w = await import("@/lib/agentWallet");
      if (w.AGENT_MODE === "none") throw new Error("Agent wallet not set: add AGENT_PRIVATE_KEY (see /setup)");
      const c = await import("@/lib/circle");
      const [agent, seller] = await Promise.all([w.agentAddress(), c.sellerAddress()]);
      if (!seller) throw new Error("Payment receiver not set: add FUCI_SELLER_ADDRESS");
      const gatewayUsdc = agent ? await c.gatewayBalance(agent) : null;
      return { mode: w.AGENT_MODE, agent, seller, gatewayUsdc };
    }),
    check(async () => {
      const s = await import("@/lib/store");
      if (!s.PERSISTENT) throw new Error("Upstash Redis not connected");
      const st = await s.getStats();
      return { calls: st.calls, agents: st.agents };
    }),
    check(async () => {
      const e = await import("@/lib/erc8004");
      const w = await import("@/lib/agentWallet");
      const [registered, houseId, agent] = await Promise.all([e.agentCount(), e.getHouseAgentId(), w.agentAddress().catch(() => null)]);
      if (houseId === null) throw new Error(`House agent not registered yet (${registered} agents on the registry). Register it on /setup`);
      const onchain = await e.readAgent(houseId);
      if (agent && onchain.owner.toLowerCase() !== agent.toLowerCase()) throw new Error(`ERC-8004 #${houseId} is owned by ${onchain.owner}, not the agent`);
      return { registry: e.ERC8004.identity, registered, houseAgentId: houseId, uri: onchain.uri, reputation: await e.reputationOf(houseId) };
    }),
  ]);
  const ok = arc.ok && argus.ok && payments.ok && redis.ok && erc8004.ok;
  return NextResponse.json(
    { ok, network: ARC_NETWORK, x402: X402_NETWORK, node: process.version, checks: { arc, argus, payments, redis, erc8004 }, claude: Boolean(process.env.ANTHROPIC_API_KEY) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
