import { NextRequest, NextResponse } from "next/server";
import { withX402, x402ResourceServer } from "@x402/next";
import type { FacilitatorClient } from "@x402/core/server";
import { BatchFacilitatorClient, GatewayEvmScheme } from "@circle-fin/x402-batching/server";
import { ARC_NETWORK, ARC_USDC, X402_NETWORK } from "./config";
import { sellerAddress } from "./circle";
import { priceToNumber, type FuciTool } from "./tools";
import { recordEvent } from "./store";

/**
 * Seller side of x402: Circle Gateway batched settlement (gas-free for the
 * buyer, USDC on Arc) wired through @x402/next's withX402, which settles only
 * after the handler succeeds (< 400). Payments go to FUCI_SELLER_ADDRESS or the
 * auto-created Circle treasury wallet. There is no simulated mode.
 */

const GATEWAY_URL = ARC_NETWORK === "mainnet" ? "https://gateway-api.circle.com" : "https://gateway-api-testnet.circle.com";

let server: x402ResourceServer | null = null;
function resourceServer() {
  if (!server) {
    // Cast: x402-batching is typed against an older @x402/core minor; the runtime shape matches.
    const facilitator = new BatchFacilitatorClient({ url: GATEWAY_URL }) as unknown as FacilitatorClient;
    server = new x402ResourceServer([facilitator]).register(X402_NETWORK, new GatewayEvmScheme());
  }
  return server;
}

type Handler = (req: NextRequest) => Promise<NextResponse>;

/** Payment requirements for a tool, for discovery (manifest, MCP). */
export function requirementsFor(tool: FuciTool, resource: string, payTo: string) {
  return {
    x402Version: 2,
    error: "Payment required",
    resource: { url: resource, description: tool.description, mimeType: "application/json" },
    accepts: [
      {
        scheme: "exact",
        network: X402_NETWORK,
        amount: String(Math.round(priceToNumber(tool.price) * 1e6)), // USDC atomic units (6dp)
        asset: ARC_USDC,
        payTo,
        maxTimeoutSeconds: 604900,
        extra: { name: "GatewayWalletBatched", version: "1", assets: [{ symbol: "USDC", address: ARC_USDC, decimals: 6 }] },
      },
    ],
  };
}

const notConfigured = () =>
  NextResponse.json(
    { error: "Payments are not configured yet. The site owner needs to finish /setup (Circle keys)." },
    { status: 503 },
  );

/** Wrap a route handler so it costs `tool.price` USDC over x402 on Arc. */
export function paid(tool: FuciTool, handler: Handler): Handler {
  const recording: Handler = async (req) => {
    const res = await handler(req);
    if (res.status < 400) {
      await recordEvent({ kind: "payment", agent: req.headers.get("x-fuci-agent") ?? "", tool: tool.id, usdc: priceToNumber(tool.price) });
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
        accepts: { scheme: "exact", price: tool.price, network: X402_NETWORK, payTo },
        description: tool.description,
        mimeType: "application/json",
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
      const reason = (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? (e as Error)?.message;
      return NextResponse.json({ error: "Payment receiver unavailable. Check the Circle keys on /setup.", reason }, { status: 503 });
    }
  };
}
