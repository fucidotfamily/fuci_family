import { NextResponse, type NextRequest } from "next/server";
import { isAddress, verifyMessage } from "viem";
import { agentOf, allow, claimName, deleteAgent, claimOwner, slugOf, PERSISTENT, pushHistory, recordEvent, saveAgent, type AgentCard, type Strategy } from "@/lib/store";
import { spawnMessage } from "@/lib/spawnMessage";
import { STRATEGIES, cleanMission } from "@/lib/strategy";

export const dynamic = "force-dynamic";


type Body = {
  name?: string;
  strategy?: string;
  mission?: string;
  dailyLimitUsdc?: number;
  owner?: string;
  ownerKind?: "browser" | "passkey";
  issuedAt?: number;
  signature?: `0x${string}`;
};

export async function POST(req: NextRequest) {
  if (!PERSISTENT) {
    return NextResponse.json({ error: "Agent storage is not connected. The site owner needs to add Upstash Redis in Vercel." }, { status: 503 });
  }
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";
  if (!(await allow(`spawn:${ip}`, 5, 3600))) {
    return NextResponse.json({ error: "Too many new fronds from this reef. Try again later." }, { status: 429 });
  }

  const b = (await req.json().catch(() => ({}))) as Body;
  const name = (b.name ?? "").replace(/[^\p{L}\p{N} ._-]/gu, "").trim().slice(0, 32);
  const strategy = STRATEGIES.includes(b.strategy as Strategy) ? (b.strategy as Strategy) : null;
  const mission = cleanMission(b.mission);
  const dailyLimitUsdc = Number(b.dailyLimitUsdc);
  if (!name || !strategy || !(dailyLimitUsdc >= 0.01 && dailyLimitUsdc <= 100) || !b.owner || !isAddress(b.owner)) {
    return NextResponse.json({ error: "Name, strategy, a daily limit (0.01–100 USDC) and an owner wallet are required." }, { status: 400 });
  }

  // One wallet, one agent.
  const existing = await agentOf(b.owner);
  if (existing) return NextResponse.json({ error: "This wallet already has a frond.", agent: existing }, { status: 409 });

  const ownerKind = b.ownerKind === "passkey" ? "passkey" : "browser";
  if (ownerKind === "browser") {
    const fresh = typeof b.issuedAt === "number" && Math.abs(Date.now() - b.issuedAt) < 10 * 60_000;
    const message = spawnMessage({ name, strategy, mission, dailyLimitUsdc, owner: b.owner, issuedAt: b.issuedAt ?? 0 });
    const valid = fresh && b.signature ? await verifyMessage({ address: b.owner, message, signature: b.signature }).catch(() => false) : false;
    if (!valid) return NextResponse.json({ error: "The wallet signature did not verify. Please sign again." }, { status: 401 });
  }

  // The name is the URL: fuci.family/agent/<name>. First come, first served.
  const slug = slugOf(name, b.owner);
  if (!slug) return NextResponse.json({ error: "Pick a name with at least 2 letters or digits." }, { status: 400 });
  if (!(await claimName(slug))) return NextResponse.json({ error: `The name "${name}" is taken. Try another one.` }, { status: 409 });
  const card: AgentCard = {
    id: slug,
    name,
    strategy,
    ...(mission ? { mission } : {}),
    owner: b.owner,
    ownerKind,
    dailyLimitUsdc,
    createdAt: Date.now(),
    calls: 0,
    spentUsdc: 0,
  };
  if (!(await claimOwner(b.owner, card.id))) {
    await deleteAgent(card.id);
    return NextResponse.json({ error: "This wallet already has a frond.", agent: await agentOf(b.owner) }, { status: 409 });
  }
  await saveAgent(card);
  await recordEvent({ kind: "spawn", agent: card.id, usdc: 0 });
  await pushHistory(card.id, { kind: "spawn", label: `Spawned by ${card.owner.slice(0, 6)}…${card.owner.slice(-4)} (wallet signature)` });
  return NextResponse.json(card);
}
