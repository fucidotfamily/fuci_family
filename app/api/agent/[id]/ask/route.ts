import { NextResponse, type NextRequest } from "next/server";
import { addSpend, allow, pushHistory, spentToday } from "@/lib/store";
import { OwnerError, verifyOwner } from "@/lib/ownerAuth";
import { GAS_RESERVE, agentGatewayFor, balancesOf, ensureAgentWallet } from "@/lib/agentWallets";
import { priceToNumber, toolById } from "@/lib/tools";
import { saveRun } from "@/lib/runs";
import type { RunResult } from "@/lib/agent";
import { errorResponse } from "@/lib/http";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** A signed "ask" session lasts a day, so owners sign once instead of on every question. */
const SESSION_MS = 24 * 60 * 60_000;

type Body = { prompt?: string; strategy?: string; address?: string; issuedAt?: number; signature?: string };

/**
 * The owner asks their own agent: the agent's wallet pays Fuci's "Ask" tool over x402
 * (never above its daily limit), and the answer comes back with the x402 trace.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";
  if (!(await allow(`ask:${ip}`, 20, 600))) return NextResponse.json({ error: "Too many questions. Try again in a few minutes." }, { status: 429 });
  const b = (await req.json().catch(() => ({}))) as Body;
  try {
    const agent = await verifyOwner(id, "ask", b, "session", SESSION_MS);
    const tool = toolById("fuci_agent")!;
    const price = priceToNumber(tool.price);

    const left = agent.dailyLimitUsdc - (await spentToday(agent.id));
    if (left < price - 1e-9) return NextResponse.json({ error: `Today's limit is used (${agent.dailyLimitUsdc} USDC a day). Raise it under Scheduled reports, or ask tomorrow.` }, { status: 402 });

    // Pay from the agent's Gateway balance; top it up from the agent wallet when needed.
    await ensureAgentWallet(agent.id);
    const gateway = await agentGatewayFor(agent.id);
    const { walletUsdc, gatewayUsdc } = await balancesOf(agent.id);
    if (gatewayUsdc < price) {
      const topUp = Math.floor(Math.min(walletUsdc - GAS_RESERVE, Math.max(left, price)) * 1e6) / 1e6;
      if (topUp < price) return NextResponse.json({ error: `The agent wallet needs USDC: an answer costs ${tool.price}. Fund it below (step 1).` }, { status: 402 });
      await gateway.deposit(String(topUp));
      await pushHistory(agent.id, { kind: "payment", label: `Moved ${topUp} USDC into Circle Gateway`, usdc: topUp });
    }

    const started = Date.now();
    const prompt = (b.prompt ?? "").slice(0, 500);
    const paid = await gateway.pay<RunResult>(`${req.nextUrl.origin}${tool.path}`, { method: "POST", body: { prompt, agentId: agent.id, strategy: b.strategy }, headers: { "x-fuci-agent": agent.id } });
    const result = paid.data;
    const spent = Number(paid.formattedAmount ?? price);
    await addSpend(agent.id, spent);
    await pushHistory(agent.id, { kind: "payment", label: `Paid ${tool.price} for an answer over x402`, usdc: spent });
    await pushHistory(agent.id, { kind: "run", label: `Asked: "${(prompt || agent.mission || "What is happening on Argus right now?").slice(0, 80)}"`, usdc: spent });

    // The agent's own payment first, then the steps the Fuci agent took to answer.
    const t = Date.now() - started;
    const steps = [
      { kind: "402" as const, label: `402 Payment Required: ${tool.price} for an answer`, detail: `${agent.name} pays from its own wallet`, t: 0 },
      { kind: "settled" as const, label: `Paid ${spent} USDC via Circle Gateway`, detail: paid.transaction ? `${String(paid.transaction).slice(0, 18)}…` : undefined, t },
      ...result.steps,
    ];
    const run = await saveRun(prompt, result).catch(() => null);
    return NextResponse.json({ ...result, steps, spentUsdc: spent, wallet: gateway.address, run, houseAgentId: null, erc8004Id: agent.erc8004Id ?? null });
  } catch (e) {
    if (e instanceof OwnerError) return NextResponse.json({ error: e.message }, { status: e.status });
    return errorResponse(e, "ask");
  }
}

