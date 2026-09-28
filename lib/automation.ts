import type { BatchEvmSigner } from "@circle-fin/x402-batching";
import { planCost, runAgent } from "./agent";
import {
  GAS_RESERVE,
  GATEWAY_TOPUP,
  agentAccount,
  agentGatewayFor,
  balancesOf,
} from "./agentWallets";
import {
  AgentBusyError,
  addSpend,
  dueAgents,
  getAgent,
  pushHistory,
  saveAgent,
  scheduleAgent,
  spentToday,
  unscheduleAgent,
  withAgentLock,
  type AgentCard,
} from "./store";

/** Most a scheduled run may spend on other sellers in Fuci Market (only when its owner opted in). */
const MARKET_PER_RUN = 0.02;

/**
 * Automatic runs. Each due agent pays from its own wallet (Circle Gateway, x402),
 * never above its daily limit; results land in its history.
 */

const MAX_FAILURES = 3;

export async function runDue(origin: string, budgetMs = 50_000) {
  const started = Date.now();
  const due = await dueAgents(started, 8);
  const results: { agent: string; status: string }[] = [];
  for (const id of due) {
    if (Date.now() - started > budgetMs) break;
    const agent = await getAgent(id);
    if (!agent?.automation?.enabled) {
      await unscheduleAgent(id);
      continue;
    }
    let status: string;
    try {
      // Overlapping ticks (or an owner's ask / trade) never run the same wallet twice at once.
      status = await withAgentLock(id, async () => {
        // Re-read under the lock: another tick may have just run it.
        const fresh = await getAgent(id);
        if (
          !fresh?.automation?.enabled ||
          (fresh.automation.nextRunAt ?? 0) > Date.now()
        )
          return "already ran";
        return runOne(fresh, origin);
      });
    } catch (e) {
      status =
        e instanceof AgentBusyError
          ? "busy, next tick"
          : `error: ${(e as Error).message.slice(0, 160)}`;
    }
    results.push({ agent: id, status });
  }
  return { ran: results.length, results };
}

async function runOne(agent: AgentCard, origin: string): Promise<string> {
  const auto = agent.automation!;
  const next = () => Date.now() + auto.everyMinutes * 60_000;
  // `pausable`: an empty wallet just waits for funds; real run failures pause after MAX_FAILURES.
  const finish = async (
    status: string,
    failed: boolean,
    note?: string,
    pausable = true,
  ) => {
    auto.lastRunAt = Date.now();
    auto.nextRunAt = next();
    auto.failures = failed ? auto.failures + 1 : 0;
    // One note per problem, not one per tick; pause after repeated failures.
    if (failed && note && auto.failures === 1)
      await pushHistory(agent.id, {
        kind: "run",
        label: `Automation skipped: ${note}`,
      });
    if (pausable && auto.failures >= MAX_FAILURES) {
      auto.enabled = false;
      auto.pausedReason = note ?? status;
      await pushHistory(agent.id, {
        kind: "run",
        label: `Automation paused after ${MAX_FAILURES} failed runs: ${auto.pausedReason}`,
      });
      await unscheduleAgent(agent.id);
    } else {
      await scheduleAgent(agent.id, auto.nextRunAt);
    }
    await saveAgent(agent);
    return status;
  };

  const cost = planCost(auto.strategy);
  const left = agent.dailyLimitUsdc - (await spentToday(agent.id));
  // With the owner's opt-in, a run may also spend up to MARKET_PER_RUN on other Market sellers, inside the daily limit.
  const market = auto.market ? Math.max(0, Math.min(MARKET_PER_RUN, left - cost)) : 0;
  if (left < cost - 1e-9) {
    // Not a failure: the owner's daily limit is doing its job.
    auto.nextRunAt = next();
    await scheduleAgent(agent.id, auto.nextRunAt);
    await saveAgent(agent);
    return "daily limit reached";
  }

  // Top up Gateway from the agent's wallet when needed (the deposit costs a little gas).
  const { walletUsdc, gatewayUsdc } = await balancesOf(agent.id);
  if (gatewayUsdc < cost + market) {
    // A small float (GATEWAY_TOPUP) within today's budget, so trading keeps the rest of the wallet.
    const topUp =
      Math.floor(
        Math.min(walletUsdc - GAS_RESERVE, left, Math.max(GATEWAY_TOPUP, cost + market)) * 1e6,
      ) / 1e6;
    if (topUp < cost)
      return finish(
        "unfunded",
        true,
        "the agent wallet is empty. Fund it on the agent page.",
        false,
      );
    await (await agentGatewayFor(agent.id)).deposit(String(topUp));
    await pushHistory(agent.id, {
      kind: "payment",
      label: `Moved ${topUp} USDC into Circle Gateway`,
      usdc: topUp,
    });
  }

  const signer = (await agentAccount(agent.id)) as unknown as BatchEvmSigner;
  const prompt = auto.prompt || agent.mission || "Automatic run";
  const result = await runAgent({
    origin,
    prompt,
    agentId: agent.id,
    strategy: auto.strategy,
    maxSpendUsdc: Math.min(cost + market, left),
    signer,
    marketUsdc: market,
  });
  await addSpend(agent.id, result.spentUsdc);

  const paid = result.steps.filter((s) => s.kind === "settled");
  for (const s of paid)
    await pushHistory(agent.id, {
      kind: "payment",
      label: `Paid for ${s.tool ?? "a tool"} over x402`,
      usdc: s.usdc,
      href: s.href,
    });
  if (!Object.keys(result.data).length) {
    const why =
      result.steps.find((s) => s.kind === "error")?.detail ??
      "no data came back";
    return finish("failed", true, why);
  }
  await pushHistory(agent.id, {
    kind: "run",
    label: `Auto run: ${result.brief.slice(0, 220)}`,
    usdc: result.spentUsdc,
  });
  return finish("ok", false);
}
