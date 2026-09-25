import crypto from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { planCost, runAgent } from "@/lib/agent";
import { ensureHouseGateway } from "@/lib/agentWallet";
import { PLAYGROUND_DAILY_USDC, SITE_URL } from "@/lib/config";
import { allow, getAgent, pushHistory, recordEvent, refundBudget, reserveBudget, resolveAgent, type AgentCard } from "@/lib/store";
import { defaultDescription, strategyName } from "@/lib/strategy";
import { TOOLS, toolById } from "@/lib/tools";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * A2A (Agent2Agent) for a Fuci agent. GET returns its A2A Agent Card; POST speaks JSON-RPC 2.0
 * ("message/send"): another agent sends a text message and gets the agent's answer back.
 * A2A answers are sponsored within Fuci's daily free budget; for unlimited, paid access the card
 * points at the x402 endpoint.
 */

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };

function agentCard(a: AgentCard) {
  const ask = toolById("fuci_agent")!;
  return {
    protocolVersion: "0.3.0",
    name: a.name,
    description: a.profile?.description || defaultDescription(a),
    url: `${SITE_URL}/api/agent/${a.id}/a2a`,
    preferredTransport: "JSONRPC",
    version: "1.0.0",
    iconUrl: `${SITE_URL}/api/agent/${a.id}/image`,
    documentationUrl: `${SITE_URL}/docs`,
    provider: { organization: "Fuci", url: SITE_URL },
    capabilities: { streaming: false, pushNotifications: false, stateTransitionHistory: false },
    defaultInputModes: ["text/plain"],
    defaultOutputModes: ["text/plain"],
    skills: [
      {
        id: "ask",
        name: `Ask ${a.name}`,
        description: `${strategyName(a)} on Arc: answers questions about Argus launches, bonding and market mood, buying live on-chain data over x402. Free within a daily budget; unlimited over x402 at ${ask.price} per answer: POST ${SITE_URL}${ask.path}.`,
        tags: ["Argus", "Arc", "x402", "USDC", "memecoins", ...(a.profile?.skills ?? [])].slice(0, 12),
        examples: ["What launched on Argus in the last hour?", "Which token is closest to bonding?", "Is the tide coming in or going out?"],
      },
      ...TOOLS.filter((t) => t.id !== "fuci_agent").map((t) => ({ id: t.id, name: t.name, description: `${t.description} Paid over x402 (${t.price}): ${t.method} ${SITE_URL}${t.path}`, tags: ["x402"] })),
    ],
  };
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { agent } = await resolveAgent((await params).id);
  if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404, headers: CORS });
  return NextResponse.json(agentCard(agent), { headers: { ...CORS, "Cache-Control": "public, s-maxage=60" } });
}

type RpcRequest = { jsonrpc?: string; id?: string | number | null; method?: string; params?: { message?: { parts?: { kind?: string; type?: string; text?: string }[]; contextId?: string } } };

const rpcError = (id: RpcRequest["id"], code: number, message: string) => NextResponse.json({ jsonrpc: "2.0", id: id ?? null, error: { code, message } }, { headers: CORS });

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rpc = (await req.json().catch(() => null)) as RpcRequest | null;
  if (!rpc || rpc.jsonrpc !== "2.0" || !rpc.method) return rpcError(null, -32600, "Invalid JSON-RPC request");
  if (rpc.method !== "message/send") return rpcError(rpc.id, -32601, `Method not found: ${rpc.method}. This agent supports message/send.`);
  const agent = await getAgent(id).catch(() => null);
  if (!agent) return rpcError(rpc.id, -32001, "Agent not found");

  const text = (rpc.params?.message?.parts ?? [])
    .filter((p) => (p.kind ?? p.type) === "text" && typeof p.text === "string")
    .map((p) => p.text)
    .join("\n")
    .slice(0, 500);
  if (!text.trim()) return rpcError(rpc.id, -32602, "Send a text part with your question");

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";
  if (!(await allow(`a2a:${ip}`, 6, 600))) return rpcError(rpc.id, -32005, "Rate limited. Try again in a few minutes, or pay per answer over x402.");
  const reserved = planCost(agent.strategy);
  if (!(await reserveBudget(reserved, PLAYGROUND_DAILY_USDC))) {
    return rpcError(rpc.id, -32005, `Today's free budget is used. Pay per answer over x402: POST ${SITE_URL}${toolById("fuci_agent")!.path}`);
  }
  await ensureHouseGateway(reserved).catch(() => undefined);

  let spent = 0;
  try {
    const result = await runAgent({ origin: req.nextUrl.origin, prompt: text, strategy: agent.strategy });
    spent = result.spentUsdc;
    await recordEvent({ kind: "agent_run", agent: result.agent, usdc: result.spentUsdc });
    await pushHistory(agent.id, { kind: "run", label: `Answered an A2A message (sponsored by Fuci): "${text.slice(0, 60)}"`, usdc: result.spentUsdc });
    return NextResponse.json(
      {
        jsonrpc: "2.0",
        id: rpc.id ?? null,
        result: {
          kind: "message",
          messageId: crypto.randomUUID(),
          role: "agent",
          contextId: rpc.params?.message?.contextId ?? crypto.randomUUID(),
          parts: [{ kind: "text", text: result.brief }],
          metadata: { paidUsdc: result.spentUsdc, network: "eip155:5042", payments: result.steps.filter((s) => s.kind === "settled").map((s) => s.detail) },
        },
      },
      { headers: CORS },
    );
  } catch (e) {
    return rpcError(rpc.id, -32603, (e as Error).message.slice(0, 200));
  } finally {
    await refundBudget(reserved - spent);
  }
}
