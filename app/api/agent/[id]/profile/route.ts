import { NextResponse, type NextRequest } from "next/server";
import { allow, pushHistory, saveAgent } from "@/lib/store";
import { OwnerError, verifyOwner } from "@/lib/ownerAuth";
import { normalizeProfile, profileDetail, type AgentProfile } from "@/lib/agentProfile";
import { errorResponse } from "@/lib/http";

export const dynamic = "force-dynamic";

type Body = { profile?: Partial<AgentProfile>; address?: string; issuedAt?: number; signature?: string };

/** Owner-signed: set the agent's public profile (its ERC-8004 registration file). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";
  if (!(await allow(`profile:${ip}`, 20, 600))) return NextResponse.json({ error: "Too many requests. Try again later." }, { status: 429 });
  const b = (await req.json().catch(() => ({}))) as Body;
  let profile: AgentProfile;
  try {
    profile = normalizeProfile(b.profile ?? {});
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
  try {
    const agent = await verifyOwner(id, "set-profile", b, profileDetail(profile));
    agent.profile = profile;
    await saveAgent(agent);
    await pushHistory(agent.id, { kind: "profile", label: "Updated its on-chain profile (registration file)" });
    // Registered agents: refresh the directory's copy of this card.
    if (agent.erc8004Id !== undefined) {
      const { forgetCard } = await import("@/lib/agentIndex");
      const { SITE_URL } = await import("@/lib/config");
      await forgetCard(`${SITE_URL}/api/agent/${agent.id}/card`);
    }
    return NextResponse.json({ ok: true, profile });
  } catch (e) {
    if (e instanceof OwnerError) return NextResponse.json({ error: e.message }, { status: e.status });
    return errorResponse(e, "profile");
  }
}
