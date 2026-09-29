import type { Address, Hex } from "viem";
import { ARC_CHAIN, EXPLORER_URL, SITE_URL } from "./config";
import { readClient, walletClientFor } from "./chain";
import { ESCROW_ABI } from "./escrowArtifact";
import { escrowAddress, escrowJob, readNote, saveNote, type EscrowJob } from "./escrow";
import { GAS_RESERVE, GATEWAY_TOPUP, agentAccount, agentGatewayFor, balancesOf } from "./agentWallets";
import { priceToNumber, toolById } from "./tools";
import type { RunResult } from "./agent";
import type { RiskReport } from "./risk/score";
import { MIN_PER_DELIVERY, describe, minUsdcFor, parseTerms, type JobSpec } from "./escrowJobs";
import { acquireLock, addSpend, agentByWallet, getAgent, kvGet, kvSet, pushHistory, releaseLock, withAgentLock, type AgentCard } from "./store";

/**
 * Every Fuci agent is an escrow seller. When someone locks USDC for a job with a Fuci agent as the provider,
 * this worker (run by the 5-minute cron) does the seller's side on its own:
 *   1. picks the job up and reads its terms,
 *   2. does the work: the agent answers the terms with its paid data tools (x402, from its own wallet),
 *   3. delivers on-chain from the agent's wallet (submit), which starts the client's review time,
 *   4. collects: the client approves, or once the review time is over the agent claims its payout.
 * Jobs it can't do (too small, or terms it can't read) are cancelled at once, which refunds the client in full.
 */

/** Smallest job a Fuci agent takes (per delivery): an answer costs it about 0.04 USDC of data plus gas. */
export const MIN_JOB_USDC = MIN_PER_DELIVERY;
const DAY = 24 * 60 * 60_000;
const dailyKey = (jobId: number) => `escrow:daily:${jobId}`;
export type DailyReport = { at: number; text: string };
/** Reports a Fuci agent has written so far for a daily-reports job (shown on the job page before delivery). */
export const dailyReports = (jobId: number) => kvGet<DailyReport[]>(dailyKey(jobId)).then((r) => r ?? []);
/** How often a job may fail (e.g. an empty agent wallet) before the agent gives it up and refunds the client. */
const MAX_TRIES = 6;

const CURSOR = "escrow:worker:cursor"; // highest job id already scanned
const OPEN = "escrow:worker:open"; // jobs a Fuci agent is working on: { [jobId]: { agent, tries } }
type Open = Record<string, { agent: string; tries: number }>;

const explorerTx = (hash: string) => `${EXPLORER_URL}/tx/${hash}`;

/** Sends one escrow call from the agent's own wallet and waits for it. */
async function agentTx(agent: AgentCard, escrow: Address, functionName: "submit" | "cancel" | "claimTimeout", args: readonly unknown[]): Promise<Hex> {
  const account = await agentAccount(agent.id);
  const c = readClient(ARC_CHAIN);
  const { request } = await c.simulateContract({ address: escrow, abi: ESCROW_ABI, functionName, args: args as never, account });
  const hash = await walletClientFor(ARC_CHAIN, account).writeContract(request as Parameters<ReturnType<typeof walletClientFor>["writeContract"]>[0]);
  const receipt = await c.waitForTransactionReceipt({ hash, timeout: 45_000 });
  if (receipt.status !== "success") throw new Error(`${functionName} reverted`);
  return hash;
}

/** Makes sure the agent's Circle Gateway balance covers `price`, topping it up from its wallet. */
async function fundGateway(agent: AgentCard, price: number) {
  const gateway = await agentGatewayFor(agent.id);
  const { walletUsdc, gatewayUsdc } = await balancesOf(agent.id);
  if (gatewayUsdc < price) {
    const topUp = Math.floor(Math.min(walletUsdc - GAS_RESERVE, Math.max(GATEWAY_TOPUP, price)) * 1e6) / 1e6;
    if (topUp < price) throw new Error("the agent wallet has no USDC to pay for data");
    await gateway.deposit(String(topUp));
    await pushHistory(agent.id, { kind: "payment", label: `Moved ${topUp} USDC into Circle Gateway`, usdc: topUp });
  }
  return gateway;
}

/** Calls one of Fuci's paid tools from the agent's own wallet (x402) and returns its data. */
async function payTool<T>(agent: AgentCard, toolId: string, origin: string, init: { query?: Record<string, string>; body?: Record<string, unknown> }): Promise<T> {
  const tool = toolById(toolId)!;
  const price = priceToNumber(tool.price);
  const gateway = await fundGateway(agent, price);
  const url = new URL(tool.path, origin);
  for (const [k, v] of Object.entries(init.query ?? {})) url.searchParams.set(k, v);
  const paid = await gateway.pay<T>(url.toString(), init.body ? { method: "POST", body: init.body, headers: { "x-fuci-agent": agent.id } } : { method: "GET", headers: { "x-fuci-agent": agent.id } });
  const spent = Number(paid.formattedAmount ?? price);
  await addSpend(agent.id, spent);
  await pushHistory(agent.id, { kind: "payment", label: `Paid ${tool.price} to ${tool.name} for an escrow job`, usdc: spent });
  return paid.data;
}

/** The agent answers `prompt` the same way its owner's chat does. */
const answer = async (agent: AgentCard, prompt: string, origin: string) =>
  (await payTool<RunResult>(agent, "fuci_agent", origin, { body: { prompt: prompt.slice(0, 500), agentId: agent.id, strategy: agent.strategy } })).brief;

/** A risk or Know Your Agent report as plain text. */
function reportText(r: RiskReport): string {
  const lines = [
    `${r.name}${r.symbol ? ` (${r.symbol})` : ""}: grade ${r.grade ?? "?"}${r.score !== null ? `, ${r.score}/100` : ""} · ${r.label}`,
    `Confidence: ${r.confidence}${r.coverage < 1 ? ` (data for ${Math.round(r.coverage * 100)}% of the checks)` : ""}`,
  ];
  if (r.redFlags.length) lines.push("", "Red flags:", ...r.redFlags.map((f) => `- ${f}`));
  if (r.limits.length) lines.push("", "Grade held down by:", ...r.limits.map((f) => `- ${f}`));
  lines.push("", "Checks:", ...r.factors.map((f) => `- ${f.label}${f.score !== null ? ` (${f.score}/100)` : ""}: ${f.summary}`));
  const src = r.sources.filter((e) => e.href).slice(0, 6).map((e) => `- ${e.label}: ${e.href}`);
  if (src.length) lines.push("", "Sources:", ...src);
  return lines.join("\n");
}

/** Does the job once (every type but daily) and returns the delivery text. */
async function work(spec: JobSpec, agent: AgentCard, origin: string): Promise<string> {
  switch (spec.type) {
    case "risk":
      return reportText(await payTool<RiskReport>(agent, "fuci_risk", origin, { query: { target: spec.target } }));
    case "kya":
      return reportText(await payTool<RiskReport>(agent, "fuci_kya", origin, { query: { agent: spec.agent } }));
    default:
      return answer(agent, spec.prompt, origin);
  }
}

/** One step for one job. Returns true when the agent is done with it (paid, refunded or given up). */
async function step(job: EscrowJob, agent: AgentCard, escrow: Address, origin: string, open: Open): Promise<{ done: boolean; status: string }> {
  const now = Date.now();
  const tag = `escrow job #${job.id}`;
  switch (job.status) {
    case "Released": {
      const paid = job.amountUsdc - (job.amountUsdc * job.feeBps) / 10_000;
      await pushHistory(agent.id, { kind: "payment", label: `Got paid ${paid.toFixed(2)} USDC for ${tag}`, usdc: paid });
      return { done: true, status: "paid" };
    }
    case "Refunded":
      await pushHistory(agent.id, { kind: "run", label: `${tag[0].toUpperCase()}${tag.slice(1)} ended with a refund to the client` });
      return { done: true, status: "refunded" };
    case "Submitted": {
      if (now <= job.reviewDeadline) return { done: false, status: "waiting for the client's review" };
      // Nobody answered in time: the agent collects its payout itself.
      const hash = await agentTx(agent, escrow, "claimTimeout", [BigInt(job.id)]);
      const paid = job.amountUsdc - (job.amountUsdc * job.feeBps) / 10_000;
      await pushHistory(agent.id, { kind: "payment", label: `Collected ${paid.toFixed(2)} USDC for ${tag} (review time over)`, usdc: paid, href: explorerTx(hash) });
      return { done: true, status: "collected" };
    }
    case "Funded": {
      if (now > job.deadline) return { done: true, status: "missed the deadline; the client can take a refund" };
      const giveUp = async (why: string) => {
        const hash = await agentTx(agent, escrow, "cancel", [BigInt(job.id)]);
        await pushHistory(agent.id, { kind: "run", label: `Turned down ${tag} (${why}); the client got a full refund`, href: explorerTx(hash) });
        return { done: true, status: `cancelled: ${why}` };
      };
      const terms = await readNote(job.termsHash);
      if (!terms) return giveUp("its terms were not published on Fuci");
      const spec = parseTerms(terms);
      const min = minUsdcFor(spec);
      if (job.amountUsdc < min - 1e-9) return giveUp(`below the ${min} USDC minimum for this job`);

      const sign = `— ${agent.name}, a Fuci agent${agent.erc8004Id !== undefined ? ` (ERC-8004 #${agent.erc8004Id})` : ""}, for escrow job #${job.id}.`;
      let text: string;
      if (spec.type === "daily") {
        // One report a day, kept off-chain as it is written; one delivery on-chain once all are in
        // (or with what exists when the deadline gets close).
        const done = await dailyReports(job.id);
        const last = done[done.length - 1];
        const closing = now > job.deadline - 2 * 60 * 60_000;
        if (done.length < spec.days && !closing && (!last || now - last.at >= DAY - 10 * 60_000)) {
          const brief = await answer(agent, spec.prompt, origin);
          done.push({ at: now, text: brief });
          await kvSet(dailyKey(job.id), done, 60 * 24 * 60 * 60);
          await pushHistory(agent.id, { kind: "run", label: `Wrote daily report ${done.length} of ${spec.days} for ${tag}` });
        }
        if (done.length < spec.days && !closing) return { done: false, status: `daily report ${done.length}/${spec.days}` };
        if (done.length === 0) return giveUp("no report could be written before the deadline");
        text = [describe(spec), ...done.map((d, i) => `\n## Day ${i + 1} · ${new Date(d.at).toISOString().slice(0, 10)}\n${d.text}`), `\n${sign}`].join("\n");
      } else {
        text = `${describe(spec)}\n\n${await work(spec, agent, origin)}\n\n${sign}`;
      }
      const hash = await saveNote(text);
      const tx = await agentTx(agent, escrow, "submit", [BigInt(job.id), hash, `${SITE_URL}/api/escrow/note/${hash}`]);
      await pushHistory(agent.id, { kind: "run", label: `Delivered ${tag} (${job.amountUsdc} USDC waiting for review)`, href: explorerTx(tx) });
      open[String(job.id)].tries = 0;
      return { done: false, status: "delivered" };
    }
    default:
      return { done: true, status: "unknown job" };
  }
}

/** Scan new jobs for Fuci agents and move every open one forward. Called from the automation tick. */
export async function runEscrowTick(origin: string, budgetMs = 20_000) {
  const started = Date.now();
  const escrow = await escrowAddress();
  if (!escrow) return { skipped: "no escrow" };
  if (!(await acquireLock("escrow-worker", 90))) return { skipped: "another tick is working" };
  try {
    const count = Number(await readClient(ARC_CHAIN).readContract({ address: escrow, abi: ESCROW_ABI, functionName: "jobCount" }));
    let cursor = (await kvGet<number>(CURSOR)) ?? 0;
    const open = (await kvGet<Open>(OPEN)) ?? {};

    // 1. New jobs: keep the ones whose provider is a Fuci agent's own wallet.
    for (let id = cursor + 1; id <= Math.min(count, cursor + 25); id++) {
      const job = await escrowJob(id);
      const agent = job ? await agentByWallet(job.provider) : null;
      if (agent) {
        open[String(id)] = { agent: agent.id, tries: 0 };
        await pushHistory(agent.id, { kind: "run", label: `New escrow job #${id}: ${job!.amountUsdc} USDC locked for this agent` });
      }
      cursor = id;
    }
    await kvSet(CURSOR, cursor);

    // 2. Move each open job forward, one agent wallet at a time.
    const results: { job: number; agent: string; status: string }[] = [];
    for (const [id, o] of Object.entries(open)) {
      if (Date.now() - started > budgetMs) break;
      let status: string;
      try {
        const [job, agent] = await Promise.all([escrowJob(Number(id)), getAgent(o.agent)]);
        if (!job || !agent || job.provider.toLowerCase() !== (agent.wallet ?? "").toLowerCase()) {
          delete open[id];
          continue;
        }
        const r = await withAgentLock(agent.id, () => step(job, agent, escrow, origin, open));
        status = r.status;
        if (r.done) delete open[id];
      } catch (e) {
        status = `error: ${(e as Error).message.slice(0, 160)}`;
        o.tries += 1;
        // After repeated failures (e.g. the agent wallet can't pay for data), refund the client rather than let the deadline run out.
        if (o.tries >= MAX_TRIES) {
          const agent = await getAgent(o.agent);
          const job = await escrowJob(Number(id)).catch(() => null);
          if (agent && job?.status === "Funded") {
            await withAgentLock(agent.id, () => agentTx(agent, escrow, "cancel", [BigInt(id)]))
              .then((hash) => pushHistory(agent.id, { kind: "run", label: `Gave up escrow job #${id} after ${MAX_TRIES} failed tries; the client got a full refund`, href: explorerTx(hash) }))
              .catch(() => undefined);
          }
          if (job?.status !== "Submitted") delete open[id];
        }
      }
      results.push({ job: Number(id), agent: o.agent, status });
    }
    await kvSet(OPEN, open);
    return { scanned: cursor, open: Object.keys(open).length, results };
  } finally {
    await releaseLock("escrow-worker");
  }
}
