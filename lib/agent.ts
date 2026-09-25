import Anthropic from "@anthropic-ai/sdk";
import { x402Client, wrapFetchWithPayment, decodePaymentResponseHeader } from "@x402/fetch";
import { registerBatchScheme } from "@circle-fin/x402-batching/client";
import { ARC_USDC, X402_NETWORK, explorerTx } from "./config";
import { AGENT_MODE, agentSigner } from "./agentWallet";
import { TOOLS, priceToNumber, toolById } from "./tools";
import type { Strategy } from "./store";

/**
 * The Fuci agent (buyer side of x402). A "frond" with its own wallet
 * (self-managed key, or Circle Wallets):
 *   1. plans which paid Fuci tools answer the prompt,
 *   2. calls each one, receives HTTP 402, signs a USDC authorization,
 *      retries with the payment header and gets real on-chain data,
 *   3. writes a brief (Claude if ANTHROPIC_API_KEY is set, else from the data).
 */

export type TraceStep = {
  t: number; // ms since run start
  kind: "plan" | "request" | "402" | "sign" | "settled" | "data" | "brief" | "limit" | "error";
  label: string;
  detail?: string;
  usdc?: number;
  href?: string;
  tool?: string;
};

export type RunResult = {
  agent: string;
  wallet: string;
  spentUsdc: number;
  steps: TraceStep[];
  brief: string;
  data: Record<string, unknown>;
};

const PLANS: Record<Strategy | "ask", string[]> = {
  scout: ["argus_launches"],
  watcher: ["argus_launches", "argus_bonding"],
  oracle: ["fucus_oracle"],
  ask: ["argus_launches", "argus_bonding", "fucus_oracle"],
  // A custom agent follows its owner's mission, so it may use every tool.
  custom: ["argus_launches", "argus_bonding", "fucus_oracle"],
};

/** Worst-case cost of a plan, used to reserve the sponsored budget up front. */
export const planCost = (strategy?: Strategy) =>
  PLANS[strategy ?? "ask"].reduce((s, id) => s + priceToNumber(toolById(id)!.price), 0);

const isTxHash = (s?: string) => Boolean(s && /^0x[0-9a-fA-F]{64}$/.test(s));

export async function runAgent(opts: {
  origin: string;
  prompt: string;
  agentId?: string;
  strategy?: Strategy;
  maxSpendUsdc?: number;
  /** Pay from this wallet instead of the house agent's (automated agents use their own). */
  signer?: Awaited<ReturnType<typeof agentSigner>>;
}): Promise<RunResult> {
  const start = Date.now();
  const steps: TraceStep[] = [];
  const log = (s: Omit<TraceStep, "t">) => steps.push({ ...s, t: Date.now() - start });
  const agent = opts.agentId ?? "house-frond";
  const cap = opts.maxSpendUsdc ?? 0.01;
  const data: Record<string, unknown> = {};
  let spent = 0;

  if (!opts.signer && AGENT_MODE === "none") {
    log({ kind: "error", label: "Agent wallet not configured", detail: "The site owner needs to finish /setup (AGENT_PRIVATE_KEY)" });
    return { agent, wallet: "", spentUsdc: 0, steps, brief: "This agent has no wallet yet, so it can't pay for data.", data };
  }

  let signer;
  try {
    signer = opts.signer ?? (await agentSigner());
  } catch (e) {
    log({ kind: "error", label: "Agent wallet unavailable", detail: errText(e) });
    return { agent, wallet: "", spentUsdc: 0, steps, brief: "The agent's wallet could not be loaded.", data };
  }

  const client = new x402Client();
  // Arc USDC isn't in x402's default-asset list; allow it explicitly, capped at 1 cent per call.
  client.setSpendControls({ allowedAssets: [{ network: X402_NETWORK, asset: ARC_USDC, maxAmountPerPayment: "10000" }] });
  const scheme = registerBatchScheme(client, { signer, networks: [X402_NETWORK] });
  scheme.onBeforePaymentCreation(async (ctx) => {
    const usdc = Number(ctx.selectedRequirements.amount) / 1e6;
    if (spent + usdc > cap + 1e-9) return { abort: true, reason: `spend limit ${cap} USDC reached` };
    log({ kind: "402", label: `402 Payment Required: ${usdc} USDC`, detail: `${ctx.selectedRequirements.network} → ${short(ctx.selectedRequirements.payTo)}` });
    log({ kind: "sign", label: `Signing ${usdc} USDC authorization`, detail: !opts.signer && AGENT_MODE === "circle" ? "EIP-712 via Circle Wallets signTypedData" : "EIP-712 by the agent's own key" });
  });
  const payFetch = wrapFetchWithPayment(fetch, client);

  const plan = PLANS[opts.strategy ?? "ask"];
  log({ kind: "plan", label: `Plan: ${plan.map((id) => toolById(id)!.name).join(" → ")}`, detail: opts.prompt });

  let curveToken: string | undefined;
  for (const id of plan) {
    const tool = toolById(id)!;
    const price = priceToNumber(tool.price);
    if (spent + price > cap + 1e-9) {
      log({ kind: "limit", label: `Skipped ${tool.name}: spend limit ${cap} USDC` });
      continue;
    }
    const url = new URL(tool.path, opts.origin);
    if (id === "argus_bonding" && curveToken) url.searchParams.set("token", curveToken);
    log({ kind: "request", label: `GET ${tool.path}`, detail: url.search || undefined });

    try {
      const res = await payFetch(url, { headers: { "x-fuci-agent": agent } });
      if (!res.ok) throw new Error(await failureReason(res));
      const receipt = readReceipt(res);
      spent += price;
      log({
        kind: "settled",
        label: `Paid ${price} USDC via Circle Gateway`,
        tool: tool.name,
        detail: receipt?.transaction ? short(receipt.transaction) : "in Gateway's next settlement batch",
        usdc: price,
        href: isTxHash(receipt?.transaction) ? explorerTx(receipt!.transaction!) : undefined,
      });
      data[id] = await res.json();
      log({ kind: "data", label: `${tool.name}: received on-chain data` });
      if (id === "argus_launches") curveToken = (data[id] as { data?: { token: string }[] })?.data?.[0]?.token;
    } catch (err) {
      log({ kind: "error", label: `${tool.name} failed`, detail: errText(err) });
    }
  }

  const brief = Object.keys(data).length ? await writeBrief(opts.prompt, data) : "No data was bought, so there is nothing to report.";
  log({ kind: "brief", label: process.env.ANTHROPIC_API_KEY ? "Brief written by Claude" : "Brief written from the data" });

  return { agent, wallet: signer.address, spentUsdc: Math.round(spent * 1e6) / 1e6, steps, brief, data };
}

const errText = (e: unknown) => {
  const err = e as { response?: { data?: { message?: string } }; message?: string };
  return err?.response?.data?.message ?? err?.message ?? String(e);
};

function readReceipt(res: Response): { transaction?: string } | null {
  const h = res.headers.get("PAYMENT-RESPONSE") ?? res.headers.get("X-PAYMENT-RESPONSE");
  if (!h) return null;
  try {
    return decodePaymentResponseHeader(h) as { transaction?: string };
  } catch {
    return null;
  }
}

/** Pull the facilitator's reason out of a failed paid request (e.g. insufficient Gateway balance). */
async function failureReason(res: Response) {
  for (const name of ["PAYMENT-RESPONSE", "PAYMENT-REQUIRED"]) {
    const header = res.headers.get(name);
    if (!header) continue;
    try {
      const body = JSON.parse(Buffer.from(header, "base64").toString("utf8")) as { errorReason?: string; error?: string };
      const reason = body.errorReason ?? body.error;
      if (reason === "insufficient_balance") return "The paying wallet's Gateway balance is empty. Owners: fund the agent on its page. Site owner: add USDC to the house agent on /setup";
      if (reason) return `${res.status}: ${reason}`;
    } catch {
      // not base64 JSON
    }
  }
  const body = (await res.json().catch(() => null)) as { error?: string } | null;
  return body?.error ? `${res.status}: ${body.error}` : `${res.status} ${res.statusText}`;
}

const short = (s: string) => (s.length > 14 ? `${s.slice(0, 6)}…${s.slice(-4)}` : s);

export async function writeBrief(prompt: string, data: Record<string, unknown>): Promise<string> {
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const client = new Anthropic();
      const response = await client.beta.messages.create({
        model: "claude-opus-5",
        // Server-side refusal fallback: routes a declined request to a fallback model.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        max_tokens: 1024,
        output_config: { effort: "low" },
        system:
          "You are a Fuci agent, a small AI 'frond' on the Arc blockchain that buys Argus market data over x402. " +
          "Answer the user's question in at most 4 short sentences using only the JSON data provided. " +
          "Mention token symbols and USDC figures. No financial advice, no hype.",
        messages: [
          { role: "user", content: `Question: ${prompt}\n\nData bought over x402:\n${JSON.stringify(data).slice(0, 12_000)}` },
        ],
      });
      if (response.stop_reason !== "refusal") {
        const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("").trim();
        if (text) return text;
      }
    } catch {
      // fall through to the template brief
    }
  }
  return templateBrief(data);
}

function templateBrief(data: Record<string, unknown>): string {
  const parts: string[] = [];
  const launches = (data.argus_launches as { data?: { symbol: string }[] })?.data;
  if (launches?.length) parts.push(`Newest Argus launches: ${launches.slice(0, 4).map((l) => `$${l.symbol}`).join(", ")}.`);
  const b = (data.argus_bonding as { data?: { symbol: string; progress: number; bonded: boolean; priceUsdc: number; buyTaxPct: number; sellTaxPct: number } })?.data;
  if (b)
    parts.push(
      `$${b.symbol} trades at ${b.priceUsdc.toPrecision(3)} USDC${b.bonded ? " and has bonded" : `, ${(b.progress * 100).toFixed(0)}% of the way to bonding`} (tax ${b.buyTaxPct}% buy / ${b.sellTaxPct}% sell).`,
    );
  const tide = (data.fucus_oracle as { data?: { reading: string } })?.data;
  if (tide) parts.push(tide.reading);
  return parts.join(" ") || "The tide is quiet. No data came back this time.";
}

export const AGENT_PROMPT_PRICE = TOOLS.find((t) => t.id === "fuci_agent")!.price;
