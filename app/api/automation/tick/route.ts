import crypto from "node:crypto";
import { NextResponse, after, type NextRequest } from "next/server";
import { tickSecret } from "@/lib/agentWallets";
import { runDue } from "@/lib/automation";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const same = (a: string, b: string) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

/**
 * Runs the agents that are due. Called every few minutes by a scheduler
 * (Upstash QStash or any cron service) with "Authorization: Bearer <tick secret>",
 * and once a day by Vercel Cron with its CRON_SECRET.
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
  });
  // Trading first (prices move), then the research runs with the time that is left.
  const started = Date.now();
  const { runTradingTick } = await import("@/lib/trading");
  const trading = await runTradingTick(30_000).catch((e: Error) => ({ error: e.message.slice(0, 200) }));
  const research = await runDue(req.nextUrl.origin, Math.max(5_000, 50_000 - (Date.now() - started)));
  return NextResponse.json({ ...research, trading }, { headers: { "Cache-Control": "no-store" } });
}

export const GET = tick;
export const POST = tick;
