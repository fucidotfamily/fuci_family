import { NextResponse, type NextRequest } from "next/server";
import { xProfile } from "@/lib/xAuth";
import { getAgent, kvGet, kvSet, pushHistory, saveAgent } from "@/lib/store";

export const dynamic = "force-dynamic";

/** X redirects here after login. Saves the verified X profile on the agent card. */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const state = sp.get("state") ?? "";
  const pending = state ? await kvGet<{ agent: string; verifier: string; redirectUri: string }>(`x-oauth:${state}`) : null;
  const back = (agent: string | null, status: string) => NextResponse.redirect(new URL(agent ? `/agent/${agent}?x=${status}` : `/?x=${status}`, req.nextUrl.origin));
  if (!pending) return back(null, "expired");
  await kvSet(`x-oauth:${state}`, null, 1); // one use
  if (sp.get("error") || !sp.get("code")) return back(pending.agent, "cancelled");

  try {
    const profile = await xProfile(sp.get("code")!, pending.verifier, pending.redirectUri);
    const agent = await getAgent(pending.agent);
    if (!agent) return back(null, "missing");
    // One X account per agent: connecting it here removes it from any other agent.
    const previous = await kvGet<string>(`x-account:${profile.id}`);
    if (previous && previous !== agent.id) {
      const other = await getAgent(previous);
      if (other?.x?.id === profile.id) {
        delete other.x;
        await saveAgent(other);
      }
    }
    agent.x = { ...profile, connectedAt: Date.now() };
    await saveAgent(agent);
    await kvSet(`x-account:${profile.id}`, agent.id);
    await pushHistory(agent.id, { kind: "profile", label: `Connected X @${profile.username}` });
    return back(agent.id, "connected");
  } catch (e) {
    console.error("[x/callback]", (e as Error).message);
    return back(pending.agent, "failed");
  }
}
