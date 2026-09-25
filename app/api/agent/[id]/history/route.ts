import { NextResponse } from "next/server";
import { agentHistory } from "@/lib/history";
import { resolveAgent } from "@/lib/store";

export const dynamic = "force-dynamic";

/** What an agent has done: spawn, runs, x402 payments, ERC-8004 registration, validations, profile changes. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { agent } = await resolveAgent((await params).id);
  if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  return NextResponse.json({ agent: agent.id, history: await agentHistory(agent) }, { headers: { "Cache-Control": "no-store" } });
}
