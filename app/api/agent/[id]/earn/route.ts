import { NextResponse, type NextRequest } from "next/server";
import { AgentBusyError, allow, resolveAgent, withAgentLock } from "@/lib/store";
import { OwnerError, verifyOwner } from "@/lib/ownerAuth";
import { errorResponse } from "@/lib/http";
import { EARN_FEE_PCT, earnDeposit, earnState, earnWithdraw } from "@/lib/earn";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** The agent's USDC/EURC balances and its Earn positions, with Fuci's fee on the yield so far. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { agent } = await resolveAgent((await params).id);
  if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  try {
    const state = await earnState(agent.id, agent.wallet);
    return NextResponse.json({ feePctOfYield: EARN_FEE_PCT, ...state }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return errorResponse(e, "agent-earn");
  }
}

type Body = { action?: "deposit" | "withdraw"; vault?: string; amount?: number | "all"; address?: string; issuedAt?: number; signature?: string };

/** Owner-signed: put the agent's USDC/EURC into a vault, or take it out. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";
  if (!(await allow(`earn:${ip}`, 20, 600))) return NextResponse.json({ error: "Too many requests. Try again later." }, { status: 429 });
  const b = (await req.json().catch(() => ({}))) as Body;
  const vault = /^0x[0-9a-fA-F]{40}$/.test(b.vault ?? "") ? b.vault!.toLowerCase() : null;
  if (!vault) return NextResponse.json({ error: "Pick a vault" }, { status: 400 });
  try {
    if (b.action === "deposit") {
      const amount = Math.floor(Number(b.amount) * 1e6) / 1e6;
      if (!(amount >= 0.1 && amount <= 100_000)) return NextResponse.json({ error: "Deposit 0.10–100,000" }, { status: 400 });
      const agent = await verifyOwner(id, "earn-deposit", b, `${vault} ${amount}`);
      const r = await withAgentLock(agent.id, () => earnDeposit(agent.id, vault, amount));
      return NextResponse.json({ ok: true, ...r });
    }
    if (b.action === "withdraw") {
      const amount = b.amount === "all" ? "all" : Math.floor(Number(b.amount) * 1e6) / 1e6;
      if (amount !== "all" && !(amount > 0)) return NextResponse.json({ error: "Pick an amount" }, { status: 400 });
      const agent = await verifyOwner(id, "earn-withdraw", b, `${vault} ${amount}`);
      const r = await withAgentLock(agent.id, () => earnWithdraw(agent.id, vault, amount));
      return NextResponse.json({ ok: true, ...r });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    if (e instanceof OwnerError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof AgentBusyError) return NextResponse.json({ error: e.message }, { status: 409 });
    const m = (e as Error).message ?? "";
    if (/enough tokens|insufficient|not listed|low on liquidity|at least|Nothing in/i.test(m)) return NextResponse.json({ error: m.slice(0, 240) }, { status: 400 });
    return errorResponse(e, "agent-earn");
  }
}
