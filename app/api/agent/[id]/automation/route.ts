import { NextResponse, type NextRequest } from "next/server";
import { AUTOMATION_INTERVALS, allow, pushHistory, resolveAgent, saveAgent, scheduleAgent, spentToday, unscheduleAgent, type Strategy } from "@/lib/store";
import { OwnerError, verifyOwner } from "@/lib/ownerAuth";
import { automationDetail, type AutomationSettings } from "@/lib/ownerMessage";
import { balancesOf, ensureAgentWallet, withdrawAll } from "@/lib/agentWallets";
import { explorerAddress, explorerTx } from "@/lib/config";
import { errorResponse } from "@/lib/http";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const STRATEGIES: Strategy[] = ["scout", "watcher", "oracle"];

/** Automation settings, the agent's own wallet and its balances. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { agent } = await resolveAgent((await params).id);
  if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  // Every agent gets its own wallet up front, so the owner can fund it before setting anything up.
  if (!agent.wallet) {
    const wallet = await ensureAgentWallet(agent.id).catch(() => null);
    if (wallet) {
      const fresh = (await resolveAgent(agent.id)).agent;
      if (fresh && !fresh.wallet) await saveAgent({ ...fresh, wallet });
      agent.wallet = wallet;
    }
  }
  const balances = agent.wallet ? await balancesOf(agent.id).catch(() => null) : null;
  return NextResponse.json(
    {
      automation: agent.automation ?? null,
      dailyLimitUsdc: agent.dailyLimitUsdc,
      spentToday: await spentToday(agent.id),
      wallet: agent.wallet ? { address: agent.wallet, explorer: explorerAddress(agent.wallet), ...(balances ?? { walletUsdc: null, gatewayUsdc: null }) } : null,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

type Body = { action?: "save" | "withdraw"; settings?: AutomationSettings; address?: string; issuedAt?: number; signature?: string };

/** Owner-signed: save automation settings (creates the agent's wallet), or withdraw everything to the owner. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";
  if (!(await allow(`automation:${ip}`, 20, 600))) return NextResponse.json({ error: "Too many requests. Try again later." }, { status: 429 });
  const b = (await req.json().catch(() => ({}))) as Body;
  try {
    if (b.action === "withdraw") {
      const agent = await verifyOwner(id, "withdraw", b, "all to owner");
      if (!agent.wallet) return NextResponse.json({ error: "This agent has no wallet" }, { status: 400 });
      // Tokens the autopilot bought go back to the owner too.
      const { getPositions } = await import("@/lib/trading");
      const { sendToken } = await import("@/lib/trade");
      const { kvSet } = await import("@/lib/store");
      const positions = await getPositions(agent.id);
      let tokens = 0;
      for (const p of Object.values(positions)) if (await sendToken(agent.id, p.token, agent.owner as `0x${string}`).catch(() => null)) tokens++;
      if (Object.keys(positions).length) await kvSet(`positions:${agent.id}`, {});
      const r = await withdrawAll(agent.id, agent.owner as `0x${string}`);
      const tx = r.wallet ?? r.gateway;
      if (!tx && !tokens) return NextResponse.json({ ok: true, nothing: true });
      await pushHistory(agent.id, {
        kind: "payment",
        label: tokens ? `Withdrew the agent's USDC and ${tokens} token(s) to its owner` : "Withdrew the agent's USDC to its owner",
        href: tx && /^0x[0-9a-f]{64}$/i.test(tx) ? explorerTx(tx) : undefined,
      });
      return NextResponse.json({ ok: true, tokens, ...r });
    }

    const s = b.settings;
    if (!s) return NextResponse.json({ error: "settings are required" }, { status: 400 });
    const settings: AutomationSettings = {
      enabled: Boolean(s.enabled),
      everyMinutes: Number(s.everyMinutes),
      strategy: String(s.strategy),
      prompt: String(s.prompt ?? "").replace(/\s+/g, " ").trim().slice(0, 200),
      dailyLimitUsdc: Math.round(Number(s.dailyLimitUsdc) * 100) / 100,
    };
    if (!(AUTOMATION_INTERVALS as readonly number[]).includes(settings.everyMinutes)) return NextResponse.json({ error: "Pick one of the listed intervals" }, { status: 400 });
    if (!STRATEGIES.includes(settings.strategy as Strategy)) return NextResponse.json({ error: "Unknown strategy" }, { status: 400 });
    if (!(settings.dailyLimitUsdc >= 0.01 && settings.dailyLimitUsdc <= 100)) return NextResponse.json({ error: "Daily limit must be 0.01–100 USDC" }, { status: 400 });

    const agent = await verifyOwner(id, "set-automation", b, automationDetail(settings));
    agent.wallet ??= await ensureAgentWallet(agent.id);
    agent.dailyLimitUsdc = settings.dailyLimitUsdc;
    const wasOn = Boolean(agent.automation?.enabled);
    agent.automation = {
      enabled: settings.enabled,
      everyMinutes: settings.everyMinutes,
      strategy: settings.strategy as Strategy,
      prompt: settings.prompt,
      // First run about a minute after switching on; otherwise keep the current slot.
      nextRunAt: settings.enabled && !wasOn ? Date.now() + 60_000 : (agent.automation?.nextRunAt ?? Date.now() + 60_000),
      lastRunAt: agent.automation?.lastRunAt,
      failures: 0,
    };
    await saveAgent(agent);
    if (settings.enabled) await scheduleAgent(agent.id, agent.automation.nextRunAt);
    else await unscheduleAgent(agent.id);
    if (settings.enabled !== wasOn) {
      await pushHistory(agent.id, { kind: "profile", label: settings.enabled ? `Automation on: every ${label(settings.everyMinutes)}` : "Automation off" });
    }
    return NextResponse.json({ ok: true, automation: agent.automation, wallet: agent.wallet });
  } catch (e) {
    if (e instanceof OwnerError) return NextResponse.json({ error: e.message }, { status: e.status });
    return errorResponse(e, "automation");
  }
}

const label = (m: number) => (m < 60 ? `${m} min` : m < 1440 ? `${m / 60} h` : "day");
