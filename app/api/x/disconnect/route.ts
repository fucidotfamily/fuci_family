import { NextResponse, type NextRequest } from "next/server";
import { OwnerError, verifyOwner } from "@/lib/ownerAuth";
import { kvSet, pushHistory, saveAgent } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Owner-signed: remove the X account from an agent card. */
export async function POST(req: NextRequest) {
  const b = (await req.json().catch(() => ({}))) as { agent?: string; address?: string; issuedAt?: number; signature?: string };
  try {
    const agent = await verifyOwner(b.agent ?? "", "disconnect-x", b);
    if (agent.x) await kvSet(`x-account:${agent.x.id}`, null, 1);
    const handle = agent.x?.username;
    delete agent.x;
    await saveAgent(agent);
    if (handle) await pushHistory(agent.id, { kind: "profile", label: `Disconnected X @${handle}` });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof OwnerError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
