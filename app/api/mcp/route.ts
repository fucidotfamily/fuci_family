import { NextResponse, type NextRequest } from "next/server";
import { TOOLS, toolById } from "@/lib/tools";
import { requirementsFor } from "@/lib/x402";
import { sellerAddress } from "@/lib/circle";

export const dynamic = "force-dynamic";

/**
 * Minimal MCP (JSON-RPC over Streamable HTTP, JSON responses) exposing the
 * Fuci tools. Calls don't run the tool for free: they return the x402 payment
 * requirements and the URL to pay, so an x402-capable agent can settle and fetch.
 */
type Rpc = { jsonrpc: "2.0"; id?: string | number | null; method: string; params?: Record<string, unknown> };

const ok = (id: Rpc["id"], result: unknown) => ({ jsonrpc: "2.0", id, result });
const fail = (id: Rpc["id"], code: number, message: string) => ({ jsonrpc: "2.0", id, error: { code, message } });

export async function POST(req: NextRequest) {
  const msg = (await req.json().catch(() => null)) as Rpc | null;
  if (!msg || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") {
    return NextResponse.json(fail(null, -32700, "Parse error"), { status: 400 });
  }
  if (msg.id === undefined) return new NextResponse(null, { status: 202 }); // notification

  const origin = req.nextUrl.origin;
  switch (msg.method) {
    case "initialize":
      return NextResponse.json(
        ok(msg.id, {
          protocolVersion: (msg.params?.protocolVersion as string) ?? "2025-06-18",
          capabilities: { tools: {} },
          serverInfo: { name: "fuci", version: "0.1.0" },
          instructions: "Fuci tools are paid per call in USDC on Arc via x402. tools/call returns payment requirements and the URL to pay.",
        }),
      );
    case "ping":
      return NextResponse.json(ok(msg.id, {}));
    case "tools/list":
      return NextResponse.json(
        ok(msg.id, {
          tools: [
            {
              name: "fuci_reputation",
              title: "ERC-8004 reputation",
              description: "Free. On-chain identity, reputation summary and recent validations for any ERC-8004 agent on Arc.",
              inputSchema: { type: "object", properties: { agentId: { type: "number", description: "ERC-8004 agentId" } }, required: ["agentId"], additionalProperties: false },
            },
            ...TOOLS.map((t) => ({
            name: t.id,
            title: t.name,
            description: `${t.description} Price: ${t.price} USDC (x402).`,
            inputSchema: {
              type: "object",
              properties: Object.fromEntries(Object.entries(t.input ?? {}).map(([k, v]) => [k, { type: v.type, description: v.description }])),
              additionalProperties: false,
            },
          })),
          ],
        }),
      );
    case "tools/call": {
      if (msg.params?.name === "fuci_reputation") {
        const id = Number((msg.params?.arguments as { agentId?: number } | undefined)?.agentId);
        if (!Number.isInteger(id) || id < 0) return NextResponse.json(fail(msg.id, -32602, "agentId must be a non-negative integer"));
        const e = await import("@/lib/erc8004");
        try {
          const [agent, reputation, validations, stored] = await Promise.all([
            e.readAgent(id),
            e.reputationOf(id),
            e.validationsOf(id).catch(() => []),
            import("@/lib/agentIndex").then((m) => m.storedIndex()).catch(() => null),
          ]);
          const ranked = stored?.index?.agents.find((a) => a.agentId === id);
          const directory = ranked ? { rank: ranked.rank, of: stored!.index!.total, score: ranked.score, x402: ranked.x402, complete: ranked.complete, missing: ranked.missing } : null;
          const result = { ...agent, reputation, validations, directory };
          return NextResponse.json(ok(msg.id, { content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: result, isError: false }));
        } catch (err) {
          return NextResponse.json(ok(msg.id, { content: [{ type: "text", text: `No such agent: ${(err as Error).message.slice(0, 120)}` }], isError: true }));
        }
      }
      const tool = toolById(String(msg.params?.name ?? ""));
      if (!tool) return NextResponse.json(fail(msg.id, -32602, "Unknown tool"));
      const args = (msg.params?.arguments ?? {}) as Record<string, string>;
      const url = new URL(tool.path, origin);
      if (tool.method === "GET") for (const [k, v] of Object.entries(args)) url.searchParams.set(k, String(v));
      const payTo = await sellerAddress().catch(() => null);
      if (!payTo) return NextResponse.json(fail(msg.id, -32000, "Payments are not configured yet on this Fuci deployment"));
      const payment = { method: tool.method, url: url.toString(), body: tool.method === "POST" ? args : undefined, ...requirementsFor(tool, url.toString(), payTo) };
      return NextResponse.json(
        ok(msg.id, {
          content: [
            {
              type: "text",
              text: `Payment required: ${tool.price} USDC on Arc via x402. ${tool.method} ${url} with an x402 client (e.g. @x402/fetch or Circle GatewayClient.pay) to receive the result.`,
            },
          ],
          structuredContent: payment,
          isError: false,
        }),
      );
    }
    default:
      return NextResponse.json(fail(msg.id, -32601, `Method not found: ${msg.method}`));
  }
}

export function GET() {
  return NextResponse.json({ name: "fuci", transport: "streamable-http (JSON)", tools: TOOLS.map((t) => t.id) });
}
