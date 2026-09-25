import { NextResponse, type NextRequest } from "next/server";
import { OwnerError, verifyOwner } from "@/lib/ownerAuth";
import { X_ENABLED, authorizeUrl, pkce } from "@/lib/xAuth";
import { allow, kvSet } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Owner-signed: start "Connect X" for an agent and return X's authorize URL. */
export async function POST(req: NextRequest) {
  if (!X_ENABLED) return NextResponse.json({ error: "X login is not set up on this site yet (X_CLIENT_ID / X_CLIENT_SECRET)." }, { status: 503 });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";
  if (!(await allow(`x-start:${ip}`, 10, 600))) return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  const b = (await req.json().catch(() => ({}))) as { agent?: string; address?: string; issuedAt?: number; signature?: string };
  try {
    const agent = await verifyOwner(b.agent ?? "", "connect-x", b);
    const { verifier, challenge, state } = pkce();
    const redirectUri = `${req.nextUrl.origin}/api/x/callback`;
    await kvSet(`x-oauth:${state}`, { agent: agent.id, verifier, redirectUri }, 600);
    return NextResponse.json({ url: authorizeUrl({ state, challenge, redirectUri }) });
  } catch (e) {
    if (e instanceof OwnerError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
