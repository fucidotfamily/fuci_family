import { NextRequest, NextResponse } from "next/server";
import { withX402, x402ResourceServer } from "@x402/next";
import type { FacilitatorClient } from "@x402/core/server";
import {
  BatchFacilitatorClient,
  GatewayEvmScheme,
} from "@circle-fin/x402-batching/server";
import {
  bazaarResourceServerExtension,
  declareDiscoveryExtension,
} from "@x402/extensions/bazaar";
import { ARC_NETWORK, X402_NETWORKS } from "./config";
import { sellerAddress } from "./circle";
import { priceToNumber, type FuciTool } from "./tools";
import { recordEvent } from "./store";

/**
 * Seller side of x402: Circle Gateway batched settlement (gas-free for the
 * buyer, USDC on Arc) wired through @x402/next's withX402, which settles only
 * after the handler succeeds (< 400). Payments go to FUCI_SELLER_ADDRESS or the
 * auto-created Circle treasury wallet. There is no simulated mode.
 */

const GATEWAY_URL =
  ARC_NETWORK === "mainnet"
    ? "https://gateway-api.circle.com"
    : "https://gateway-api-testnet.circle.com";

let server: x402ResourceServer | null = null;
function resourceServer() {
  if (!server) {
    // Cast: x402-batching is typed against an older @x402/core minor; the runtime shape matches.
    const facilitator = new BatchFacilitatorClient({
      url: GATEWAY_URL,
    }) as unknown as FacilitatorClient;
    server = new x402ResourceServer([facilitator]);
    // One Gateway scheme per accepted network: the same batched USDC payment, settled by Circle Gateway.
    for (const n of X402_NETWORKS)
      server.register(n.network, new GatewayEvmScheme());
    // Bazaar: the 402 challenge carries each tool's input and output schema, so agents know how to call it.
    server.registerExtension(bazaarResourceServerExtension);
  }
  return server;
}

type Handler = (req: NextRequest) => Promise<NextResponse>;

/** Payment requirements for a tool, for discovery (manifest, MCP). */
export function requirementsFor(
  tool: FuciTool,
  resource: string,
  payTo: string,
) {
  return {
    x402Version: 2,
    error: "Payment required",
    resource: {
      url: resource,
      description: tool.description,
      mimeType: "application/json",
    },
    accepts: X402_NETWORKS.map((n) => ({
      scheme: "exact",
      network: n.network,
      amount: String(Math.round(priceToNumber(tool.price) * 1e6)), // USDC atomic units (6dp)
      asset: n.usdc,
      payTo,
      maxTimeoutSeconds: 604900,
      extra: {
        name: "GatewayWalletBatched",
        version: "1",
        assets: [{ symbol: "USDC", address: n.usdc, decimals: 6 }],
      },
    })),
  };
}

/** Bazaar discovery info for a tool: its inputs (query or JSON body) and the shape of its answer. */
function discovery(tool: FuciTool) {
  const fields = Object.entries(tool.input ?? {});
  const inputSchema = {
    type: "object",
    properties: Object.fromEntries(
      fields.map(([k, v]) => [k, { type: v.type, description: v.description }]),
    ),
    required: fields.filter(([, v]) => !v.optional).map(([k]) => k),
  };
  const output = {
    schema: { type: "object", description: `JSON answer of ${tool.name}.` },
  };
  const input = Object.fromEntries(fields.map(([k, v]) => [k, v.example]));
  return tool.method === "POST"
    ? declareDiscoveryExtension({
        bodyType: "json",
        input,
        inputSchema,
        output,
      })
    : declareDiscoveryExtension({ input, inputSchema, output });
}

const notConfigured = () =>
  NextResponse.json(
    {
      error:
        "Payments are not configured yet. The site owner needs to finish /setup (Circle keys).",
    },
    { status: 503 },
  );

/** Who paid, and on which network, read from the x402 payment header (for the public payments feed). */
function payerOf(req: NextRequest): { payer?: string; network?: string } {
  const raw =
    req.headers.get("payment-signature") ?? req.headers.get("x-payment");
  if (!raw) return {};
  try {
    const p = JSON.parse(Buffer.from(raw, "base64").toString("utf8")) as {
      network?: string;
      accepted?: { network?: string };
      payload?: { authorization?: { from?: string } };
    };
    const from = p.payload?.authorization?.from;
    const network = p.accepted?.network ?? p.network;
    return {
      ...(from && /^0x[0-9a-fA-F]{40}$/.test(from)
        ? { payer: from.toLowerCase() }
        : {}),
      ...(network && /^eip155:\d+$/.test(network) ? { network } : {}),
    };
  } catch {
    return {};
  }
}

/** Wrap a route handler so it costs `tool.price` USDC over x402 on Arc. */
export function paid(tool: FuciTool, handler: Handler): Handler {
  const recording: Handler = async (req) => {
    const res = await handler(req);
    if (res.status < 400) {
      await recordEvent({
        kind: "payment",
        agent: req.headers.get("x-fuci-agent") ?? "",
        tool: tool.id,
        usdc: priceToNumber(tool.price),
        ...payerOf(req),
      });
    }
    return res;
  };

  // The receiving address may need a Circle API call (treasury wallet), so the
  // x402 wrapper is built on the first request and then reused.
  let live: Promise<Handler | null> | null = null;
  const build = async (): Promise<Handler | null> => {
    const payTo = await sellerAddress();
    if (!payTo) return null;
    return withX402(
      recording,
      {
        accepts: X402_NETWORKS.map((n) => ({
          scheme: "exact",
          price: tool.price,
          network: n.network,
          payTo,
        })),
        description: tool.description,
        mimeType: "application/json",
        extensions: discovery(tool),
      },
      resourceServer(),
    ) as Handler;
  };

  return async (req) => {
    if (!live) {
      live = build();
      live.then((h) => h ?? (live = null)).catch(() => (live = null)); // retry until configured / reachable
    }
    try {
      const h = await live;
      return h ? await h(req) : notConfigured();
    } catch (e) {
      const reason =
        (e as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? (e as Error)?.message;
      return NextResponse.json(
        {
          error:
            "Payment receiver unavailable. Check the Circle keys on /setup.",
          reason,
        },
        { status: 503 },
      );
    }
  };
}
