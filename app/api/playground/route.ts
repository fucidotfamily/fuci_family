import { NextResponse, after, type NextRequest } from "next/server";
import { planCost, runAgent } from "@/lib/agent";
import { PLAYGROUND_DAILY_USDC } from "@/lib/config";
import { saveRun } from "@/lib/runs";
import { getHouseAgentId } from "@/lib/erc8004";
import { ensureHouseGateway } from "@/lib/agentWallet";
import { allow, getAgent, pushHistory, recordEvent, refundBudget, reserveBudget, type Strategy } from "@/lib/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const STRATEGIES: Strategy[] = ["scout", "watcher", "oracle"];
const clientKey = (req: NextRequest) => req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";

/**
 * Website playground: the visitor's prompt is sponsored by Fuci's house agent,
 * which pays each tool over x402 with real USDC. Guarded by a per-visitor rate
 * limit and a daily sponsored budget (both in Redis).
 */
export async function POST(req: NextRequest) {
  if (!(await allow(`pg:${clientKey(req)}`, 6, 600))) {
    return NextResponse.json({ error: "The tide is resting. Try again in a few minutes." }, { status: 429 });
  }
  const body = (await req.json().catch(() => ({}))) as { prompt?: string; agentId?: string; strategy?: string };
  const card = body.agentId ? await getAgent(body.agentId) : null;
  // A custom agent answers an empty prompt with its own mission.
  const prompt = (body.prompt ?? "").slice(0, 500) || card?.mission || "What is happening on Argus right now?";
  const strategy = STRATEGIES.includes(body.strategy as Strategy) ? (body.strategy as Strategy) : card?.strategy;

  const reserved = planCost(strategy);
  if (!(await reserveBudget(reserved, PLAYGROUND_DAILY_USDC))) {
    return NextResponse.json({ error: "Today's sponsored budget is used up. Come back tomorrow, or call the tools with your own x402 wallet (see /docs)." }, { status: 429 });
  }

  // The sponsor pays from its Gateway balance: refill it from the house wallet when it runs dry,
  // and top it up ahead of time after each run so visitors rarely wait for a deposit.
  await ensureHouseGateway(reserved).catch(() => undefined);
  after(() => ensureHouseGateway(0.1).catch(() => undefined));

  let spent = 0;
  try {
    const result = await runAgent({
      origin: req.nextUrl.origin,
      prompt,
      // Sponsored: the house agent pays, so the tools are not counted as this agent's own spend.
      strategy,
      maxSpendUsdc: Math.min(reserved, card?.dailyLimitUsdc ?? reserved),
    });
    spent = result.spentUsdc;
    await recordEvent({ kind: "agent_run", agent: result.agent, usdc: result.spentUsdc });
    if (card && (result.spentUsdc > 0 || Object.keys(result.data).length > 0)) {
      // The frond's own history: the run, then each x402 payment it made (with the tx when settled on-chain).
      for (const s of result.steps.filter((x) => x.kind === "settled")) {
        await pushHistory(card.id, { kind: "payment", label: `Fuci paid for ${s.tool ?? "a tool"} over x402 (sponsored)`, usdc: s.usdc, href: s.href });
      }
      await pushHistory(card.id, { kind: "run", label: `Asked (sponsored by Fuci): "${prompt.slice(0, 80)}"`, usdc: result.spentUsdc });
    }
    // Stored so anyone can ask for an ERC-8004 validation of this run.
    const [run, houseAgentId] = await Promise.all([saveRun(prompt, result).catch(() => null), getHouseAgentId().catch(() => null)]);
    return NextResponse.json({ ...result, run, houseAgentId, erc8004Id: card?.erc8004Id ?? houseAgentId });
  } finally {
    await refundBudget(reserved - spent);
  }
}
