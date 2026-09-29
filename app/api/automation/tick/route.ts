import crypto from "node:crypto";
import { NextResponse, after, type NextRequest } from "next/server";
import { tickSecret } from "@/lib/agentWallets";
import { runDue } from "@/lib/automation";
import { SITE_URL } from "@/lib/config";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const same = (a: string, b: string) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

/**
 * Runs the agents that are due. Called every 5 minutes by Vercel Cron (vercel.json), which sends
 * "Authorization: Bearer <CRON_SECRET>", or by another scheduler (e.g. Upstash QStash) with the tick secret.
 */
async function tick(req: NextRequest) {
  const bearer = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  let ok = false;
  try {
    ok = Boolean(bearer) && (same(bearer, tickSecret()) || Boolean(process.env.CRON_SECRET && same(bearer, process.env.CRON_SECRET)));
  } catch {
    ok = false;
  }
  if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Keep the /agents directory fresh too, after the response.
  after(async () => {
    const { storedIndex, rebuildIndex } = await import("@/lib/agentIndex");
    if ((await storedIndex()).stale) await rebuildIndex().catch(() => undefined);
    const { refreshForest } = await import("@/lib/forest");
    await refreshForest().catch(() => undefined);
    // Graduated Argus tokens (lib/argusRegistry.ts): new graduations, and the history backfill until done.
    const { advanceRegistry } = await import("@/lib/argusRegistry");
    await advanceRegistry(20_000).catch(() => undefined);
    // Keep the token safety screen warm so "which token?" answers don't wait for it.
    const { tokenPicks } = await import("@/lib/picks");
    const { kvGet } = await import("@/lib/store");
    const cur = await kvGet<{ at: number }>("picks:v1").catch(() => null);
    if (!cur || Date.now() - cur.at > 10 * 60_000) await tokenPicks(true).catch(() => undefined);
  });
  // Trading first (prices move), then escrow jobs, then the research runs with the time that is left.
  const started = Date.now();
  const { runTradingTick } = await import("@/lib/trading");
  const trading = await runTradingTick(30_000).catch((e: Error) => ({ error: e.message.slice(0, 200) }));
  // Vercel Cron calls the *.vercel.app URL, which sits behind Vercel's login wall: the paid tools
  // would answer with that HTML page. In production, agents always call the public domain.
  const origin = process.env.VERCEL_ENV === "production" ? SITE_URL : req.nextUrl.origin;
  // Escrow jobs for Fuci agents next: paid work with deadlines (see lib/escrowWorker.ts).
  const { runEscrowTick } = await import("@/lib/escrowWorker");
  const escrow = await runEscrowTick(origin, Math.max(5_000, 45_000 - (Date.now() - started))).catch((e: Error) => ({ error: e.message.slice(0, 200) }));
  const research = await runDue(origin, Math.max(5_000, 50_000 - (Date.now() - started)));
  return NextResponse.json({ ...research, trading, escrow }, { headers: { "Cache-Control": "no-store" } });
}

export const GET = tick;
export const POST = tick;
