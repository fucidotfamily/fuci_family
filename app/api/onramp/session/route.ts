import { NextResponse, type NextRequest } from "next/server";
import { KitError } from "@circle-fin/onramp-kit/server";
import { ONRAMP_ASSETS, ONRAMP_READY, onrampServer } from "@/lib/onramp";
import { allow, getAgent } from "@/lib/store";

export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };
const fail = (error: string, status: number) => NextResponse.json({ error }, { status, headers: noStore });

const STATUS: Record<string, number> = { INPUT: 400, RATE_LIMIT: 429, NETWORK: 504, SERVICE: 502, RPC: 502 };

/**
 * Mint a single-use onramp session. The destination is decided here, never taken blindly from the
 * browser: `{ agentId }` funds that agent's own wallet (looked up server-side); `{ address }` funds the
 * visitor's own connected wallet.
 */
export async function POST(req: NextRequest) {
  if (!ONRAMP_READY) return fail("Buying USDC with a card isn't set up yet", 503);
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";
  if (!(await allow(`onramp:${ip}`, 10, 600))) return fail("Too many requests. Try again in a few minutes", 429);

  const body = (await req.json().catch(() => ({}))) as { agentId?: unknown; address?: unknown };
  let destinationAddress: string;
  let appUserId: string;
  if (typeof body.agentId === "string" && body.agentId) {
    const agent = await getAgent(body.agentId.slice(0, 64));
    if (!agent) return fail("Agent not found", 404);
    if (!agent.wallet) return fail("This agent has no wallet yet", 409);
    destinationAddress = agent.wallet;
    appUserId = `agent:${agent.id}`;
  } else if (typeof body.address === "string" && /^0x[0-9a-fA-F]{40}$/.test(body.address)) {
    destinationAddress = body.address;
    appUserId = `wallet:${body.address.toLowerCase()}`;
  } else {
    return fail("Send { agentId } or { address }", 400);
  }

  try {
    const session = await onrampServer().createSession({ appUserId, destinationAddress, assets: ONRAMP_ASSETS });
    return NextResponse.json(session, { headers: noStore });
  } catch (e) {
    if (e instanceof KitError) return fail(e.message, STATUS[e.type] ?? 500);
    return fail((e as Error).message ?? "Could not start the purchase", 500);
  }
}
