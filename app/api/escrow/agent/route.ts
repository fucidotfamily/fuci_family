import { NextResponse, type NextRequest } from "next/server";
import { agentByErc8004Id, agentByWallet, allow, resolveAgent, type AgentCard } from "@/lib/store";
import { balancesOf } from "@/lib/agentWallets";
import { MIN_JOB_USDC } from "@/lib/escrowWorker";
import { SITE_URL } from "@/lib/config";

export const dynamic = "force-dynamic";

/**
 * Is this a Fuci agent? Looks up an agent by page id (e.g. "fuci"), ERC-8004 id or its own wallet.
 * A Fuci agent is paid at its own wallet and works escrow jobs by itself (lib/escrowWorker.ts).
 */
export async function GET(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";
  if (!(await allow(`escrow-agent:${ip}`, 60, 600))) return NextResponse.json({ error: "Too many lookups" }, { status: 429 });
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().replace(/^#/, "");
  if (!q) return NextResponse.json({ fuci: false });
  let a: AgentCard | null = null;
  if (/^0x[0-9a-fA-F]{40}$/.test(q)) a = await agentByWallet(q);
  else if (/^\d{1,9}$/.test(q)) a = await agentByErc8004Id(Number(q));
  else if (/^[a-z0-9-]{1,64}$/i.test(q)) a = (await resolveAgent(q.toLowerCase())).agent;
  if (!a?.wallet) return NextResponse.json({ fuci: false });
  // Ready when it can pay for the data it needs to do the job.
  const bal = await balancesOf(a.id).catch(() => null);
  const ready = bal ? bal.walletUsdc + bal.gatewayUsdc >= 0.06 : false;
  return NextResponse.json(
    {
      fuci: true,
      id: a.id,
      name: a.name,
      erc8004Id: a.erc8004Id ?? null,
      wallet: a.wallet,
      image: `${SITE_URL}/api/agent/${a.id}/image`,
      ready,
      minUsdc: MIN_JOB_USDC,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
