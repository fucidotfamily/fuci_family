import { NextResponse, type NextRequest } from "next/server";
import { runAgent } from "@/lib/agent";
import { getAgent, recordEvent, type Strategy } from "@/lib/store";
import { STRATEGIES } from "@/lib/strategy";
import { toolById } from "@/lib/tools";
import { paid } from "@/lib/x402";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Pay-per-prompt ($0.04 over x402): the Fuci agent answers by buying the tools it needs.
 * Settles only when an answer was bought. Fuci agents pay it from their own wallet when
 * their owner asks (see /api/agent/[id]/ask); `agentId` then applies that agent's plan and mission.
 */
export const POST = paid(toolById("fuci_agent")!, async (req: NextRequest) => {
  const body = (await req.json().catch(() => ({}))) as { prompt?: string; agentId?: string; strategy?: string };
  const card = body.agentId ? await getAgent(String(body.agentId).slice(0, 40)).catch(() => null) : null;
  const strategy = STRATEGIES.includes(body.strategy as Strategy) ? (body.strategy as Strategy) : card?.strategy;
  const prompt = (body.prompt ?? "").slice(0, 500) || card?.mission || "What is happening on Argus right now?";
  const result = await runAgent({ origin: req.nextUrl.origin, prompt, strategy });
  await recordEvent({ kind: "agent_run", agent: result.agent, usdc: result.spentUsdc });
  const ok = Object.keys(result.data).length > 0;
  return NextResponse.json(result, { status: ok ? 200 : 502 });
});
