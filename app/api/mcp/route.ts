import { NextResponse, type NextRequest } from "next/server";
import { TOOLS, toolById } from "@/lib/tools";
import { requirementsFor } from "@/lib/x402";
import { sellerAddress } from "@/lib/circle";
import { MCP_PROMPTS, MCP_RESOURCES } from "@/lib/mcpCatalog";

export const dynamic = "force-dynamic";

/**
 * Minimal MCP (JSON-RPC over Streamable HTTP, JSON responses) exposing the
 * Fuci tools. Calls don't run the tool for free: they return the x402 payment
 * requirements and the URL to pay, so an x402-capable agent can settle and fetch.
 */
type Rpc = { jsonrpc: "2.0"; id?: string | number | null; method: string; params?: Record<string, unknown> };

/** Paid tools answer with the x402 payment to make (method, URL and requirements), not the data itself. */
const PAYMENT_SCHEMA = {
  type: "object",
  properties: {
    method: { type: "string", description: "HTTP method to call with an x402 client" },
    url: { type: "string", description: "URL to call; it answers 402 with the price, then the data once paid" },
    body: { type: "object", description: "JSON body for POST tools" },
  },
  required: ["method", "url"],
  additionalProperties: true,
};
/** Every Fuci tool only reads data; nothing is changed or spent by calling it. */
const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };

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
          capabilities: { tools: { listChanged: false }, prompts: { listChanged: false }, resources: { listChanged: false, subscribe: false } },
          serverInfo: { name: "fuci", title: "Fuci", version: "1.1.0", websiteUrl: "https://www.fuci.family" },
          instructions: "Fuci tools are paid per call in USDC on Arc via x402. tools/call returns payment requirements and the URL to pay.",
        }),
      );
    case "ping":
      return NextResponse.json(ok(msg.id, {}));
    case "resources/list":
      return NextResponse.json(ok(msg.id, { resources: MCP_RESOURCES.map((r) => ({ uri: r.uri, name: r.name, title: r.title, description: r.description, mimeType: r.mimeType })) }));
    case "resources/templates/list":
      return NextResponse.json(ok(msg.id, { resourceTemplates: [] }));
    case "resources/read": {
      const r = MCP_RESOURCES.find((x) => x.uri === msg.params?.uri);
      if (!r) return NextResponse.json(fail(msg.id, -32002, "Resource not found"));
      const text = await fetch(r.url, { cache: "no-store" })
        .then((res) => (res.ok ? res.text() : Promise.reject(new Error(`HTTP ${res.status}`))))
        .catch(() => null);
      if (text === null) return NextResponse.json(fail(msg.id, -32603, `Couldn't read ${r.url}`));
      return NextResponse.json(ok(msg.id, { contents: [{ uri: r.uri, mimeType: r.mimeType, text }] }));
    }
    case "prompts/list":
      return NextResponse.json(ok(msg.id, { prompts: MCP_PROMPTS.map((p) => ({ name: p.name, title: p.title, description: p.description, arguments: p.arguments })) }));
    case "prompts/get": {
      const p = MCP_PROMPTS.find((x) => x.name === msg.params?.name);
      if (!p) return NextResponse.json(fail(msg.id, -32602, "Unknown prompt"));
      const args = Object.fromEntries(Object.entries((msg.params?.arguments as Record<string, unknown>) ?? {}).map(([k, v]) => [k, String(v)]));
      const missing = p.arguments.find((a) => a.required && !args[a.name]);
      if (missing) return NextResponse.json(fail(msg.id, -32602, `Missing argument: ${missing.name}`));
      return NextResponse.json(ok(msg.id, { description: p.description, messages: [{ role: "user", content: { type: "text", text: p.text(args) } }] }));
    }
    case "tools/list":
      return NextResponse.json(
        ok(msg.id, {
          tools: [
            {
              name: "fuci_reputation",
              title: "ERC-8004 reputation",
              description: "Free. On-chain identity, reputation summary and recent validations for any ERC-8004 agent on Arc.",
              inputSchema: { type: "object", properties: { agentId: { type: "number", description: "ERC-8004 agentId" } }, required: ["agentId"], additionalProperties: false },
              outputSchema: {
                type: "object",
                properties: {
                  reputation: { type: "object", description: "Reputation summary from the ERC-8004 Reputation Registry" },
                  validations: { type: "array", description: "Recent ERC-8004 validations", items: { type: "object" } },
                  directory: { type: ["object", "null"], description: "Rank in the Fuci agent directory, if listed" },
                },
                required: ["reputation", "validations"],
                additionalProperties: true,
              },
              annotations: { title: "ERC-8004 reputation", ...READ_ONLY },
            },
            {
              name: "market_search",
              title: "Fuci Market search",
              description: "Free. Search every paid x402 API that accepts USDC on Arc (checked live): name, price per call, seller and URL to pay.",
              inputSchema: {
                type: "object",
                properties: { query: { type: "string", description: "What you need, e.g. 'web search' or 'token price'" }, limit: { type: "number", description: "Max results (1-25)" } },
                required: ["query"],
                additionalProperties: false,
              },
              outputSchema: {
                type: "object",
                properties: {
                  total: { type: "number", description: "Number of listings returned" },
                  listings: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        name: { type: "string" },
                        description: { type: "string" },
                        method: { type: "string" },
                        url: { type: "string" },
                        priceUsdc: { type: "number" },
                        networks: { type: "array", items: { type: "string" } },
                        seller: { type: "string" },
                        checkedAt: { type: "string" },
                      },
                    },
                  },
                },
                required: ["total", "listings"],
              },
              annotations: { title: "Fuci Market search", ...READ_ONLY },
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
            outputSchema: PAYMENT_SCHEMA,
            annotations: { title: t.name, ...READ_ONLY },
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
      if (msg.params?.name === "market_search") {
        const args = (msg.params?.arguments ?? {}) as { query?: unknown; limit?: unknown };
        const { getMarket, searchMarket } = await import("@/lib/market");
        const { market } = await getMarket();
        const limit = Math.min(25, Math.max(1, Number(args.limit) || 10));
        const hits = searchMarket(market?.listings ?? [], String(args.query ?? "").slice(0, 80))
          .slice(0, limit)
          .map((l) => ({ name: l.name, description: l.description, method: l.method, url: l.url, priceUsdc: l.priceUsdc, networks: l.networks, seller: l.seller, checkedAt: new Date(l.checkedAt).toISOString() }));
        const result = { total: hits.length, listings: hits };
        return NextResponse.json(ok(msg.id, { content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: result, isError: false }));
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
